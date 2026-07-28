import { CredentialsStoreLive } from "alchemy/Auth/Credentials";
import { ProfileLive } from "alchemy/Auth/Profile";
import * as Provider from "alchemy/Provider";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import type * as Redacted from "effect/Redacted";
import { RailwayAuth } from "./auth/RailwayAuth.js";
import {
  RailwayCredentials,
  RailwayCredentialsFromAuthProvider,
} from "./auth/RailwayCredentials.js";
import {
  RailwayClientLive,
  type RailwayGraphQLClientOptions,
} from "./client/RailwayGraphQL.js";
import {
  CustomDomain,
  CustomDomainProvider,
} from "./resources/CustomDomain.js";
import {
  Environment,
  EnvironmentProvider,
} from "./resources/Environment.js";
import {
  ExistingProject,
  ExistingProjectProvider,
} from "./resources/ExistingProject.js";
import { Service, ServiceProvider } from "./resources/Service.js";
import {
  ServiceVariable,
  ServiceVariableProvider,
  SharedVariable,
  SharedVariableProvider,
} from "./resources/Variable.js";

export class Providers extends Provider.ProviderCollection<Providers>()(
  "Railway",
) {}

export const resourceProviders = Layer.effect(
  Providers,
  Provider.collection([
    ExistingProject,
    Environment,
    Service,
    SharedVariable,
    ServiceVariable,
    CustomDomain,
  ]),
).pipe(
  Layer.provide([
    ExistingProjectProvider,
    EnvironmentProvider,
    ServiceProvider,
    SharedVariableProvider,
    ServiceVariableProvider,
    CustomDomainProvider,
  ]),
);

export interface RailwayProviderOptions
  extends RailwayGraphQLClientOptions {
  readonly credentials?: {
    readonly token: Redacted.Redacted<string>;
    readonly tokenType?: "api" | "project";
  };
}

export const providers = (options: RailwayProviderOptions = {}) => {
  const credentials =
    options.credentials === undefined
      ? RailwayCredentialsFromAuthProvider.pipe(
          Layer.provide(RailwayAuth),
          Layer.provide([ProfileLive, CredentialsStoreLive]),
        )
      : Layer.succeed(
          RailwayCredentials,
          RailwayCredentials.of({
            resolve: Effect.succeed({
              type: "token",
              token: options.credentials.token,
              tokenType: options.credentials.tokenType ?? "api",
              source: {
                type: "env",
                details: "provider options",
              },
            }),
          }),
        );
  const client = RailwayClientLive(options).pipe(
    Layer.provide(credentials),
  );
  return resourceProviders.pipe(
    Layer.provideMerge(client),
    Layer.orDie,
  );
};
