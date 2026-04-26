# Architecture Review: Skill Rail — Parity Engine vs Single Rail Wrapper

**Date:** 2026-04-25 (after v0.11.3 ship)
**Asked by:** Sergei
**Reviewer:** `/plan-eng-review`
**Question:** Should we continue investing in the parity-engine pattern, or refactor skill rail into a thin wrapper over API rail's `applyModification`?

---

## Current state

Coherent CLI v0.11.3 ships **two rails** that share a phase engine:

- **API rail** — `coherent chat "..."` calls Anthropic/OpenAI directly. Long-running single process. Entry: `packages/cli/src/commands/chat.ts`. Mutates project via `applyModification(request, dsm, cm, pm, projectRoot, provider, message)` — a switch over `ModificationRequest.type` in `commands/chat/modification-handler.ts`.

- **Skill rail** — `/coherent-chat` invokes `coherent _phase prep/ingest/run` from inside Claude Code. Multi-process. Each phase reads/writes session artifacts in `.coherent/session/<uuid>/`. End-of-session, `coherent session end` runs registered appliers (in `packages/cli/src/phase-engine/appliers.ts`).

**Shared via "phase engine":**
- Session lifecycle (lock, snapshot, artifacts dir)
- Phase definitions (plan, anchor, extract-style, components, page)
- Prompt builders (modification, plan-only, page)
- Applier protocol

**NOT shared (drift surface):**
- API rail uses `applyModification` switch (12 request types)
- Skill rail uses per-domain appliers (config-delta, modification, components, pages, replace-welcome, layout, fix-globals-css)

## What surfaced in last 24 hours (v0.11.0 → v0.11.3)

Four hotfixes, each fixing a different parity gap:

| Release | Bug | Root cause | Fix |
|---|---|---|---|
| v0.11.1 | Multi-turn nav.items wiped on chat #2 | Pages applier sourced routes from current session's pagesQueue, not registered config.pages | Source from finalConfig.pages, filter by requiresAuth |
| v0.11.2 | Update-notifier banner mid-command | Hooked AFTER program.parse() | Sync cache read BEFORE parse, async refresh after |
| v0.11.3 | delete-page silently dropped in mixed sessions | Skill rail handled only add-page request type; planner emitted [delete, add] but only add executed | createModificationApplier mirrors API rail's switch, hard-fail guard on AI-dependent types |
| v0.11.4 (planned) | "[1/6]" wrong for plan-only ops + anchor errors out | Skill body hardcoded for full add-page workflow | Compute session-shape.json at plan time, branch skill body conditionally |

**Codex consult audit (v0.11.3 cycle, 1.4M tokens)** mapped all 12 ModificationRequest types against the skill rail. Found:

- Only `add-page` had real coverage pre-v0.11.3
- 9 silently-dropped types (delete-page, delete-component, update-token, add-component, modify-component, plus AI-dependent: update-page, modify-layout-block, link-shared, promote-and-link)
- 6 OTHER architectural drifts beyond request-type-coverage class:
  1. Destructive safety bypass (skill skips API rail's pre-parser)
  2. Normalization drift (applyDefaults / normalizeRequest API-only)
  3. Validation/autofix drift (skill only autoFix, API has component install + TS fix-loop + pageAnalysis + duplicate audit + quality loops)
  4. Known-routes drift (skill autofix sees only session routes, API sees full config)
  5. Manual-edit hash protection drift (skill regenerateLayout no hashes)
  6. Backup drift (API pre+post backups, skill had none until v0.11.3 which added pre-only)

v0.11.3 ships fixes 1 + 5-no-AI-types + the guard. v0.11.4 ships the skill body conditional + session-shape. **Six other drifts still open** for M16+.

## The fundamental question

Are we **building a parallel implementation** of `applyModification` in skill rail (with all the parity-drift maintenance burden that implies), or should the skill rail be a **thin orchestrator** that calls the same `applyModification` underneath?

### Option A: Continue parity-engine pattern (status quo)

Two implementations of every request type. Parity maintained by tests + audits + hotfixes. Each new request type → ship in API rail first → eventually port to skill rail.

**Pros:**
- Skill rail is independently testable
- Phase boundaries are explicit (plan → anchor → components → pages)
- Multi-process (skill rail) and single-process (API rail) get to optimize differently
- Already invested 4 versions of work in this pattern

**Cons:**
- 6+ drift classes still open after 4 hotfixes
- Every new request type doubles the implementation surface
- Audit-driven (codex finds drifts when user dogfoods them)
- Skill rail will always lag API rail in coverage
- Tests don't cover "skill rail behaves identically to API rail" — they cover "skill rail behaves correctly in isolation"

### Option B: Skill rail = thin wrapper over `applyModification`

Skill rail's `coherent session end` calls `applyModification` directly per request, NOT a switch in appliers. The phase engine becomes "the orchestration layer that splits AI generation across processes" — applies the same final mutation logic as API rail.

**Concretely:**
- Plan phase computes shape (same as v0.11.4 plans)
- AI-required phases (anchor, page generation) still run as separate processes/phases
- Session end: load `modification-requests.json` + every `page-<id>.json` artifact + every component artifact → assemble into a list of `ModificationRequest[]` → call `applyModification` for each in order → done
- The 7 current appliers collapse into 2: artifact-collector + apply-modification-loop

**Pros:**
- One implementation = no parity drift, ever
- Bug fixes land in API rail benefit skill rail automatically
- Every request type works in skill rail by construction (if API rail handles it)
- Test surface shrinks (no skill-rail-specific applier tests)
- Codex audits become unnecessary for parity (they remain useful for design)

**Cons:**
- Big refactor (~2 weeks?)
- Breaks skill rail's "each phase is independent" mental model
- Multi-process advantage on skill rail (parallel page generation) needs new abstraction
- Some phase boundaries (pre-write-validation) don't map cleanly to single-shot apply
- Risk of regressing things v0.11.0–v0.11.3 just fixed

### Option C: Hybrid — keep applier shape, but extract shared apply logic

Status quo applier shape, but each applier delegates the actual mutation to a shared `applyModification`-like helper. Appliers read artifacts, build `ModificationRequest`, hand to shared helper.

**Pros:** Refactor is gradual. Each applier can migrate independently.
**Cons:** Drift surface shrinks but doesn't disappear; still two organizational structures.

## Codex audit findings deferred (relevant context)

These 6 drifts will need to be addressed regardless of Option A/B/C:

1. Destructive pre-parser parity
2. Normalization drift
3. Validation/autofix coverage parity
4. Known-routes drift
5. Manual-edit hash protection
6. Full backup parity (post-apply, not just pre)

If Option B, all 6 collapse to "use the API rail's logic."
If Option A, each is its own M16 hotfix.

## What I want from /plan-eng-review

1. **Architectural recommendation** — A, B, or C, with concrete reasoning grounded in Coherent's actual codebase + the v0.11.x bug pattern
2. **Migration path if B or C** — 2-week vs 4-week vs 8-week shape, what ships in what order
3. **Risk gate** — what would CONVINCE you to keep Option A vs switch?
4. **Long-term scaling** — at v0.20+ when we have 20+ request types, which option scales?
5. **Test strategy** — under each option, what does the test pyramid look like?

## Files to reference during review

- `packages/cli/src/commands/chat/modification-handler.ts` — API rail's switch (~1300 lines)
- `packages/cli/src/phase-engine/appliers.ts` — skill rail's per-domain appliers (~870 lines)
- `packages/cli/src/phase-engine/phases/*.ts` — phase implementations
- `packages/cli/src/phase-engine/run-pipeline.ts` — phase orchestrator
- `packages/cli/src/phase-engine/session-lifecycle.ts` — start/end + applier protocol
- `docs/CHANGELOG.md` (v0.9.0 onward) — design intent for the phase engine
- `docs/wiki/ADR/` — architectural decision records (if any cover the two-rail decision)
- `docs/wiki/PATTERNS_JOURNAL.md` — known parity drifts already documented

## Constraints

- Coherent is solo-maintained (Sergei). Refactor budget realistic for a single human + AI assistant.
- v0.11.4 is in flight (~2.5h work) — orthogonal to this review. v0.11.4 either survives a future Option B refactor (session-shape.json artifact would still be useful) or gets discarded with low cost.
- Active users currently 1 (Sergei dogfooding). Window for bigger refactors before broader adoption is open.
- Test suite at 1508 tests. Refactor must keep them green or replace them, not delete them.

---

**TL;DR for the review:** Are we building a parallel implementation that will keep drifting, or is there a cleaner shape where skill rail orchestrates and API rail's logic does the actual work?

---

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 0 | — | not run |
| Codex Review | `/codex review` | Independent 2nd opinion | 1 | issues_found → all 4 accepted | 4 substantive critiques: layer violation, sequencing, AI contract, fixtures |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 1 | issues_open → all 7 decisions resolved | 7 decisions (D1–D7); 0 unresolved; 0 critical gaps |
| Design Review | `/plan-design-review` | UI/UX gaps | 0 | — | n/a (no UI) |
| DX Review | `/plan-devex-review` | Developer experience gaps | 0 | — | not run |

**CODEX:** Surfaced 4 P0/P1-class gaps the eng review missed — (1) phase-engine/ is wrong layer for the extract (modification-handler.ts has command-layer dep tree), (2) parity harness is stubbed and can't be the safety net for the very refactor that builds it, (3) AI-dependent cases call createAIProvider() at apply time without contract → silent extra API calls + double-edit risk on skill rail, (4) live 3-intent fixtures are flaky/expensive and shouldn't gate PR1. All 4 accepted; plan revised.

**CROSS-MODEL:** Strong agreement on direction (B-shaped, not A or C). Tension on execution (layer / sequencing / AI contract / fixtures) — codex won every tension; eng-review hand-waved details that codex hardened.

**UNRESOLVED:** 0.

**FINAL DECISIONS:**
- **D1: Option B** — extract shared request-application pipeline; both rails call it.
- **D4: Layer = top-level `packages/cli/src/apply-requests/`** (sibling to `commands/`, `phase-engine/`, `utils/` — peer service, NOT nested under `commands/chat/`). Top-level placement signals "shared service" not "chat-specific helper" — matters for future contributor mental model. Both rails import as peers; phase-engine stays narrow (lifecycle + ArtifactApplier protocol).
- **D5: Two sequential PRs.** PR1 = pipeline + 6 deterministic fixtures (the drift gate). PR2 = chat.ts facade refactor with PR1 as the proven gate.
- **D6: Explicit `applyMode: 'with-ai' | 'no-new-ai'` parameter + artifact-shape contract.** Skill rail uses `no-new-ai`; AI-dependent cases require pre-populated artifact fields; missing → hard error.
- **D7: Deterministic per-case fixtures for PR1.** Live 3-intent recording deferred to PR2+.

**VERDICT:** ENG CLEARED — ready to implement PR1.

**Test plan:** `~/.gstack/projects/skovtun-coherent-design-method/sergeipro-main-eng-review-test-plan-20260425-215353.md`

---

## NOT in scope (deferred)

- **Live 3-intent parity fixture recording** — defer to PR2+. PR1's drift gate is 6 hand-crafted deterministic fixtures (cheap, repeatable, zero flake).
- **Performance micro-opts** — sharing DSM/CM/PM across appliers. Not blocking; capture as TODO.
- **Telemetry / run-record additions** — orthogonal to refactor.
- **AI-output cases (modify-layout-block, link-shared, promote-and-link, update-page-without-pageCode) coverage** — covered structurally by `with-ai` mode in PR1, but byte-equivalent fixture coverage waits for PR2's live recording.
- **v0.11.4 sequencing** — already shipped (commit 7af0d4e). v0.11.5 also shipped (d95ae1d). No in-flight work to coordinate around.
- **CEO review and DX review** — not relevant; this is an internal architecture refactor with no user-facing surface change.

## What already exists (reuse, do not rebuild)

- `applyModification(req, dsm, cm, pm, projectRoot, provider, message)` at `commands/chat/modification-handler.ts:208` — the 12-case switch. Move bodies into `commands/apply-requests/dispatch.ts`; do not rewrite logic.
- `createModificationApplier()` at `phase-engine/appliers.ts:127` — keep the artifact-collection shape (reads `modification-requests.json`, partitions `handled`/`deferred`/`unsupported`); replace the handler bodies with one call to `applyRequests(handled, ctx, 'no-new-ai')`.
- `createPagesApplier()` at `phase-engine/appliers.ts:509` — already assembles `add-page` shape from `page-*.json` artifacts; just call `applyRequests([assembled], ctx, 'no-new-ai')` instead of inline writes.
- `applyManagerResult()` duplicated at `modification-handler.ts:196` and `appliers.ts:279` — extract to `commands/apply-requests/managers.ts` on Day 1 as smoke test for the extract pattern.
- `parity-harness.ts` at `phase-engine/__tests__/parity-harness.ts` — reuse the tree snapshot / normalize / diff infrastructure for the deterministic fixtures. The `runRailA`/`runRailB` stubs at :186, :202 stay stubbed until PR2.
- `MockProvider` from `phase-engine/__tests__/mock-provider.test.ts` — drives chat-rail for parity tests without API calls.

## Failure modes (for each new codepath)

| New codepath | Realistic failure | Test? | Error handling? | Visible to user? |
|---|---|---|---|---|
| `applyRequests(reqs, ctx, 'no-new-ai')` with missing AI artifact | Hard throw before any mutation | YES (D6 contract test) | Explicit error class with request type + missing field | YES — clear error, no partial state |
| `applyRequests(reqs, ctx, 'with-ai')` regresses chat-rail behavior | One of 12 cases produces different output post-extract | YES (deterministic fixture suite) | Existing chat error paths preserved | Chat rail user sees same output as v0.11.x |
| `commands/apply-requests/parse.ts` destructive pre-parser misses an intent | Silent destructive op slips through | YES (`parse.test.ts`) | Throw with intent + reason | User sees "destructive op refused — confirm with --force" |
| `createModificationApplier` 20-line dispatch passes wrong `ctx` shape | Type error caught at compile | TypeScript exhaustiveness | N/A (type system) | N/A |
| Hash protection lookup race (file edited mid-apply) | Stale hash → overwrites manual edit | INTEGRATION test | Skip apply + warn | User sees "manual edits detected; skipped X" |
| `no-new-ai` mode lets a `createAIProvider` call sneak through | Spy assertion in `mode.test.ts` would fail | YES — mandatory spy | Code-path-level fail-fast | N/A (test catches before user) |
| `applyManagerResult` extract introduces shared-state bug | Mutation seen across managers in unintended order | YES (existing applier tests cover) | Existing semantics preserved | N/A |

**Critical gap audit:** None. Every new failure mode has a test AND error handling AND a clear user signal.

## TODOs (proposed for `IDEAS_BACKLOG.md` or M16)

Asking each individually below.

## Worktree parallelization strategy

PR1 and PR2 are SEQUENTIAL — PR2 depends on PR1's pipeline existing. Within PR1:

| Step | Modules touched | Depends on |
|------|----------------|------------|
| 1. Extract `applyManagerResult` | `commands/apply-requests/managers.ts`, `modification-handler.ts`, `phase-engine/appliers.ts` | — |
| 2. Extract dispatch (12-case switch) | `commands/apply-requests/dispatch.ts`, `modification-handler.ts` | 1 |
| 3. Extract pre-helpers | `commands/apply-requests/pre.ts`, `chat.ts` (delegate) | 2 (dispatch must be callable) |
| 4. Extract post-helpers | `commands/apply-requests/post.ts`, `chat.ts` (delegate) | 2 |
| 5. Add `applyMode` parameter + contract | `commands/apply-requests/index.ts`, `dispatch.ts` | 2 |
| 6. Rewrite `createModificationApplier` to dispatch | `phase-engine/appliers.ts` | 5 |
| 7. Deterministic fixture suite | `commands/apply-requests/__tests__/fixtures/` | 6 |

Steps 3 and 4 (`pre.ts` / `post.ts`) are **independent — different modules, no shared state**. Lane A: pre. Lane B: post. Parallel. Recombine before step 5.

```
Lane A: 1 → 2 → 3 ─┐
                   ├→ 5 → 6 → 7
Lane B: ─────── → 4 ─┘
```

**Conflict flag:** Steps 3 and 4 both edit `chat.ts` to delegate. If two parallel agents both edit `chat.ts`, merge conflicts on the inline-replacement lines. Mitigation: each lane edits a different `chat.ts` line range (Lane A → :432/:661 pre-stack, Lane B → :900/:1283/:1310-1360/:1380 post-stack). Coordinate before pushing.

## Completion summary

- Step 0: Scope Challenge — accepted as-is (plan IS the scope; B is the boil-the-lake answer)
- Architecture Review: 1 issue (D1) — resolved (Option B)
- Code Quality Review: 2 issues (D2 superseded by D5; trivial `applyManagerResult` dup → smoke test step 1)
- Test Review: 22 new tests added to plan; 6 deterministic fixtures gate PR1; ~3 tests + live recording for PR2
- Performance Review: 0 issues (DSM/CM/PM sharing micro-opt → TODO)
- NOT in scope: written
- What already exists: written (reuse map for migration)
- TODOs.md updates: deferring to interactive Q below
- Failure modes: 0 critical gaps flagged
- Outside voice: codex consult ran; 4 substantive tensions; ALL 4 codex critiques accepted; plan revised
- Parallelization: 2 PRs sequential; within PR1, 2 lanes (pre/post extracts) can run parallel after step 2
- Lake Score: 6/7 recommendations chose complete option (D5 chose sequence-over-bundle for risk mgmt — conscious risk-trade, not coverage cut)
