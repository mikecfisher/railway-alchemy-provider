import { Unowned } from "alchemy/AdoptPolicy";
import { isResolved } from "alchemy/Diff";
import * as Provider from "alchemy/Provider";
import { Resource } from "alchemy/Resource";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import {
  RailwayClient,
  type VariableScope,
} from "../client/RailwayClient.js";
import type { Providers } from "../Providers.js";
import type { ExistingProjectAttributes } from "./ExistingProject.js";
import type { ServiceAttributes } from "./Service.js";

const ProjectScope = Schema.Struct({
  projectId: Schema.NonEmptyString,
  environmentId: Schema.NonEmptyString,
});

const VariableFields = {
  name: Schema.NonEmptyString,
  value: Schema.String,
  skipDeploys: Schema.optionalKey(Schema.Boolean),
};

const SharedVariablePropsSchema = Schema.Struct({
  project: ProjectScope,
  ...VariableFields,
});

export interface SharedVariableProps
  extends Schema.Schema.Type<typeof SharedVariablePropsSchema> {
  readonly project: Pick<
    ExistingProjectAttributes,
    "projectId" | "environmentId"
  >;
}

const ServiceVariablePropsSchema = Schema.Struct({
  service: Schema.Struct({
    projectId: Schema.NonEmptyString,
    environmentId: Schema.NonEmptyString,
    serviceId: Schema.NonEmptyString,
  }),
  ...VariableFields,
});

export interface ServiceVariableProps
  extends Schema.Schema.Type<typeof ServiceVariablePropsSchema> {
  readonly service: Pick<
    ServiceAttributes,
    "projectId" | "environmentId" | "serviceId"
  >;
}

export interface VariableAttributes {
  readonly projectId: string;
  readonly environmentId: string;
  readonly serviceId?: string;
  readonly name: string;
}

export type SharedVariable = Resource<
  "Railway.SharedVariable",
  SharedVariableProps,
  VariableAttributes,
  never,
  Providers
>;

export const SharedVariable = Resource<SharedVariable>(
  "Railway.SharedVariable",
);

export type ServiceVariable = Resource<
  "Railway.ServiceVariable",
  ServiceVariableProps,
  VariableAttributes,
  never,
  Providers
>;

export const ServiceVariable = Resource<ServiceVariable>(
  "Railway.ServiceVariable",
);

const attributesOf = (
  scope: VariableScope,
  name: string,
): VariableAttributes => ({
  projectId: scope.projectId,
  environmentId: scope.environmentId,
  ...(scope.serviceId === undefined ? {} : { serviceId: scope.serviceId }),
  name,
});

const decodeSharedProps = Schema.decodeUnknownEffect(
  SharedVariablePropsSchema,
);
const decodeServiceProps = Schema.decodeUnknownEffect(
  ServiceVariablePropsSchema,
);

export const SharedVariableProvider = Provider.succeed(SharedVariable, {
  stables: ["projectId", "environmentId", "name"],
  list: () => Effect.succeed([]),
  read: Effect.fn("Railway.SharedVariable.read")(function* ({
    olds,
    output,
  }) {
    const props = yield* decodeSharedProps(olds);
    const scope = output
      ? {
          projectId: output.projectId,
          environmentId: output.environmentId,
        }
      : props.project;
    const client = yield* RailwayClient;
    const variables = yield* client.getVariables(scope);
    if (!(props.name in variables)) return undefined;
    const attributes = attributesOf(scope, props.name);
    return output ? attributes : Unowned(attributes);
  }),
  diff: Effect.fn("Railway.SharedVariable.diff")(function* ({
    olds,
    news,
    output,
  }) {
    if (!isResolved(news)) return undefined;
    const oldProps = yield* decodeSharedProps(olds);
    const props = yield* decodeSharedProps(news);
    if (
      oldProps.project.projectId !== props.project.projectId ||
      oldProps.project.environmentId !== props.project.environmentId ||
      oldProps.name !== props.name
    ) {
      return { action: "replace" } as const;
    }
    if (!output) return { action: "update" } as const;
    const client = yield* RailwayClient;
    const variables = yield* client.getVariables(props.project);
    return variables[props.name] === props.value
      ? ({ action: "noop" } as const)
      : ({ action: "update" } as const);
  }),
  reconcile: Effect.fn("Railway.SharedVariable.reconcile")(function* ({
    news,
  }) {
    const props = yield* decodeSharedProps(news);
    const client = yield* RailwayClient;
    const variables = yield* client.getVariables(props.project);
    if (variables[props.name] !== props.value) {
      yield* client.putVariable({
        ...props.project,
        name: props.name,
        value: props.value,
        skipDeploys: props.skipDeploys ?? false,
      });
    }
    return attributesOf(props.project, props.name);
  }),
  delete: Effect.fn("Railway.SharedVariable.delete")(function* ({
    output,
  }) {
    const scope = {
      projectId: output.projectId,
      environmentId: output.environmentId,
    };
    const client = yield* RailwayClient;
    const variables = yield* client.getVariables(scope);
    if (output.name in variables) {
      yield* client.removeVariable(scope, output.name);
    }
  }),
});

export const ServiceVariableProvider = Provider.succeed(ServiceVariable, {
  stables: ["projectId", "environmentId", "serviceId", "name"],
  list: () => Effect.succeed([]),
  read: Effect.fn("Railway.ServiceVariable.read")(function* ({
    olds,
    output,
  }) {
    const props = yield* decodeServiceProps(olds);
    const scope: VariableScope = output
      ? {
          projectId: output.projectId,
          environmentId: output.environmentId,
          serviceId: output.serviceId,
        }
      : props.service;
    const client = yield* RailwayClient;
    const variables = yield* client.getVariables(scope);
    if (!(props.name in variables)) return undefined;
    const attributes = attributesOf(scope, props.name);
    return output ? attributes : Unowned(attributes);
  }),
  diff: Effect.fn("Railway.ServiceVariable.diff")(function* ({
    olds,
    news,
    output,
  }) {
    if (!isResolved(news)) return undefined;
    const oldProps = yield* decodeServiceProps(olds);
    const props = yield* decodeServiceProps(news);
    if (
      oldProps.service.projectId !== props.service.projectId ||
      oldProps.service.environmentId !== props.service.environmentId ||
      oldProps.service.serviceId !== props.service.serviceId ||
      oldProps.name !== props.name
    ) {
      return { action: "replace" } as const;
    }
    if (!output) return { action: "update" } as const;
    const client = yield* RailwayClient;
    const variables = yield* client.getVariables(props.service);
    return variables[props.name] === props.value
      ? ({ action: "noop" } as const)
      : ({ action: "update" } as const);
  }),
  reconcile: Effect.fn("Railway.ServiceVariable.reconcile")(function* ({
    news,
  }) {
    const props = yield* decodeServiceProps(news);
    const client = yield* RailwayClient;
    const variables = yield* client.getVariables(props.service);
    if (variables[props.name] !== props.value) {
      yield* client.putVariable({
        ...props.service,
        name: props.name,
        value: props.value,
        skipDeploys: props.skipDeploys ?? false,
      });
    }
    return attributesOf(props.service, props.name);
  }),
  delete: Effect.fn("Railway.ServiceVariable.delete")(function* ({
    output,
  }) {
    const scope = {
      projectId: output.projectId,
      environmentId: output.environmentId,
      serviceId: output.serviceId,
    };
    const client = yield* RailwayClient;
    const variables = yield* client.getVariables(scope);
    if (output.name in variables) {
      yield* client.removeVariable(scope, output.name);
    }
  }),
});
