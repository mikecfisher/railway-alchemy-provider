import { expect } from "bun:test";
import * as Test from "alchemy/Test/Bun";
import * as Effect from "effect/Effect";
import { ExistingProject } from "../src/index.js";
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

test.provider(
  "an existing project and environment are referenced without mutation",
  (stack) =>
    Effect.gen(function* () {
      const project = yield* stack.deploy(
        ExistingProject("TestProject", {
          projectId: "project_test",
          environmentId: "environment_test",
        }),
      );

      expect(project).toEqual({
        projectId: "project_test",
        name: "test-project",
        environmentId: "environment_test",
        environmentName: "production",
      });
      expect(client.mutations).toEqual([]);

      yield* stack.destroy();

      expect(client.getProjectSnapshot("project_test")).toBeDefined();
      expect(client.mutations).toEqual([]);
    }),
);
