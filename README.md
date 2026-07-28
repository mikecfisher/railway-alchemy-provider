# railway-alchemy-provider

[![CI](https://github.com/mikecfisher/railway-alchemy-provider/actions/workflows/ci.yml/badge.svg)](https://github.com/mikecfisher/railway-alchemy-provider/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/railway-alchemy-provider.svg)](https://www.npmjs.com/package/railway-alchemy-provider)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)

An Effect-native Railway provider for
[Alchemy v2](https://alchemy.run/infrastructure-as-code/).

> [!IMPORTANT]
> This is an experimental, community-maintained pre-1.0 package. It is not an
> official Railway or Alchemy project. Alchemy v2 and Effect v4 are beta
> dependencies, so compatible versions are pinned exactly.

## What v0.2 manages

- `ExistingProject`: read-only reference to an existing project/environment.
- `Environment`: create, rename, adopt, drift-check, and delete an environment.
- `Service`: Docker-image or GitHub-backed service, deployment configuration,
  selected variables, Railway-generated domain, deploy/wait, drift repair, and
  deletion.
- `SharedVariable`: one environment-scoped variable.
- `ServiceVariable`: one service-scoped variable.
- `CustomDomain`: one custom hostname and target port.

All mutable resources require explicit Alchemy adoption when an exact live
match already exists. Ambiguous matches fail closed.

Projects, volumes, databases, TCP proxies, private registries, and webhooks are
not managed yet. See the [roadmap](docs/railway-provider-roadmap.md).

## Compatibility

| Component | Supported version |
| --- | --- |
| `railway-alchemy-provider` | `0.2.x` |
| `alchemy` | `2.0.0-beta.65` |
| `effect` | `4.0.0-beta.102` |
| `@effect/platform-bun` | `4.0.0-beta.102` |
| `@effect/platform-node` | `4.0.0-beta.102` |
| Bun | `1.3.14` tested |
| Node.js | `>=20.19`; Node 20.19 and 22 import-smoke-tested |
| Module format | ESM only |

## Install

```bash
bun add railway-alchemy-provider \
  alchemy@2.0.0-beta.65 \
  effect@4.0.0-beta.102 \
  @effect/platform-bun@4.0.0-beta.102 \
  @effect/platform-node@4.0.0-beta.102
```

## Authentication

Account and workspace tokens use `RAILWAY_API_TOKEN`:

```bash
export RAILWAY_API_TOKEN="..."
```

Project tokens use `RAILWAY_TOKEN` and Railway's
`Project-Access-Token` header. Configure the token type interactively:

```bash
bunx alchemy login --configure
```

Choose Railway, the token type, and either environment or stored credentials.
Legacy v0.1 stored/API profiles continue to resolve as API tokens.

For non-interactive code, pass a redacted token:

```ts
import * as Redacted from "effect/Redacted";
import * as Railway from "railway-alchemy-provider";

const railwayProviders = Railway.providers({
  credentials: {
    token: Redacted.make(process.env.RAILWAY_TOKEN!),
    tokenType: "project",
  },
});
```

Never put the unredacted token in resource inputs or outputs.

## Quick start

```ts
import * as Alchemy from "alchemy";
import * as Effect from "effect/Effect";
import * as Railway from "railway-alchemy-provider";

const projectId = "project-id";
const productionEnvironmentId = "environment-id";

export default Alchemy.Stack(
  "RailwayExample",
  {
    providers: Railway.providers(),
    state: Alchemy.localState(),
  },
  Effect.gen(function* () {
    const production = yield* Railway.ExistingProject("Production", {
      projectId,
      environmentId: productionEnvironmentId,
    });

    const api = yield* Railway.Service("Api", {
      project: production,
      name: "api",
      source: { image: "nginx:1.27-alpine" },
      healthcheckPath: "/",
      numReplicas: 1,
      public: true,
      targetPort: 80,
    });

    yield* Railway.ServiceVariable("ApiPort", {
      service: api,
      name: "PORT",
      value: "80",
    });

    return { serviceId: api.serviceId, url: api.url };
  }),
);
```

```bash
bunx alchemy plan
bunx alchemy deploy
bunx alchemy destroy
```

`Alchemy.localState()` is suitable for individual/local use. A real team should
use protected shared state and a single CI writer; see
[Team operations](docs/team-operations.md).

## GitHub-backed services

```ts
const api = yield* Railway.Service("Api", {
  project,
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
  preDeployCommand: ["bun run migrate"],
  healthcheckPath: "/health",
  healthcheckTimeout: 30,
  restartPolicyType: "ON_FAILURE",
  restartPolicyMaxRetries: 5,
  sleepApplication: false,
  watchPatterns: ["/apps/api/**"],
});
```

The Railway account must already have access to the GitHub repository.
Changing image/repository/branch or deployment settings converges the existing
service; changing project/environment replaces it.

## Managed environments

```ts
const staging = yield* Railway.Environment("Staging", {
  projectId,
  name: "staging",
  sourceEnvironmentId: productionEnvironmentId,
  skipInitialDeploys: true,
});

const worker = yield* Railway.Service("Worker", {
  project: staging,
  name: "worker",
  source: { repo: "your-org/your-repo", branch: "main" },
  startCommand: "bun run worker",
});
```

Environment rename updates in place. Changing the project, source environment,
or `ephemeral` setting replaces the environment. Destroy deletes managed or
adopted environments and everything Railway associates with them.

## Variables and secrets

Prefer one first-class resource per independently owned value:

```ts
yield* Railway.SharedVariable("DatabaseHost", {
  project,
  name: "DATABASE_HOST",
  value: database.hostname,
});

yield* Railway.ServiceVariable("ApiSecret", {
  service: api,
  name: "API_SECRET",
  value: secret,
});
```

Variable values are deliberately omitted from resource outputs and provider
errors. Values remain in Alchemy resource inputs/state, so the state backend
must be encrypted and access-controlled.

`Service.variables` remains supported for convenient bulk ownership. Do not
manage the same key with both `Service.variables` and `ServiceVariable`.
Unmanaged Railway variables are preserved.

## Domains

`Service.public` manages Railway's generated domain. Use `CustomDomain` for
your own hostname:

```ts
const domain = yield* Railway.CustomDomain("ApiDomain", {
  service: api,
  domain: "api.example.com",
  targetPort: 8080,
});
```

The output includes Railway's `verified`, `certificateStatus`, and
`syncStatus`; DNS configuration is still your responsibility. Changing the
hostname or service replaces the resource. Changing `targetPort` updates it in
place.

## Resource summary

| Resource | Stable identity | In-place drift | Delete behavior |
| --- | --- | --- | --- |
| `ExistingProject` | project + environment IDs | live names refreshed | no-op |
| `Environment` | environment + project IDs | name | deletes environment |
| `Service` | service + project + environment IDs | source, deployment config, variables, domains, health | deletes service |
| `SharedVariable` | project + environment + name | value | deletes variable |
| `ServiceVariable` | project + environment + service + name | value | deletes variable |
| `CustomDomain` | domain + service scope | target port/status | deletes domain |

Every plan reads live state. Read-only GraphQL operations retry bounded
transient network, 408, 429, and 5xx failures. Mutations are never
automatically retried because their idempotency cannot be assumed.

## Adoption and deletion safety

```ts
import { adopt } from "alchemy/AdoptPolicy";

const api = yield* Railway.Service("Api", {
  project: { projectId, environmentId },
  name: "existing-api",
  source: { image: "nginx:1.27-alpine" },
}).pipe(adopt(true));
```

Exact-name discovery returns an unowned resource. Without `adopt(true)`,
deployment stops before mutation. After adoption, stack destruction deletes
that live resource. Use Alchemy's removal-policy controls for infrastructure
that must be retained, and verify a destroy plan before approving it.

## Railway native IaC versus this provider

Railway's native Infrastructure as Code is the best default when the entire
stack is Railway-only and its current resource model covers the workload. This
provider is useful when a team wants one Alchemy/Effect graph across Railway
and other providers, explicit adoption semantics, typed outputs between
resources, or custom lifecycle policy. Railway native IaC is evolving; evaluate
both against your current requirements.

## Development and verification

```bash
bun install --frozen-lockfile
bun run check
```

The release gate includes strict TypeScript, Effect diagnostics, provider
lifecycle tests, GraphQL boundary tests, production provider-path coverage,
build/declaration output, package linting, example compilation, and tarball
inspection. The exact Effect source is vendored read-only under `repos/effect`.

The opt-in live test creates an isolated temporary environment and disposable
Railway resources, verifies convergence/HTTP, destroys them, and confirms
cleanup:

```bash
RAILWAY_TEST_PROJECT_ID=... \
RAILWAY_TEST_ENVIRONMENT_ID=... \
RAILWAY_TEST_SERVICE_NAME=alchemy-provider-e2e-local \
bun run test:acceptance
```

See [Contributing](CONTRIBUTING.md), [Design](docs/design.md),
[Migration](docs/migrating-to-v0.2.md), and
[Release process](docs/releasing.md).

## Support and security

- Bugs and usage: [GitHub Issues](https://github.com/mikecfisher/railway-alchemy-provider/issues)
- Support expectations: [SUPPORT.md](SUPPORT.md)
- Security reports: [SECURITY.md](SECURITY.md)
- Community expectations: [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md)

Do not include tokens, variable values, `.alchemy` state, or private Railway
response payloads in public issues.
