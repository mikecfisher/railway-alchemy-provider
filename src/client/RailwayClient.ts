import * as Context from "effect/Context";
import type * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import type { RailwayClientError } from "../Errors.js";

export const ProjectSnapshot = Schema.Struct({
  projectId: Schema.NonEmptyString,
  name: Schema.NonEmptyString,
  environmentId: Schema.NonEmptyString,
  environmentName: Schema.NonEmptyString,
});

export interface ProjectSnapshot
  extends Schema.Schema.Type<typeof ProjectSnapshot> {}

export const DeploymentStatus = Schema.Literals([
  "QUEUED",
  "INITIALIZING",
  "WAITING",
  "BUILDING",
  "DEPLOYING",
  "SUCCESS",
  "FAILED",
  "CRASHED",
  "NEEDS_APPROVAL",
  "SLEEPING",
  "SKIPPED",
  "REMOVING",
  "REMOVED",
]);

export type DeploymentStatus = Schema.Schema.Type<typeof DeploymentStatus>;

export const ServiceSnapshot = Schema.Struct({
  serviceId: Schema.NonEmptyString,
  projectId: Schema.NonEmptyString,
  environmentId: Schema.NonEmptyString,
  name: Schema.NonEmptyString,
  image: Schema.String,
  healthcheckPath: Schema.optional(Schema.String),
  region: Schema.optional(Schema.String),
  numReplicas: Schema.Int,
  variables: Schema.Record(Schema.String, Schema.String),
  domainId: Schema.optional(Schema.String),
  domain: Schema.optional(Schema.String),
  deploymentId: Schema.optional(Schema.String),
  deploymentStatus: Schema.optional(DeploymentStatus),
});

export interface ServiceSnapshot
  extends Schema.Schema.Type<typeof ServiceSnapshot> {}

export interface PutServiceInput {
  readonly projectId: string;
  readonly environmentId: string;
  readonly name: string;
  readonly image: string;
  readonly healthcheckPath?: string;
  readonly region?: string;
  readonly numReplicas: number;
}

export interface UpdateServiceInput extends PutServiceInput {
  readonly serviceId: string;
}

export interface ServiceScope {
  readonly projectId: string;
  readonly environmentId: string;
  readonly serviceId: string;
}

export interface RailwayClientService {
  readonly getProject: (
    projectId: string,
    environmentId: string,
  ) => Effect.Effect<ProjectSnapshot, RailwayClientError>;
  readonly getService: (
    scope: ServiceScope,
  ) => Effect.Effect<ServiceSnapshot, RailwayClientError>;
  readonly listServices: (
    projectId: string,
    environmentId: string,
  ) => Effect.Effect<ReadonlyArray<ServiceSnapshot>, RailwayClientError>;
  readonly createService: (
    input: PutServiceInput,
  ) => Effect.Effect<ServiceSnapshot, RailwayClientError>;
  readonly updateService: (
    input: UpdateServiceInput,
  ) => Effect.Effect<ServiceSnapshot, RailwayClientError>;
  readonly upsertVariables: (
    scope: ServiceScope,
    variables: Readonly<Record<string, string>>,
  ) => Effect.Effect<ServiceSnapshot, RailwayClientError>;
  readonly deleteVariable: (
    scope: ServiceScope,
    name: string,
  ) => Effect.Effect<ServiceSnapshot, RailwayClientError>;
  readonly ensureDomain: (
    scope: ServiceScope,
    targetPort?: number,
  ) => Effect.Effect<ServiceSnapshot, RailwayClientError>;
  readonly deleteDomain: (
    scope: ServiceScope,
    domainId: string,
  ) => Effect.Effect<ServiceSnapshot, RailwayClientError>;
  readonly deployService: (
    scope: ServiceScope,
  ) => Effect.Effect<ServiceSnapshot, RailwayClientError>;
  readonly deleteService: (
    scope: ServiceScope,
  ) => Effect.Effect<void, RailwayClientError>;
}

export class RailwayClient extends Context.Service<
  RailwayClient,
  RailwayClientService
>()("railway-alchemy-provider/client/RailwayClient") {}
