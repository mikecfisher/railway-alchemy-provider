import { expect } from "bun:test";
import * as Test from "alchemy/Test/Bun";
import * as Effect from "effect/Effect";
import {
  ExistingProject,
  Service,
  ServiceVariable,
  SharedVariable,
} from "../src/index.js";
import {
  InMemoryRailwayClient,
  providersForTesting,
} from "../src/testing.js";

const client = InMemoryRailwayClient.make({
  projects: [
    {
      projectId: "project_variable",
      name: "variable-project",
      environmentId: "environment_variable",
      environmentName: "production",
    },
  ],
});

const { test } = Test.make({
  providers: providersForTesting({ client }),
});

const desired = (value: string) =>
  Effect.gen(function* () {
    const project = yield* ExistingProject("Project", {
      projectId: "project_variable",
      environmentId: "environment_variable",
    });
    const service = yield* Service("Api", {
      project,
      name: "variable-api",
      source: { image: "nginx:1.27-alpine" },
    });
    const shared = yield* SharedVariable("SharedToken", {
      project,
      name: "SHARED_TOKEN",
      value,
    });
    const serviceVariable = yield* ServiceVariable("ServiceToken", {
      service,
      name: "SERVICE_TOKEN",
      value,
    });
    return { service, shared, serviceVariable };
  });

test.provider(
  "first-class variables converge without exposing values",
  (stack) =>
    Effect.gen(function* () {
      const first = yield* stack.deploy(desired("first-secret"));
      expect(first.shared).not.toHaveProperty("value");
      expect(first.serviceVariable).not.toHaveProperty("value");
      expect(
        client.getServiceSnapshot(first.service.serviceId)?.variables,
      ).toMatchObject({ SERVICE_TOKEN: "first-secret" });

      const second = yield* stack.deploy(desired("second-secret"));
      expect(second.shared).toEqual(first.shared);
      expect(second.serviceVariable).toEqual(first.serviceVariable);
      expect(
        client.getServiceSnapshot(first.service.serviceId)?.variables,
      ).toMatchObject({ SERVICE_TOKEN: "second-secret" });

      yield* stack.destroy();
      expect(client.getServiceSnapshot(first.service.serviceId)).toBeUndefined();
    }),
);
