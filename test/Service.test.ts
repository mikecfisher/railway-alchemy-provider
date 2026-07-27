import { expect } from "bun:test";
import * as Test from "alchemy/Test/Bun";
import * as Effect from "effect/Effect";
import { ExistingProject, Service } from "../src/index.js";
import {
  InMemoryRailwayClient,
  providersForTesting,
} from "../src/testing.js";

const client = InMemoryRailwayClient.make({
  projects: [
    {
      projectId: "project_test",
      name: "test-project",
      environmentId: "environment_test",
      environmentName: "production",
    },
  ],
});

const { test } = Test.make({
  providers: providersForTesting({ client }),
});

const desired = Effect.gen(function* () {
  const project = yield* ExistingProject("Project", {
    projectId: "project_test",
    environmentId: "environment_test",
  });
  return yield* Service("Api", {
    project,
    name: "api",
    source: { image: "nginx:1.27-alpine" },
    healthcheckPath: "/",
    region: "us-west2",
    numReplicas: 1,
    variables: {
      ALCHEMY_PROVIDER_TEST: "first",
    },
    public: true,
  });
});

test.provider(
  "a Docker service converges, becomes a no-op, and deletes only itself",
  (stack) =>
    Effect.gen(function* () {
      const first = yield* stack.deploy(desired);

      expect(first).toMatchObject({
        projectId: "project_test",
        environmentId: "environment_test",
        name: "api",
        image: "nginx:1.27-alpine",
        healthcheckPath: "/",
        region: "us-west2",
        numReplicas: 1,
        variableNames: ["ALCHEMY_PROVIDER_TEST"],
        deploymentStatus: "SUCCESS",
      });
      expect(first.url).toStartWith("https://");

      const observed = client.getServiceSnapshot(first.serviceId);
      expect(observed).toMatchObject({
        serviceId: first.serviceId,
        image: "nginx:1.27-alpine",
        variables: {
          ALCHEMY_PROVIDER_TEST: "first",
        },
      });

      const mutationCount = client.mutations.length;
      const second = yield* stack.deploy(desired);

      expect(second).toEqual(first);
      expect(client.mutations).toHaveLength(mutationCount);

      yield* stack.destroy();

      expect(client.getServiceSnapshot(first.serviceId)).toBeUndefined();
      expect(client.getProjectSnapshot("project_test")).toBeDefined();
    }),
);

test.provider(
  "managed drift converges without deleting unmanaged variables",
  (stack) =>
    Effect.gen(function* () {
      const first = yield* stack.deploy(desired);
      client.setServiceSnapshot({
        ...client.getServiceSnapshot(first.serviceId)!,
        image: "nginx:1.26-alpine",
        variables: {
          ALCHEMY_PROVIDER_TEST: "drifted",
          RAILWAY_OWNED: "preserve-me",
        },
        deploymentStatus: "CRASHED",
      });

      const converged = yield* stack.deploy(desired);
      expect(converged.image).toBe("nginx:1.27-alpine");
      expect(
        client.getServiceSnapshot(first.serviceId)?.variables,
      ).toEqual({
        ALCHEMY_PROVIDER_TEST: "first",
        RAILWAY_OWNED: "preserve-me",
      });

      yield* stack.destroy();
    }),
);
