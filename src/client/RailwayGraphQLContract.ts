import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { RailwayApiError } from "../Errors.js";
import {
  DeploymentStatus,
  RestartPolicyType,
  ServiceBuilder,
  type ServiceScope,
  type ServiceSnapshot,
} from "./RailwayClient.js";

const NullableString = Schema.NullOr(Schema.String);

export const ProjectResponse = Schema.Struct({
  project: Schema.Struct({
    id: Schema.NonEmptyString,
    name: Schema.NonEmptyString,
  }),
  environment: Schema.Struct({
    id: Schema.NonEmptyString,
    name: Schema.NonEmptyString,
    projectId: Schema.NonEmptyString,
  }),
});

export const EnvironmentResponse = Schema.Struct({
  environment: Schema.Struct({
    id: Schema.NonEmptyString,
    projectId: Schema.NonEmptyString,
    name: Schema.NonEmptyString,
    isEphemeral: Schema.Boolean,
  }),
});

const EnvironmentValue = Schema.Struct({
  id: Schema.NonEmptyString,
  projectId: Schema.NonEmptyString,
  name: Schema.NonEmptyString,
  isEphemeral: Schema.Boolean,
});

export const EnvironmentListResponse = Schema.Struct({
  project: Schema.Struct({
    environments: Schema.Struct({
      edges: Schema.Array(
        Schema.Struct({
          node: EnvironmentValue,
        }),
      ),
      pageInfo: Schema.Struct({
        hasNextPage: Schema.Boolean,
        endCursor: Schema.NullOr(Schema.String),
      }),
    }),
  }),
});

export const EnvironmentMutationResponse = Schema.Struct({
  environmentCreate: EnvironmentValue,
});

export const EnvironmentRenameResponse = Schema.Struct({
  environmentRename: EnvironmentValue,
});

export const EnvironmentDeleteResponse = Schema.Struct({
  environmentDelete: Schema.Boolean,
});

const ServiceInstance = Schema.Struct({
  serviceId: Schema.NonEmptyString,
  serviceName: Schema.NonEmptyString,
  source: Schema.NullOr(
    Schema.Struct({
      image: NullableString,
      repo: Schema.optional(NullableString),
    }),
  ),
  healthcheckPath: NullableString,
  healthcheckTimeout: Schema.optional(Schema.NullOr(Schema.Int)),
  region: NullableString,
  numReplicas: Schema.NullOr(Schema.Int),
  builder: Schema.optional(Schema.NullOr(ServiceBuilder)),
  rootDirectory: Schema.optional(NullableString),
  buildCommand: Schema.optional(NullableString),
  startCommand: Schema.optional(NullableString),
  preDeployCommand: Schema.optional(
    Schema.NullOr(Schema.Array(Schema.String)),
  ),
  dockerfilePath: Schema.optional(NullableString),
  restartPolicyType: Schema.optional(Schema.NullOr(RestartPolicyType)),
  restartPolicyMaxRetries: Schema.optional(Schema.NullOr(Schema.Int)),
  sleepApplication: Schema.optional(Schema.NullOr(Schema.Boolean)),
  cronSchedule: Schema.optional(NullableString),
  watchPatterns: Schema.optional(
    Schema.NullOr(Schema.Array(Schema.String)),
  ),
  latestDeployment: Schema.NullOr(
    Schema.Struct({
      id: Schema.NonEmptyString,
      status: DeploymentStatus,
    }),
  ),
});

export const ServiceResponse = Schema.Struct({
  serviceInstance: ServiceInstance,
  service: Schema.optionalKey(
    Schema.Struct({
      repoTriggers: Schema.Struct({
        edges: Schema.Array(
          Schema.Struct({
            node: Schema.Struct({
              id: Schema.NonEmptyString,
              branch: Schema.NonEmptyString,
              repository: Schema.NonEmptyString,
              checkSuites: Schema.Boolean,
            }),
          }),
        ),
      }),
    }),
  ),
  variables: Schema.Record(Schema.String, Schema.String),
  domains: Schema.Struct({
    serviceDomains: Schema.Array(
      Schema.Struct({
        id: Schema.NonEmptyString,
        domain: Schema.NonEmptyString,
        targetPort: Schema.optional(Schema.NullOr(Schema.Int)),
      }),
    ),
  }),
});

export const ServiceListResponse = Schema.Struct({
  project: Schema.Struct({
    services: Schema.Struct({
      edges: Schema.Array(
        Schema.Struct({
          node: Schema.Struct({
            id: Schema.NonEmptyString,
            name: Schema.NonEmptyString,
            projectId: Schema.NonEmptyString,
          }),
        }),
      ),
      pageInfo: Schema.Struct({
        hasNextPage: Schema.Boolean,
        endCursor: Schema.NullOr(Schema.String),
      }),
    }),
  }),
});

export const CreateServiceResponse = Schema.Struct({
  serviceCreate: Schema.Struct({ id: Schema.NonEmptyString }),
});

export const UpdateServiceResponse = Schema.Struct({
  serviceInstanceUpdate: Schema.Boolean,
});

export const RenameServiceResponse = Schema.Struct({
  serviceUpdate: Schema.Struct({ id: Schema.NonEmptyString }),
});

export const DeploymentTriggerCreateResponse = Schema.Struct({
  deploymentTriggerCreate: Schema.Struct({
    id: Schema.NonEmptyString,
  }),
});

export const DeploymentTriggerUpdateResponse = Schema.Struct({
  deploymentTriggerUpdate: Schema.Struct({
    id: Schema.NonEmptyString,
  }),
});

export const DeploymentTriggerDeleteResponse = Schema.Struct({
  deploymentTriggerDelete: Schema.Boolean,
});

export const VariableCollectionUpsertResponse = Schema.Struct({
  variableCollectionUpsert: Schema.Boolean,
});

export const VariableDeleteResponse = Schema.Struct({
  variableDelete: Schema.Boolean,
});

export const VariablesResponse = Schema.Struct({
  variables: Schema.Record(Schema.String, Schema.String),
});

export const VariableUpsertResponse = Schema.Struct({
  variableUpsert: Schema.Boolean,
});

export const ServiceDomainCreateResponse = Schema.Struct({
  serviceDomainCreate: Schema.Struct({ id: Schema.NonEmptyString }),
});

export const ServiceDomainDeleteResponse = Schema.Struct({
  serviceDomainDelete: Schema.Boolean,
});

export const ServiceDomainUpdateResponse = Schema.Struct({
  serviceDomainUpdate: Schema.Boolean,
});

const CustomDomainValue = Schema.Struct({
  id: Schema.NonEmptyString,
  projectId: Schema.NullOr(Schema.String),
  environmentId: Schema.NonEmptyString,
  serviceId: Schema.NonEmptyString,
  domain: Schema.NonEmptyString,
  targetPort: Schema.NullOr(Schema.Int),
  status: Schema.Struct({
    verified: Schema.Boolean,
    certificateStatus: Schema.String,
  }),
  syncStatus: Schema.String,
});

export const CustomDomainListResponse = Schema.Struct({
  domains: Schema.Struct({
    customDomains: Schema.Array(CustomDomainValue),
  }),
});

export const CustomDomainCreateResponse = Schema.Struct({
  customDomainCreate: CustomDomainValue,
});

export const CustomDomainUpdateResponse = Schema.Struct({
  customDomainUpdate: Schema.Boolean,
});

export const CustomDomainDeleteResponse = Schema.Struct({
  customDomainDelete: Schema.Boolean,
});

export const DeployServiceResponse = Schema.Struct({
  serviceInstanceDeployV2: Schema.NonEmptyString,
});

export const DeploymentResponse = Schema.Struct({
  deployment: Schema.Struct({
    id: Schema.NonEmptyString,
    status: DeploymentStatus,
  }),
});

export const ServiceDeleteResponse = Schema.Struct({
  serviceDelete: Schema.Boolean,
});

export const decodeGraphQLContract = <S extends Schema.Constraint>(
  operation: string,
  schema: S,
  value: unknown,
): Effect.Effect<
  S["Type"],
  RailwayApiError,
  S["DecodingServices"]
> =>
  Schema.decodeUnknownEffect(schema)(value).pipe(
    Effect.mapError(
      () =>
        new RailwayApiError({
          operation,
          message:
            `Railway returned an invalid response while attempting to ${operation}`,
        }),
    ),
  );

export const serviceSnapshotOf = (
  scope: Pick<ServiceScope, "projectId" | "environmentId">,
  service: Schema.Schema.Type<typeof ServiceResponse>,
): ServiceSnapshot => {
  const domain = service.domains.serviceDomains[0];
  const trigger = service.service?.repoTriggers.edges[0]?.node;
  return {
    serviceId: service.serviceInstance.serviceId,
    projectId: scope.projectId,
    environmentId: scope.environmentId,
    name: service.serviceInstance.serviceName,
    ...(service.serviceInstance.source?.image === null ||
    service.serviceInstance.source?.image === undefined
      ? {}
      : { image: service.serviceInstance.source.image }),
    ...(service.serviceInstance.source?.repo === null ||
    service.serviceInstance.source?.repo === undefined
      ? {}
      : { repository: service.serviceInstance.source.repo }),
    ...(trigger === undefined
      ? {}
      : {
          deploymentTriggerId: trigger.id,
          repository: trigger.repository,
          branch: trigger.branch,
          checkSuites: trigger.checkSuites,
        }),
    ...(service.serviceInstance.healthcheckPath === null
      ? {}
      : { healthcheckPath: service.serviceInstance.healthcheckPath }),
    ...(service.serviceInstance.healthcheckTimeout === null ||
    service.serviceInstance.healthcheckTimeout === undefined
      ? {}
      : { healthcheckTimeout: service.serviceInstance.healthcheckTimeout }),
    ...(service.serviceInstance.region === null
      ? {}
      : { region: service.serviceInstance.region }),
    numReplicas: service.serviceInstance.numReplicas ?? 1,
    ...(service.serviceInstance.builder === null ||
    service.serviceInstance.builder === undefined
      ? {}
      : { builder: service.serviceInstance.builder }),
    ...(service.serviceInstance.rootDirectory === null ||
    service.serviceInstance.rootDirectory === undefined
      ? {}
      : { rootDirectory: service.serviceInstance.rootDirectory }),
    ...(service.serviceInstance.buildCommand === null ||
    service.serviceInstance.buildCommand === undefined
      ? {}
      : { buildCommand: service.serviceInstance.buildCommand }),
    ...(service.serviceInstance.startCommand === null ||
    service.serviceInstance.startCommand === undefined
      ? {}
      : { startCommand: service.serviceInstance.startCommand }),
    ...(service.serviceInstance.preDeployCommand === null ||
    service.serviceInstance.preDeployCommand === undefined
      ? {}
      : { preDeployCommand: service.serviceInstance.preDeployCommand }),
    ...(service.serviceInstance.dockerfilePath === null ||
    service.serviceInstance.dockerfilePath === undefined
      ? {}
      : { dockerfilePath: service.serviceInstance.dockerfilePath }),
    ...(service.serviceInstance.restartPolicyType === null ||
    service.serviceInstance.restartPolicyType === undefined
      ? {}
      : { restartPolicyType: service.serviceInstance.restartPolicyType }),
    ...(service.serviceInstance.restartPolicyMaxRetries === null ||
    service.serviceInstance.restartPolicyMaxRetries === undefined
      ? {}
      : {
          restartPolicyMaxRetries:
            service.serviceInstance.restartPolicyMaxRetries,
        }),
    ...(service.serviceInstance.sleepApplication === null ||
    service.serviceInstance.sleepApplication === undefined
      ? {}
      : { sleepApplication: service.serviceInstance.sleepApplication }),
    ...(service.serviceInstance.cronSchedule === null ||
    service.serviceInstance.cronSchedule === undefined
      ? {}
      : { cronSchedule: service.serviceInstance.cronSchedule }),
    ...(service.serviceInstance.watchPatterns === null ||
    service.serviceInstance.watchPatterns === undefined
      ? {}
      : { watchPatterns: service.serviceInstance.watchPatterns }),
    variables: service.variables,
    ...(domain === undefined
      ? {}
      : {
          domainId: domain.id,
          domain: domain.domain,
          ...(domain.targetPort === null || domain.targetPort === undefined
            ? {}
            : { targetPort: domain.targetPort }),
        }),
    ...(service.serviceInstance.latestDeployment === null
      ? {}
      : {
          deploymentId:
            service.serviceInstance.latestDeployment.id,
          deploymentStatus:
            service.serviceInstance.latestDeployment.status,
        }),
  };
};
