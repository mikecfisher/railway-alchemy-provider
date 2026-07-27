import * as Schema from "effect/Schema";

export class RailwayNotFound extends Schema.TaggedErrorClass<RailwayNotFound>()(
  "RailwayNotFound",
  {
    resource: Schema.String,
    resourceId: Schema.String,
    message: Schema.String,
  },
) {}

export class RailwayApiError extends Schema.TaggedErrorClass<RailwayApiError>()(
  "RailwayApiError",
  {
    operation: Schema.String,
    message: Schema.String,
  },
) {}

export class RailwayAuthenticationError extends Schema.TaggedErrorClass<RailwayAuthenticationError>()(
  "RailwayAuthenticationError",
  {
    message: Schema.String,
  },
) {}

export class RailwayDeploymentFailed extends Schema.TaggedErrorClass<RailwayDeploymentFailed>()(
  "RailwayDeploymentFailed",
  {
    deploymentId: Schema.String,
    status: Schema.String,
    message: Schema.String,
  },
) {}

export type RailwayClientError =
  | RailwayNotFound
  | RailwayApiError
  | RailwayAuthenticationError
  | RailwayDeploymentFailed;
