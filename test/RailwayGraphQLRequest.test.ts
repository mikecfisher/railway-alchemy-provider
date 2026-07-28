import { expect, test } from "bun:test";
import * as Effect from "effect/Effect";
import * as Redacted from "effect/Redacted";
import { makeRailwayFetchExecutor } from "../src/client/RailwayGraphQLRequest.js";

test("the HTTP executor authenticates and returns GraphQL data", async () => {
  const requests: Array<Request> = [];
  const executor = makeRailwayFetchExecutor({
    token: Redacted.make("token_test"),
    fetch: async (request) => {
      requests.push(request);
      return new Response(
        JSON.stringify({ data: { project: { id: "project_1" } } }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        },
      );
    },
  });

  const data = await Effect.runPromise(
    executor.execute(
      "GetProject",
      "query GetProject { project { id } }",
      {},
    ),
  );

  expect(data).toEqual({ project: { id: "project_1" } });
  expect(requests[0]?.headers.get("authorization")).toBe(
    "Bearer token_test",
  );
});

test("project tokens use Railway's project access header", async () => {
  const requests: Array<Request> = [];
  const executor = makeRailwayFetchExecutor({
    token: Redacted.make("project_token_test"),
    tokenType: "project",
    fetch: async (request) => {
      requests.push(request);
      return new Response(JSON.stringify({ data: { ok: true } }));
    },
  });

  await Effect.runPromise(
    executor.execute("GetProject", "query GetProject { project { id } }", {}),
  );

  expect(requests[0]?.headers.get("Project-Access-Token")).toBe(
    "project_token_test",
  );
  expect(requests[0]?.headers.has("authorization")).toBe(false);
});

test("read operations retry transient Railway failures", async () => {
  let requests = 0;
  const executor = makeRailwayFetchExecutor({
    token: Redacted.make("retry_token"),
    maxReadRetries: 2,
    retryBaseDelay: 0,
    fetch: async () => {
      requests += 1;
      return requests < 3
        ? new Response("temporarily unavailable", { status: 503 })
        : Response.json({ data: { project: { id: "project_1" } } });
    },
  });

  const data = await Effect.runPromise(
    executor.execute(
      "GetProject",
      "query GetProject { project { id } }",
      {},
    ),
  );

  expect(data).toEqual({ project: { id: "project_1" } });
  expect(requests).toBe(3);
});

test("mutations are never retried automatically", async () => {
  let requests = 0;
  const executor = makeRailwayFetchExecutor({
    token: Redacted.make("mutation_token"),
    maxReadRetries: 3,
    retryBaseDelay: 0,
    fetch: async () => {
      requests += 1;
      return new Response("temporarily unavailable", { status: 503 });
    },
  });

  const error = await Effect.runPromise(
    executor
      .execute(
        "CreateService",
        "mutation CreateService { serviceCreate { id } }",
        {},
      )
      .pipe(Effect.flip),
  );

  expect(error).toMatchObject({
    _tag: "RailwayApiError",
    operation: "CreateService",
    status: 503,
    retryable: true,
  });
  expect(requests).toBe(1);
});

test("GraphQL errors fail even when Railway responds with HTTP 200", async () => {
  const executor = makeRailwayFetchExecutor({
    token: Redacted.make("token_test"),
    fetch: async () =>
      new Response(
        JSON.stringify({
          errors: [{ message: "Service not found" }],
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        },
      ),
  });

  const exit = await Effect.runPromiseExit(
    executor.execute("GetService", "query GetService { service { id } }", {}),
  );

  expect(exit._tag).toBe("Failure");
  if (exit._tag === "Failure") {
    expect(String(exit.cause)).toContain("Service not found");
  }
});

test("Railway failures do not expose credentials or GraphQL variable values", async () => {
  const token = "token_private_value";
  const variableValue = "variable_private_value";
  const executor = makeRailwayFetchExecutor({
    token: Redacted.make(token),
    fetch: async () =>
      new Response(
        JSON.stringify({
          errors: [
            {
              message:
                `Railway rejected ${variableValue} while using ${token}`,
            },
          ],
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        },
      ),
  });

  const exit = await Effect.runPromiseExit(
    executor.execute(
      "UpsertVariables",
      "mutation UpsertVariables { variableCollectionUpsert }",
      {
        variables: {
          API_SECRET: variableValue,
        },
      },
    ),
  );

  expect(exit._tag).toBe("Failure");
  if (exit._tag === "Failure") {
    const rendered = String(exit.cause);
    expect(rendered).toContain("[REDACTED]");
    expect(rendered).not.toContain(token);
    expect(rendered).not.toContain(variableValue);
  }
});

test("HTTP failures do not expose credentials or GraphQL variable values", async () => {
  const token = "token_private_value";
  const variableValue = "variable_private_value";
  const executor = makeRailwayFetchExecutor({
    token: Redacted.make(token),
    fetch: async () =>
      new Response(
        `Railway rejected ${variableValue} while using ${token}`,
        { status: 400 },
      ),
  });

  const exit = await Effect.runPromiseExit(
    executor.execute("UpsertVariables", "mutation UpsertVariables", {
      variables: {
        API_SECRET: variableValue,
      },
    }),
  );

  expect(exit._tag).toBe("Failure");
  if (exit._tag === "Failure") {
    const rendered = String(exit.cause);
    expect(rendered).toContain("[REDACTED]");
    expect(rendered).not.toContain(token);
    expect(rendered).not.toContain(variableValue);
  }
});
