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
import type { Providers } from "../Providers.js";
import type { ExistingProjectAttributes } from "./ExistingProject.js";

const ServicePropsSchema = Schema.Struct({
  project: Schema.Struct({
    projectId: Schema.NonEmptyString,
    environmentId: Schema.NonEmptyString,
  }),
  name: Schema.NonEmptyString,
  source: Schema.Struct({
    image: Schema.NonEmptyString,
  }),
  healthcheckPath: Schema.optionalKey(Schema.String),
  region: Schema.optionalKey(Schema.NonEmptyString),
  numReplicas: Schema.optionalKey(Schema.Int.check(Schema.isGreaterThan(0))),
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
  readonly image: string;
  readonly healthcheckPath?: string;
  readonly region?: string;
  readonly numReplicas: number;
  readonly variableNames: ReadonlyArray<string>;
  readonly domainId?: string;
  readonly domain?: string;
  readonly url?: string;
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
  image: service.image,
  ...(service.healthcheckPath === undefined
    ? {}
    : { healthcheckPath: service.healthcheckPath }),
  ...(service.region === undefined ? {} : { region: service.region }),
  numReplicas: service.numReplicas,
  variableNames: [...variableNames].sort(),
  ...(service.domainId === undefined ? {} : { domainId: service.domainId }),
  ...(service.domain === undefined
    ? {}
    : { domain: service.domain, url: `https://${service.domain}` }),
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
  image: props.source.image,
  ...(props.healthcheckPath === undefined
    ? {}
    : { healthcheckPath: props.healthcheckPath }),
  ...(props.region === undefined ? {} : { region: props.region }),
  numReplicas: props.numReplicas ?? 1,
});

const sortedKeys = (record: Readonly<Record<string, string>>) =>
  Object.keys(record).sort();

const sameRecord = (
  left: Readonly<Record<string, string>>,
  right: Readonly<Record<string, string>>,
) => JSON.stringify(left) === JSON.stringify(right);

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
    service.image === desired.image &&
    service.healthcheckPath === desired.healthcheckPath &&
    service.region === desired.region &&
    service.numReplicas === desired.numReplicas &&
    sameRecord(observedManaged, variables) &&
    Boolean(service.domain) === (props.public ?? false) &&
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
    return matches.length === 1 ? matches[0] : undefined;
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
      live.image !== props.source.image ||
      live.healthcheckPath !== props.healthcheckPath ||
      live.region !== props.region ||
      live.numReplicas !== (props.numReplicas ?? 1);
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

    if ((props.public ?? false) && !live.domain) {
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
