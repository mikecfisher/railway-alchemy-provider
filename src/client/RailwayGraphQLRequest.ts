import * as Effect from "effect/Effect";
import * as Predicate from "effect/Predicate";
import * as Redacted from "effect/Redacted";
import * as Schema from "effect/Schema";
import { RailwayApiError } from "../Errors.js";
export interface RailwayGraphQLExecutor {
  readonly execute: (
    operation: string,
    query: string,
    variables: Readonly<Record<string, unknown>>,
  ) => Effect.Effect<unknown, RailwayApiError>;
}

const GraphQLEnvelope = Schema.Struct({
  data: Schema.optionalKey(Schema.Unknown),
  errors: Schema.optionalKey(
    Schema.Array(
      Schema.Struct({
        message: Schema.String,
      }),
    ),
  ),
});

export const railwaySensitiveValues = (value: unknown): ReadonlyArray<string> => {
  if (Predicate.isString(value)) {
    return value.length === 0 ? [] : [value];
  }
  if (Array.isArray(value)) {
    return value.flatMap(railwaySensitiveValues);
  }
  if (Predicate.isObject(value)) {
    return Object.values(value).flatMap(railwaySensitiveValues);
  }
  return [];
};

export const redactRailwayErrorMessage = (
  message: string,
  sensitiveValues: ReadonlyArray<string>,
) =>
  [...new Set(sensitiveValues)]
    .sort((left, right) => right.length - left.length)
    .reduce(
      (redacted, sensitive) =>
        redacted.replaceAll(sensitive, "[REDACTED]"),
      message,
    );

const decodeEnvelope = (
  operation: string,
  value: unknown,
  sensitiveValues: ReadonlyArray<string> = [],
): Effect.Effect<unknown, RailwayApiError> =>
  Schema.decodeUnknownEffect(GraphQLEnvelope)(value).pipe(
    Effect.mapError(
      (error) =>
        new RailwayApiError({
          operation,
          message: redactRailwayErrorMessage(
            `Railway returned malformed GraphQL JSON: ${String(error)}`,
            sensitiveValues,
          ),
        }),
    ),
    Effect.flatMap((envelope) => {
      if (envelope.errors && envelope.errors.length > 0) {
        return new RailwayApiError({
          operation,
          message: redactRailwayErrorMessage(
            envelope.errors
              .map((error) => error.message)
              .join("; "),
            sensitiveValues,
          ),
        });
      }
      if (envelope.data === undefined) {
        return new RailwayApiError({
          operation,
          message: "Railway GraphQL response did not contain data",
        });
      }
      return Effect.succeed(envelope.data);
    }),
  );

export interface RailwayFetchExecutorOptions {
  readonly token: Redacted.Redacted<string>;
  readonly endpoint?: string;
  readonly fetch?: (request: Request) => Promise<Response>;
}

export const makeRailwayFetchExecutor = ({
  token,
  endpoint = "https://backboard.railway.com/graphql/v2",
  fetch: fetchImpl = globalThis.fetch,
}: RailwayFetchExecutorOptions): RailwayGraphQLExecutor => ({
  execute: (operation, query, variables) => {
    const sensitiveValues = [
      Redacted.value(token),
      ...railwaySensitiveValues(variables),
    ];
    return Effect.tryPromise({
      try: (signal) =>
        fetchImpl(
          new Request(endpoint, {
            method: "POST",
            headers: {
              authorization: `Bearer ${Redacted.value(token)}`,
              "content-type": "application/json",
            },
            body: JSON.stringify({ query, variables }),
            signal,
          }),
        ),
      catch: (error) =>
        new RailwayApiError({
          operation,
          message: redactRailwayErrorMessage(
            `Railway request failed: ${String(error)}`,
            sensitiveValues,
          ),
        }),
    }).pipe(
      Effect.flatMap((response) =>
        Effect.tryPromise({
          try: () => response.text(),
          catch: (error) =>
            new RailwayApiError({
              operation,
              message: `Could not read Railway response: ${String(error)}`,
            }),
        }).pipe(
          Effect.flatMap((body) => {
            if (!response.ok) {
              return new RailwayApiError({
                operation,
                message: redactRailwayErrorMessage(
                  `Railway returned HTTP ${response.status}: ` +
                    body.slice(0, 1_000),
                  sensitiveValues,
                ),
              });
            }
            return Effect.try({
              try: () => JSON.parse(body) as unknown,
              catch: (error) =>
                new RailwayApiError({
                  operation,
                  message:
                    `Railway returned invalid JSON: ${String(error)}`,
                }),
            });
          }),
        ),
      ),
      Effect.flatMap((value) =>
        decodeEnvelope(operation, value, sensitiveValues)
      ),
      Effect.withSpan(`RailwayGraphQL.${operation}`),
    );
  },
});

export const decodeRailwayGraphQLResponse = decodeEnvelope;
