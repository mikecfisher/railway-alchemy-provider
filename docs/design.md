# Design

This is the maintainer-facing source of truth for v0.2 ownership and lifecycle
decisions.

## Resource model

```text
ExistingProject (read-only)
├── Environment (owned)
│   └── Service
└── Service
    ├── ServiceVariable
    └── CustomDomain

ExistingProject or Environment
└── SharedVariable
```

Railway separates a project-level service identity from each
environment-specific service instance. `RailwayClient` normalizes both into one
snapshot while every mutation retains project, environment, and service scope.

## Lifecycle rules

- All inputs are decoded with Effect Schema before use.
- Every plan reads Railway; state is identity/ownership, not the source of
  observed truth.
- Cold exact-name discovery returns `Unowned`.
- Multiple exact matches fail with `RailwayAmbiguousMatch`.
- Scope/identity changes replace; observable settings converge in place.
- Deletes are scoped by stable IDs and tolerate already-missing resources.
- Boolean Railway mutations must return `true`; `false` is a typed API error.
- Query transport retries bounded transient failures; mutations never retry.

`ExistingProject` never mutates or deletes Railway. `Environment`, `Service`,
`SharedVariable`, `ServiceVariable`, and `CustomDomain` are owned after create
or explicit adoption and are deleted on stack destruction.

## Services

`Service` supports mutually exclusive Docker image and GitHub repository
sources. Repository services also own their deployment trigger. The normalized
snapshot observes source, branch, deployment settings, selected variables,
generated Railway domain, and latest deployment.

Reconciliation:

1. Read by tracked ID or create.
2. Update source, trigger, and drifted service-instance settings.
3. Reconcile only variables owned by `Service.variables`.
4. Reconcile the generated Railway domain and target port.
5. Deploy when creation/settings/variables require it or health is not
   `SUCCESS`.
6. Wait on a bounded Effect schedule and return a fresh snapshot.

First-class variable resources mutate only their single named key. Teams should
not assign the same key to both the bulk and first-class ownership models.

## Secrets

Resolved credentials are `Redacted<string>`. GraphQL errors redact the
credential and all string variable values. Variable resource outputs contain
identity and name only.

Alchemy state still contains desired resource inputs, including variable
values. Secret safety therefore also depends on an encrypted,
access-controlled shared state backend and disciplined CI logs.

## Authentication

- API/account/workspace tokens: `Authorization: Bearer`, normally sourced from
  `RAILWAY_API_TOKEN`.
- Project tokens: `Project-Access-Token`, normally sourced from
  `RAILWAY_TOKEN`.
- Stored credentials record their token type. Legacy v0.1 records default to
  API-token behavior.
- Programmatic credentials accept only `Redacted<string>`.

Credentials resolve lazily inside live operations. Construction never logs or
serializes the token into resource state.

## Adapter boundaries

- `src/client/RailwayClient.ts`: normalized domain model/Effect service.
- `src/client/RailwayGraphQLRequest.ts`: HTTP, auth headers, safe read retries,
  envelope handling, and redaction.
- `src/client/RailwayGraphQLContract.ts`: decoding untrusted responses.
- `src/client/RailwayGraphQL.ts`: Railway GraphQL operations.
- `src/testing/InMemoryRailwayClient.ts`: deterministic lifecycle tests.
- `src/testing/RailwayCliGraphQLExecutor.ts`: live acceptance transport without
  reading the CLI credential.

Resource implementations do not depend on raw HTTP, CLI output, or GraphQL
payload shapes.

## Verification layers

1. TypeScript and Effect diagnostics.
2. Public provider lifecycle tests with deterministic in-memory Railway.
3. HTTP auth/retry/redaction and GraphQL contract tests.
4. Public `providers()` path test through real HTTP.
5. Consumer example typecheck, JS/declaration build, publint, and tarball audit.
6. Opt-in live Railway acceptance covering deploy, no-op, drift, HTTP, and
   cleanup.
