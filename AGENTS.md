# Agent instructions

## Documentation

Use `npx ctx7@latest` to fetch current documentation before working with a
library, framework, SDK, API, CLI, or cloud service.

## Package manager

Use Bun for installs, scripts, builds, and tests.

## Vendored Effect reference

This project vendors the exact installed Effect source under `repos/effect`.

- Before writing or changing Effect code, read `repos/effect/LLMS.md`, then
  inspect the relevant implementation, tests, package documentation, and
  `ai-docs` examples.
- Treat the vendored release as the compatibility reference and current
  official documentation as the setup reference.
- Use `repos/effect` as read-only reference material.
- Import application code from normal package dependencies.
- Keep `repos/` outside application builds, tests, linting, and TypeScript
  projects.
