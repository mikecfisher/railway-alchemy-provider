# Migrating to v0.2

v0.2 remains source-compatible for the v0.1 Docker service path.

## Dependency update

Pin the coordinated versions:

```bash
bun add railway-alchemy-provider@0.2.0 \
  alchemy@2.0.0-beta.65 \
  effect@4.0.0-beta.102 \
  @effect/platform-bun@4.0.0-beta.102 \
  @effect/platform-node@4.0.0-beta.102
```

Run `alchemy plan` against a non-production stack before upgrading production.

## Credentials

Existing environment/stored authentication defaults to API-token behavior and
continues to use `RAILWAY_API_TOKEN`. To use a project token, reconfigure the
Railway Alchemy profile and set `RAILWAY_TOKEN` for environment-based auth.

## Variables

Existing `Service.variables` ownership is unchanged. Migrate a key to
`ServiceVariable` in two reviewed deploys:

1. add the `ServiceVariable` while the key remains in `Service.variables`;
2. after the first deployment succeeds, remove the key from
   `Service.variables`.

Do not leave the same key under both owners.

## New observed drift

v0.2 observes generated-domain target ports and more service-instance fields.
The first plan may show an update where v0.1 could not see drift. Review the
live Railway configuration and desired inputs before applying.
