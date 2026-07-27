import * as Layer from "effect/Layer";
import {
  RailwayClient,
  type RailwayClientService,
} from "./client/RailwayClient.js";
import { resourceProviders } from "./Providers.js";

export {
  makeRailwayClient,
  type MakeRailwayClientOptions,
} from "./client/RailwayGraphQL.js";
export type {
  RailwayGraphQLExecutor,
} from "./client/RailwayGraphQLRequest.js";

export {
  InMemoryRailwayClient,
  type InMemoryRailwayClientOptions,
} from "./testing/InMemoryRailwayClient.js";
export {
  makeRailwayCliGraphQLExecutor,
  type RailwayCliGraphQLExecutorOptions,
} from "./testing/RailwayCliGraphQLExecutor.js";

export interface ProvidersForTestingOptions {
  readonly client: RailwayClientService;
}

export const providersForTesting = ({
  client,
}: ProvidersForTestingOptions) =>
  resourceProviders.pipe(
    Layer.provideMerge(Layer.succeed(RailwayClient, client)),
  );
