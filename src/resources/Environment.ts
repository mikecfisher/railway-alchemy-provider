import { Unowned } from "alchemy/AdoptPolicy";
import { isResolved } from "alchemy/Diff";
import * as Provider from "alchemy/Provider";
import { Resource } from "alchemy/Resource";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import {
  RailwayClient,
  type EnvironmentSnapshot,
} from "../client/RailwayClient.js";
import { RailwayAmbiguousMatch } from "../Errors.js";
import type { Providers } from "../Providers.js";

const EnvironmentPropsSchema = Schema.Struct({
  projectId: Schema.NonEmptyString,
  name: Schema.NonEmptyString,
  sourceEnvironmentId: Schema.optionalKey(Schema.NonEmptyString),
  ephemeral: Schema.optionalKey(Schema.Boolean),
  skipInitialDeploys: Schema.optionalKey(Schema.Boolean),
});

export interface EnvironmentProps
  extends Schema.Schema.Type<typeof EnvironmentPropsSchema> {}

export interface EnvironmentAttributes {
  readonly environmentId: string;
  readonly projectId: string;
  readonly name: string;
  readonly ephemeral: boolean;
}

export type Environment = Resource<
  "Railway.Environment",
  EnvironmentProps,
  EnvironmentAttributes,
  never,
  Providers
>;

export const Environment = Resource<Environment>("Railway.Environment");

const decodeProps = Schema.decodeUnknownEffect(EnvironmentPropsSchema);

const attributesOf = (
  environment: EnvironmentSnapshot,
): EnvironmentAttributes => ({ ...environment });

const findByName = Effect.fn("Railway.Environment.findByName")(
  function* (props: EnvironmentProps) {
    const client = yield* RailwayClient;
    const environments = yield* client.listEnvironments(props.projectId);
    const matches = environments.filter(
      (environment) => environment.name === props.name,
    );
    if (matches.length > 1) {
      return yield* new RailwayAmbiguousMatch({
        resource: "environment",
        selector: props.name,
        matches: matches.length,
        message:
          `Railway returned ${matches.length} environments named ` +
          `'${props.name}'; refusing an ambiguous adoption`,
      });
    }
    return matches[0];
  },
);

export const EnvironmentProvider = Provider.succeed(Environment, {
  stables: ["environmentId", "projectId"],
  list: () => Effect.succeed([]),
  read: Effect.fn("Railway.Environment.read")(function* ({ olds, output }) {
    const client = yield* RailwayClient;
    if (output?.environmentId) {
      return yield* client
        .getEnvironment({
          projectId: output.projectId,
          environmentId: output.environmentId,
        })
        .pipe(
          Effect.map(attributesOf),
          Effect.catchTag("RailwayNotFound", () =>
            Effect.void.pipe(Effect.as(undefined))
          ),
        );
    }
    const props = yield* decodeProps(olds);
    const existing = yield* findByName(props);
    return existing ? Unowned(attributesOf(existing)) : undefined;
  }),
  diff: Effect.fn("Railway.Environment.diff")(function* ({
    olds,
    news,
    output,
  }) {
    if (!isResolved(news)) return undefined;
    const props = yield* decodeProps(news);
    if (
      olds.projectId !== props.projectId ||
      olds.sourceEnvironmentId !== props.sourceEnvironmentId ||
      (olds.ephemeral ?? false) !== (props.ephemeral ?? false)
    ) {
      return { action: "replace" } as const;
    }
    if (!output?.environmentId) return { action: "update" } as const;
    const client = yield* RailwayClient;
    const live = yield* client
      .getEnvironment({
        projectId: output.projectId,
        environmentId: output.environmentId,
      })
      .pipe(Effect.catchTag("RailwayNotFound", () => Effect.void));
    return live &&
        live.name === props.name &&
        live.ephemeral === (props.ephemeral ?? false)
      ? ({ action: "noop" } as const)
      : ({ action: "update" } as const);
  }),
  reconcile: Effect.fn("Railway.Environment.reconcile")(function* ({
    news,
    output,
  }) {
    const props = yield* decodeProps(news);
    const client = yield* RailwayClient;
    let live = output?.environmentId
      ? yield* client
          .getEnvironment({
            projectId: output.projectId,
            environmentId: output.environmentId,
          })
          .pipe(
            Effect.catchTag("RailwayNotFound", () =>
              Effect.void.pipe(Effect.as(undefined))
            ),
          )
      : undefined;
    if (!live) {
      live = yield* client.createEnvironment({
        projectId: props.projectId,
        name: props.name,
        ...(props.sourceEnvironmentId === undefined
          ? {}
          : { sourceEnvironmentId: props.sourceEnvironmentId }),
        ephemeral: props.ephemeral ?? false,
        skipInitialDeploys: props.skipInitialDeploys ?? false,
      });
    } else if (live.name !== props.name) {
      live = yield* client.renameEnvironment(
        {
          projectId: live.projectId,
          environmentId: live.environmentId,
        },
        props.name,
      );
    }
    return attributesOf(live);
  }),
  delete: Effect.fn("Railway.Environment.delete")(function* ({ output }) {
    const client = yield* RailwayClient;
    yield* client
      .deleteEnvironment({
        projectId: output.projectId,
        environmentId: output.environmentId,
      })
      .pipe(Effect.catchTag("RailwayNotFound", () => Effect.void));
  }),
});
