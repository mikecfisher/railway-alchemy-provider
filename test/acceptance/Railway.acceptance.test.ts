import { afterAll, beforeAll, expect } from "bun:test";
import { adopt } from "alchemy/AdoptPolicy";
import * as Test from "alchemy/Test/Bun";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { ExistingProject, Service } from "../../src/index.js";
import {
  makeRailwayClient,
  makeRailwayCliGraphQLExecutor,
  providersForTesting,
} from "../../src/testing.js";

const requiredEnvironment = (name: string) => {
  const value = Bun.env[name];
  if (!value) {
    throw new Error(`${name} is required for Railway acceptance tests`);
  }
  return value;
};

const projectId = requiredEnvironment("RAILWAY_TEST_PROJECT_ID");
const environmentId = requiredEnvironment("RAILWAY_TEST_ENVIRONMENT_ID");
const serviceName =
  Bun.env["RAILWAY_TEST_SERVICE_NAME"] ??
  `alchemy-provider-e2e-${Date.now().toString(36)}`;
const executor = makeRailwayCliGraphQLExecutor({
  caller: "skill:use-railway@1.3.6",
  agentSession:
    "railway-alchemy-provider-e2e-20260727-01",
});
const client = makeRailwayClient(executor, {
  deploymentPollInterval: 2_000,
  deploymentMaxPolls: 300,
});
const { test } = Test.make({
  providers: providersForTesting({ client }),
});

const CreatedService = Schema.Struct({
  serviceCreate: Schema.Struct({
    id: Schema.NonEmptyString,
    name: Schema.NonEmptyString,
  }),
});

let seededServiceId: string | undefined;

beforeAll(async () => {
  const result = await Effect.runPromise(
    executor.execute(
      "CreateAcceptanceSeed",
      `
        mutation CreateAcceptanceSeed(
          $projectId: String!
          $environmentId: String!
          $name: String!
        ) {
          serviceCreate(input: {
            projectId: $projectId
            environmentId: $environmentId
            name: $name
          }) { id name }
        }
      `,
      { projectId, environmentId, name: serviceName },
    ).pipe(
      Effect.flatMap(Schema.decodeUnknownEffect(CreatedService)),
    ),
  );
  seededServiceId = result.serviceCreate.id;
});

afterAll(async () => {
  if (!seededServiceId) return;
  await Effect.runPromise(
    executor.execute(
      "CleanupAcceptanceSeed",
      `
        mutation CleanupAcceptanceSeed(
          $serviceId: String!
          $environmentId: String!
        ) {
          serviceDelete(
            id: $serviceId
            environmentId: $environmentId
          )
        }
      `,
      { serviceId: seededServiceId, environmentId },
    ).pipe(Effect.ignore),
  );
});

const desired = Effect.gen(function* () {
  yield* ExistingProject("AcceptanceProject", {
    projectId,
    environmentId,
  });
  return yield* Service("AcceptanceService", {
    project: { projectId, environmentId },
    name: serviceName,
    source: { image: "nginx:1.27-alpine" },
    healthcheckPath: "/",
    numReplicas: 1,
    variables: {
      ALCHEMY_PROVIDER_E2E: "true",
      PORT: "80",
    },
    public: true,
    targetPort: 80,
  }).pipe(adopt(true));
});

test.provider(
  "adopts a CLI-created service, deploys it, serves HTTP, and deletes it",
  (stack) =>
    Effect.gen(function* () {
      const expectedServiceId = seededServiceId;
      if (!expectedServiceId) {
        return yield* Effect.die(
          new Error("The Railway CLI did not create the acceptance service"),
        );
      }
      const deployed = yield* stack.deploy(desired);
      expect(deployed.serviceId).toBe(expectedServiceId);
      expect(deployed.deploymentStatus).toBe("SUCCESS");
      expect(deployed.url).toStartWith("https://");
      const url = deployed.url;
      if (!url) {
        return yield* Effect.die(
          new Error("Railway did not create a public service URL"),
        );
      }

      const second = yield* stack.deploy(desired);
      expect(second).toEqual(deployed);

      let status: number | undefined;
      for (let attempt = 0; attempt < 30; attempt++) {
        const response = yield* Effect.tryPromise(() =>
          fetch(url, { redirect: "follow" }),
        ).pipe(Effect.orElseSucceed(() => undefined));
        if (response?.ok) {
          status = response.status;
          break;
        }
        yield* Effect.sleep(2_000);
      }
      expect(status).toBe(200);

      yield* stack.destroy();
      let removed = false;
      for (let attempt = 0; attempt < 30; attempt++) {
        const services = yield* client.listServices(
          projectId,
          environmentId,
        );
        if (
          !services.some(
            (service) => service.serviceId === deployed.serviceId,
          )
        ) {
          removed = true;
          break;
        }
        yield* Effect.sleep(1_000);
      }
      expect(removed).toBe(true);
      seededServiceId = undefined;
    }),
);
