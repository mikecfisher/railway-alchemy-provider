import { Unowned } from "alchemy/AdoptPolicy";
import { isResolved } from "alchemy/Diff";
import * as Provider from "alchemy/Provider";
import { Resource } from "alchemy/Resource";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import {
  RailwayClient,
  type ServiceSnapshot,
} from "../client/RailwayClient.js";
import { RailwayAmbiguousMatch } from "../Errors.js";
import type { Providers } from "../Providers.js";
import type { ExistingProjectAttributes } from "./ExistingProject.js";

const ServicePropsSchema = Schema.Struct({
  project: Schema.Struct({
    projectId: Schema.NonEmptyString,
    environmentId: Schema.NonEmptyString,
  }),
  name: Schema.NonEmptyString,
  source: Schema.Union([
    Schema.Struct({ image: Schema.NonEmptyString }),
    Schema.Struct({
      repo: Schema.NonEmptyString,
      branch: Schema.NonEmptyString,
      checkSuites: Schema.optionalKey(Schema.Boolean),
    }),
  ]),
  healthcheckPath: Schema.optionalKey(Schema.String),
  healthcheckTimeout: Schema.optionalKey(
    Schema.Int.check(Schema.isGreaterThan(0)),
  ),
  region: Schema.optionalKey(Schema.NonEmptyString),
  numReplicas: Schema.optionalKey(Schema.Int.check(Schema.isGreaterThan(0))),
  builder: Schema.optionalKey(
    Schema.Literals(["HEROKU", "NIXPACKS", "PAKETO", "RAILPACK"]),
  ),
  rootDirectory: Schema.optionalKey(Schema.String),
  buildCommand: Schema.optionalKey(Schema.String),
  startCommand: Schema.optionalKey(Schema.String),
  preDeployCommand: Schema.optionalKey(Schema.Array(Schema.String)),
  dockerfilePath: Schema.optionalKey(Schema.String),
  restartPolicyType: Schema.optionalKey(
    Schema.Literals(["ALWAYS", "NEVER", "ON_FAILURE"]),
  ),
  restartPolicyMaxRetries: Schema.optionalKey(
    Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
  ),
  sleepApplication: Schema.optionalKey(Schema.Boolean),
  cronSchedule: Schema.optionalKey(Schema.String),
  watchPatterns: Schema.optionalKey(Schema.Array(Schema.String)),
  variables: Schema.optionalKey(
    Schema.Record(Schema.String, Schema.String),
  ),
  public: Schema.optionalKey(Schema.Boolean),
  targetPort: Schema.optionalKey(
    Schema.Int.check(Schema.isGreaterThan(0)),
  ),
});

export interface ServiceProps
  extends Schema.Schema.Type<typeof ServicePropsSchema> {
  readonly project: Pick<
    ExistingProjectAttributes,
    "projectId" | "environmentId"
  >;
}

export interface ServiceAttributes {
  readonly serviceId: string;
  readonly projectId: string;
  readonly environmentId: string;
  readonly name: string;
  readonly image?: string;
  readonly repository?: string;
  readonly branch?: string;
  readonly checkSuites?: boolean;
  readonly healthcheckPath?: string;
  readonly healthcheckTimeout?: number;
  readonly region?: string;
  readonly numReplicas: number;
  readonly builder?: ServiceSnapshot["builder"];
  readonly rootDirectory?: string;
  readonly buildCommand?: string;
  readonly startCommand?: string;
  readonly preDeployCommand?: ReadonlyArray<string>;
  readonly dockerfilePath?: string;
  readonly restartPolicyType?: ServiceSnapshot["restartPolicyType"];
  readonly restartPolicyMaxRetries?: number;
  readonly sleepApplication?: boolean;
  readonly cronSchedule?: string;
  readonly watchPatterns?: ReadonlyArray<string>;
  readonly variableNames: ReadonlyArray<string>;
  readonly domainId?: string;
  readonly domain?: string;
  readonly url?: string;
  readonly targetPort?: number;
  readonly deploymentId?: string;
  readonly deploymentStatus?: ServiceSnapshot["deploymentStatus"];
}

export type Service = Resource<
  "Railway.Service",
  ServiceProps,
  ServiceAttributes,
  never,
  Providers
>;

export const Service = Resource<Service>("Railway.Service");

const decodeProps = Schema.decodeUnknownEffect(ServicePropsSchema);

const scopeOf = (
  props: ServiceProps,
  serviceId: string,
) => ({
  projectId: props.project.projectId,
  environmentId: props.project.environmentId,
  serviceId,
});

const attributesOf = (
  service: ServiceSnapshot,
  variableNames: ReadonlyArray<string>,
): ServiceAttributes => ({
  serviceId: service.serviceId,
  projectId: service.projectId,
  environmentId: service.environmentId,
  name: service.name,
  ...(service.image === undefined ? {} : { image: service.image }),
  ...(service.repository === undefined
    ? {}
    : { repository: service.repository }),
  ...(service.branch === undefined ? {} : { branch: service.branch }),
  ...(service.checkSuites === undefined
    ? {}
    : { checkSuites: service.checkSuites }),
  ...(service.healthcheckPath === undefined
    ? {}
    : { healthcheckPath: service.healthcheckPath }),
  ...(service.healthcheckTimeout === undefined
    ? {}
    : { healthcheckTimeout: service.healthcheckTimeout }),
  ...(service.region === undefined ? {} : { region: service.region }),
  numReplicas: service.numReplicas,
  ...(service.builder === undefined ? {} : { builder: service.builder }),
  ...(service.rootDirectory === undefined
    ? {}
    : { rootDirectory: service.rootDirectory }),
  ...(service.buildCommand === undefined
    ? {}
    : { buildCommand: service.buildCommand }),
  ...(service.startCommand === undefined
    ? {}
    : { startCommand: service.startCommand }),
  ...(service.preDeployCommand === undefined
    ? {}
    : { preDeployCommand: service.preDeployCommand }),
  ...(service.dockerfilePath === undefined
    ? {}
    : { dockerfilePath: service.dockerfilePath }),
  ...(service.restartPolicyType === undefined
    ? {}
    : { restartPolicyType: service.restartPolicyType }),
  ...(service.restartPolicyMaxRetries === undefined
    ? {}
    : { restartPolicyMaxRetries: service.restartPolicyMaxRetries }),
  ...(service.sleepApplication === undefined
    ? {}
    : { sleepApplication: service.sleepApplication }),
  ...(service.cronSchedule === undefined
    ? {}
    : { cronSchedule: service.cronSchedule }),
  ...(service.watchPatterns === undefined
    ? {}
    : { watchPatterns: service.watchPatterns }),
  variableNames: [...variableNames].sort(),
  ...(service.domainId === undefined ? {} : { domainId: service.domainId }),
  ...(service.domain === undefined
    ? {}
    : { domain: service.domain, url: `https://${service.domain}` }),
  ...(service.targetPort === undefined
    ? {}
    : { targetPort: service.targetPort }),
  ...(service.deploymentId === undefined
    ? {}
    : { deploymentId: service.deploymentId }),
  ...(service.deploymentStatus === undefined
    ? {}
    : { deploymentStatus: service.deploymentStatus }),
});

const desiredOf = (props: ServiceProps) => ({
  projectId: props.project.projectId,
  environmentId: props.project.environmentId,
  name: props.name,
  source: props.source,
  ...(props.healthcheckPath === undefined
    ? {}
    : { healthcheckPath: props.healthcheckPath }),
  ...(props.healthcheckTimeout === undefined
    ? {}
    : { healthcheckTimeout: props.healthcheckTimeout }),
  ...(props.region === undefined ? {} : { region: props.region }),
  numReplicas: props.numReplicas ?? 1,
  ...(props.builder === undefined ? {} : { builder: props.builder }),
  ...(props.rootDirectory === undefined
    ? {}
    : { rootDirectory: props.rootDirectory }),
  ...(props.buildCommand === undefined
    ? {}
    : { buildCommand: props.buildCommand }),
  ...(props.startCommand === undefined
    ? {}
    : { startCommand: props.startCommand }),
  ...(props.preDeployCommand === undefined
    ? {}
    : { preDeployCommand: props.preDeployCommand }),
  ...(props.dockerfilePath === undefined
    ? {}
    : { dockerfilePath: props.dockerfilePath }),
  ...(props.restartPolicyType === undefined
    ? {}
    : { restartPolicyType: props.restartPolicyType }),
  ...(props.restartPolicyMaxRetries === undefined
    ? {}
    : { restartPolicyMaxRetries: props.restartPolicyMaxRetries }),
  ...(props.sleepApplication === undefined
    ? {}
    : { sleepApplication: props.sleepApplication }),
  ...(props.cronSchedule === undefined
    ? {}
    : { cronSchedule: props.cronSchedule }),
  ...(props.watchPatterns === undefined
    ? {}
    : { watchPatterns: props.watchPatterns }),
});

const sortedKeys = (record: Readonly<Record<string, string>>) =>
  Object.keys(record).sort();

const sameRecord = (
  left: Readonly<Record<string, string>>,
  right: Readonly<Record<string, string>>,
) => {
  const leftKeys = Object.keys(left).sort();
  const rightKeys = Object.keys(right).sort();
  return leftKeys.length === rightKeys.length &&
    leftKeys.every(
      (key, index) =>
        key === rightKeys[index] && left[key] === right[key],
  );
};

const sameArray = (
  left: ReadonlyArray<string> | undefined,
  right: ReadonlyArray<string> | undefined,
) =>
  left === undefined || right === undefined
    ? left === right
    : left.length === right.length &&
      left.every((value, index) => value === right[index]);

const sourceMatches = (
  service: ServiceSnapshot,
  source: ServiceProps["source"],
) =>
  "image" in source
    ? service.image === source.image && service.repository === undefined
    : service.repository === source.repo &&
      service.image === undefined &&
      service.branch === source.branch &&
      service.checkSuites === (source.checkSuites ?? false);

const matchesDesired = (
  service: ServiceSnapshot,
  props: ServiceProps,
  managedNames: ReadonlyArray<string>,
) => {
  const desired = desiredOf(props);
  const variables = props.variables ?? {};
  const observedManaged = Object.fromEntries(
    managedNames
      .filter((name) => service.variables[name] !== undefined)
      .map((name) => [name, service.variables[name] as string]),
  );
  return (
    service.projectId === desired.projectId &&
    service.environmentId === desired.environmentId &&
    service.name === desired.name &&
    sourceMatches(service, props.source) &&
    service.healthcheckPath === desired.healthcheckPath &&
    (desired.healthcheckTimeout === undefined ||
      service.healthcheckTimeout === desired.healthcheckTimeout) &&
    service.region === desired.region &&
    service.numReplicas === desired.numReplicas &&
    (desired.builder === undefined || service.builder === desired.builder) &&
    (desired.rootDirectory === undefined ||
      service.rootDirectory === desired.rootDirectory) &&
    (desired.buildCommand === undefined ||
      service.buildCommand === desired.buildCommand) &&
    (desired.startCommand === undefined ||
      service.startCommand === desired.startCommand) &&
    (desired.preDeployCommand === undefined ||
      sameArray(service.preDeployCommand, desired.preDeployCommand)) &&
    (desired.dockerfilePath === undefined ||
      service.dockerfilePath === desired.dockerfilePath) &&
    (desired.restartPolicyType === undefined ||
      service.restartPolicyType === desired.restartPolicyType) &&
    (desired.restartPolicyMaxRetries === undefined ||
      service.restartPolicyMaxRetries ===
        desired.restartPolicyMaxRetries) &&
    (desired.sleepApplication === undefined ||
      service.sleepApplication === desired.sleepApplication) &&
    (desired.cronSchedule === undefined ||
      service.cronSchedule === desired.cronSchedule) &&
    (desired.watchPatterns === undefined ||
      sameArray(service.watchPatterns, desired.watchPatterns)) &&
    sameRecord(observedManaged, variables) &&
    Boolean(service.domain) === (props.public ?? false) &&
    (!(props.public ?? false) || service.targetPort === props.targetPort) &&
    service.deploymentStatus === "SUCCESS"
  );
};

const findByName = Effect.fn("Railway.Service.findByName")(
  function* (props: ServiceProps) {
    const client = yield* RailwayClient;
    const services = yield* client.listServices(
      props.project.projectId,
      props.project.environmentId,
    );
    const matches = services.filter((service) => service.name === props.name);
    if (matches.length > 1) {
      return yield* new RailwayAmbiguousMatch({
        resource: "service",
        selector: props.name,
        matches: matches.length,
        message:
          `Railway returned ${matches.length} services named '${props.name}' ` +
          "in the target environment; refusing an ambiguous adoption",
      });
    }
    return matches[0];
  },
);

export const ServiceProvider = Provider.succeed(Service, {
  stables: ["serviceId", "projectId", "environmentId"],
  list: () => Effect.succeed([]),
  read: Effect.fn("Railway.Service.read")(function* ({ olds, output }) {
    const client = yield* RailwayClient;
    if (output?.serviceId) {
      return yield* client
        .getService({
          projectId: output.projectId,
          environmentId: output.environmentId,
          serviceId: output.serviceId,
        })
        .pipe(
          Effect.map((service) =>
            attributesOf(service, output.variableNames),
          ),
          Effect.catchTag("RailwayNotFound", () =>
            Effect.void.pipe(Effect.as(undefined)),
          ),
        );
    }
    const props = yield* decodeProps(olds);
    const existing = yield* findByName(props);
    return existing
      ? Unowned(attributesOf(existing, sortedKeys(props.variables ?? {})))
      : undefined;
  }),
  diff: Effect.fn("Railway.Service.diff")(function* ({
    olds,
    news,
    output,
  }) {
    if (!isResolved(news)) return undefined;
    const props = yield* decodeProps(news);
    if (
      olds.project.projectId !== props.project.projectId ||
      olds.project.environmentId !== props.project.environmentId
    ) {
      return { action: "replace" } as const;
    }
    if (!output?.serviceId) return { action: "update" } as const;
    const client = yield* RailwayClient;
    const live = yield* client
      .getService(scopeOf(props, output.serviceId))
      .pipe(Effect.catchTag("RailwayNotFound", () => Effect.void));
    return live &&
      matchesDesired(live, props, output.variableNames)
      ? ({ action: "noop" } as const)
      : ({ action: "update" } as const);
  }),
  reconcile: Effect.fn("Railway.Service.reconcile")(function* ({
    news,
    output,
  }) {
    const props = yield* decodeProps(news);
    const client = yield* RailwayClient;
    let live: ServiceSnapshot | undefined = output?.serviceId
      ? yield* client
          .getService(scopeOf(props, output.serviceId))
          .pipe(
            Effect.catchTag("RailwayNotFound", () =>
              Effect.void.pipe(Effect.as(undefined)),
            ),
          )
      : undefined;

    if (!live) {
      live = yield* client.createService(desiredOf(props));
    }

    const managedNames = new Set(output?.variableNames ?? []);
    const desiredVariables = props.variables ?? {};
    const settingsChanged =
      live.name !== props.name ||
      !sourceMatches(live, props.source) ||
      live.healthcheckPath !== props.healthcheckPath ||
      (props.healthcheckTimeout !== undefined &&
        live.healthcheckTimeout !== props.healthcheckTimeout) ||
      live.region !== props.region ||
      live.numReplicas !== (props.numReplicas ?? 1) ||
      (props.builder !== undefined && live.builder !== props.builder) ||
      (props.rootDirectory !== undefined &&
        live.rootDirectory !== props.rootDirectory) ||
      (props.buildCommand !== undefined &&
        live.buildCommand !== props.buildCommand) ||
      (props.startCommand !== undefined &&
        live.startCommand !== props.startCommand) ||
      (props.preDeployCommand !== undefined &&
        !sameArray(live.preDeployCommand, props.preDeployCommand)) ||
      (props.dockerfilePath !== undefined &&
        live.dockerfilePath !== props.dockerfilePath) ||
      (props.restartPolicyType !== undefined &&
        live.restartPolicyType !== props.restartPolicyType) ||
      (props.restartPolicyMaxRetries !== undefined &&
        live.restartPolicyMaxRetries !== props.restartPolicyMaxRetries) ||
      (props.sleepApplication !== undefined &&
        live.sleepApplication !== props.sleepApplication) ||
      (props.cronSchedule !== undefined &&
        live.cronSchedule !== props.cronSchedule) ||
      (props.watchPatterns !== undefined &&
        !sameArray(live.watchPatterns, props.watchPatterns));
    if (settingsChanged) {
      live = yield* client.updateService({
        ...desiredOf(props),
        serviceId: live.serviceId,
      });
    }

    const scope = scopeOf(props, live.serviceId);
    const upserts = Object.fromEntries(
      Object.entries(desiredVariables).filter(
        ([name, value]) => live!.variables[name] !== value,
      ),
    );
    if (Object.keys(upserts).length > 0) {
      live = yield* client.upsertVariables(scope, upserts);
    }
    let variablesChanged = Object.keys(upserts).length > 0;
    for (const name of managedNames) {
      if (!(name in desiredVariables) && name in live.variables) {
        live = yield* client.deleteVariable(scope, name);
        variablesChanged = true;
      }
    }

    if (
      (props.public ?? false) &&
      (!live.domain || live.targetPort !== props.targetPort)
    ) {
      live = yield* client.ensureDomain(scope, props.targetPort);
    } else if (!(props.public ?? false) && live.domainId) {
      live = yield* client.deleteDomain(scope, live.domainId);
    }

    if (
      output === undefined ||
      settingsChanged ||
      variablesChanged ||
      live.deploymentStatus !== "SUCCESS"
    ) {
      live = yield* client.deployService(scope);
    }

    return attributesOf(live, sortedKeys(desiredVariables));
  }),
  delete: Effect.fn("Railway.Service.delete")(function* ({ output }) {
    const client = yield* RailwayClient;
    yield* client
      .deleteService({
        projectId: output.projectId,
        environmentId: output.environmentId,
        serviceId: output.serviceId,
      })
      .pipe(Effect.catchTag("RailwayNotFound", () => Effect.void));
  }),
});
