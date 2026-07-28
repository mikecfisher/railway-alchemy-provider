import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schedule from "effect/Schedule";
import type * as Schema from "effect/Schema";
import { RailwayCredentials } from "../auth/RailwayCredentials.js";
import {
  RailwayApiError,
  RailwayAuthenticationError,
  type RailwayClientError,
  RailwayDeploymentFailed,
  RailwayNotFound,
} from "../Errors.js";
import {
  type CustomDomainScope,
  type CustomDomainSnapshot,
  type DeploymentStatus,
  type EnvironmentScope,
  type EnvironmentSnapshot,
  type PutCustomDomainInput,
  type PutEnvironmentInput,
  type PutServiceInput,
  type PutVariableInput,
  RailwayClient,
  type RailwayClientService,
  type ServiceScope,
  type ServiceSnapshot,
  type UpdateServiceInput,
  type VariableScope,
} from "./RailwayClient.js";
import {
  CreateServiceResponse,
  CustomDomainCreateResponse,
  CustomDomainDeleteResponse,
  CustomDomainListResponse,
  CustomDomainUpdateResponse,
  decodeGraphQLContract,
  DeploymentResponse,
  DeploymentTriggerCreateResponse,
  DeploymentTriggerDeleteResponse,
  DeploymentTriggerUpdateResponse,
  DeployServiceResponse,
  EnvironmentDeleteResponse,
  EnvironmentListResponse,
  EnvironmentMutationResponse,
  EnvironmentRenameResponse,
  EnvironmentResponse,
  ProjectResponse,
  RenameServiceResponse,
  ServiceDeleteResponse,
  ServiceDomainCreateResponse,
  ServiceDomainDeleteResponse,
  ServiceDomainUpdateResponse,
  ServiceListResponse,
  ServiceResponse,
  serviceSnapshotOf,
  UpdateServiceResponse,
  VariableCollectionUpsertResponse,
  VariableDeleteResponse,
  VariablesResponse,
  VariableUpsertResponse,
} from "./RailwayGraphQLContract.js";
import {
  makeRailwayFetchExecutor,
  type RailwayGraphQLExecutor,
} from "./RailwayGraphQLRequest.js";

type DeploymentPoll = Data.TaggedEnum<{
  Pending: {
    readonly deploymentId: string;
    readonly status: DeploymentStatus;
  };
}>;

const DeploymentPoll = Data.taggedEnum<DeploymentPoll>();

export interface MakeRailwayClientOptions {
  readonly deploymentPollInterval?: number;
  readonly deploymentMaxPolls?: number;
}

const projectQuery = `
  query GetProject($projectId: String!, $environmentId: String!) {
    project(id: $projectId) { id name }
    environment(id: $environmentId, projectId: $projectId) {
      id
      name
      projectId
    }
  }
`;

const serviceFields = `
  serviceInstance(serviceId: $serviceId, environmentId: $environmentId) {
    serviceId
    serviceName
    source { image repo }
    healthcheckPath
    healthcheckTimeout
    region
    numReplicas
    builder
    rootDirectory
    buildCommand
    startCommand
    preDeployCommand
    dockerfilePath
    restartPolicyType
    restartPolicyMaxRetries
    sleepApplication
    cronSchedule
    watchPatterns
    latestDeployment { id status }
  }
  variables(
    projectId: $projectId
    environmentId: $environmentId
    serviceId: $serviceId
    unrendered: true
  )
  domains(
    projectId: $projectId
    environmentId: $environmentId
    serviceId: $serviceId
  ) {
    serviceDomains { id domain targetPort }
  }
`;

const serviceQuery = `
  query GetService(
    $projectId: String!
    $environmentId: String!
    $serviceId: String!
  ) {
    ${serviceFields}
    service(id: $serviceId) {
      repoTriggers(first: 1) {
        edges {
          node {
            id
            branch
            repository
            checkSuites
          }
        }
      }
    }
  }
`;

const environmentFields = `
  id
  projectId
  name
  isEphemeral
`;

const environmentOf = (value: {
  readonly id: string;
  readonly projectId: string;
  readonly name: string;
  readonly isEphemeral: boolean;
}): EnvironmentSnapshot => ({
  environmentId: value.id,
  projectId: value.projectId,
  name: value.name,
  ephemeral: value.isEphemeral,
});

const customDomainOf = (
  scope: CustomDomainScope,
  value: {
    readonly id: string;
    readonly projectId: string | null;
    readonly environmentId: string;
    readonly serviceId: string;
    readonly domain: string;
    readonly targetPort: number | null;
    readonly status: {
      readonly verified: boolean;
      readonly certificateStatus: string;
    };
    readonly syncStatus: string;
  },
): CustomDomainSnapshot => ({
  domainId: value.id,
  projectId: value.projectId ?? scope.projectId,
  environmentId: value.environmentId,
  serviceId: value.serviceId,
  domain: value.domain,
  ...(value.targetPort === null ? {} : { targetPort: value.targetPort }),
  verified: value.status.verified,
  certificateStatus: value.status.certificateStatus,
  syncStatus: value.syncStatus,
});

const listServicesQuery = `
  query ListServices($projectId: String!, $after: String) {
    project(id: $projectId) {
      services(first: 100, after: $after) {
        edges {
          node {
            id
            name
            projectId
          }
        }
        pageInfo { hasNextPage endCursor }
      }
    }
  }
`;

const isNotFoundMessage = (message: string) =>
  message.toLowerCase().includes("not found") ||
  message.toLowerCase().includes("could not be found");

export const makeRailwayClient = (
  executor: RailwayGraphQLExecutor,
  options: MakeRailwayClientOptions = {},
): RailwayClientService => {
  const execute = <S extends Schema.Constraint>(
    operation: string,
    query: string,
    variables: Readonly<Record<string, unknown>>,
    schema: S,
  ) =>
    executor
      .execute(operation, query, variables)
      .pipe(
        Effect.flatMap((value) =>
          decodeGraphQLContract(operation, schema, value),
        ),
      );

  const getProject = Effect.fn("RailwayClient.getProject")(function* (
    projectId: string,
    environmentId: string,
  ) {
    const response = yield* execute(
      "GetProject",
      projectQuery,
      { projectId, environmentId },
      ProjectResponse,
    ).pipe(
      Effect.mapError((error) =>
        isNotFoundMessage(error.message)
          ? new RailwayNotFound({
              resource: "project environment",
              resourceId: `${projectId}/${environmentId}`,
              message: error.message,
            })
          : error,
      ),
    );
    return {
      projectId: response.project.id,
      name: response.project.name,
      environmentId: response.environment.id,
      environmentName: response.environment.name,
    };
  });

  const getService = Effect.fn("RailwayClient.getService")(function* (
    scope: ServiceScope,
  ) {
    const response = yield* execute(
      "GetService",
      serviceQuery,
      { ...scope },
      ServiceResponse,
    ).pipe(
      Effect.mapError((error) =>
        isNotFoundMessage(error.message)
          ? new RailwayNotFound({
              resource: "service",
              resourceId: scope.serviceId,
              message: error.message,
            })
          : error,
      ),
    );
    return serviceSnapshotOf(scope, response);
  });

  const getEnvironment = Effect.fn("RailwayClient.getEnvironment")(
    function* (scope: EnvironmentScope) {
      const response = yield* execute(
        "GetEnvironment",
        `
          query GetEnvironment(
            $projectId: String!
            $environmentId: String!
          ) {
            environment(id: $environmentId, projectId: $projectId) {
              ${environmentFields}
            }
          }
        `,
        { ...scope },
        EnvironmentResponse,
      ).pipe(
        Effect.mapError((error) =>
          isNotFoundMessage(error.message)
            ? new RailwayNotFound({
                resource: "environment",
                resourceId: scope.environmentId,
                message: error.message,
              })
            : error,
        ),
      );
      return environmentOf(response.environment);
    },
  );

  const listEnvironments = Effect.fn("RailwayClient.listEnvironments")(
    function* (projectId: string) {
      const environments: Array<EnvironmentSnapshot> = [];
      let after: string | null = null;
      do {
        const response: Schema.Schema.Type<
          typeof EnvironmentListResponse
        > = yield* execute(
          "ListEnvironments",
          `
            query ListEnvironments(
              $projectId: String!
              $after: String
            ) {
              project(id: $projectId) {
                environments(first: 100, after: $after) {
                  edges { node { ${environmentFields} } }
                  pageInfo { hasNextPage endCursor }
                }
              }
            }
          `,
          { projectId, after },
          EnvironmentListResponse,
        );
        environments.push(
          ...response.project.environments.edges.map(({ node }) =>
            environmentOf(node)
          ),
        );
        const pageInfo: {
          readonly hasNextPage: boolean;
          readonly endCursor: string | null;
        } = response.project.environments.pageInfo;
        after = pageInfo.hasNextPage ? pageInfo.endCursor : null;
        if (pageInfo.hasNextPage && after === null) {
          return yield* new RailwayApiError({
            operation: "ListEnvironments",
            message:
              "Railway indicated another environment page without a cursor",
          });
        }
      } while (after !== null);
      return environments;
    },
  );

  const createEnvironment = Effect.fn("RailwayClient.createEnvironment")(
    function* (input: PutEnvironmentInput) {
      const response = yield* execute(
        "CreateEnvironment",
        `
          mutation CreateEnvironment(
            $projectId: String!
            $name: String!
            $sourceEnvironmentId: String
            $ephemeral: Boolean
            $skipInitialDeploys: Boolean
          ) {
            environmentCreate(input: {
              projectId: $projectId
              name: $name
              sourceEnvironmentId: $sourceEnvironmentId
              ephemeral: $ephemeral
              skipInitialDeploys: $skipInitialDeploys
            }) { ${environmentFields} }
          }
        `,
        {
          ...input,
          sourceEnvironmentId: input.sourceEnvironmentId ?? null,
          ephemeral: input.ephemeral ?? false,
          skipInitialDeploys: input.skipInitialDeploys ?? false,
        },
        EnvironmentMutationResponse,
      );
      return environmentOf(response.environmentCreate);
    },
  );

  const renameEnvironment = Effect.fn("RailwayClient.renameEnvironment")(
    function* (scope: EnvironmentScope, name: string) {
      const response = yield* execute(
        "RenameEnvironment",
        `
          mutation RenameEnvironment(
            $environmentId: String!
            $name: String!
          ) {
            environmentRename(
              id: $environmentId
              input: { name: $name }
            ) { ${environmentFields} }
          }
        `,
        { ...scope, name },
        EnvironmentRenameResponse,
      );
      return environmentOf(response.environmentRename);
    },
  );

  const deleteEnvironment = Effect.fn("RailwayClient.deleteEnvironment")(
    function* (scope: EnvironmentScope) {
      const response = yield* execute(
        "DeleteEnvironment",
        `
          mutation DeleteEnvironment($environmentId: String!) {
            environmentDelete(id: $environmentId)
          }
        `,
        { ...scope },
        EnvironmentDeleteResponse,
      );
      if (!response.environmentDelete) {
        return yield* new RailwayApiError({
          operation: "DeleteEnvironment",
          message: "Railway did not delete the environment",
        });
      }
    },
  );

  const listServices = Effect.fn("RailwayClient.listServices")(
    function* (projectId: string, environmentId: string) {
      const services: Array<ServiceSnapshot> = [];
      let after: string | null = null;
      do {
        const response: Schema.Schema.Type<typeof ServiceListResponse> =
          yield* execute(
          "ListServices",
          listServicesQuery,
          { projectId, environmentId, after },
          ServiceListResponse,
        );
        services.push(
          ...response.project.services.edges.map(
            ({ node }): ServiceSnapshot => ({
              serviceId: node.id,
              projectId,
              environmentId,
              name: node.name,
              numReplicas: 1,
              variables: {},
            }),
          ),
        );
        const pageInfo: {
          readonly hasNextPage: boolean;
          readonly endCursor: string | null;
        } = response.project.services.pageInfo;
        after = pageInfo.hasNextPage ? pageInfo.endCursor : null;
        if (pageInfo.hasNextPage && after === null) {
          return yield* new RailwayApiError({
            operation: "ListServices",
            message:
              "Railway indicated another service page without a cursor",
          });
        }
      } while (after !== null);
      return services;
    },
  );

  const updateService = Effect.fn("RailwayClient.updateService")(
    function* (input: UpdateServiceInput) {
      const current = yield* getService(input);
      if (current.name !== input.name) {
        yield* execute(
          "RenameService",
          `
            mutation RenameService(
              $serviceId: String!
              $name: String!
            ) {
              serviceUpdate(id: $serviceId, input: { name: $name }) { id }
            }
          `,
          { serviceId: input.serviceId, name: input.name },
          RenameServiceResponse,
        );
      }
      const updated = yield* execute(
        "UpdateService",
        `
          mutation UpdateService(
            $serviceId: String!
            $environmentId: String!
            $source: ServiceSourceInput!
            $healthcheckPath: String
            $healthcheckTimeout: Int
            $region: String
            $numReplicas: Int!
            $builder: Builder
            $rootDirectory: String
            $buildCommand: String
            $startCommand: String
            $preDeployCommand: [String!]
            $dockerfilePath: String
            $restartPolicyType: RestartPolicyType
            $restartPolicyMaxRetries: Int
            $sleepApplication: Boolean
            $cronSchedule: String
            $watchPatterns: [String!]
          ) {
            serviceInstanceUpdate(
              serviceId: $serviceId
              environmentId: $environmentId
              input: {
                source: $source
                healthcheckPath: $healthcheckPath
                healthcheckTimeout: $healthcheckTimeout
                region: $region
                numReplicas: $numReplicas
                builder: $builder
                rootDirectory: $rootDirectory
                buildCommand: $buildCommand
                startCommand: $startCommand
                preDeployCommand: $preDeployCommand
                dockerfilePath: $dockerfilePath
                restartPolicyType: $restartPolicyType
                restartPolicyMaxRetries: $restartPolicyMaxRetries
                sleepApplication: $sleepApplication
                cronSchedule: $cronSchedule
                watchPatterns: $watchPatterns
              }
            )
          }
        `,
        {
          ...input,
          source:
            "image" in input.source
              ? { image: input.source.image }
              : { repo: input.source.repo },
          healthcheckPath: input.healthcheckPath ?? null,
          healthcheckTimeout: input.healthcheckTimeout ?? null,
          region: input.region ?? null,
          builder: input.builder ?? null,
          rootDirectory: input.rootDirectory ?? null,
          buildCommand: input.buildCommand ?? null,
          startCommand: input.startCommand ?? null,
          preDeployCommand: input.preDeployCommand ?? null,
          dockerfilePath: input.dockerfilePath ?? null,
          restartPolicyType: input.restartPolicyType ?? null,
          restartPolicyMaxRetries: input.restartPolicyMaxRetries ?? null,
          sleepApplication: input.sleepApplication ?? null,
          cronSchedule: input.cronSchedule ?? null,
          watchPatterns: input.watchPatterns ?? null,
        },
        UpdateServiceResponse,
      );
      if (!updated.serviceInstanceUpdate) {
        return yield* new RailwayApiError({
          operation: "UpdateService",
          message: "Railway did not update the service instance",
        });
      }
      if ("repo" in input.source) {
        if (current.deploymentTriggerId) {
          yield* execute(
            "UpdateDeploymentTrigger",
            `
              mutation UpdateDeploymentTrigger(
                $triggerId: String!
                $repository: String!
                $branch: String!
                $checkSuites: Boolean
                $rootDirectory: String
              ) {
                deploymentTriggerUpdate(
                  id: $triggerId
                  input: {
                    repository: $repository
                    branch: $branch
                    checkSuites: $checkSuites
                    rootDirectory: $rootDirectory
                  }
                ) { id }
              }
            `,
            {
              triggerId: current.deploymentTriggerId,
              repository: input.source.repo,
              branch: input.source.branch,
              checkSuites: input.source.checkSuites ?? false,
              rootDirectory: input.rootDirectory ?? null,
            },
            DeploymentTriggerUpdateResponse,
          );
        } else {
          yield* execute(
            "CreateDeploymentTrigger",
            `
              mutation CreateDeploymentTrigger(
                $projectId: String!
                $environmentId: String!
                $serviceId: String!
                $repository: String!
                $branch: String!
                $checkSuites: Boolean
                $rootDirectory: String
              ) {
                deploymentTriggerCreate(input: {
                  projectId: $projectId
                  environmentId: $environmentId
                  serviceId: $serviceId
                  provider: "github"
                  repository: $repository
                  branch: $branch
                  checkSuites: $checkSuites
                  rootDirectory: $rootDirectory
                }) { id }
              }
            `,
            {
              ...input,
              repository: input.source.repo,
              branch: input.source.branch,
              checkSuites: input.source.checkSuites ?? false,
              rootDirectory: input.rootDirectory ?? null,
            },
            DeploymentTriggerCreateResponse,
          );
        }
      } else if (current.deploymentTriggerId) {
        const response = yield* execute(
          "DeleteDeploymentTrigger",
          `
            mutation DeleteDeploymentTrigger($triggerId: String!) {
              deploymentTriggerDelete(id: $triggerId)
            }
          `,
          { triggerId: current.deploymentTriggerId },
          DeploymentTriggerDeleteResponse,
        );
        if (!response.deploymentTriggerDelete) {
          return yield* new RailwayApiError({
            operation: "DeleteDeploymentTrigger",
            message: "Railway did not delete the deployment trigger",
          });
        }
      }
      return yield* getService(input);
    },
  );

  const createService = Effect.fn("RailwayClient.createService")(
    function* (input: PutServiceInput) {
      const response = yield* execute(
        "CreateService",
        `
          mutation CreateService(
            $projectId: String!
            $environmentId: String!
            $name: String!
            $source: ServiceSourceInput!
            $branch: String
          ) {
            serviceCreate(input: {
              projectId: $projectId
              environmentId: $environmentId
              name: $name
              source: $source
              branch: $branch
            }) { id }
          }
        `,
        {
          ...input,
          source:
            "image" in input.source
              ? { image: input.source.image }
              : { repo: input.source.repo },
          branch: "repo" in input.source ? input.source.branch : null,
        },
        CreateServiceResponse,
      );
      return yield* updateService({
        ...input,
        serviceId: response.serviceCreate.id,
      });
    },
  );

  const upsertVariables = Effect.fn("RailwayClient.upsertVariables")(
    function* (
      scope: ServiceScope,
      variables: Readonly<Record<string, string>>,
    ) {
      const response = yield* execute(
        "UpsertVariables",
        `
          mutation UpsertVariables(
            $projectId: String!
            $environmentId: String!
            $serviceId: String!
            $variables: EnvironmentVariables!
          ) {
            variableCollectionUpsert(input: {
              projectId: $projectId
              environmentId: $environmentId
              serviceId: $serviceId
              variables: $variables
              replace: false
              skipDeploys: true
            })
          }
        `,
        { ...scope, variables },
        VariableCollectionUpsertResponse,
      );
      if (!response.variableCollectionUpsert) {
        return yield* new RailwayApiError({
          operation: "UpsertVariables",
          message: "Railway did not upsert the service variables",
        });
      }
      return yield* getService(scope);
    },
  );

  const deleteVariable = Effect.fn("RailwayClient.deleteVariable")(
    function* (scope: ServiceScope, name: string) {
      const response = yield* execute(
        "DeleteVariable",
        `
          mutation DeleteVariable(
            $projectId: String!
            $environmentId: String!
            $serviceId: String!
            $name: String!
          ) {
            variableDelete(input: {
              projectId: $projectId
              environmentId: $environmentId
              serviceId: $serviceId
              name: $name
            })
          }
        `,
        { ...scope, name },
        VariableDeleteResponse,
      );
      if (!response.variableDelete) {
        return yield* new RailwayApiError({
          operation: "DeleteVariable",
          message: `Railway did not delete variable '${name}'`,
        });
      }
      return yield* getService(scope);
    },
  );

  const getVariables = Effect.fn("RailwayClient.getVariables")(
    function* (scope: VariableScope) {
      const response = yield* execute(
        "GetVariables",
        `
          query GetVariables(
            $projectId: String!
            $environmentId: String!
            $serviceId: String
          ) {
            variables(
              projectId: $projectId
              environmentId: $environmentId
              serviceId: $serviceId
              unrendered: true
            )
          }
        `,
        { ...scope, serviceId: scope.serviceId ?? null },
        VariablesResponse,
      );
      return response.variables;
    },
  );

  const putVariable = Effect.fn("RailwayClient.putVariable")(
    function* (input: PutVariableInput) {
      const response = yield* execute(
        "PutVariable",
        `
          mutation PutVariable(
            $projectId: String!
            $environmentId: String!
            $serviceId: String
            $name: String!
            $value: String!
            $skipDeploys: Boolean
          ) {
            variableUpsert(input: {
              projectId: $projectId
              environmentId: $environmentId
              serviceId: $serviceId
              name: $name
              value: $value
              skipDeploys: $skipDeploys
            })
          }
        `,
        {
          ...input,
          serviceId: input.serviceId ?? null,
          skipDeploys: input.skipDeploys ?? false,
        },
        VariableUpsertResponse,
      );
      if (!response.variableUpsert) {
        return yield* new RailwayApiError({
          operation: "PutVariable",
          message: `Railway did not upsert variable '${input.name}'`,
        });
      }
    },
  );

  const removeVariable = Effect.fn("RailwayClient.removeVariable")(
    function* (scope: VariableScope, name: string) {
      const response = yield* execute(
        "RemoveVariable",
        `
          mutation RemoveVariable(
            $projectId: String!
            $environmentId: String!
            $serviceId: String
            $name: String!
          ) {
            variableDelete(input: {
              projectId: $projectId
              environmentId: $environmentId
              serviceId: $serviceId
              name: $name
            })
          }
        `,
        { ...scope, serviceId: scope.serviceId ?? null, name },
        VariableDeleteResponse,
      );
      if (!response.variableDelete) {
        return yield* new RailwayApiError({
          operation: "RemoveVariable",
          message: `Railway did not delete variable '${name}'`,
        });
      }
    },
  );

  const ensureDomain = Effect.fn("RailwayClient.ensureDomain")(
    function* (scope: ServiceScope, targetPort?: number) {
      const current = yield* getService(scope);
      if (current.domain && current.targetPort === targetPort) return current;
      if (current.domainId && current.domain) {
        const response = yield* execute(
          "UpdateServiceDomain",
          `
            mutation UpdateServiceDomain(
              $serviceDomainId: String!
              $serviceId: String!
              $environmentId: String!
              $domain: String!
              $targetPort: Int
            ) {
              serviceDomainUpdate(input: {
                serviceDomainId: $serviceDomainId
                serviceId: $serviceId
                environmentId: $environmentId
                domain: $domain
                targetPort: $targetPort
              })
            }
          `,
          {
            ...scope,
            serviceDomainId: current.domainId,
            domain: current.domain,
            targetPort: targetPort ?? null,
          },
          ServiceDomainUpdateResponse,
        );
        if (!response.serviceDomainUpdate) {
          return yield* new RailwayApiError({
            operation: "UpdateServiceDomain",
            message: "Railway did not update the generated service domain",
          });
        }
      } else {
        yield* execute(
          "CreateServiceDomain",
          `
            mutation CreateServiceDomain(
              $serviceId: String!
              $environmentId: String!
              $targetPort: Int
            ) {
              serviceDomainCreate(input: {
                serviceId: $serviceId
                environmentId: $environmentId
                targetPort: $targetPort
              }) { id }
            }
          `,
          { ...scope, targetPort: targetPort ?? null },
          ServiceDomainCreateResponse,
        );
      }
      return yield* getService(scope);
    },
  );

  const deleteDomain = Effect.fn("RailwayClient.deleteDomain")(
    function* (scope: ServiceScope, domainId: string) {
      const response = yield* execute(
        "DeleteServiceDomain",
        `
          mutation DeleteServiceDomain($domainId: String!) {
            serviceDomainDelete(id: $domainId)
          }
        `,
        { domainId },
        ServiceDomainDeleteResponse,
      );
      if (!response.serviceDomainDelete) {
        return yield* new RailwayApiError({
          operation: "DeleteServiceDomain",
          message: "Railway did not delete the generated service domain",
        });
      }
      return yield* getService(scope);
    },
  );

  const listCustomDomains = Effect.fn("RailwayClient.listCustomDomains")(
    function* (scope: CustomDomainScope) {
      const response = yield* execute(
        "ListCustomDomains",
        `
          query ListCustomDomains(
            $projectId: String!
            $environmentId: String!
            $serviceId: String!
          ) {
            domains(
              projectId: $projectId
              environmentId: $environmentId
              serviceId: $serviceId
            ) {
              customDomains {
                id
                projectId
                environmentId
                serviceId
                domain
                targetPort
                status { verified certificateStatus }
                syncStatus
              }
            }
          }
        `,
        { ...scope },
        CustomDomainListResponse,
      );
      return response.domains.customDomains.map((domain) =>
        customDomainOf(scope, domain)
      );
    },
  );

  const findCustomDomain = Effect.fn("RailwayClient.findCustomDomain")(
    function* (scope: CustomDomainScope, domainId: string) {
      const domains = yield* listCustomDomains(scope);
      const domain = domains.find((candidate) =>
        candidate.domainId === domainId
      );
      if (!domain) {
        return yield* new RailwayNotFound({
          resource: "custom domain",
          resourceId: domainId,
          message: `Railway custom domain '${domainId}' was not found`,
        });
      }
      return domain;
    },
  );

  const createCustomDomain = Effect.fn("RailwayClient.createCustomDomain")(
    function* (input: PutCustomDomainInput) {
      const response = yield* execute(
        "CreateCustomDomain",
        `
          mutation CreateCustomDomain(
            $projectId: String!
            $environmentId: String!
            $serviceId: String!
            $domain: String!
            $targetPort: Int
          ) {
            customDomainCreate(input: {
              projectId: $projectId
              environmentId: $environmentId
              serviceId: $serviceId
              domain: $domain
              targetPort: $targetPort
            }) {
              id
              projectId
              environmentId
              serviceId
              domain
              targetPort
              status { verified certificateStatus }
              syncStatus
            }
          }
        `,
        { ...input, targetPort: input.targetPort ?? null },
        CustomDomainCreateResponse,
      );
      return customDomainOf(input, response.customDomainCreate);
    },
  );

  const updateCustomDomain = Effect.fn("RailwayClient.updateCustomDomain")(
    function* (
      scope: CustomDomainScope,
      domainId: string,
      targetPort?: number,
    ) {
      const response = yield* execute(
        "UpdateCustomDomain",
        `
          mutation UpdateCustomDomain(
            $domainId: String!
            $environmentId: String!
            $targetPort: Int
          ) {
            customDomainUpdate(
              id: $domainId
              environmentId: $environmentId
              targetPort: $targetPort
            )
          }
        `,
        {
          ...scope,
          domainId,
          targetPort: targetPort ?? null,
        },
        CustomDomainUpdateResponse,
      );
      if (!response.customDomainUpdate) {
        return yield* new RailwayApiError({
          operation: "UpdateCustomDomain",
          message: "Railway did not update the custom domain",
        });
      }
      return yield* findCustomDomain(scope, domainId);
    },
  );

  const deleteCustomDomain = Effect.fn("RailwayClient.deleteCustomDomain")(
    function* (scope: CustomDomainScope, domainId: string) {
      const response = yield* execute(
        "DeleteCustomDomain",
        `
          mutation DeleteCustomDomain($domainId: String!) {
            customDomainDelete(id: $domainId)
          }
        `,
        { ...scope, domainId },
        CustomDomainDeleteResponse,
      );
      if (!response.customDomainDelete) {
        return yield* new RailwayApiError({
          operation: "DeleteCustomDomain",
          message: "Railway did not delete the custom domain",
        });
      }
    },
  );

  const deployService = Effect.fn("RailwayClient.deployService")(
    function* (scope: ServiceScope) {
      const response = yield* execute(
        "DeployService",
        `
          mutation DeployService(
            $serviceId: String!
            $environmentId: String!
          ) {
            serviceInstanceDeployV2(
              serviceId: $serviceId
              environmentId: $environmentId
            )
          }
        `,
        { ...scope },
        DeployServiceResponse,
      );
      const deploymentId = response.serviceInstanceDeployV2;
      const maxPolls = options.deploymentMaxPolls ?? 300;
      const pollInterval = options.deploymentPollInterval ?? 2_000;
      const poll = Effect.fn("RailwayClient.pollDeployment")(function* () {
        const deployment = yield* execute(
          "GetDeployment",
          `
            query GetDeployment($deploymentId: String!) {
              deployment(id: $deploymentId) { id status }
            }
          `,
          { deploymentId },
          DeploymentResponse,
        );
        const status = deployment.deployment.status;
        if (status === "SUCCESS") return yield* getService(scope);
        if (
          status === "FAILED" ||
          status === "CRASHED" ||
          status === "REMOVED" ||
          status === "SKIPPED" ||
          status === "NEEDS_APPROVAL"
        ) {
          return yield* new RailwayDeploymentFailed({
            deploymentId,
            status,
            message: `Railway deployment '${deploymentId}' ended with ${status}`,
          });
        }
        return yield* Effect.fail(
          DeploymentPoll.Pending({ deploymentId, status }),
        );
      });
      return yield* poll().pipe(
        Effect.retry({
          schedule: Schedule.spaced(pollInterval).pipe(
            Schedule.upTo({ times: Math.max(0, maxPolls - 1) }),
          ),
          while: DeploymentPoll.$is("Pending"),
        }),
        Effect.catchTag(
          "Pending",
          () =>
            new RailwayDeploymentFailed({
              deploymentId,
              status: "TIMEOUT",
              message:
                `Railway deployment '${deploymentId}' did not finish in time`,
            }),
        ),
      );
    },
  );

  const deleteService = Effect.fn("RailwayClient.deleteService")(
    function* (scope: ServiceScope) {
      const response = yield* execute(
        "DeleteService",
        `
          mutation DeleteService(
            $serviceId: String!
            $environmentId: String!
          ) {
            serviceDelete(
              id: $serviceId
              environmentId: $environmentId
            )
          }
        `,
        { ...scope },
        ServiceDeleteResponse,
      );
      if (!response.serviceDelete) {
        return yield* new RailwayApiError({
          operation: "DeleteService",
          message: "Railway did not delete the service",
        });
      }
    },
  );

  return {
    getProject,
    getService,
    getEnvironment,
    listEnvironments,
    createEnvironment,
    renameEnvironment,
    deleteEnvironment,
    listServices,
    createService,
    updateService,
    upsertVariables,
    deleteVariable,
    getVariables,
    putVariable,
    removeVariable,
    ensureDomain,
    deleteDomain,
    listCustomDomains,
    createCustomDomain,
    updateCustomDomain,
    deleteCustomDomain,
    deployService,
    deleteService,
  };
};

export interface RailwayGraphQLClientOptions {
  readonly endpoint?: string;
  readonly deploymentPollInterval?: number;
  readonly deploymentMaxPolls?: number;
  readonly maxReadRetries?: number;
  readonly retryBaseDelay?: number;
}

export const RailwayClientLive = (
  options: RailwayGraphQLClientOptions = {},
) =>
  Layer.effect(
    RailwayClient,
    Effect.gen(function* () {
      const credentials = yield* RailwayCredentials;
      const withCredentials = <A>(
        operation: (
          client: RailwayClientService,
        ) => Effect.Effect<A, RailwayClientError>,
      ) =>
        credentials.resolve.pipe(
          Effect.mapError(
            () =>
              new RailwayAuthenticationError({
                message: "Unable to resolve Railway credentials",
              }),
          ),
          Effect.flatMap((resolved) =>
            operation(
              makeRailwayClient(
                makeRailwayFetchExecutor({
                  token: resolved.token,
                  tokenType: resolved.tokenType,
                  ...(options.endpoint === undefined
                    ? {}
                    : { endpoint: options.endpoint }),
                  ...(options.maxReadRetries === undefined
                    ? {}
                    : { maxReadRetries: options.maxReadRetries }),
                  ...(options.retryBaseDelay === undefined
                    ? {}
                    : { retryBaseDelay: options.retryBaseDelay }),
                }),
                {
                  ...(options.deploymentPollInterval === undefined
                    ? {}
                    : {
                        deploymentPollInterval:
                          options.deploymentPollInterval,
                      }),
                  ...(options.deploymentMaxPolls === undefined
                    ? {}
                    : {
                        deploymentMaxPolls: options.deploymentMaxPolls,
                      }),
                },
              ),
            ),
          ),
        );

      return RailwayClient.of({
        getProject: Effect.fn("RailwayClient.live.getProject")(function* (
          projectId: string,
          environmentId: string,
        ) {
          return yield* withCredentials((client) =>
            client.getProject(projectId, environmentId),
          );
        }),
        getService: Effect.fn("RailwayClient.live.getService")(function* (
          scope: ServiceScope,
        ) {
          return yield* withCredentials((client) =>
            client.getService(scope),
          );
        }),
        getEnvironment: Effect.fn(
          "RailwayClient.live.getEnvironment",
        )(function* (scope: EnvironmentScope) {
          return yield* withCredentials((client) =>
            client.getEnvironment(scope),
          );
        }),
        listEnvironments: Effect.fn(
          "RailwayClient.live.listEnvironments",
        )(function* (projectId: string) {
          return yield* withCredentials((client) =>
            client.listEnvironments(projectId),
          );
        }),
        createEnvironment: Effect.fn(
          "RailwayClient.live.createEnvironment",
        )(function* (input: PutEnvironmentInput) {
          return yield* withCredentials((client) =>
            client.createEnvironment(input),
          );
        }),
        renameEnvironment: Effect.fn(
          "RailwayClient.live.renameEnvironment",
        )(function* (scope: EnvironmentScope, name: string) {
          return yield* withCredentials((client) =>
            client.renameEnvironment(scope, name),
          );
        }),
        deleteEnvironment: Effect.fn(
          "RailwayClient.live.deleteEnvironment",
        )(function* (scope: EnvironmentScope) {
          return yield* withCredentials((client) =>
            client.deleteEnvironment(scope),
          );
        }),
        listServices: Effect.fn("RailwayClient.live.listServices")(
          function* (projectId: string, environmentId: string) {
            return yield* withCredentials((client) =>
              client.listServices(projectId, environmentId),
            );
          },
        ),
        createService: Effect.fn("RailwayClient.live.createService")(
          function* (input: PutServiceInput) {
            return yield* withCredentials((client) =>
              client.createService(input),
            );
          },
        ),
        updateService: Effect.fn("RailwayClient.live.updateService")(
          function* (input: UpdateServiceInput) {
            return yield* withCredentials((client) =>
              client.updateService(input),
            );
          },
        ),
        upsertVariables: Effect.fn(
          "RailwayClient.live.upsertVariables",
        )(function* (
          scope: ServiceScope,
          variables: Readonly<Record<string, string>>,
        ) {
          return yield* withCredentials((client) =>
            client.upsertVariables(scope, variables),
          );
        }),
        deleteVariable: Effect.fn(
          "RailwayClient.live.deleteVariable",
        )(function* (scope: ServiceScope, name: string) {
          return yield* withCredentials((client) =>
            client.deleteVariable(scope, name),
          );
        }),
        getVariables: Effect.fn("RailwayClient.live.getVariables")(
          function* (scope: VariableScope) {
            return yield* withCredentials((client) =>
              client.getVariables(scope),
            );
          },
        ),
        putVariable: Effect.fn("RailwayClient.live.putVariable")(
          function* (input: PutVariableInput) {
            return yield* withCredentials((client) =>
              client.putVariable(input),
            );
          },
        ),
        removeVariable: Effect.fn("RailwayClient.live.removeVariable")(
          function* (scope: VariableScope, name: string) {
            return yield* withCredentials((client) =>
              client.removeVariable(scope, name),
            );
          },
        ),
        ensureDomain: Effect.fn("RailwayClient.live.ensureDomain")(
          function* (scope: ServiceScope, targetPort?: number) {
            return yield* withCredentials((client) =>
              client.ensureDomain(scope, targetPort),
            );
          },
        ),
        deleteDomain: Effect.fn("RailwayClient.live.deleteDomain")(
          function* (scope: ServiceScope, domainId: string) {
            return yield* withCredentials((client) =>
              client.deleteDomain(scope, domainId),
            );
          },
        ),
        listCustomDomains: Effect.fn(
          "RailwayClient.live.listCustomDomains",
        )(function* (scope: CustomDomainScope) {
          return yield* withCredentials((client) =>
            client.listCustomDomains(scope),
          );
        }),
        createCustomDomain: Effect.fn(
          "RailwayClient.live.createCustomDomain",
        )(function* (input: PutCustomDomainInput) {
          return yield* withCredentials((client) =>
            client.createCustomDomain(input),
          );
        }),
        updateCustomDomain: Effect.fn(
          "RailwayClient.live.updateCustomDomain",
        )(function* (
          scope: CustomDomainScope,
          domainId: string,
          targetPort?: number,
        ) {
          return yield* withCredentials((client) =>
            client.updateCustomDomain(scope, domainId, targetPort),
          );
        }),
        deleteCustomDomain: Effect.fn(
          "RailwayClient.live.deleteCustomDomain",
        )(function* (scope: CustomDomainScope, domainId: string) {
          return yield* withCredentials((client) =>
            client.deleteCustomDomain(scope, domainId),
          );
        }),
        deployService: Effect.fn("RailwayClient.live.deployService")(
          function* (scope: ServiceScope) {
            return yield* withCredentials((client) =>
              client.deployService(scope),
            );
          },
        ),
        deleteService: Effect.fn("RailwayClient.live.deleteService")(
          function* (scope: ServiceScope) {
            return yield* withCredentials((client) =>
              client.deleteService(scope),
            );
          },
        ),
      });
    }),
  );
