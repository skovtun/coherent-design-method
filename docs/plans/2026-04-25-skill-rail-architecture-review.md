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
