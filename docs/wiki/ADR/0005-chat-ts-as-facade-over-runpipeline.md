---
id: ADR-0005
type: adr
status: accepted
date: 2026-04-24
confidence: established
shipped_in: [0.9.0]
---

# ADR 0005 — chat.ts as facade over runPipeline

**Status:** Accepted
**Date:** 2026-04-24
**Shipped in:** v0.9.0 (phase-engine rail) + follow-up facade refactor (same release cycle)

## Context

Before v0.9.0, `packages/cli/src/commands/chat.ts` was a 1569-line monolith that inlined every step a generation run needs: argument parsing, lock acquire, pre-AI preflight, the 6-phase split-generator loop, the post-AI apply stack, and release. `split-generator.ts` handled phase sequencing but wrote project state directly mid-loop — `design-system.config.ts` mutations at lines 526 / 631 / 674, hash sync at the end, manifest updates inline. Everything in-process, everything coupled.

Two problems the monolith prevented us from solving:

1. **Skill-mode parity.** v0.9.0 introduced a second rail driven by Claude Code (`/coherent-generate` → `coherent session start` → `_phase prep/ingest` per step → `session end`). The chat-rail monolith can't be decomposed into steps that run in separate CLI processes — it holds all state in one closure and mutates config inline. Any attempt at "parity" via duplication means two copies of phase prompts, two copies of the pre/post stack, drift between the two from day one. R2 in the canonical design doc called this out explicitly: *parity-by-duplication is branding, not substance.*

2. **Testability against a real parity bar.** The Tier 1 parity harness (see `packages/cli/src/phase-engine/__tests__/parity.test.ts`) compares byte-identical output between chat rail and skill rail for canonical intents. If the two rails run different code, "byte-identical" is either impossible (real differences) or meaningless (same bugs in both). The harness needs both rails to emit through **the same phase code** with only the driver (in-process vs multi-process) differing.

Codex's cold read on the v0.9.0 design doc surfaced the deeper problem (R3): a thin `runPipeline` orchestrator plus two callers isn't enough. Chat has critical pre/post operations at six call sites: project lock (`files.ts:67`), backup, preflight, auto-scaffold, save, regenerate, dependency scan, globals fix, hash sync, manifest sync (chat.ts:211, 250, 900, 1018-1071, 1283, 1310-1360, 1380, 1567). If skill-mode's `session start`/`session end` ran a different — or partial — version of that stack, the two rails would produce different on-disk results even with identical AI responses.

The only correct shape: chat.ts itself collapses into a facade that goes through the same lifecycle and runner skill-mode uses.

## Decision

**Refactor `chat.ts` into a thin facade over the shared phase engine.** The final shape, end-state:

```
coherent chat "<message>"
  → sessionStart(projectRoot, intent, options)    // shared with skill
  → runPipeline(phases, provider, session, hooks) // in-process AnthropicProvider
  → sessionEnd(projectRoot, uuid, appliers)       // shared with skill
```

Every step outside `runPipeline` (lock, backup, preflight, dependency scan, globals fix, hash sync, manifest finalize, rewrite DSM, write config-delta, apply patches) moves into either `sessionStart` (pre-AI stack) or `sessionEnd` (post-AI stack via pluggable appliers) in `packages/cli/src/phase-engine/session-lifecycle.ts`. Both rails run the identical pre/post stack via shared subcommand code. chat.ts's job narrows to:

1. Parse CLI flags into `SessionStartInput.options`.
2. Pick the AI provider (Anthropic/OpenAI/mock) and wire it into `runPipeline`.
3. Register hooks for the spinner / heartbeat / retry UX that chat has today and skill-mode explicitly doesn't want (the skill markdown controls its own progress reporting from within Claude Code).
4. Surface errors with chat-specific chalk colors and exit codes.

That is the whole file. Post-refactor chat.ts should be ~100-150 lines, near-entirely glue.

### What moves where

| Current location in chat.ts | Target location | Notes |
|---|---|---|
| `acquireProjectLock` (line 211) | `sessionStart` | Already uses `acquirePersistentLock` on the skill path; chat switches to the same call. |
| `createBackup` pre-gen (line 900) | `sessionStart` pre-AI stack | As an applier-like `preStart` hook or inlined, depending on ordering needs. |
| `fixGlobalsCss` plan-only (line 250) + post-gen (line 1283) | `sessionEnd` post-AI or new applier | Idempotent, safe to run once at end. |
| `autoScaffold` (lines 1018-1071) | `sessionStart` | Auth-route group setup is pre-generation. |
| `manifest auto-sync` (lines 1310-1360) | `sessionEnd` applier | Matches components applier's manifest update semantics. |
| `createBackup` final (line 1380) | `sessionEnd` | Optional, wrap in an applier. |
| `releaseLock` finally (line 1567) | `sessionEnd` outer `try/finally` (already done for skill rail, see codex R3 P1 #8 fix). |

Line anchors are from the pre-refactor state — they stay stable as reference for migration because the refactor lands commit-by-commit, one move per commit, preserving test parity.

### Appliers cover the post-AI asymmetry

The skill rail today uses `defaultAppliers()` from `packages/cli/src/phase-engine/appliers.ts`: `createConfigDeltaApplier` → `createComponentsApplier` → `createPagesApplier`. The chat rail's richer post-stack (hash sync, dependency scan, inline validator) becomes **additional appliers** passed to `sessionEnd`. Shared order guarantees observable equivalence.

### runPipeline hooks carry chat-specific UX

Chat's spinner, heartbeat, per-page fallback, and retry logic become `RunPipelineHooks` (`onPhaseStart`/`onPhaseEnd`/`onError`/`fallback`). Skill rail passes no hooks; chat rail passes the full UX suite. `runPipeline` itself stays agnostic.

## Consequences

**Gains**

- **Parity becomes code-shared, not code-duplicated.** Tier 1 harness (`parity.test.ts`) compares byte-for-byte against a MockProvider replay; both rails execute the identical phase + applier code. A test that passes is a real correctness claim, not a branding exercise.
- **chat.ts shrinks from 1569 lines to ~100-150.** Remaining content is strictly UX glue — the phase engine is the source of truth for everything else. Code review and future refactors target the phase engine, not a monolith.
- **New phases ship to both rails simultaneously.** Add a phase to the registry (`phase-registry.ts`) and it's available to `coherent chat` AND `/coherent-generate` with zero further wiring.
- **Session lifecycle becomes the natural place to harden.** Lock fix (codex R3 P1 #8 — release on error) and run-record composition (R2 P1 #6) live in one module and benefit both rails.

**Costs**

- **Migration touches load-bearing code.** 1146 tests exercise the current chat rail. Moving each mid-loop mutation into the session lifecycle without breaking them requires commit-by-commit migration with the full test suite green at each step. The parity harness is the safety net that catches observable-behavior drift.
- **runPipeline hooks API widens.** Chat's existing UX has quirks — per-page retry on empty-code, per-component fallback on batch-parse failure, component-install during add-page. These become fallback hooks keyed by phase name. Each quirk migrates as its own commit; skill rail ignores them (no hooks passed).
- **Pre-refactor line anchors in commit messages go stale fast.** During migration, every move shifts the numbers. Migration commits must reference target files, not chat.ts line numbers, to stay readable after the fact.

**What breaks**

- Nothing from a user-visible standpoint. `coherent chat --help` surface stays identical; both positional arg shapes, every flag, every error path. Post-refactor a user running `coherent chat "build CRM"` gets the same files on disk as before — the internal path just goes through the shared lifecycle now.

## Why not alternatives

- **Keep chat.ts monolithic, build skill rail as a duplicate.** Rejected in R2 of the canonical design doc. Two copies of phase prompts means guaranteed drift from the first post-release bugfix. Parity harness becomes noise.
- **Thin runner + lifecycle hooks only (no facade).** Codex cold read flagged this as insufficient (R3). The pre/post stack at six call sites in chat.ts is too substantive to hand-carry into the skill rail as a comment-level reference — either it moves into shared code or the two rails diverge.
- **Facade first, appliers later.** Attempted conceptually, rejected during implementation: the pages applier is where `routeToFsPath` + auth-group routing lives, and chat rail's `add-page` handling relies on the same logic. Doing facade without appliers means chat.ts keeps its inline routing and skill rail reimplements it — drift again. Appliers had to land first (done in codex P1 #2, commit 48c8241) so the facade has a real destination for the work.
- **Just extract `splitGeneratePages` and leave chat.ts wrapping it.** Preserves the monolith shape; skill rail still can't call the extracted code from a separate process because the function signature assumes in-process state. The shared lifecycle is the forcing function — it either is, or isn't, the integration point.

## References

- Canonical design doc: `~/.gstack/projects/skovtun-coherent-design-method/sergeipro-main-design-20260423-172452.md` (R3 "session start/end share pre/post stack").
- Eng-review test plan: `~/.gstack/projects/skovtun-coherent-design-method/sergeipro-main-eng-review-test-plan-20260423-174142.md` (parity harness Tier 1 spec).
- `packages/cli/src/phase-engine/session-lifecycle.ts` — `sessionStart` + `sessionEnd` + outer `try/finally` lock release (codex R3 P1 #8).
- `packages/cli/src/phase-engine/appliers.ts` — config-delta, components, pages appliers (codex P1 #2, R3 P2 #9 auto-fix).
- `packages/cli/src/phase-engine/run-pipeline.ts` — orchestrator + `RunPipelineHooks` contract.
- `packages/cli/src/phase-engine/__tests__/parity.test.ts` — Tier 1 harness (9 `test.todo` pending fixture recording).
- `packages/cli/src/commands/chat.ts` — pre-refactor monolith (1569 lines; anchors 211/250/900/1018-1071/1283/1310-1360/1380/1567).
- ADR-0001 (golden patterns): sets the precedent for structured primitives over prose.
