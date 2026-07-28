import * as Schema from "effect/Schema";

export class RailwayNotFound extends Schema.TaggedErrorClass<RailwayNotFound>()(
  "RailwayNotFound",
  {
    resource: Schema.String,
    resourceId: Schema.String,
    message: Schema.String,
  },
) {}

export class RailwayAmbiguousMatch extends Schema.TaggedErrorClass<RailwayAmbiguousMatch>()(
  "RailwayAmbiguousMatch",
  {
    resource: Schema.String,
    selector: Schema.String,
    matches: Schema.Int,
    message: Schema.String,
  },
) {}

export class RailwayApiError extends Schema.TaggedErrorClass<RailwayApiError>()(
  "RailwayApiError",
  {
    operation: Schema.String,
    message: Schema.String,
    status: Schema.optional(Schema.Int),
    retryable: Schema.optional(Schema.Boolean),
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
  | RailwayAmbiguousMatch
  | RailwayApiError
  | RailwayAuthenticationError
  | RailwayDeploymentFailed;
