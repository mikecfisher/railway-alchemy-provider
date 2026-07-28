import { afterAll, expect } from "bun:test";
import * as Test from "alchemy/Test/Bun";
import * as Effect from "effect/Effect";
import * as Redacted from "effect/Redacted";
import { ExistingProject, providers } from "../src/index.js";

const authorizationHeaders: Array<string | null> = [];
const server = Bun.serve({
  port: 0,
  fetch: async (request) => {
    authorizationHeaders.push(request.headers.get("authorization"));
    return Response.json({
      data: {
        project: { id: "project_production", name: "production-provider" },
        environment: {
          id: "environment_production",
          name: "production",
          projectId: "project_production",
        },
      },
    });
  },
});

afterAll(() => server.stop(true));

const { test } = Test.make({
  providers: providers({
    endpoint: `http://127.0.0.1:${server.port}/graphql`,
    credentials: {
      token: Redacted.make("production_provider_token"),
    },
    maxReadRetries: 0,
  }),
});

test.provider(
  "the public provider collection uses the production HTTP and auth path",
  (stack) =>
    Effect.gen(function* () {
      const project = yield* stack.deploy(
        ExistingProject("ProductionPath", {
          projectId: "project_production",
          environmentId: "environment_production",
        }),
      );
      expect(project.name).toBe("production-provider");
      expect(authorizationHeaders.length).toBeGreaterThan(0);
      expect(
        authorizationHeaders.every(
          (header) => header === "Bearer production_provider_token",
        ),
      ).toBe(true);
      yield* stack.destroy();
    }),
);
