# railway-alchemy-provider

[![CI](https://github.com/mikecfisher/railway-alchemy-provider/actions/workflows/ci.yml/badge.svg)](https://github.com/mikecfisher/railway-alchemy-provider/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/railway-alchemy-provider.svg)](https://www.npmjs.com/package/railway-alchemy-provider)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)

An Effect-native Railway provider for
[Alchemy v2](https://alchemy.run/infrastructure-as-code/).

> [!IMPORTANT]
> This is an experimental, community-maintained pre-1.0 package. It is not an
> official Railway or Alchemy project. Alchemy v2 and Effect v4 are currently
> beta dependencies, so compatible versions are pinned exactly.

## What it manages

The v0.1 provider deliberately supports one safe, focused path:

- `ExistingProject` references an existing Railway project and environment
  without creating, updating, or deleting either one.
- `Service` manages a Docker-image service in that environment: image,
  health-check path, region, replica count, selected variables, a generated
  Railway public domain, deployment, drift repair, and deletion.
- Existing services are matched by exact name and require explicit Alchemy
  adoption before the provider can change or delete them.

It does not yet manage projects, environments, GitHub sources, custom domains,
volumes, databases, TCP proxies, webhooks, OAuth, or project tokens. See the
[roadmap](docs/railway-provider-roadmap.md).

## Compatibility

| Component | Supported version |
| --- | --- |
| `railway-alchemy-provider` | `0.1.x` |
| `alchemy` | `2.0.0-beta.64` |
| `effect` | `4.0.0-beta.102` |
| `@effect/platform-bun` | `4.0.0-beta.102` |
| `@effect/platform-node` | `4.0.0-beta.102` |
| Bun | `1.3.14` tested |
| Node.js | `>=18`; Node 22 import-smoke-tested |
| Module format | ESM only |

## Install

```bash
bun add railway-alchemy-provider \
  alchemy@2.0.0-beta.64 \
  effect@4.0.0-beta.102 \
  @effect/platform-bun@4.0.0-beta.102 \
  @effect/platform-node@4.0.0-beta.102
```

## Quick start

### 1. Choose Railway credentials

For CI, set an account or workspace token that can access the target project:

```bash
export RAILWAY_API_TOKEN="..."
```

For local use, create `alchemy.run.ts` first and then let Alchemy store the
token in its credential store:

```bash
bunx alchemy login --configure
```

Choose Railway and the stored API-token method. Credentials are resolved lazily
for Railway operations, redacted from profile output, and omitted from resource
outputs and provider errors.

Project tokens are not supported in v0.1 because Railway requires a different
authentication header for them.

### 2. Find the target IDs

Use the Railway dashboard, or link the Railway CLI and inspect its current
context:

```bash
railway status --json
```

You need a project ID and an environment ID. `ExistingProject` will verify that
they refer to the same Railway project before any service mutation runs.

### 3. Declare the stack

Create `alchemy.run.ts`:

```ts
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

    const api = yield* Railway.Service("Api", {
      project,
      name: "api",
      source: { image: "nginx:1.27-alpine" },
      healthcheckPath: "/",
      numReplicas: 1,
      variables: {
        // Railway health checks use PORT. Set it when the image listens on a
        // fixed port instead of Railway's injected dynamic port.
        PORT: "80",
        APP_ENV: "production",
      },
      public: true,
      targetPort: 80,
    });

    return {
      projectName: project.name,
      serviceId: api.serviceId,
      url: api.url,
      deploymentStatus: api.deploymentStatus,
    };
  }),
);
```

### 4. Plan and deploy

```bash
bunx alchemy plan
bunx alchemy deploy
```

To destroy the managed service:

```bash
bunx alchemy destroy
```

> [!CAUTION]
> Destroy deletes the Railway service, including when the service was imported
> through explicit adoption. `ExistingProject` and its environment are never
> deleted.

## Resource reference

### `ExistingProject`

References one existing Railway project/environment pair.

#### Inputs

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `projectId` | `string` | yes | Railway project ID. |
| `environmentId` | `string` | yes | Environment ID belonging to that project. |

#### Outputs

| Property | Type | Description |
| --- | --- | --- |
| `projectId` | `string` | Stable Railway project ID. |
| `name` | `string` | Live project name. |
| `environmentId` | `string` | Stable Railway environment ID. |
| `environmentName` | `string` | Live environment name. |

Changing either ID replaces the Alchemy reference. Deleting the reference is a
no-op in Railway.

### `Service`

Manages one Docker-image Railway service in one environment.

#### Inputs

| Property | Type | Required | Default | Description |
| --- | --- | --- | --- | --- |
| `project` | `{ projectId, environmentId }` | yes | — | Existing Railway scope. An `ExistingProject` output can be passed directly. |
| `name` | `string` | yes | — | Exact Railway service name. |
| `source.image` | `string` | yes | — | Public Docker image reference. |
| `healthcheckPath` | `string` | no | unset | HTTP health-check path. |
| `region` | `string` | no | Railway default | Railway deployment region. |
| `numReplicas` | positive integer | no | `1` | Desired replica count. |
| `variables` | `Record<string, string>` | no | `{}` | Variables owned by this resource. |
| `public` | `boolean` | no | `false` | Generate a Railway public domain. |
| `targetPort` | positive integer | no | Railway default | Port used by the generated domain. |

#### Outputs

| Property | Type | Description |
| --- | --- | --- |
| `serviceId` | `string` | Stable Railway service ID. |
| `projectId` | `string` | Railway project ID. |
| `environmentId` | `string` | Railway environment ID. |
| `name` | `string` | Live service name. |
| `image` | `string` | Live Docker image. |
| `healthcheckPath` | `string \| undefined` | Live health-check path. |
| `region` | `string \| undefined` | Live deployment region. |
| `numReplicas` | `number` | Live replica count. |
| `variableNames` | `readonly string[]` | Managed variable names; values are omitted. |
| `domainId` | `string \| undefined` | Generated Railway domain ID. |
| `domain` | `string \| undefined` | Generated hostname. |
| `url` | `string \| undefined` | Generated HTTPS URL. |
| `deploymentId` | `string \| undefined` | Latest deployment ID. |
| `deploymentStatus` | `string \| undefined` | Latest Railway deployment status. |

## Adopting an existing service

Cold adoption requires literal project/environment IDs and an explicit policy:

```ts
import { adopt } from "alchemy/AdoptPolicy";

const api = yield* Railway.Service("Api", {
  project: { projectId, environmentId },
  name: "existing-api",
  source: { image: "nginx:1.27-alpine" },
  variables: { PORT: "80" },
  public: true,
  targetPort: 80,
}).pipe(adopt(true));
```

The provider adopts only one exact live name match. Zero matches create a new
service; ambiguous matches fail closed. After adoption, the service is managed
like any other resource and will be deleted by stack destruction.

## Lifecycle, drift, and secrets

Every plan reads live Railway state. A managed service is updated when its
image, health check, region, replicas, managed variables, public-domain setting,
or deployment health differs from the desired state.

The provider tracks the names of variables it manages:

- desired managed variables are created or repaired;
- a previously managed variable removed from the resource is deleted;
- variables not managed by this resource are preserved.

Variable values are intentionally omitted from outputs and errors. Desired
values still exist in the Alchemy state input, so use an appropriately protected
state backend for secrets and never commit `.alchemy/` or `.env` files.

A deployment is not reported as successful until Railway reaches `SUCCESS`.
Terminal failure states and polling timeouts become typed Effect errors:

- `RailwayAuthenticationError`
- `RailwayApiError`
- `RailwayNotFound`
- `RailwayDeploymentFailed`

## Architecture

See [docs/design.md](docs/design.md) for lifecycle, ownership, authentication,
and adapter decisions.

The stable public package entry points are:

- `railway-alchemy-provider`
- `railway-alchemy-provider/testing`

The testing entry point exposes the in-memory client, GraphQL executor seam,
Railway CLI adapter, and provider-layer constructor used by this package's own
tests. The Railway CLI adapter itself requires Bun.

## Development

Requirements:

- Bun `1.3.14`
- an authenticated Railway CLI only for live acceptance tests

```bash
bun install --frozen-lockfile
bun run check
```

The exact Effect source used by the package is vendored read-only under
`repos/effect`. The verification suite checks that its version matches the
package peer dependency. It is excluded from package builds, TypeScript
projects, tests, and editor search.

The real Railway acceptance test is opt-in. It creates a uniquely named empty
service through the authenticated Railway CLI, adopts it with the provider,
deploys it, verifies HTTPS, destroys it, and confirms it disappeared:

```bash
RAILWAY_TEST_PROJECT_ID=... \
RAILWAY_TEST_ENVIRONMENT_ID=... \
RAILWAY_TEST_SERVICE_NAME=alchemy-provider-e2e-local \
bun run test:acceptance
```

The harness never reads or prints the Railway CLI credential.

See [CONTRIBUTING.md](CONTRIBUTING.md) before opening a pull request.

## Support and security

- Usage questions and reproducible bugs: [GitHub Issues](https://github.com/mikecfisher/railway-alchemy-provider/issues)
- Support expectations: [SUPPORT.md](SUPPORT.md)
- Contribution guidelines: [CONTRIBUTING.md](CONTRIBUTING.md)
- Security reports: [SECURITY.md](SECURITY.md)
- Community expectations: [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md)

Do not include tokens, variable values, `.alchemy` state, or private Railway
response payloads in public issues.

## Releases

GitHub Releases publish to npm from `.github/workflows/publish.yml` using npm
trusted publishing and provenance. A release tag must exactly match
`v${package.json.version}`.

## License

[Apache License 2.0](LICENSE).
