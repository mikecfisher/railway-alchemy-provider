# Design

This document describes the implemented v0.1 architecture. It is the
maintainer-facing source of truth for lifecycle and ownership decisions.

## Scope

The provider manages a Docker-image Railway service inside an existing project
and environment. It intentionally does not own the project or environment.

```text
ExistingProject (read-only reference)
└── Service (owned after create or explicit adoption)
    ├── service identity and Docker image
    ├── environment-specific deployment settings
    ├── selected variables
    ├── optional Railway public domain
    └── deployment status
```

Railway separates a project-level `Service` identity from its
environment-specific `ServiceInstance`. The client adapter normalizes both into
one provider snapshot while retaining project, environment, and service IDs for
every operation.

## Resource lifecycle

Each resource is a typed Alchemy `Resource` with an Effect provider.

`ExistingProject`:

1. Decodes the requested project and environment IDs.
2. Reads both objects from Railway.
3. Returns their live names and stable IDs.
4. Never mutates or deletes either object.

`Service` uses one observe-and-converge lifecycle for create, update, retry,
drift repair, and adoption:

1. Read the tracked service ID when Alchemy state contains one.
2. Create the service when no tracked live service exists.
3. Synchronize only drifted settings.
4. Upsert desired managed variables.
5. Delete only variables previously managed by this resource and now removed
   from the desired input.
6. Create or remove the Railway-generated domain.
7. Deploy only when required and wait for a terminal result.
8. Return a fresh, secret-free snapshot.

Deletion removes the Railway service and treats an already-missing service as
success.

## Adoption and ownership

An exact-name service discovered without Alchemy state is returned as
`Unowned`. Alchemy will not manage it unless the stack explicitly enables
adoption.

Adoption is intentionally consequential: after adoption, stack destruction
deletes that Railway service. Project and environment references remain
read-only in every lifecycle.

Name matching is exact and succeeds only when there is one live match. The
provider does not infer ownership from a partial or ambiguous display name.

## Variables and state

`Service.variables` is a resource-owned subset of the Railway variable
collection:

- desired keys are created or repaired;
- previously managed keys removed from the desired input are deleted;
- unrelated Railway variables are preserved.

Only managed variable names are returned as resource attributes. Desired values
still exist in Alchemy's resource inputs and therefore in its state. Users must
protect the selected state backend as secret-bearing infrastructure state.

Transport errors redact the Railway bearer token and all string values supplied
as GraphQL variables before creating a provider error.

## Authentication

The provider registers an Alchemy authentication provider with two methods:

- `env`: resolve `RAILWAY_API_TOKEN` lazily;
- `stored`: read a token from Alchemy's credential store.

Resolved credentials use Effect `Redacted<string>`. Authentication is resolved
inside live operations rather than when the provider collection is constructed.

Account and workspace tokens use Railway's bearer-token header and are
supported. Project tokens use a different header and are deferred.

## Adapter boundaries

- `src/client/RailwayClient.ts` defines the Effect service and normalized
  domain model used by resources.
- `src/client/RailwayGraphQLRequest.ts` owns authenticated HTTP transport,
  GraphQL envelope handling, and error redaction.
- `src/client/RailwayGraphQLContract.ts` decodes untrusted Railway responses.
- `src/client/RailwayGraphQL.ts` maps Railway operations into the client
  service.
- `src/testing/InMemoryRailwayClient.ts` provides deterministic lifecycle
  tests.
- `src/testing/RailwayCliGraphQLExecutor.ts` provides an authenticated live-test
  transport without accessing the CLI credential.

Resources do not depend directly on HTTP, the Railway CLI, or raw GraphQL
payloads.

## Deployment polling

Deployment polling uses a bounded Effect `Schedule`. `SUCCESS` returns a fresh
service snapshot. Terminal Railway failures and an exhausted polling schedule
become `RailwayDeploymentFailed`.

The default client polls every two seconds for at most 150 observations.
Testing and acceptance adapters can override both values.

## Verification layers

The release gate combines:

1. strict TypeScript and Effect diagnostics;
2. provider lifecycle tests against the in-memory client;
3. GraphQL transport and response-contract tests;
4. an example consumer typecheck;
5. JavaScript and declaration builds;
6. package-surface linting and tarball inspection;
7. an opt-in live Railway acceptance test.

The live acceptance test creates a disposable service, adopts it, converges its
configuration, verifies HTTPS, verifies a second deploy is a no-op, destroys the
stack, and confirms the service disappears.
