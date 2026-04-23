# Cut a release

From green `main` to merged PR on GitHub. Covers patch/minor/major bumps. npm publish is optional (user decision).

## Prerequisites

- You are on the feature branch (not `main`), everything committed.
- `npx vitest run` passes locally.
- `npx tsc --noEmit -p packages/cli/tsconfig.json` passes.
- `npx prettier --check 'packages/*/src/**/*.{ts,tsx}'` passes.
- `npm run build` passes.
- You know the target version — pick the smallest bump that matches the change (patch for bug fixes, minor for features, major for breaking/distribution shifts).

## Steps

**1. Bump versions (both packages must match).**

```bash
# Edit packages/core/package.json   → "version": "X.Y.Z"
# Edit packages/cli/package.json    → "version": "X.Y.Z"
# Edit CLAUDE.md                    → **Current version:** X.Y.Z
# Edit CLAUDE.md                    → **Tests:** NNNN passing (from vitest output)
```

**2. Update CHANGELOG.**

```bash
# Prepend new entry to docs/CHANGELOG.md above the previous version:
#   ## [X.Y.Z] — YYYY-MM-DD
#   ### <one-line "why this release" sentence>
#   ### Added | Changed | Removed | Fixed
#   <bullet list citing files touched>
#   ### Migration (if needed)
#   <steps existing users must take>
```

Look at recent entries for voice; keep it factual over marketing.

**3. Update `QUICK_REFERENCE.md` if new commands or flags shipped.**

**4. Pre-ship gate — all must be green in one pass:**

```bash
npm run build
npx vitest run
npx tsc --noEmit -p packages/cli/tsconfig.json
npx prettier --check 'packages/*/src/**/*.{ts,tsx}'
node packages/cli/dist/index.js wiki audit
node packages/cli/dist/index.js wiki index
```

If wiki content changed, `wiki index` should update entry count.

**5. Commit.**

Stage specific files (never `git add -A` at this stage — easy to pick up secrets or untracked noise):

```bash
git add CLAUDE.md QUICK_REFERENCE.md docs/CHANGELOG.md \
        packages/cli/package.json packages/core/package.json \
        <touched source files>
```

Commit message format: `vX.Y.Z — <one-line summary>` + body explaining why + what's not changed (if minor bump without full scope).

**6. Push + PR.**

```bash
git push -u origin <branch>
gh pr create --title "vX.Y.Z — ..." --body "$(cat <<'EOF'
## Summary
...
## Test plan
- [x] ...
EOF
)"
```

**7. Wait for CI.**

```bash
gh pr checks <N> --watch
```

**8. Merge + sync local `main`.**

```bash
gh pr merge <N> --squash --delete-branch
git checkout main
git fetch origin
git reset --hard origin/main   # local main diverged from origin due to squash — reset, don't merge
```

## Verifying it worked

- `git log --oneline -3` shows the new version as the most recent commit on `main`.
- `gh pr view <N>` shows `MERGED`.
- `grep -n "Current version" CLAUDE.md` matches the new version.

## npm publish (optional — only when you want the npm registry updated)

```bash
cd packages/core && pnpm publish --no-git-checks
cd packages/cli && pnpm publish --no-git-checks
```

Both must succeed. If `core` publishes but `cli` fails mid-flight, the registry has a version mismatch — fix immediately or deprecate the half-published version.

## Common failures

- **Version mismatch between `core` and `cli`.** Pre-ship check should catch. If it escapes, `coherent wiki audit` flags `auditVersionConsistency` errors.
- **CHANGELOG top entry behind package version.** Same audit. Bump CHANGELOG version first, rebuild.
- **CI fails on formatting.** Run `npx prettier --write 'packages/*/src/**/*.{ts,tsx}'` then re-push.
- **CI fails on a flaky test.** Look at `packages/cli/src/commands/chat/plan-generator.test.ts` for timing-sensitive tests. If the same test has failed before, add a skip or stabilize — don't retry blindly.
- **Post-merge local main won't fast-forward.** Squash-merge rewrites history. Use `git reset --hard origin/main` (safe here because the squash includes your branch changes).
