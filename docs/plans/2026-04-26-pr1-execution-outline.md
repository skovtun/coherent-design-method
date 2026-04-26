# PR1 Execution Outline — `apply-requests/` extract + drift gate

**Date written:** 2026-04-25 (prep) — execution targeted for 2026-04-26+
**Plan source:** `docs/plans/2026-04-25-skill-rail-architecture-review.md` (review locked decisions D1, D4-D8)
**Test plan source:** `~/.gstack/projects/skovtun-coherent-design-method/sergeipro-main-eng-review-test-plan-20260425-215353.md`
**ADR delivered:** ADR-0005 (chat.ts → facade) — PR1 ships the apply-pipeline extract, PR2 ships the chat.ts facade
**Reviewer:** `/plan-eng-review` + `/codex consult` cross-model check
**Estimated effort:** 2-3 days CC+gstack focused work

---

## TL;DR

PR1 extracts the 12-case `applyModification` switch from `commands/chat/modification-handler.ts` into a NEW top-level shared service `packages/cli/src/apply-requests/`. Both rails (API + skill) call it. Adds an explicit `applyMode: 'with-ai' | 'no-new-ai'` parameter so AI-dependent cases either use the provider (chat rail) or require pre-populated artifact fields (skill rail) — missing pre-population becomes a hard error, killing the v0.11.3 silent-drop bug class structurally.

Ships with a 6-fixture deterministic drift gate that asserts byte-identical output between rails for the deterministic case majority.

PR1 unblocks PR2 (chat.ts facade per ADR-0005) by giving it a proven shared apply layer to delegate to.

---

## Branch + version

- Branch: `feat/v0.12.0-apply-requests-extract`
- Cuts: v0.12.0 (first non-hotfix release after the v0.11.0–v0.11.5 hotfix tail)
- Sequence: PR1 (this) → ship v0.12.0 → PR2 chat.ts facade → ship v0.13.0

---

## Target file structure

### NEW files (all under new top-level `packages/cli/src/apply-requests/`)

```
apply-requests/
├── index.ts                  — applyRequests(requests, ctx, mode) entry + re-exports
├── parse.ts                  — destructive-intent refusal, normalizeRequest, applyDefaults
├── dispatch.ts               — 12-case switch (extracted from modification-handler.ts:208)
├── pre.ts                    — preflight, backup, known-routes resolution, hash protection
├── post.ts                   — validation/autofix loop, manifest sync, post-backup
├── managers.ts               — applyManagerResult helper (moved from modification-handler.ts:196)
├── types.ts                  — ApplyRequestsContext, ApplyMode, ApplyResult shapes
└── __tests__/
    ├── dispatch.test.ts      — 12 cases × applyMode discrimination
    ├── parse.test.ts         — destructive refusal, applyDefaults, normalizeRequest
    ├── mode.test.ts          — with-ai vs no-new-ai contract enforcement
    ├── integration.test.ts   — full session against pipeline (both driver paths)
    └── fixtures/deterministic/
        ├── delete-page/
        │   ├── input.json    — { requests: [{type:'delete-page', target:'X'}] }
        │   ├── before.json   — config + filesystem snapshot
        │   └── after.json    — golden disk diff
        ├── update-token/
        ├── add-component/
        ├── modify-component/
        ├── add-page-with-pageCode/   (no-new-ai mode)
        └── update-page-with-pageCode/ (no-new-ai mode)
```

### Modified files

- **`commands/chat/modification-handler.ts`** — 1344 → ~50 lines.
  - Keep: page-template helpers (`inferPageType`, `getDefaultContent`, etc.), `stripInlineLayoutElements`.
  - Delete: 12-case switch (moved to `apply-requests/dispatch.ts`), `applyManagerResult` (moved to `apply-requests/managers.ts`).
  - Re-export `applyModification` from `apply-requests/` for back-compat with any external callers.

- **`phase-engine/appliers.ts`** — `createModificationApplier` collapses ~250 lines → ~30 lines.
  - Reads `modification-requests.json` artifact (no change).
  - Calls `applyRequests(requests, ctx, 'no-new-ai')`.
  - Delete: `applyDeletePage` helper (lines 273+), `applyDeleteComponent` helper (lines 372+), all duplicated case logic.
  - Keep: shape that registers as an `ArtifactApplier` for the session-end chain.

- **`commands/chat.ts`** — minimal change in PR1 (PR2 does the facade).
  - Replace direct `applyModification(req, dsm, cm, pm, ...)` call with `applyRequests([req], ctx, 'with-ai')`.
  - Keep all surrounding pre/post inline (PR2 moves it).

---

## Commit-by-commit plan

Designed for bisectability. Each commit keeps the test suite green. Migration fence: every commit must end with `npx vitest run` clean.

### Setup commits

1. **`feat(apply-requests): scaffold top-level apply-requests/ directory + types`**
   - Create `apply-requests/{index.ts,types.ts,managers.ts}` with placeholder exports.
   - `types.ts` defines `ApplyMode`, `ApplyRequestsContext`, `ApplyResult` interfaces.
   - `managers.ts` ports `applyManagerResult` from `modification-handler.ts:196` verbatim.
   - `index.ts` exports `applyRequests` stub that throws "not implemented yet".
   - No behavior change. Test suite green.

### Lane A — pre/post helpers (parallelizable after commit #1)

2. **`feat(apply-requests): extract pre.ts (preflight, backup, known-routes, hashes)`**
   - Identify pre-stack helpers from `chat.ts:267, 275, 916, 1044, 1072` and `modification-handler.ts` knownRoutes assembly.
   - Move into `apply-requests/pre.ts` as pure functions taking `(ctx, ...)` returning state.
   - chat.ts calls remain at original sites — pre.ts is just a co-located library at this commit.
   - Tests: `apply-requests/__tests__/pre.test.ts` for each extracted helper.

3. **`feat(apply-requests): extract post.ts (validation, manifest sync, fix-globals, backup)`**
   - Identify post-stack helpers from `chat.ts:1310-1360, 1380-1430`.
   - Move into `apply-requests/post.ts` as pure functions.
   - chat.ts calls remain at original sites.
   - Tests: `apply-requests/__tests__/post.test.ts`.

### Lane B — dispatch + parse (parallelizable after commit #1)

4. **`feat(apply-requests): extract parse.ts (destructive refusal, applyDefaults, normalizeRequest)`**
   - Move `messageHasDestructiveIntent` callsite logic + `applyDefaults` + `normalizeRequest` into `apply-requests/parse.ts`.
   - chat.ts at line 661/685 imports from new location, behavior unchanged.
   - Tests: `apply-requests/__tests__/parse.test.ts` (~3 tests).

5. **`feat(apply-requests): extract dispatch.ts — 12-case switch (no-AI cases first)`**
   - Move 6 deterministic cases (`delete-page`, `delete-component`, `update-token`, `add-component`, `modify-component`, `update-navigation`) from `modification-handler.ts` into `apply-requests/dispatch.ts`.
   - `dispatch.ts` exports `dispatchRequest(req, ctx, mode)` for ONE request.
   - `modification-handler.ts` keeps the 6 AI cases for now; calls `dispatchRequest` for the 6 no-AI ones via a fall-through.
   - Tests: `apply-requests/__tests__/dispatch.test.ts` — one test per case, all pass with MockProvider.

6. **`feat(apply-requests): extract dispatch.ts — AI cases + applyMode contract`**
   - Move remaining 5 AI cases (`add-page`, `update-page`, `modify-layout-block`, `link-shared`, `promote-and-link`) into `dispatch.ts`.
   - Add `applyMode` parameter:
     - `'with-ai'` — calls provider as today.
     - `'no-new-ai'` — checks for pre-populated `changes.pageCode` / `changes.layoutBlock` / etc. Missing → throws CoherentError with code E-NEW (new error code).
   - `modification-handler.ts` switch is now empty; file shrinks to ~50 lines (helpers only).
   - Tests: `apply-requests/__tests__/mode.test.ts` (~2 tests) — assert AI-call spy fires on `with-ai`, throws on `no-new-ai` without pre-population.

### Convergence commits

7. **`feat(apply-requests): wire applyRequests entry — both rails call it`**
   - `apply-requests/index.ts` `applyRequests(requests, ctx, mode)`:
     1. `parse.refuseDestructiveIntent(...)`
     2. `pre.preflight(...)` (skipped on `no-new-ai`)
     3. for each request: `dispatch.dispatchRequest(req, ctx, mode)`
     4. `post.validateAndAutofix(...)` (gated)
     5. `post.syncManifest(...)`
   - Update `chat.ts` direct callers: replace `applyModification(req, dsm, cm, pm, ...)` with `applyRequests([req], ctx, 'with-ai')`.
   - Update `phase-engine/appliers.ts` `createModificationApplier`: ~30 lines, reads `modification-requests.json`, calls `applyRequests(requests, ctx, 'no-new-ai')`.
   - Delete `applyDeletePage`, `applyDeleteComponent` from `appliers.ts`.

8. **`test(apply-requests): integration tests — both driver paths produce identical output`**
   - `apply-requests/__tests__/integration.test.ts`:
     - Skill-rail driver: `applyRequests(reqs, ctx, 'no-new-ai')` with full pre-populated artifact set.
     - Chat-rail driver: `applyRequests(reqs, ctx, 'with-ai')` against MockProvider.
     - Assert byte-equivalent disk diff.

### Fixture commits (DRIFT GATE — the v0.11.x bug class kill switch)

9. **`test(apply-requests): record 6 deterministic fixtures + parity gate`**
   - For each of 6 deterministic cases, hand-craft fixture:
     - `input.json` — `{ requests: [...] }` with all required fields populated for `no-new-ai` mode where applicable.
     - `before.json` — initial config + filesystem state.
     - `after.json` — golden disk diff (config delta + file ops).
   - Test runner sets up tmpdir per fixture, applies state, runs through chat-rail and skill-rail drivers, asserts both produce identical `after.json`.
   - This replaces the 4 `test.todo` placeholders in `phase-engine/__tests__/parity.test.ts`.

### Cleanup commits

10. **`chore(modification-handler): collapse to ~50 lines — keep page-template helpers only`**
    - Final cleanup pass on `modification-handler.ts`.
    - Move `inferPageType`, `getDefaultContent` helpers OUT to `apply-requests/page-templates.ts` if they're called elsewhere; otherwise leave inline.
    - File ends ≤ 100 lines (target ~50).

11. **`chore: bump v0.11.5 → v0.12.0 + CHANGELOG + ADR-0005 status update`**
    - `package.json` (both packages) → `0.12.0`.
    - `CHANGELOG.md` v0.12.0 entry — what shipped, what doesn't (defer chat.ts facade to PR2).
    - `docs/wiki/ADR/0005-chat-ts-as-facade-over-runpipeline.md` — keep `status: accepted` (full delivery is PR2); add a note that PR1 (apply-requests extract) shipped in v0.12.0 as the prerequisite layer.

---

## `applyMode` contract spec (D6)

```ts
// apply-requests/types.ts
export type ApplyMode =
  | 'with-ai'    // chat rail — provider available, AI cases run as today
  | 'no-new-ai'  // skill rail — provider NOT called. AI-dependent cases
                 //              REQUIRE pre-populated artifact fields.

export interface ApplyRequestsContext {
  dsm: DesignSystemManager
  cm: ComponentManager
  pm: PageManager
  projectRoot: string
  // with-ai mode populates these:
  provider?: 'claude' | 'openai' | 'auto'
  originalMessage?: string
  // no-new-ai mode: AI-dependent cases read pre-populated changes field
}
```

### Required pre-populated fields per AI-dependent case (no-new-ai mode)

- `add-page`: `changes.pageCode` (string, non-empty), `changes.id`, `changes.name`, `changes.route`
- `update-page`: same as add-page
- `modify-layout-block`: `changes.layoutBlock` (object) + `changes.targetSelector`
- `link-shared`: `changes.sharedIdOrName`, `changes.blockHint`
- `promote-and-link`: `changes.promoted` (object with extracted shared component code)

### Hard-error shape (no-new-ai missing pre-population)

```ts
throw new CoherentError({
  code: COHERENT_ERROR_CODES.E007_NO_AI_REQUIRES_PREPOPULATION,
  message: `applyRequests in 'no-new-ai' mode requires pre-populated changes.${field} for type '${req.type}', got: ${JSON.stringify(req.changes)}`,
  cause: 'Skill rail orchestrators must produce the AI artifact upstream (anchor/page phases) before invoking applyRequests. The shared pipeline does not call providers in no-new-ai mode by design.',
  fix: `If you need AI generation, use 'with-ai' mode (chat rail). Otherwise pre-populate ${field} in the modification-requests.json artifact.`,
})
```

New error code `E007_NO_AI_REQUIRES_PREPOPULATION` to add to `errors/index.ts`.

---

## Fixture format spec

Every fixture directory has 3 files:

### `input.json`
```json
{
  "requests": [
    { "type": "delete-page", "target": "transactions" }
  ]
}
```

### `before.json`
```json
{
  "config": {
    "pages": [
      { "id": "transactions", "route": "/transactions", "name": "Transactions", ... }
    ],
    "navigation": { "items": [...] }
  },
  "files": {
    "app/(app)/transactions/page.tsx": "export default ..."
  }
}
```

### `after.json` (golden)
```json
{
  "config": {
    "pages": [
      // transactions removed
    ],
    "navigation": { "items": [/* transactions item removed */] }
  },
  "files": {
    "app/(app)/transactions/page.tsx": "<DELETED>"
  },
  "appliedMessage": "delete-page: Transactions (/transactions) ✓"
}
```

Test runner:
1. Sets up tmpdir with `before.json` state.
2. Runs `applyRequests(input.requests, ctx, mode)`.
3. Diffs result against `after.json` byte-for-byte.
4. Repeats for both `with-ai` and `no-new-ai` modes (both should produce same `after.json` for deterministic cases).

---

## Definition of done (PR1)

Per reviewer's test plan §"Definition of done (PR1)":

1. ✅ All 1530 existing tests pass.
2. ✅ ~25 new PR1 unit + integration + fixture tests pass.
3. ✅ 6 deterministic fixtures pass byte-identically between chat-rail and skill-rail driver paths.
4. ✅ `npx tsc --noEmit -p packages/cli/tsconfig.json` clean.
5. ✅ `npx prettier --check 'packages/*/src/**/*.{ts,tsx}'` clean.
6. ✅ `npm run build` clean.
7. ✅ `coherent wiki audit` clean (PJ entry "v0.12.0: shared apply pipeline shipped").
8. ✅ `modification-handler.ts` ≤ 100 lines (target ~50).
9. ✅ `phase-engine/appliers.ts` `createModificationApplier` ≤ 30 lines, no `applyDeletePage`/`applyDeleteComponent` helpers.
10. ✅ v0.12.0 cuts on PR1 merge.

---

## Risk mitigation

### Risk: Migration regresses one of the 1530 existing tests

- **Mitigation:** Commit-by-commit migration. Each commit ends with full vitest green. If commit N fails, revert just that commit, root-cause, retry.
- **Bisect-friendly:** every commit message names the moving piece. `git bisect` lands on the regression commit cleanly.

### Risk: applyMode contract breaks v0.11.3 modification applier behavior

- **Mitigation:** Existing `appliers.test.ts` regression tests for delete-page, delete-component etc. (v0.11.3) MUST stay green AFTER `createModificationApplier` collapse. Reviewer flagged these specifically.
- **Migration order:** do not delete `applyDeletePage`/`applyDeleteComponent` helpers until commit 7 (after wiring). Commits 5-6 keep the duplicate code working in parallel with the new dispatch.

### Risk: Fixtures don't catch real drift

- **Mitigation:** Reviewer's test plan has 6 fixtures + 8 critical-path tests + 9 edge cases. Combination is sufficient to catch every v0.11.x bug class we shipped (rename pattern, multi-turn nav, silent partial-apply, etc.).
- **Verification:** before merging PR1, run the fixtures against the v0.11.5 codebase (revert apply-requests, keep fixtures). If any fixture fails on v0.11.5, that's a regression we ALREADY had — the fixture caught it. PR1 fixes it.

### Risk: PR1 lands but PR2 (facade) takes longer than estimated

- **Mitigation:** PR1 stands alone — even without PR2, the apply-requests extract is a real win (no parity drift on apply layer). PR2 can ship in its own sprint, no rush. ADR-0005 status stays `accepted` until PR2.

### Risk: Mid-refactor someone runs `coherent chat` against in-flight branch

- **Mitigation:** Only Sergei works on this. He won't `coherent chat` against feat branch. Risk: zero.

---

## Rollback plan

If PR1 ships and produces unexpected regressions in production (single-user-dogfood detection):

1. **Revert PR1 commit:** `git revert <pr1-merge-commit>` on main, push.
2. **npm publish v0.12.1 → v0.11.5 codebase:** since semver disallows downgrade, ship a v0.12.1 that's a superset of v0.11.5 + the fixtures (without the extract). Fixtures stay valuable as future canaries.
3. **Bisect specific regression:** the commit-by-commit history makes bisect O(log N) easy. Each commit is independently revertable too.

---

## Cross-cutting items deferred to M16 / outside PR1 scope

Per reviewer's test plan §"Out of scope":

- **Live parity recording infrastructure** — defer to PR2+. Deterministic fixtures cover the cases that matter for v0.12.0.
- **Telemetry / run-record additions** — independent of refactor, separate PR.
- **DSM/CM/PM construction sharing across appliers** (D8 → M17 in IDEAS_BACKLOG) — post-PR2 perf cleanup.
- **AI-dependent types as proper skill phases** (`update-page`, `modify-layout-block`, `link-shared`, `promote-and-link`) — these become PHASES not just dispatch cases. Separate v0.13+ work after PR2 lands.
- **6 codex audit drifts** (destructive pre-parser, normalization, validation/autofix, known-routes, manual-edit hashes, full backup parity) — collapse INTO PR2 (chat.ts facade) automatically because the pre/post stack moves into shared session lifecycle.

---

## Tomorrow's start point

```bash
# 1. Switch to fresh branch
git checkout main && git pull
git checkout -b feat/v0.12.0-apply-requests-extract

# 2. Read this outline + the test plan to load context
cat docs/plans/2026-04-26-pr1-execution-outline.md
cat ~/.gstack/projects/skovtun-coherent-design-method/sergeipro-main-eng-review-test-plan-20260425-215353.md

# 3. Start commit #1 — scaffold
mkdir -p packages/cli/src/apply-requests/__tests__/fixtures/deterministic
# ... create types.ts, index.ts (stub), managers.ts (port from modification-handler.ts:196)

# 4. Run tests after each commit
npx vitest run

# 5. Continue through commits 2-11 sequentially or with Lane A/B parallelism after #1
```

**Estimated wall-clock for tomorrow:** 2-3 days focused work to ship PR1. Don't try to land it in one sitting — bisect-friendly history is the win and that requires breathing room between commits.
