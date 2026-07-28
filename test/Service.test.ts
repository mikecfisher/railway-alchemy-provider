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
  "a GitHub service and deployment settings converge in place",
  (stack) =>
    Effect.gen(function* () {
      const deploy = (branch: string, startCommand: string) =>
        Service("GitHubApi", {
          project: {
            projectId: "project_test",
            environmentId: "environment_test",
          },
          name: "github-api",
          source: {
            repo: "mikecfisher/example-api",
            branch,
            checkSuites: true,
          },
          builder: "RAILPACK",
          rootDirectory: "/apps/api",
          buildCommand: "bun run build",
          startCommand,
          preDeployCommand: ["bun run migrate"],
          healthcheckPath: "/health",
          healthcheckTimeout: 30,
          restartPolicyType: "ON_FAILURE",
          restartPolicyMaxRetries: 5,
          sleepApplication: false,
          watchPatterns: ["/apps/api/**"],
        });

      const first = yield* stack.deploy(
        deploy("main", "bun run start"),
      );
      expect(first).toMatchObject({
        repository: "mikecfisher/example-api",
        branch: "main",
        builder: "RAILPACK",
        rootDirectory: "/apps/api",
        startCommand: "bun run start",
        restartPolicyType: "ON_FAILURE",
      });

      const second = yield* stack.deploy(
        deploy("release", "bun run start:production"),
      );
      expect(second.serviceId).toBe(first.serviceId);
      expect(second).toMatchObject({
        branch: "release",
        startCommand: "bun run start:production",
      });

      const mutationCount = client.mutations.length;
      expect(
        yield* stack.deploy(
          deploy("release", "bun run start:production"),
        ),
      ).toEqual(second);
      expect(client.mutations).toHaveLength(mutationCount);

      yield* stack.destroy();
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

test.provider(
  "equivalent variables are a no-op regardless of property order",
  (stack) =>
    Effect.gen(function* () {
      const deployWith = (variables: Readonly<Record<string, string>>) =>
        Effect.gen(function* () {
          const project = yield* ExistingProject("OrderedProject", {
            projectId: "project_test",
            environmentId: "environment_test",
          });
          return yield* Service("OrderedApi", {
            project,
            name: "ordered-api",
            source: { image: "nginx:1.27-alpine" },
            variables,
          });
        });

      yield* stack.deploy(deployWith({ ALPHA: "one", BETA: "two" }));
      const mutationCount = client.mutations.length;

      const plan = yield* stack.plan(
        deployWith({ BETA: "two", ALPHA: "one" }),
      );
      const servicePlan = Object.values(plan.resources).find(
        ({ resource }) => resource.LogicalId === "OrderedApi",
      );

      expect(servicePlan?.action).toBe("noop");
      expect(client.mutations).toHaveLength(mutationCount);
      yield* stack.destroy();
    }),
);

test.provider(
  "changing a generated domain target port updates the existing domain",
  (stack) =>
    Effect.gen(function* () {
      const deployOnPort = (targetPort: number) =>
        Service("PortApi", {
          project: {
            projectId: "project_test",
            environmentId: "environment_test",
          },
          name: "port-api",
          source: { image: "nginx:1.27-alpine" },
          public: true,
          targetPort,
        });

      const first = yield* stack.deploy(deployOnPort(80));
      expect(client.getServiceSnapshot(first.serviceId)).toMatchObject({
        domainId: first.domainId,
        targetPort: 80,
      });

      const second = yield* stack.deploy(deployOnPort(8080));
      expect(second.domainId).toBe(first.domainId);
      expect(client.getServiceSnapshot(first.serviceId)).toMatchObject({
        domainId: first.domainId,
        targetPort: 8080,
      });

      yield* stack.destroy();
    }),
);

test.provider(
  "Railway defaults do not cause perpetual service updates",
  (stack) =>
    Effect.gen(function* () {
      const desiredWithDefaults = Service("DefaultedApi", {
        project: {
          projectId: "project_test",
          environmentId: "environment_test",
        },
        name: "defaulted-api",
        source: { image: "nginx:1.27-alpine" },
      });

      const first = yield* stack.deploy(desiredWithDefaults);
      client.setServiceSnapshot({
        ...client.getServiceSnapshot(first.serviceId)!,
        builder: "RAILPACK",
        restartPolicyType: "ON_FAILURE",
        restartPolicyMaxRetries: 10,
        sleepApplication: false,
        watchPatterns: [],
      });
      const mutationCount = client.mutations.length;

      const plan = yield* stack.plan(desiredWithDefaults);
      const servicePlan = Object.values(plan.resources).find(
        ({ resource }) => resource.LogicalId === "DefaultedApi",
      );
      expect(servicePlan?.action).toBe("noop");
      expect(client.mutations).toHaveLength(mutationCount);

      yield* stack.destroy();
    }),
);
