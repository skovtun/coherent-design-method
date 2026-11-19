# Coherent Design Method

> The model designs. Coherent governs.
> Since v0.27.0 Coherent does not author UI. The coding agent (Claude Code, Codex)
> builds the app; Coherent scopes every edit against a code-derived graph, enforces
> its write set, verifies it in a real browser (build, renders, pixel diff, browser
> errors, identity leaks), returns an honest verdict and rolls back what fails.
> Why: ADR-0011 (plain Claude Code beat the `coherent chat` pipeline on every screen).
> The old generator (`coherent chat`, `init --classic`) is deprecated, fixes only:
> its notes live in `docs/classic/CLAUDE-classic.md`.

**Current version:** 0.33.1
**Packages:** `@getcoherent/core` + `@getcoherent/cli` (published together, same version)
**Tests:** 2706 passing

---

## ⚡ Start-of-session reading (REQUIRED before any work)

The wiki records **why things are the way they are**. CLAUDE.md and
CHANGELOG.md answer "what is" and "what changed"; the wiki answers "why".
Read before touching code:

1. **`docs/wiki/ADR/0011-governance-not-authorship.md`**, **`0012-agent-mode-adapter.md`**, **`0013-design-system-from-code.md`** — the current product: why governance, how agent mode plugs into hosts, design system with IDs.
2. **`docs/wiki/PATTERNS_JOURNAL.md`** — append-only log of every AI-output bug we've seen, its root cause, and what we shipped in response. If you're debugging something that feels familiar, it probably IS.
3. **`docs/wiki/IDEAS_BACKLOG.md`** — open proposals, deferred work, rejected ideas with reasons. Check before proposing a new feature — it might already be scoped.

Classic generator work only: also `docs/wiki/RULES_MAP.md` and `docs/wiki/MODEL_PROFILE.md` (see `docs/classic/CLAUDE-classic.md`).

Update the wiki when you:
- Observe a new AI-output failure pattern (JOURNAL entry).
- Make a breaking or philosophically-significant change (new ADR).
- Propose or defer an idea (IDEAS_BACKLOG.md).
- Add or change a classic rule (row in RULES_MAP.md).

**Not in the wiki, on purpose:**
- `docs/FAQ.md` — user-facing answers. Not retrieval-indexed (would pollute generation context).
- `docs/runbooks/` — operational how-tos (cut a release, validate retrieval, debug indexing). Not retrieval-indexed. See `docs/runbooks/README.md` for the layering rule.

---

## For Claude Code: How to Work in This Project

Route the task:

```
Task touches agent mode, coherent edit, init, MCP, or verification?
  └─ YES → packages/cli/src/governance/ + commands/agent-init.ts (see GOVERNANCE below).
           Read ADR-0011 + ADR-0012 first; design-system work: ADR-0013.
Task touches the classic generator (coherent chat, fix, design-constraints.ts, modifier.ts)?
  └─ YES → read docs/classic/CLAUDE-classic.md first. Fixes only, no new features.
Anything else?
  └─ read the test file for that module first — it shows expected behavior.
```

---

## Development Workflow

```bash
pnpm install                    # Install dependencies
npm run build                   # Build all packages (tsup)
npx vitest run                  # Run the full test suite
npx tsc --noEmit -p packages/cli/tsconfig.json   # TypeScript check
npx prettier --check 'packages/*/src/**/*.{ts,tsx}'  # Format check
pnpm test:mcp-e2e               # Live MCP end-to-end against the built CLI
```

### Before Every Push

1. All tests pass (`npx vitest run`)
2. TypeScript clean (`npx tsc --noEmit -p packages/cli/tsconfig.json`)
3. Prettier clean (`npx prettier --check 'packages/*/src/**/*.{ts,tsx}'`)
4. Build succeeds (`npm run build`)
5. `docs/CHANGELOG.md` updated if version bump
6. `QUICK_REFERENCE.md` updated if new commands/flags added
7. **Wiki hygiene** — `coherent wiki audit` clean (no errors). Run `coherent wiki index` to refresh retrieval cache if wiki files changed. If retrieval-sensitive changes: `coherent wiki bench` (precision@1 ≥ 0.8).
8. **ADR check** — if the change is architecturally significant, new subsystem, or breaking: write an ADR in `docs/wiki/ADR/NNNN-slug.md` with YAML frontmatter. Backfill is expensive; add it as you go.

### Publishing

Steps: `docs/runbooks/cut-release.md`. Version bump in BOTH packages (must match),
merge the PR, then a GitHub release triggers `.github/workflows/publish.yml`
(npm trusted publishing, no tokens). A pre-release publishes to the `next`
dist-tag, a stable release to `latest`. The workflow skips a version already on
npm, so a half-failed release can be re-run. Right after publishing, tarballs can
404 for a few minutes while npm processes them.

### Git Workflow

Work on feature branches for significant changes. Direct-to-main for hotfixes only.

```bash
git checkout -b feat/feature-name
# ... work ...
git push -u origin feat/feature-name
gh pr create --title "..." --body "..."
# → review → merge
```

---

## Governance (agent mode) — the product since v0.27.0

```
packages/cli/src/governance/
  session.ts      host-neutral core: beginEdit / verifyEdit (fast|final) / rollbackEdit
  graph.ts        code-derived graph from the TypeScript AST (transitive, layout-scoped impact)
  router.ts       scope routing for `coherent edit` (tokens|component|variant|page|new-component)
  transaction.ts  snapshot + rollback of the edit's own files only; no secrets
  verify.ts       baseline type errors, prod build, renders, pixel diff (±1/channel), browser errors
  privacy.ts      identity-leak detection (git user name/email in UI)
  agent-tools.ts  the 5 MCP agent tools over session.ts (inventory, begin/verify/rollback edit, ds_sync)
  design-system.ts       ADR-0013: IDs in source, tokens, exact targets, ds sync plan
  design-system-site.ts  the generated /design-system viewer
  raw-values.ts          hardcoded colours/sizes in TSX (AST); edit warnings, viewer list; token references (reach)
  tailwind-classes.ts    classes that compile to no CSS (project's Tailwind 4); fail the edit; also in scripts/design-check.mjs
  hook.ts         `coherent hook pre-write` (PreToolUse write guard, feedback only)
packages/cli/src/commands/
  agent-init.ts   `coherent init`: new app / agent-only / update; writes agent, .mcp.json, settings, AGENTS.md
  edit.ts         `coherent edit` CLI adapter
  mcp.ts          `--profile agent` serves agent-tools.ts only, no authoring tools
packages/cli/templates/agent/   agent definition, welcome page
```

**Invariants (do not break):**
- Post-write verification is the enforcement boundary; the hook is only feedback (Bash/IDE writes bypass it).
- Verification runs before commit; a failed edit is never committed (agent: stays open to fix or roll back; `coherent edit`: rolled back unless --keep); verdicts never overstate coverage.
- Rollback touches only the transaction's own files.
- The agent tool surface has no authoring tools and cannot disable renders.
- Claude Code host facts (found by trying): inline `mcpServers` and `hooks` in agent frontmatter do not work; project `.mcp.json` and `.claude/settings.json` do.

---

## Classic generator (deprecated)

`coherent chat`, `coherent fix`, `design-constraints.ts`, `modifier.ts`,
`split-generator.ts` and the tier system: see `docs/classic/CLAUDE-classic.md`.
Do not load it for governance work.
