import * as Effect from "effect/Effect";
import {
  type PutServiceInput,
  type ProjectSnapshot,
  type RailwayClientService,
  type ServiceScope,
  type ServiceSnapshot,
  type UpdateServiceInput,
} from "../client/RailwayClient.js";
import { RailwayNotFound } from "../Errors.js";

export interface InMemoryRailwayClientOptions {
  readonly projects?: ReadonlyArray<ProjectSnapshot>;
  readonly services?: ReadonlyArray<ServiceSnapshot>;
}

export class InMemoryRailwayClient implements RailwayClientService {
  readonly mutations: Array<string> = [];
  readonly #projects = new Map<string, ProjectSnapshot>();
  readonly #services = new Map<string, ServiceSnapshot>();
  #nextServiceId = 1;
  #nextDomainId = 1;
  #nextDeploymentId = 1;

  private constructor(options: InMemoryRailwayClientOptions) {
    for (const project of options.projects ?? []) {
      this.#projects.set(project.projectId, structuredClone(project));
    }
    for (const service of options.services ?? []) {
      this.#services.set(service.serviceId, structuredClone(service));
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
      const service: ServiceSnapshot = {
        ...input,
        serviceId: `service_${this.#nextServiceId++}`,
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
      const service: ServiceSnapshot = {
        ...current,
        ...input,
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

  readonly ensureDomain = Effect.fn("InMemoryRailwayClient.ensureDomain")(
    function* (this: InMemoryRailwayClient, scope: ServiceScope) {
      const current = yield* this.getService(scope);
      if (current.domainId && current.domain) return current;
      const domainId = `domain_${this.#nextDomainId++}`;
      const service: ServiceSnapshot = {
        ...current,
        domainId,
        domain: `${current.name}-${domainId}.up.railway.app`,
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
        ...withoutDomain
      } = current;
      const service: ServiceSnapshot = withoutDomain;
      this.#services.set(service.serviceId, structuredClone(service));
      this.mutations.push(`delete-domain:${service.serviceId}`);
      return structuredClone(service);
    },
  );

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

  setServiceSnapshot(service: ServiceSnapshot): void {
    this.#services.set(service.serviceId, structuredClone(service));
  }
}
