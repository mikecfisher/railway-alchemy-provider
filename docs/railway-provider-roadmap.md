# Railway provider roadmap

The v0.1 package is intentionally narrow: it references an existing Railway
project/environment and manages one Docker-image service lifecycle. See
[design.md](design.md) for the implemented behavior.

This roadmap records possible future work, not compatibility promises.

## Near term

### Project-token authentication

Add Railway project-token credentials alongside account/workspace bearer
tokens. This requires:

- a distinct credential variant;
- the `Project-Access-Token` header;
- validation that the token's environment matches the resource scope;
- a complete live acceptance run using that token type.

### More service settings

Consider observable, environment-specific settings individually:

- start command;
- root directory;
- restart policy;
- sleep behavior;
- cron schedule;
- private registry credentials.

Each setting must have a stable Railway read path and create, no-op, update,
drift, adoption, and deletion coverage before becoming public API.

### Release compatibility automation

Alchemy v2 and Effect v4 are moving beta dependencies. Automate coordinated
updates of:

- exact peer and development dependency versions;
- the vendored Effect source;
- README compatibility documentation;
- provider and live acceptance tests.

## Later resource candidates

- managed Railway projects and environments;
- GitHub repository service sources;
- custom domains and certificate readiness;
- volumes and backups;
- Railway databases;
- TCP proxies;
- webhooks;
- OAuth;
- Railway Functions;
- project/environment variable resources separate from `Service`.

Destructive resources such as projects, environments, volumes, and databases
need explicit ownership rules and dedicated live deletion tests.

## Upstream alignment

Alchemy has previously carried an unreleased Railway provider proposal. Before
expanding this package substantially, re-check current Alchemy releases and
upstream work. Prefer compatible resource names and lifecycle behavior where
doing so does not weaken this package's ownership and secret-safety guarantees.

## Non-goals

- runtime application data or event handling;
- deploying without observable convergence;
- loose-name adoption;
- returning secret variable values in resource outputs;
- deleting projects or environments through read-only references.
