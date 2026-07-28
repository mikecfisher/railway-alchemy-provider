# Changelog

## 0.2.0 - 2026-07-28

### Added

- managed environments;
- GitHub-backed services and observable deployment settings;
- first-class shared and service variables with secret-free outputs;
- custom domains and generated-domain target-port updates;
- Railway project-token authentication;
- redacted programmatic credentials for CI;
- bounded retry for read-only transient failures and paginated service lookup;
- team operations, migration, and release documentation.

### Fixed

- fail when Railway returns `false` for a mutation;
- fail closed on ambiguous exact-name adoption;
- compare bulk variable records independently of property order;
- reconcile target-port drift on generated Railway domains.

### Changed

- Alchemy peer/development dependency updated to `2.0.0-beta.65`.
- Service image output is optional for GitHub-backed services.
- Node.js 20.19 is the minimum supported Node runtime for the pinned Alchemy
  beta; Bun remains the development package manager.

## 0.1.0 - 2026-07-27

- Initial release with existing-project references and Docker-image service
  lifecycle management.
