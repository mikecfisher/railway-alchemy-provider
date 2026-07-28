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

export const EnvironmentSnapshot = Schema.Struct({
  environmentId: Schema.NonEmptyString,
  projectId: Schema.NonEmptyString,
  name: Schema.NonEmptyString,
  ephemeral: Schema.Boolean,
});

export interface EnvironmentSnapshot
  extends Schema.Schema.Type<typeof EnvironmentSnapshot> {}

export const CustomDomainSnapshot = Schema.Struct({
  domainId: Schema.NonEmptyString,
  projectId: Schema.NonEmptyString,
  environmentId: Schema.NonEmptyString,
  serviceId: Schema.NonEmptyString,
  domain: Schema.NonEmptyString,
  targetPort: Schema.optional(Schema.Int),
  verified: Schema.optional(Schema.Boolean),
  certificateStatus: Schema.optional(Schema.String),
  syncStatus: Schema.optional(Schema.String),
});

export interface CustomDomainSnapshot
  extends Schema.Schema.Type<typeof CustomDomainSnapshot> {}

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

export const ServiceBuilder = Schema.Literals([
  "HEROKU",
  "NIXPACKS",
  "PAKETO",
  "RAILPACK",
]);

export type ServiceBuilder = Schema.Schema.Type<typeof ServiceBuilder>;

export const RestartPolicyType = Schema.Literals([
  "ALWAYS",
  "NEVER",
  "ON_FAILURE",
]);

export type RestartPolicyType = Schema.Schema.Type<
  typeof RestartPolicyType
>;

export type ServiceSource =
  | {
      readonly image: string;
    }
  | {
      readonly repo: string;
      readonly branch: string;
      readonly checkSuites?: boolean;
    };

export const ServiceSnapshot = Schema.Struct({
  serviceId: Schema.NonEmptyString,
  projectId: Schema.NonEmptyString,
  environmentId: Schema.NonEmptyString,
  name: Schema.NonEmptyString,
  image: Schema.optional(Schema.String),
  repository: Schema.optional(Schema.String),
  branch: Schema.optional(Schema.String),
  checkSuites: Schema.optional(Schema.Boolean),
  deploymentTriggerId: Schema.optional(Schema.String),
  healthcheckPath: Schema.optional(Schema.String),
  healthcheckTimeout: Schema.optional(Schema.Int),
  region: Schema.optional(Schema.String),
  numReplicas: Schema.Int,
  builder: Schema.optional(ServiceBuilder),
  rootDirectory: Schema.optional(Schema.String),
  buildCommand: Schema.optional(Schema.String),
  startCommand: Schema.optional(Schema.String),
  preDeployCommand: Schema.optional(Schema.Array(Schema.String)),
  dockerfilePath: Schema.optional(Schema.String),
  restartPolicyType: Schema.optional(RestartPolicyType),
  restartPolicyMaxRetries: Schema.optional(Schema.Int),
  sleepApplication: Schema.optional(Schema.Boolean),
  cronSchedule: Schema.optional(Schema.String),
  watchPatterns: Schema.optional(Schema.Array(Schema.String)),
  variables: Schema.Record(Schema.String, Schema.String),
  domainId: Schema.optional(Schema.String),
  domain: Schema.optional(Schema.String),
  targetPort: Schema.optional(Schema.Int),
  deploymentId: Schema.optional(Schema.String),
  deploymentStatus: Schema.optional(DeploymentStatus),
});

export interface ServiceSnapshot
  extends Schema.Schema.Type<typeof ServiceSnapshot> {}

export interface PutServiceInput {
  readonly projectId: string;
  readonly environmentId: string;
  readonly name: string;
  readonly source: ServiceSource;
  readonly healthcheckPath?: string;
  readonly healthcheckTimeout?: number;
  readonly region?: string;
  readonly numReplicas: number;
  readonly builder?: ServiceBuilder;
  readonly rootDirectory?: string;
  readonly buildCommand?: string;
  readonly startCommand?: string;
  readonly preDeployCommand?: ReadonlyArray<string>;
  readonly dockerfilePath?: string;
  readonly restartPolicyType?: RestartPolicyType;
  readonly restartPolicyMaxRetries?: number;
  readonly sleepApplication?: boolean;
  readonly cronSchedule?: string;
  readonly watchPatterns?: ReadonlyArray<string>;
}

export interface UpdateServiceInput extends PutServiceInput {
  readonly serviceId: string;
}

export interface ServiceScope {
  readonly projectId: string;
  readonly environmentId: string;
  readonly serviceId: string;
}

export interface EnvironmentScope {
  readonly projectId: string;
  readonly environmentId: string;
}

export interface PutEnvironmentInput {
  readonly projectId: string;
  readonly name: string;
  readonly sourceEnvironmentId?: string;
  readonly ephemeral?: boolean;
  readonly skipInitialDeploys?: boolean;
}

export interface VariableScope {
  readonly projectId: string;
  readonly environmentId: string;
  readonly serviceId?: string;
}

export interface PutVariableInput extends VariableScope {
  readonly name: string;
  readonly value: string;
  readonly skipDeploys?: boolean;
}

export interface CustomDomainScope extends ServiceScope {}

export interface PutCustomDomainInput extends CustomDomainScope {
  readonly domain: string;
  readonly targetPort?: number;
}

export interface RailwayClientService {
  readonly getProject: (
    projectId: string,
    environmentId: string,
  ) => Effect.Effect<ProjectSnapshot, RailwayClientError>;
  readonly getService: (
    scope: ServiceScope,
  ) => Effect.Effect<ServiceSnapshot, RailwayClientError>;
  readonly getEnvironment: (
    scope: EnvironmentScope,
  ) => Effect.Effect<EnvironmentSnapshot, RailwayClientError>;
  readonly listEnvironments: (
    projectId: string,
  ) => Effect.Effect<ReadonlyArray<EnvironmentSnapshot>, RailwayClientError>;
  readonly createEnvironment: (
    input: PutEnvironmentInput,
  ) => Effect.Effect<EnvironmentSnapshot, RailwayClientError>;
  readonly renameEnvironment: (
    scope: EnvironmentScope,
    name: string,
  ) => Effect.Effect<EnvironmentSnapshot, RailwayClientError>;
  readonly deleteEnvironment: (
    scope: EnvironmentScope,
  ) => Effect.Effect<void, RailwayClientError>;
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
  readonly getVariables: (
    scope: VariableScope,
  ) => Effect.Effect<
    Readonly<Record<string, string>>,
    RailwayClientError
  >;
  readonly putVariable: (
    input: PutVariableInput,
  ) => Effect.Effect<void, RailwayClientError>;
  readonly removeVariable: (
    scope: VariableScope,
    name: string,
  ) => Effect.Effect<void, RailwayClientError>;
  readonly ensureDomain: (
    scope: ServiceScope,
    targetPort?: number,
  ) => Effect.Effect<ServiceSnapshot, RailwayClientError>;
  readonly deleteDomain: (
    scope: ServiceScope,
    domainId: string,
  ) => Effect.Effect<ServiceSnapshot, RailwayClientError>;
  readonly listCustomDomains: (
    scope: CustomDomainScope,
  ) => Effect.Effect<
    ReadonlyArray<CustomDomainSnapshot>,
    RailwayClientError
  >;
  readonly createCustomDomain: (
    input: PutCustomDomainInput,
  ) => Effect.Effect<CustomDomainSnapshot, RailwayClientError>;
  readonly updateCustomDomain: (
    scope: CustomDomainScope,
    domainId: string,
    targetPort?: number,
  ) => Effect.Effect<CustomDomainSnapshot, RailwayClientError>;
  readonly deleteCustomDomain: (
    scope: CustomDomainScope,
    domainId: string,
  ) => Effect.Effect<void, RailwayClientError>;
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
