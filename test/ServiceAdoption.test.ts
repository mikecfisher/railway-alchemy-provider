import { expect } from "bun:test";
import { adopt } from "alchemy/AdoptPolicy";
import * as Test from "alchemy/Test/Bun";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import { Service } from "../src/index.js";
import {
  InMemoryRailwayClient,
  providersForTesting,
} from "../src/testing.js";

const client = InMemoryRailwayClient.make({
  projects: [
    {
      projectId: "project_adopt",
      name: "adoption-project",
      environmentId: "environment_adopt",
      environmentName: "production",
    },
  ],
  services: [
    {
      serviceId: "service_existing",
      projectId: "project_adopt",
      environmentId: "environment_adopt",
      name: "existing-api",
      image: "nginx:1.26-alpine",
      numReplicas: 1,
      variables: {},
    },
  ],
});

const { test } = Test.make({
  providers: providersForTesting({ client }),
});

const desired = Service("ExistingApi", {
  project: {
    projectId: "project_adopt",
    environmentId: "environment_adopt",
  },
  name: "existing-api",
  source: { image: "nginx:1.27-alpine" },
  numReplicas: 1,
});

test.provider(
  "an existing service requires explicit adoption",
  (stack) =>
    Effect.gen(function* () {
      const refused = yield* Effect.exit(stack.deploy(desired));
      expect(Exit.isFailure(refused)).toBe(true);
      expect(client.getServiceSnapshot("service_existing")?.image).toBe(
        "nginx:1.26-alpine",
      );

      const adopted = yield* stack.deploy(desired.pipe(adopt(true)));
      expect(adopted.serviceId).toBe("service_existing");
      expect(adopted.image).toBe("nginx:1.27-alpine");

      yield* stack.destroy();
      expect(
        client.getServiceSnapshot("service_existing"),
      ).toBeUndefined();
    }),
);
