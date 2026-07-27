import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schedule from "effect/Schedule";
import type * as Schema from "effect/Schema";
import { RailwayCredentials } from "../auth/RailwayCredentials.js";
import {
  RailwayAuthenticationError,
  type RailwayClientError,
  RailwayDeploymentFailed,
  RailwayNotFound,
} from "../Errors.js";
import {
  type DeploymentStatus,
  type PutServiceInput,
  RailwayClient,
  type RailwayClientService,
  type ServiceScope,
  type ServiceSnapshot,
  type UpdateServiceInput,
} from "./RailwayClient.js";
import {
  CreateServiceResponse,
  decodeGraphQLContract,
  DeploymentResponse,
  DeployServiceResponse,
  ProjectResponse,
  RenameServiceResponse,
  ServiceDeleteResponse,
  ServiceDomainCreateResponse,
  ServiceDomainDeleteResponse,
  ServiceListResponse,
  ServiceResponse,
  serviceSnapshotOf,
  UpdateServiceResponse,
  VariableCollectionUpsertResponse,
  VariableDeleteResponse,
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
    source { image }
    healthcheckPath
    region
    numReplicas
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
    serviceDomains { id domain }
  }
`;

const serviceQuery = `
  query GetService(
    $projectId: String!
    $environmentId: String!
    $serviceId: String!
  ) {
    ${serviceFields}
  }
`;

const listServicesQuery = `
  query ListServices($projectId: String!) {
    project(id: $projectId) {
      services(first: 100) {
        edges {
          node {
            id
            name
            projectId
          }
        }
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

  const listServices = Effect.fn("RailwayClient.listServices")(
    function* (projectId: string, environmentId: string) {
      const response = yield* execute(
        "ListServices",
        listServicesQuery,
        { projectId, environmentId },
        ServiceListResponse,
      );
      return response.project.services.edges.map(
        ({ node }): ServiceSnapshot => ({
          serviceId: node.id,
          projectId,
          environmentId,
          name: node.name,
          image: "",
          numReplicas: 1,
          variables: {},
        }),
      );
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
      yield* execute(
        "UpdateService",
        `
          mutation UpdateService(
            $serviceId: String!
            $environmentId: String!
            $image: String!
            $healthcheckPath: String
            $region: String
            $numReplicas: Int!
          ) {
            serviceInstanceUpdate(
              serviceId: $serviceId
              environmentId: $environmentId
              input: {
                source: { image: $image }
                healthcheckPath: $healthcheckPath
                region: $region
                numReplicas: $numReplicas
              }
            )
          }
        `,
        {
          ...input,
          healthcheckPath: input.healthcheckPath ?? null,
          region: input.region ?? null,
        },
        UpdateServiceResponse,
      );
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
            $image: String!
          ) {
            serviceCreate(input: {
              projectId: $projectId
              environmentId: $environmentId
              name: $name
              source: { image: $image }
            }) { id }
          }
        `,
        { ...input },
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
      yield* execute(
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
      return yield* getService(scope);
    },
  );

  const deleteVariable = Effect.fn("RailwayClient.deleteVariable")(
    function* (scope: ServiceScope, name: string) {
      yield* execute(
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
      return yield* getService(scope);
    },
  );

  const ensureDomain = Effect.fn("RailwayClient.ensureDomain")(
    function* (scope: ServiceScope, targetPort?: number) {
      const current = yield* getService(scope);
      if (current.domain) return current;
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
      return yield* getService(scope);
    },
  );

  const deleteDomain = Effect.fn("RailwayClient.deleteDomain")(
    function* (scope: ServiceScope, domainId: string) {
      yield* execute(
        "DeleteServiceDomain",
        `
          mutation DeleteServiceDomain($domainId: String!) {
            serviceDomainDelete(id: $domainId)
          }
        `,
        { domainId },
        ServiceDomainDeleteResponse,
      );
      return yield* getService(scope);
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
      yield* execute(
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
    },
  );

  return {
    getProject,
    getService,
    listServices,
    createService,
    updateService,
    upsertVariables,
    deleteVariable,
    ensureDomain,
    deleteDomain,
    deployService,
    deleteService,
  };
};

export interface RailwayGraphQLClientOptions {
  readonly endpoint?: string;
  readonly deploymentPollInterval?: number;
  readonly deploymentMaxPolls?: number;
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
                  ...(options.endpoint === undefined
                    ? {}
                    : { endpoint: options.endpoint }),
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
