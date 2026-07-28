import * as Effect from "effect/Effect";
import {
  type CustomDomainScope,
  type CustomDomainSnapshot,
  type EnvironmentScope,
  type EnvironmentSnapshot,
  type PutCustomDomainInput,
  type PutEnvironmentInput,
  type PutServiceInput,
  type PutVariableInput,
  type ProjectSnapshot,
  type RailwayClientService,
  type ServiceScope,
  type ServiceSnapshot,
  type UpdateServiceInput,
  type VariableScope,
} from "../client/RailwayClient.js";
import { RailwayNotFound } from "../Errors.js";

export interface InMemoryRailwayClientOptions {
  readonly projects?: ReadonlyArray<ProjectSnapshot>;
  readonly environments?: ReadonlyArray<EnvironmentSnapshot>;
  readonly services?: ReadonlyArray<ServiceSnapshot>;
  readonly customDomains?: ReadonlyArray<CustomDomainSnapshot>;
}

export class InMemoryRailwayClient implements RailwayClientService {
  readonly mutations: Array<string> = [];
  readonly #projects = new Map<string, ProjectSnapshot>();
  readonly #environments = new Map<string, EnvironmentSnapshot>();
  readonly #services = new Map<string, ServiceSnapshot>();
  readonly #sharedVariables = new Map<string, Record<string, string>>();
  readonly #customDomains = new Map<string, CustomDomainSnapshot>();
  #nextEnvironmentId = 1;
  #nextServiceId = 1;
  #nextDomainId = 1;
  #nextCustomDomainId = 1;
  #nextDeploymentId = 1;

  private constructor(options: InMemoryRailwayClientOptions) {
    for (const project of options.projects ?? []) {
      this.#projects.set(project.projectId, structuredClone(project));
      this.#environments.set(project.environmentId, {
        environmentId: project.environmentId,
        projectId: project.projectId,
        name: project.environmentName,
        ephemeral: false,
      });
    }
    for (const environment of options.environments ?? []) {
      this.#environments.set(
        environment.environmentId,
        structuredClone(environment),
      );
    }
    for (const service of options.services ?? []) {
      this.#services.set(service.serviceId, structuredClone(service));
    }
    for (const domain of options.customDomains ?? []) {
      this.#customDomains.set(domain.domainId, structuredClone(domain));
    }
  }

  static make(
    options: InMemoryRailwayClientOptions = {},
  ): InMemoryRailwayClient {
    return new InMemoryRailwayClient(options);
  }

  readonly getProject = Effect.fn("InMemoryRailwayClient.getProject")(
    function* (
      this: InMemoryRailwayClient,
      projectId: string,
      environmentId: string,
    ) {
      const project = this.#projects.get(projectId);
      if (!project || project.environmentId !== environmentId) {
        return yield* new RailwayNotFound({
          resource: "project environment",
          resourceId: `${projectId}/${environmentId}`,
          message:
            `Railway project environment '${projectId}/${environmentId}' ` +
            "was not found",
        });
      }
      return structuredClone(project);
    },
  );

  readonly getService = Effect.fn("InMemoryRailwayClient.getService")(
    function* (
      this: InMemoryRailwayClient,
      scope: ServiceScope,
      _targetPort?: number,
    ) {
      const service = this.#services.get(scope.serviceId);
      if (
        !service ||
        service.projectId !== scope.projectId ||
        service.environmentId !== scope.environmentId
      ) {
        return yield* new RailwayNotFound({
          resource: "service",
          resourceId: scope.serviceId,
          message: `Railway service '${scope.serviceId}' was not found`,
        });
      }
      return structuredClone(service);
    },
  );

  readonly getEnvironment = Effect.fn(
    "InMemoryRailwayClient.getEnvironment",
  )(function* (
    this: InMemoryRailwayClient,
    scope: EnvironmentScope,
  ) {
    const environment = this.#environments.get(scope.environmentId);
    if (!environment || environment.projectId !== scope.projectId) {
      return yield* new RailwayNotFound({
        resource: "environment",
        resourceId: scope.environmentId,
        message:
          `Railway environment '${scope.environmentId}' was not found`,
      });
    }
    return structuredClone(environment);
  });

  readonly listEnvironments = Effect.fn(
    "InMemoryRailwayClient.listEnvironments",
  )(function* (this: InMemoryRailwayClient, projectId: string) {
    if (!this.#projects.has(projectId)) {
      return yield* new RailwayNotFound({
        resource: "project",
        resourceId: projectId,
        message: `Railway project '${projectId}' was not found`,
      });
    }
    return [...this.#environments.values()]
      .filter((environment) => environment.projectId === projectId)
      .map((environment) => structuredClone(environment));
  });

  readonly createEnvironment = Effect.fn(
    "InMemoryRailwayClient.createEnvironment",
  )(function* (
    this: InMemoryRailwayClient,
    input: PutEnvironmentInput,
  ) {
    if (!this.#projects.has(input.projectId)) {
      return yield* new RailwayNotFound({
        resource: "project",
        resourceId: input.projectId,
        message: `Railway project '${input.projectId}' was not found`,
      });
    }
    if (input.sourceEnvironmentId) {
      yield* this.getEnvironment({
        projectId: input.projectId,
        environmentId: input.sourceEnvironmentId,
      });
    }
    const environment: EnvironmentSnapshot = {
      environmentId: `environment_${this.#nextEnvironmentId++}`,
      projectId: input.projectId,
      name: input.name,
      ephemeral: input.ephemeral ?? false,
    };
    this.#environments.set(
      environment.environmentId,
      structuredClone(environment),
    );
    this.mutations.push(`create-environment:${environment.environmentId}`);
    return structuredClone(environment);
  });

  readonly renameEnvironment = Effect.fn(
    "InMemoryRailwayClient.renameEnvironment",
  )(function* (
    this: InMemoryRailwayClient,
    scope: EnvironmentScope,
    name: string,
  ) {
    const current = yield* this.getEnvironment(scope);
    const environment = { ...current, name };
    this.#environments.set(
      environment.environmentId,
      structuredClone(environment),
    );
    this.mutations.push(`rename-environment:${environment.environmentId}`);
    return structuredClone(environment);
  });

  readonly deleteEnvironment = Effect.fn(
    "InMemoryRailwayClient.deleteEnvironment",
  )(function* (
    this: InMemoryRailwayClient,
    scope: EnvironmentScope,
  ) {
    yield* this.getEnvironment(scope);
    this.#environments.delete(scope.environmentId);
    this.mutations.push(`delete-environment:${scope.environmentId}`);
  });

  readonly listServices = Effect.fn("InMemoryRailwayClient.listServices")(
    function* (
      this: InMemoryRailwayClient,
      projectId: string,
      environmentId: string,
    ) {
      yield* this.getProject(projectId, environmentId);
      return [...this.#services.values()]
        .filter(
          (service) =>
            service.projectId === projectId &&
            service.environmentId === environmentId,
        )
        .map((service) => structuredClone(service));
    },
  );

  readonly createService = Effect.fn("InMemoryRailwayClient.createService")(
    function* (this: InMemoryRailwayClient, input: PutServiceInput) {
      yield* this.getProject(input.projectId, input.environmentId);
      const { source, ...settings } = input;
      const service: ServiceSnapshot = {
        ...settings,
        serviceId: `service_${this.#nextServiceId++}`,
        ...("image" in source
          ? { image: source.image }
          : {
              repository: source.repo,
              branch: source.branch,
              checkSuites: source.checkSuites ?? false,
              deploymentTriggerId: `trigger_${this.#nextServiceId - 1}`,
            }),
        variables: {},
      };
      this.#services.set(service.serviceId, structuredClone(service));
      this.mutations.push(`create:${service.serviceId}`);
      return structuredClone(service);
    },
  );

  readonly updateService = Effect.fn("InMemoryRailwayClient.updateService")(
    function* (this: InMemoryRailwayClient, input: UpdateServiceInput) {
      const current = yield* this.getService(input);
      const {
        image: _image,
        repository: _repository,
        branch: _branch,
        checkSuites: _checkSuites,
        deploymentTriggerId: _deploymentTriggerId,
        ...withoutSource
      } = current;
      const { source, ...settings } = input;
      const service: ServiceSnapshot = {
        ...withoutSource,
        ...settings,
        ...("image" in source
          ? { image: source.image }
          : {
              repository: source.repo,
              branch: source.branch,
              checkSuites: source.checkSuites ?? false,
              deploymentTriggerId:
                current.deploymentTriggerId ??
                `trigger_${current.serviceId}`,
            }),
      };
      this.#services.set(service.serviceId, structuredClone(service));
      this.mutations.push(`update:${service.serviceId}`);
      return structuredClone(service);
    },
  );

  readonly upsertVariables = Effect.fn(
    "InMemoryRailwayClient.upsertVariables",
  )(function* (
    this: InMemoryRailwayClient,
    scope: ServiceScope,
    variables: Readonly<Record<string, string>>,
  ) {
    const current = yield* this.getService(scope);
    const service: ServiceSnapshot = {
      ...current,
      variables: { ...current.variables, ...variables },
    };
    this.#services.set(service.serviceId, structuredClone(service));
    this.mutations.push(`variables:${service.serviceId}`);
    return structuredClone(service);
  });

  readonly deleteVariable = Effect.fn(
    "InMemoryRailwayClient.deleteVariable",
  )(function* (
    this: InMemoryRailwayClient,
    scope: ServiceScope,
    name: string,
  ) {
    const current = yield* this.getService(scope);
    const variables = { ...current.variables };
    delete variables[name];
    const service: ServiceSnapshot = { ...current, variables };
    this.#services.set(service.serviceId, structuredClone(service));
    this.mutations.push(`delete-variable:${service.serviceId}/${name}`);
    return structuredClone(service);
  });

  readonly getVariables = Effect.fn(
    "InMemoryRailwayClient.getVariables",
  )(function* (
    this: InMemoryRailwayClient,
    scope: VariableScope,
  ) {
    if (scope.serviceId) {
      const service = yield* this.getService({
        ...scope,
        serviceId: scope.serviceId,
      });
      return structuredClone(service.variables);
    }
    yield* this.getEnvironment(scope);
    return structuredClone(
      this.#sharedVariables.get(
        `${scope.projectId}/${scope.environmentId}`,
      ) ?? {},
    );
  });

  readonly putVariable = Effect.fn("InMemoryRailwayClient.putVariable")(
    function* (this: InMemoryRailwayClient, input: PutVariableInput) {
      if (input.serviceId) {
        const scope = {
          projectId: input.projectId,
          environmentId: input.environmentId,
          serviceId: input.serviceId,
        };
        const current = yield* this.getService(scope);
        this.#services.set(current.serviceId, {
          ...current,
          variables: {
            ...current.variables,
            [input.name]: input.value,
          },
        });
      } else {
        yield* this.getEnvironment(input);
        const key = `${input.projectId}/${input.environmentId}`;
        this.#sharedVariables.set(key, {
          ...(this.#sharedVariables.get(key) ?? {}),
          [input.name]: input.value,
        });
      }
      this.mutations.push(
        `put-variable:${input.serviceId ?? "shared"}/${input.name}`,
      );
    },
  );

  readonly removeVariable = Effect.fn(
    "InMemoryRailwayClient.removeVariable",
  )(function* (
    this: InMemoryRailwayClient,
    scope: VariableScope,
    name: string,
  ) {
    if (scope.serviceId) {
      const serviceScope = { ...scope, serviceId: scope.serviceId };
      const current = yield* this.getService(serviceScope);
      const variables = { ...current.variables };
      delete variables[name];
      this.#services.set(current.serviceId, { ...current, variables });
    } else {
      yield* this.getEnvironment(scope);
      const key = `${scope.projectId}/${scope.environmentId}`;
      const variables = { ...(this.#sharedVariables.get(key) ?? {}) };
      delete variables[name];
      this.#sharedVariables.set(key, variables);
    }
    this.mutations.push(
      `remove-variable:${scope.serviceId ?? "shared"}/${name}`,
    );
  });

  readonly ensureDomain = Effect.fn("InMemoryRailwayClient.ensureDomain")(
    function* (
      this: InMemoryRailwayClient,
      scope: ServiceScope,
      targetPort?: number,
    ) {
      const current = yield* this.getService(scope);
      if (
        current.domainId &&
        current.domain &&
        current.targetPort === targetPort
      ) {
        return current;
      }
      if (current.domainId && current.domain) {
        const { targetPort: _currentTargetPort, ...withoutTargetPort } =
          current;
        const updated: ServiceSnapshot =
          targetPort === undefined
            ? withoutTargetPort
            : { ...withoutTargetPort, targetPort };
        this.#services.set(updated.serviceId, structuredClone(updated));
        this.mutations.push(`domain:${updated.serviceId}`);
        return structuredClone(updated);
      }
      const domainId = `domain_${this.#nextDomainId++}`;
      const service: ServiceSnapshot = {
        ...current,
        domainId,
        domain: `${current.name}-${domainId}.up.railway.app`,
        ...(targetPort === undefined ? {} : { targetPort }),
      };
      this.#services.set(service.serviceId, structuredClone(service));
      this.mutations.push(`domain:${service.serviceId}`);
      return structuredClone(service);
    },
  );

  readonly deleteDomain = Effect.fn("InMemoryRailwayClient.deleteDomain")(
    function* (
      this: InMemoryRailwayClient,
      scope: ServiceScope,
      domainId: string,
    ) {
      const current = yield* this.getService(scope);
      if (current.domainId !== domainId) {
        return yield* new RailwayNotFound({
          resource: "domain",
          resourceId: domainId,
          message: `Railway domain '${domainId}' was not found`,
        });
      }
      const {
        domain: _domain,
        domainId: _domainId,
        targetPort: _targetPort,
        ...withoutDomain
      } = current;
      const service: ServiceSnapshot = withoutDomain;
      this.#services.set(service.serviceId, structuredClone(service));
      this.mutations.push(`delete-domain:${service.serviceId}`);
      return structuredClone(service);
    },
  );

  readonly listCustomDomains = Effect.fn(
    "InMemoryRailwayClient.listCustomDomains",
  )(function* (
    this: InMemoryRailwayClient,
    scope: CustomDomainScope,
  ) {
    yield* this.getService(scope);
    return [...this.#customDomains.values()]
      .filter(
        (domain) =>
          domain.projectId === scope.projectId &&
          domain.environmentId === scope.environmentId &&
          domain.serviceId === scope.serviceId,
      )
      .map((domain) => structuredClone(domain));
  });

  readonly createCustomDomain = Effect.fn(
    "InMemoryRailwayClient.createCustomDomain",
  )(function* (
    this: InMemoryRailwayClient,
    input: PutCustomDomainInput,
  ) {
    yield* this.getService(input);
    const domain: CustomDomainSnapshot = {
      domainId: `custom_domain_${this.#nextCustomDomainId++}`,
      projectId: input.projectId,
      environmentId: input.environmentId,
      serviceId: input.serviceId,
      domain: input.domain,
      ...(input.targetPort === undefined
        ? {}
        : { targetPort: input.targetPort }),
      verified: false,
      certificateStatus: "PENDING",
      syncStatus: "PENDING",
    };
    this.#customDomains.set(domain.domainId, structuredClone(domain));
    this.mutations.push(`create-custom-domain:${domain.domainId}`);
    return structuredClone(domain);
  });

  readonly updateCustomDomain = Effect.fn(
    "InMemoryRailwayClient.updateCustomDomain",
  )(function* (
    this: InMemoryRailwayClient,
    scope: CustomDomainScope,
    domainId: string,
    targetPort?: number,
  ) {
    const current = this.#customDomains.get(domainId);
    if (
      !current ||
      current.projectId !== scope.projectId ||
      current.environmentId !== scope.environmentId ||
      current.serviceId !== scope.serviceId
    ) {
      return yield* new RailwayNotFound({
        resource: "custom domain",
        resourceId: domainId,
        message: `Railway custom domain '${domainId}' was not found`,
      });
    }
    const { targetPort: _targetPort, ...withoutTargetPort } = current;
    const updated: CustomDomainSnapshot =
      targetPort === undefined
        ? withoutTargetPort
        : { ...withoutTargetPort, targetPort };
    this.#customDomains.set(domainId, structuredClone(updated));
    this.mutations.push(`update-custom-domain:${domainId}`);
    return structuredClone(updated);
  });

  readonly deleteCustomDomain = Effect.fn(
    "InMemoryRailwayClient.deleteCustomDomain",
  )(function* (
    this: InMemoryRailwayClient,
    scope: CustomDomainScope,
    domainId: string,
  ) {
    const domains = yield* this.listCustomDomains(scope);
    if (!domains.some((domain) => domain.domainId === domainId)) {
      return yield* new RailwayNotFound({
        resource: "custom domain",
        resourceId: domainId,
        message: `Railway custom domain '${domainId}' was not found`,
      });
    }
    this.#customDomains.delete(domainId);
    this.mutations.push(`delete-custom-domain:${domainId}`);
  });

  readonly deployService = Effect.fn("InMemoryRailwayClient.deployService")(
    function* (this: InMemoryRailwayClient, scope: ServiceScope) {
      const current = yield* this.getService(scope);
      const service: ServiceSnapshot = {
        ...current,
        deploymentId: `deployment_${this.#nextDeploymentId++}`,
        deploymentStatus: "SUCCESS",
      };
      this.#services.set(service.serviceId, structuredClone(service));
      this.mutations.push(`deploy:${service.serviceId}`);
      return structuredClone(service);
    },
  );

  readonly deleteService = Effect.fn("InMemoryRailwayClient.deleteService")(
    function* (this: InMemoryRailwayClient, scope: ServiceScope) {
      yield* this.getService(scope);
      this.#services.delete(scope.serviceId);
      this.mutations.push(`delete:${scope.serviceId}`);
    },
  );

  getProjectSnapshot(projectId: string): ProjectSnapshot | undefined {
    const project = this.#projects.get(projectId);
    return project ? structuredClone(project) : undefined;
  }

  getServiceSnapshot(serviceId: string): ServiceSnapshot | undefined {
    const service = this.#services.get(serviceId);
    return service ? structuredClone(service) : undefined;
  }

  getEnvironmentSnapshot(
    environmentId: string,
  ): EnvironmentSnapshot | undefined {
    const environment = this.#environments.get(environmentId);
    return environment ? structuredClone(environment) : undefined;
  }

  getCustomDomainSnapshot(
    domainId: string,
  ): CustomDomainSnapshot | undefined {
    const domain = this.#customDomains.get(domainId);
    return domain ? structuredClone(domain) : undefined;
  }

  setServiceSnapshot(service: ServiceSnapshot): void {
    this.#services.set(service.serviceId, structuredClone(service));
  }
}
