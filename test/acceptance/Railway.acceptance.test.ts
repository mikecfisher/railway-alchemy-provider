import { afterAll, beforeAll, expect } from "bun:test";
import { adopt } from "alchemy/AdoptPolicy";
import * as Test from "alchemy/Test/Bun";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import {
  CustomDomain,
  ExistingProject,
  Service,
  ServiceVariable,
  SharedVariable,
} from "../../src/index.js";
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
const sourceEnvironmentId = requiredEnvironment(
  "RAILWAY_TEST_ENVIRONMENT_ID",
);
const serviceName =
  Bun.env["RAILWAY_TEST_SERVICE_NAME"] ??
  `alchemy-provider-e2e-${Date.now().toString(36)}`;
const environmentName = `e2e-${Date.now().toString(36)}`;
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

const CreatedEnvironment = Schema.Struct({
  environmentCreate: Schema.Struct({
    id: Schema.NonEmptyString,
  }),
});

let seededServiceId: string | undefined;
let acceptanceEnvironmentId: string | undefined;

beforeAll(async () => {
  const environment = await Effect.runPromise(
    executor
      .execute(
        "CreateAcceptanceEnvironment",
        `
          mutation CreateAcceptanceEnvironment(
            $projectId: String!
            $name: String!
            $sourceEnvironmentId: String!
          ) {
            environmentCreate(input: {
              projectId: $projectId
              name: $name
              sourceEnvironmentId: $sourceEnvironmentId
              skipInitialDeploys: true
            }) { id }
          }
        `,
        {
          projectId,
          name: environmentName,
          sourceEnvironmentId,
        },
      )
      .pipe(
        Effect.flatMap(
          Schema.decodeUnknownEffect(CreatedEnvironment),
        ),
      ),
  );
  acceptanceEnvironmentId = environment.environmentCreate.id;
  const result = await Effect.runPromise(
    executor
      .execute(
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
        {
          projectId,
          environmentId: acceptanceEnvironmentId,
          name: serviceName,
        },
      )
      .pipe(
        Effect.flatMap(Schema.decodeUnknownEffect(CreatedService)),
      ),
  );
  seededServiceId = result.serviceCreate.id;
});

afterAll(async () => {
  if (seededServiceId && acceptanceEnvironmentId) {
    await Effect.runPromise(
      executor
        .execute(
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
          {
            serviceId: seededServiceId,
            environmentId: acceptanceEnvironmentId,
          },
        )
        .pipe(Effect.ignore),
    );
  }
  if (acceptanceEnvironmentId) {
    await Effect.runPromise(
      executor
        .execute(
          "CleanupAcceptanceEnvironment",
          `
            mutation CleanupAcceptanceEnvironment(
              $environmentId: String!
            ) {
              environmentDelete(id: $environmentId)
            }
          `,
          { environmentId: acceptanceEnvironmentId },
        )
        .pipe(Effect.ignore),
    );
  }
});

const desired = (includeCustomDomain: boolean) => Effect.gen(function* () {
  const environmentId = acceptanceEnvironmentId;
  if (!environmentId) {
    return yield* Effect.die(
      new Error("The Railway CLI did not create the acceptance environment"),
    );
  }
  const project = yield* ExistingProject("AcceptanceProject", {
    projectId,
    environmentId,
  });
  const service = yield* Service("AcceptanceService", {
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
  const serviceVariable = yield* ServiceVariable(
    "AcceptanceServiceVariable",
    {
      service,
      name: "ALCHEMY_PROVIDER_FIRST_CLASS_E2E",
      value: "true",
      skipDeploys: true,
    },
  );
  const sharedVariable = yield* SharedVariable(
    "AcceptanceSharedVariable",
    {
      project,
      name: "ALCHEMY_PROVIDER_SHARED_E2E",
      value: "true",
      skipDeploys: true,
    },
  );
  const customDomain = includeCustomDomain
    ? yield* CustomDomain("AcceptanceCustomDomain", {
        service,
        domain:
          `${serviceName.replaceAll(/[^a-zA-Z0-9]/g, "")}.` +
          "alchemy-provider-test.com",
        targetPort: 80,
      })
    : undefined;
  return { service, serviceVariable, sharedVariable, customDomain };
});

test.provider(
  "adopts a CLI-created service, deploys it, serves HTTP, and deletes it",
  (stack) =>
    Effect.gen(function* () {
      const expectedServiceId = seededServiceId;
      const environmentId = acceptanceEnvironmentId;
      if (!expectedServiceId) {
        return yield* Effect.die(
          new Error("The Railway CLI did not create the acceptance service"),
        );
      }
      if (!environmentId) {
        return yield* Effect.die(
          new Error("The Railway CLI did not create the acceptance environment"),
        );
      }
      const serviceDeployed = yield* stack.deploy(desired(false));
      const deployed = yield* stack.deploy(desired(true));
      expect(deployed.service.serviceId).toBe(expectedServiceId);
      expect(deployed.service.deploymentStatus).toBe("SUCCESS");
      expect(deployed.service.url).toStartWith("https://");
      expect(deployed.serviceVariable).not.toHaveProperty("value");
      expect(deployed.sharedVariable).not.toHaveProperty("value");
      expect(serviceDeployed.service.deploymentStatus).toBe("SUCCESS");
      expect(deployed.customDomain?.domainId).toBeTruthy();
      const url = deployed.service.url;
      if (!url) {
        return yield* Effect.die(
          new Error("Railway did not create a public service URL"),
        );
      }

      const second = yield* stack.deploy(desired(true));
      expect(second.service.deploymentId).toBe(
        deployed.service.deploymentId,
      );
      expect(second.service.serviceId).toBe(deployed.service.serviceId);
      expect(second.customDomain?.domainId).toBe(
        deployed.customDomain?.domainId,
      );

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
            (service) => service.serviceId === deployed.service.serviceId,
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
