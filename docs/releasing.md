# Release process

1. Update exact compatibility pins, vendored Effect when applicable,
   documentation, `CHANGELOG.md`, and `package.json`.
2. Run:

   ```bash
   bun install --frozen-lockfile
   bun run check
   bun audit
   npm pack --dry-run --ignore-scripts
   ```

3. Run the live Railway acceptance test and confirm all disposable resources
   are absent afterward.
4. Open a pull request, require green CI, review the package diff, and merge.
5. Create the signed release/tag `v${package.json.version}` from the merge
   commit.
6. The GitHub release workflow publishes to npm through trusted publishing with
   provenance.
7. Verify the workflow, npm version/provenance, a clean Bun install, a Node
   import, and the GitHub release assets/notes.

Never publish a package from an unreviewed dirty worktree or infer npm success
from a successful GitHub release alone.
