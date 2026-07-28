import * as Alchemy from "alchemy";
import * as Effect from "effect/Effect";
import * as Railway from "railway-alchemy-provider";

const projectId = "project-id";
const productionEnvironmentId = "production-environment-id";

export default Alchemy.Stack(
  "RailwayTeamExample",
  {
    providers: Railway.providers(),
    // Replace local state with the team's protected shared state backend.
    state: Alchemy.localState(),
  },
  Effect.gen(function* () {
    const staging = yield* Railway.Environment("Staging", {
      projectId,
      name: "staging",
      sourceEnvironmentId: productionEnvironmentId,
      skipInitialDeploys: true,
    });

    const api = yield* Railway.Service("Api", {
      project: staging,
      name: "api",
      source: {
        repo: "your-org/your-repo",
        branch: "main",
        checkSuites: true,
      },
      builder: "RAILPACK",
      rootDirectory: "/apps/api",
      buildCommand: "bun run build",
      startCommand: "bun run start",
      healthcheckPath: "/health",
      restartPolicyType: "ON_FAILURE",
      restartPolicyMaxRetries: 5,
    });

    yield* Railway.ServiceVariable("ApiEnvironment", {
      service: api,
      name: "APP_ENV",
      value: "staging",
    });

    return {
      environmentId: staging.environmentId,
      serviceId: api.serviceId,
    };
  }),
);
