import { expect } from "bun:test";
import * as Test from "alchemy/Test/Bun";
import * as Effect from "effect/Effect";
import { CustomDomain, ExistingProject, Service } from "../src/index.js";
import {
  InMemoryRailwayClient,
  providersForTesting,
} from "../src/testing.js";

const client = InMemoryRailwayClient.make({
  projects: [
    {
      projectId: "project_domain",
      name: "domain-project",
      environmentId: "environment_domain",
      environmentName: "production",
    },
  ],
});

const { test } = Test.make({
  providers: providersForTesting({ client }),
});

const desired = (targetPort: number) =>
  Effect.gen(function* () {
    const project = yield* ExistingProject("Project", {
      projectId: "project_domain",
      environmentId: "environment_domain",
    });
    const service = yield* Service("Api", {
      project,
      name: "domain-api",
      source: { image: "nginx:1.27-alpine" },
    });
    const domain = yield* CustomDomain("Domain", {
      service,
      domain: "api.example.com",
      targetPort,
    });
    return { service, domain };
  });

test.provider(
  "a custom domain creates, updates its target port, and deletes",
  (stack) =>
    Effect.gen(function* () {
      const first = yield* stack.deploy(desired(80));
      expect(first.domain).toMatchObject({
        domain: "api.example.com",
        targetPort: 80,
      });

      const second = yield* stack.deploy(desired(8080));
      expect(second.domain.domainId).toBe(first.domain.domainId);
      expect(second.domain.targetPort).toBe(8080);

      yield* stack.destroy();
      expect(
        client.getCustomDomainSnapshot(first.domain.domainId),
      ).toBeUndefined();
      expect(
        client.getServiceSnapshot(first.service.serviceId),
      ).toBeUndefined();
    }),
);
