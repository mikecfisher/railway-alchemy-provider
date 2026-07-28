# Contributing

Thank you for improving `railway-alchemy-provider`.

## Before opening an issue

- Search existing issues.
- Confirm the problem with the exact compatibility versions listed in the
  README.
- Remove Railway tokens, variable values, `.alchemy` state, and private API
  payloads from logs and examples.
- Report security concerns privately according to [SECURITY.md](SECURITY.md).

Usage and bug-report guidance is also available in [SUPPORT.md](SUPPORT.md).

## Development setup

Requirements:

- Bun `1.3.14`;
- Node.js 20.19 or newer for the Node compatibility smoke test;
- Railway CLI authentication only when running the opt-in acceptance test.

```bash
git clone https://github.com/mikecfisher/railway-alchemy-provider.git
cd railway-alchemy-provider
bun install --frozen-lockfile
bun run check
```

The project vendors the supported Effect source under `repos/effect` for
diagnostics. Its package-manager lockfile is intentionally excluded because
the vendored workspace is never installed or shipped.
Treat it as read-only reference material. When intentionally updating Effect,
update the package pins and vendored source together; `bun run check:vendor`
enforces their version match.

## Code conventions

- Keep resource lifecycle logic in `src/resources`.
- Keep Railway transport and API quirks behind `RailwayClient`.
- Decode untrusted responses with Effect Schema.
- Use typed Effect errors and named `Effect.fn` workflows.
- Resolve credentials lazily and keep secret values out of outputs, errors,
  logs, fixtures, and snapshots.
- Preserve unmanaged Railway state unless a resource explicitly owns it.
- Add behavior tests through the public provider/client seam rather than
  private implementation helpers.

See [docs/design.md](docs/design.md) for the current architecture and ownership
rules.

## Verification

The required local gate is:

```bash
bun run check
```

It runs strict typechecking, vendored-version verification, Effect diagnostics,
unit/provider tests, JavaScript and declaration builds, package linting, and an
example consumer typecheck.

For package inspection:

```bash
npm pack --dry-run --ignore-scripts
```

### Live Railway acceptance

The live test creates a temporary environment, a service, variables, generated
and custom domains, then deletes them. Use a dedicated test project where you
are authorized to perform the operations:

```bash
RAILWAY_TEST_PROJECT_ID=... \
RAILWAY_TEST_ENVIRONMENT_ID=... \
RAILWAY_TEST_SERVICE_NAME=alchemy-provider-e2e-contributor \
bun run test:acceptance
```

The test must finish by confirming that the temporary service disappeared.
Never run it against a service name that already contains important data.

## Pull requests

Keep pull requests focused and include:

- the user-visible behavior or maintenance problem;
- tests for changed behavior;
- documentation changes for public API or lifecycle changes;
- `bun run check` output;
- live Railway acceptance evidence when changing GraphQL mutations, deployment
  behavior, adoption, or deletion.

Do not commit generated `dist/`, `.alchemy/`, `.env`, or package tarballs.

## Releases

Only maintainers publish releases. The release tag must be
`v${package.json.version}`. GitHub Releases invoke the npm trusted-publishing
workflow, which verifies, builds, and publishes the package with provenance.
