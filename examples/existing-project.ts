import * as Alchemy from "alchemy";
import * as Effect from "effect/Effect";
import * as Railway from "railway-alchemy-provider";

const projectId = "project-id";
const environmentId = "environment-id";

export default Alchemy.Stack(
  "RailwayExample",
  {
    providers: Railway.providers(),
    state: Alchemy.localState(),
  },
  Effect.gen(function* () {
    const project = yield* Railway.ExistingProject("Project", {
      projectId,
      environmentId,
    });

    const service = yield* Railway.Service("Api", {
      project,
      name: "api",
      source: { image: "nginx:1.27-alpine" },
      healthcheckPath: "/",
      numReplicas: 1,
      public: true,
      targetPort: 80,
    });

    yield* Railway.ServiceVariable("Port", {
      service,
      name: "PORT",
      value: "80",
    });

    yield* Railway.ServiceVariable("AppEnvironment", {
      service,
      name: "APP_ENV",
      value: "production",
    });

    return {
      projectName: project.name,
      serviceId: service.serviceId,
      url: service.url,
    };
  }),
);
