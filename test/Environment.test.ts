import { expect } from "bun:test";
import * as Test from "alchemy/Test/Bun";
import * as Effect from "effect/Effect";
import { Environment } from "../src/index.js";
import {
  InMemoryRailwayClient,
  providersForTesting,
} from "../src/testing.js";

const client = InMemoryRailwayClient.make({
  projects: [
    {
      projectId: "project_environment",
      name: "environment-project",
      environmentId: "environment_production",
      environmentName: "production",
    },
  ],
});

const { test } = Test.make({
  providers: providersForTesting({ client }),
});

const desired = (name: string) =>
  Environment("Preview", {
    projectId: "project_environment",
    name,
    sourceEnvironmentId: "environment_production",
    skipInitialDeploys: true,
  });

test.provider(
  "an environment creates, renames, converges, and deletes",
  (stack) =>
    Effect.gen(function* () {
      const first = yield* stack.deploy(desired("preview"));
      expect(first).toMatchObject({
        projectId: "project_environment",
        name: "preview",
        ephemeral: false,
      });

      const renamed = yield* stack.deploy(desired("staging"));
      expect(renamed.environmentId).toBe(first.environmentId);
      expect(renamed.name).toBe("staging");

      const mutationCount = client.mutations.length;
      expect(yield* stack.deploy(desired("staging"))).toEqual(renamed);
      expect(client.mutations).toHaveLength(mutationCount);

      yield* stack.destroy();
      expect(
        client.getEnvironmentSnapshot(first.environmentId),
      ).toBeUndefined();
      expect(client.getProjectSnapshot("project_environment")).toBeDefined();
    }),
);
