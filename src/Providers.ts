import { CredentialsStoreLive } from "alchemy/Auth/Credentials";
import { ProfileLive } from "alchemy/Auth/Profile";
import * as Provider from "alchemy/Provider";
import * as Layer from "effect/Layer";
import { RailwayAuth } from "./auth/RailwayAuth.js";
import { RailwayCredentialsFromAuthProvider } from "./auth/RailwayCredentials.js";
import {
  RailwayClientLive,
  type RailwayGraphQLClientOptions,
} from "./client/RailwayGraphQL.js";
import {
  ExistingProject,
  ExistingProjectProvider,
} from "./resources/ExistingProject.js";
import { Service, ServiceProvider } from "./resources/Service.js";

export class Providers extends Provider.ProviderCollection<Providers>()(
  "Railway",
) {}

export const resourceProviders = Layer.effect(
  Providers,
  Provider.collection([ExistingProject, Service]),
).pipe(Layer.provide([ExistingProjectProvider, ServiceProvider]));

export interface RailwayProviderOptions
  extends RailwayGraphQLClientOptions {}

export const providers = (options: RailwayProviderOptions = {}) => {
  const credentials = RailwayCredentialsFromAuthProvider.pipe(
    Layer.provide(RailwayAuth),
    Layer.provide([ProfileLive, CredentialsStoreLive]),
  );
  const client = RailwayClientLive(options).pipe(
    Layer.provide(credentials),
  );
  return resourceProviders.pipe(
    Layer.provideMerge(client),
    Layer.orDie,
  );
};
