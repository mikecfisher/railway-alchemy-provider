import { expect, test } from "bun:test";
import * as Effect from "effect/Effect";
import {
  makeRailwayClient,
} from "../src/client/RailwayGraphQL.js";
import type {
  RailwayGraphQLExecutor,
} from "../src/client/RailwayGraphQLRequest.js";

test("maps Railway GraphQL project and service snapshots", async () => {
  const operations: Array<string> = [];
  const executor: RailwayGraphQLExecutor = {
    execute: (operation) => {
      operations.push(operation);
      if (operation === "GetProject") {
        return Effect.succeed({
          project: { id: "project_1", name: "example" },
          environment: {
            id: "environment_1",
            name: "production",
            projectId: "project_1",
          },
        });
      }
      if (operation === "GetService") {
        return Effect.succeed({
          serviceInstance: {
            serviceId: "service_1",
            serviceName: "api",
            source: { image: "nginx:1.27-alpine" },
            healthcheckPath: "/",
            region: "us-west2",
            numReplicas: 1,
            latestDeployment: {
              id: "deployment_1",
              status: "SUCCESS",
            },
          },
          variables: {
            ALCHEMY_PROVIDER_TEST: "first",
          },
          domains: {
            serviceDomains: [
              {
                id: "domain_1",
                domain: "api-production.up.railway.app",
              },
            ],
          },
        });
      }
      return Effect.die(new Error(`Unexpected operation: ${operation}`));
    },
  };
  const client = makeRailwayClient(executor);

  const result = await Effect.runPromise(
    Effect.all({
      project: client.getProject("project_1", "environment_1"),
      service: client.getService({
        projectId: "project_1",
        environmentId: "environment_1",
        serviceId: "service_1",
      }),
    }),
  );

  expect(result.project).toEqual({
    projectId: "project_1",
    name: "example",
    environmentId: "environment_1",
    environmentName: "production",
  });
  expect(result.service).toEqual({
    serviceId: "service_1",
    projectId: "project_1",
    environmentId: "environment_1",
    name: "api",
    image: "nginx:1.27-alpine",
    healthcheckPath: "/",
    region: "us-west2",
    numReplicas: 1,
    variables: {
      ALCHEMY_PROVIDER_TEST: "first",
    },
    domainId: "domain_1",
    domain: "api-production.up.railway.app",
    deploymentId: "deployment_1",
    deploymentStatus: "SUCCESS",
  });
  expect(operations).toEqual(["GetProject", "GetService"]);
});

test("rejects malformed Railway responses at the boundary", async () => {
  const client = makeRailwayClient({
    execute: () =>
      Effect.succeed({
        project: { id: 42, name: "invalid" },
        environment: {},
      }),
  });

  const exit = await Effect.runPromiseExit(
    client.getProject("project_1", "environment_1"),
  );

  expect(exit._tag).toBe("Failure");
});

test("lists every Railway service page", async () => {
  const cursors: Array<unknown> = [];
  const client = makeRailwayClient({
    execute: (operation, _query, variables) => {
      if (operation !== "ListServices") {
        return Effect.die(new Error(`Unexpected operation: ${operation}`));
      }
      cursors.push(variables["after"]);
      const secondPage = variables["after"] === "cursor_1";
      return Effect.succeed({
        project: {
          services: {
            edges: [
              {
                node: {
                  id: secondPage ? "service_2" : "service_1",
                  name: secondPage ? "worker" : "api",
                  projectId: "project_1",
                },
              },
            ],
            pageInfo: secondPage
              ? { hasNextPage: false, endCursor: "cursor_2" }
              : { hasNextPage: true, endCursor: "cursor_1" },
          },
        },
      });
    },
  });

  const services = await Effect.runPromise(
    client.listServices("project_1", "environment_1"),
  );

  expect(services.map(({ serviceId }) => serviceId)).toEqual([
    "service_1",
    "service_2",
  ]);
  expect(cursors).toEqual([null, "cursor_1"]);
});

test("polls deployments with a bounded Effect schedule", async () => {
  let deploymentReads = 0;
  const client = makeRailwayClient(
    {
      execute: (operation) => {
        if (operation === "DeployService") {
          return Effect.succeed({
            serviceInstanceDeployV2: "deployment_1",
          });
        }
        if (operation === "GetDeployment") {
          deploymentReads += 1;
          return Effect.succeed({
            deployment: {
              id: "deployment_1",
              status:
                deploymentReads === 1 ? "DEPLOYING" : "SUCCESS",
            },
          });
        }
        if (operation === "GetService") {
          return Effect.succeed({
            serviceInstance: {
              serviceId: "service_1",
              serviceName: "api",
              source: { image: "nginx:1.27-alpine" },
              healthcheckPath: "/",
              region: null,
              numReplicas: 1,
              latestDeployment: {
                id: "deployment_1",
                status: "SUCCESS",
              },
            },
            variables: {},
            domains: { serviceDomains: [] },
          });
        }
        return Effect.die(
          new Error(`Unexpected operation: ${operation}`),
        );
      },
    },
    {
      deploymentPollInterval: 0,
      deploymentMaxPolls: 3,
    },
  );

  const deployed = await Effect.runPromise(
    client.deployService({
      projectId: "project_1",
      environmentId: "environment_1",
      serviceId: "service_1",
    }),
  );

  expect(deployed.deploymentStatus).toBe("SUCCESS");
  expect(deploymentReads).toBe(2);
});

test("rejects a service deletion that Railway did not apply", async () => {
  const client = makeRailwayClient({
    execute: (operation) =>
      operation === "DeleteService"
        ? Effect.succeed({ serviceDelete: false })
        : Effect.die(new Error(`Unexpected operation: ${operation}`)),
  });

  const error = await Effect.runPromise(
    client
      .deleteService({
        projectId: "project_1",
        environmentId: "environment_1",
        serviceId: "service_1",
      })
      .pipe(Effect.flip),
  );

  expect(error._tag).toBe("RailwayApiError");
  if (error._tag === "RailwayApiError") {
    expect(error.operation).toBe("DeleteService");
  }
});
