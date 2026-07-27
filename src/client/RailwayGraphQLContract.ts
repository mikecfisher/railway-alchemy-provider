import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { RailwayApiError } from "../Errors.js";
import {
  DeploymentStatus,
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

const ServiceInstance = Schema.Struct({
  serviceId: Schema.NonEmptyString,
  serviceName: Schema.NonEmptyString,
  source: Schema.NullOr(
    Schema.Struct({
      image: NullableString,
    }),
  ),
  healthcheckPath: NullableString,
  region: NullableString,
  numReplicas: Schema.NullOr(Schema.Int),
  latestDeployment: Schema.NullOr(
    Schema.Struct({
      id: Schema.NonEmptyString,
      status: DeploymentStatus,
    }),
  ),
});

export const ServiceResponse = Schema.Struct({
  serviceInstance: ServiceInstance,
  variables: Schema.Record(Schema.String, Schema.String),
  domains: Schema.Struct({
    serviceDomains: Schema.Array(
      Schema.Struct({
        id: Schema.NonEmptyString,
        domain: Schema.NonEmptyString,
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

export const VariableCollectionUpsertResponse = Schema.Struct({
  variableCollectionUpsert: Schema.Boolean,
});

export const VariableDeleteResponse = Schema.Struct({
  variableDelete: Schema.Boolean,
});

export const ServiceDomainCreateResponse = Schema.Struct({
  serviceDomainCreate: Schema.Struct({ id: Schema.NonEmptyString }),
});

export const ServiceDomainDeleteResponse = Schema.Struct({
  serviceDomainDelete: Schema.Boolean,
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
  return {
    serviceId: service.serviceInstance.serviceId,
    projectId: scope.projectId,
    environmentId: scope.environmentId,
    name: service.serviceInstance.serviceName,
    image: service.serviceInstance.source?.image ?? "",
    ...(service.serviceInstance.healthcheckPath === null
      ? {}
      : { healthcheckPath: service.serviceInstance.healthcheckPath }),
    ...(service.serviceInstance.region === null
      ? {}
      : { region: service.serviceInstance.region }),
    numReplicas: service.serviceInstance.numReplicas ?? 1,
    variables: service.variables,
    ...(domain === undefined
      ? {}
      : { domainId: domain.id, domain: domain.domain }),
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
