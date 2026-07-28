# Team operations

Treat the provider like production infrastructure software, not a developer
script.

## Required controls

1. Use protected shared Alchemy state. Do not share `.alchemy/` through Git or
   use workstation-local state as the team source of truth.
2. Allow one writer per stack/environment. Use CI concurrency locking so two
   deploys cannot reconcile the same Railway resources simultaneously.
3. Run plan on pull requests and deploy from a protected branch. Require a
   human approval for production and always inspect replace/delete actions.
4. Give CI the narrowest Railway token practical. Prefer a project token for a
   project-scoped stack; use an account/workspace token only when required.
5. Separate production and preview state, credentials, project/environment IDs,
   and CI concurrency groups.
6. Protect state and logs as secrets. Variable values are absent from outputs,
   but desired values live in state inputs.

## Recommended pipeline

```text
pull request
  -> install with frozen lockfile
  -> typecheck/tests
  -> alchemy plan
  -> review plan artifact

protected main
  -> acquire environment concurrency lock
  -> production approval
  -> alchemy deploy
  -> application smoke/health check
  -> retain deployment and state evidence
```

Do not run `destroy` automatically for production. For previews, use a separate
stack and require the destroy job to show its plan and verify Railway cleanup.

## Ownership conventions

- One Alchemy logical resource owns one Railway object or variable key.
- Never manage the same variable through both `Service.variables` and
  `ServiceVariable`.
- Record whether adopted resources may be deleted. Apply a retention/removal
  policy when deletion is unacceptable.
- Use literal IDs for cold adoption. Review the first plan before enabling
  `adopt(true)`.
- Keep `ExistingProject` for infrastructure the stack must never delete.

## Production readiness checklist

- [ ] shared encrypted state and recovery procedure tested;
- [ ] single-writer CI concurrency enabled;
- [ ] production approval and branch protection enabled;
- [ ] least-privilege Railway token stored in the CI secret manager;
- [ ] preview and production scopes separated;
- [ ] adoption/removal policy reviewed per resource;
- [ ] health endpoint and post-deploy smoke check defined;
- [ ] rollback means app rollback plus IaC version/state review, not blind state
      rewinding;
- [ ] owners know how to revoke credentials and remove a stuck resource
      manually;
- [ ] provider and Alchemy upgrades are pinned and tested in a non-production
      stack first.

## Incident handling

Stop concurrent deploys first. Capture the Alchemy plan/result, Railway
deployment ID/status, package versions, and affected stable IDs without
including tokens or variable values. Read live Railway state before editing
Alchemy state. Prefer another normal reconcile after correcting desired state;
manual Railway changes should be followed by a plan to confirm drift.
