# Railway provider roadmap

v0.2 covers the first team-usable slice: project references, managed
environments, Docker/GitHub services, deployment configuration, first-class
variables, generated/custom domains, project tokens, safe reads, adoption, and
drift repair.

This roadmap is directional, not a compatibility promise.

## Highest-value next resources

- volumes, volume instances, and backups;
- Railway database templates with explicit data-retention defaults;
- private networking, TCP proxies, and IPv6 egress;
- private registry credentials without secret output/state leakage;
- project creation and project-level settings;
- webhooks and observability integrations.

Each destructive/data-bearing resource needs live create, drift, adoption,
retention, and cleanup evidence before becoming public.

## Team/platform maturity

- remote acceptance in a dedicated Railway project;
- compatibility matrix automation for Alchemy/Effect betas;
- canary releases before stable tags;
- generated API/reference docs from public TypeScript declarations;
- policy examples for preview environments and production approvals;
- OpenTelemetry spans/metrics documentation and rate-limit telemetry;
- documented rollback drills for npm and provider upgrades.

## Non-goals

- hiding Railway behavior behind a lowest-common-denominator abstraction;
- deploying without observable convergence;
- automatic mutation retries;
- loose-name adoption;
- returning secret values in outputs;
- deleting through `ExistingProject`;
- replacing Railway's native IaC when a Railway-only stack is better served by
  it.
