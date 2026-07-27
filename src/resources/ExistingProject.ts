import { Resource } from "alchemy";
import { isResolved } from "alchemy/Diff";
import * as Provider from "alchemy/Provider";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { RailwayClient } from "../client/RailwayClient.js";
import type { Providers } from "../Providers.js";

const ExistingProjectPropsSchema = Schema.Struct({
  projectId: Schema.NonEmptyString,
  environmentId: Schema.NonEmptyString,
});

export interface ExistingProjectProps
  extends Schema.Schema.Type<typeof ExistingProjectPropsSchema> {}

export interface ExistingProjectAttributes {
  readonly projectId: string;
  readonly name: string;
  readonly environmentId: string;
  readonly environmentName: string;
}

export type ExistingProject = Resource<
  "Railway.ExistingProject",
  ExistingProjectProps,
  ExistingProjectAttributes,
  never,
  Providers
>;

export const ExistingProject = Resource<ExistingProject>(
  "Railway.ExistingProject",
);

const decodeProps = Schema.decodeUnknownEffect(ExistingProjectPropsSchema);

export const ExistingProjectProvider = Provider.succeed(ExistingProject, {
  stables: ["projectId", "environmentId"],
  nuke: { skip: true },
  list: () => Effect.succeed([]),
  read: Effect.fn("Railway.ExistingProject.read")(function* ({ olds }) {
    const client = yield* RailwayClient;
    const props = yield* decodeProps(olds);
    return yield* client.getProject(props.projectId, props.environmentId);
  }),
  diff: Effect.fn("Railway.ExistingProject.diff")(function* ({
    olds,
    news,
  }) {
    if (!isResolved(news)) return undefined;
    const props = yield* decodeProps(news);
    return olds.projectId === props.projectId &&
      olds.environmentId === props.environmentId
      ? ({ action: "update", stables: ["projectId", "environmentId"] } as const)
      : ({ action: "replace" } as const);
  }),
  reconcile: Effect.fn("Railway.ExistingProject.reconcile")(function* ({
    news,
  }) {
    const client = yield* RailwayClient;
    const props = yield* decodeProps(news);
    return yield* client.getProject(props.projectId, props.environmentId);
  }),
  delete: () => Effect.void,
});
