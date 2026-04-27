---
id: ADR-0007
type: adr
status: accepted
date: 2026-04-27
confidence: established
shipped_in: [0.13.0]
---

# ADR 0007 — Codex + adversarial subagent gate for cross-cutting changes

**Status:** Accepted
**Date:** 2026-04-27
**Shipped in:** v0.13.0 part1 (formalized; pattern emerged across M14, M15, v0.11.x hotfix line, v0.12.0 PR1 before being committed to durable docs).

## Context

Coherent's release history shows a pattern: cross-cutting architectural changes that ship without an external-perspective gate cause downstream pain that takes multiple hotfixes to clear. Specific examples:

- **v0.7.6 PJ-009 silent-coerce regression.** `add-page` → `update-page` coercion shipped without external review; manifested as silent data loss in production user sessions.
- **v0.11.0 → v0.11.5 hotfix line.** Six hotfixes in 24h, each patching a different symptom of the same parity-drift class between the API rail and skill rail. The drift would have been caught by an external perspective on the v0.11.0 plan.
- **v0.12.0 silent-drop on `add-layout-block`.** Type was in the `ModificationRequest` union but in NEITHER `DETERMINISTIC_TYPES` nor `AI_TYPES`. Codex consult signed off the plan; only the post-merge adversarial subagent caught it.
- **v0.13.0 plan reinventing existing code.** Item 1 (auto-update prompt) was scoped as new file. Codex consult missed that `utils/update-notifier.ts` had shipped in v0.11.2. Adversarial subagent grepped the repo with fresh context and caught it within 5 minutes.

The pattern: codex consult (external model perspective) catches some failure modes, but is **context-poisoned** when run in the same session as the human author or when given only the plan document. Fresh-context adversarial subagent (literally a new agent with no session history) catches the rest. Either alone is insufficient for cross-cutting work; both together have proven decisive across 5+ cycles.

## Decision

For changes that meet the gate criteria below, follow this sequence BEFORE any implementation code is written:

```
plan document → codex consult → revise → adversarial subagent on revised plan → revise → implement → adversarial subagent on implementation diff → fix → ship
```

## Gate criteria — when to invoke

Invoke the dual-gate when the change touches ANY of:

- **Both rails.** API rail (`coherent chat`) AND skill rail (`/coherent-chat` via Claude Code) — anything in `apply-requests/`, `phase-engine/`, `commands/chat/modification-handler.ts`.
- **Phase-engine appliers.** New applier, applier reorder, applier deletion. Any file under `phase-engine/appliers/`.
- **Init / scaffold lifecycle.** `coherent init` flow, scaffold templates, project-create artifacts.
- **Anything reading `dsm.config` for a derived signal.** Welcome-replacement, sidebar regen, nav-items inference, route-to-fs mapping.
- **Supply-chain integration.** Registry interactions, signing, the auto-update notifier's domain allowlist, npm dist-tag routing.
- **CI / publish workflows.** Anything under `.github/workflows/`. These are one-way for downstream users — broken workflow ships every release thereafter.
- **New top-level modules.** Anything that introduces a new directory under `packages/cli/src/` or `packages/core/src/`.
- **Cross-rail message format.** Any change to text emitted by both `coherent chat` and `coherent _phase ingest` outputs (consumers parse these).

Do NOT invoke for:

- Localized bug fixes that touch one file and don't affect the contracts above.
- New tests, doc-only changes (CHANGELOG, README), version bumps without code changes.
- Refactors that preserve public API and don't cross layer boundaries.

When in doubt, invoke the gate. The cost is ~$1-2 of tokens and ~10-15 minutes; the cost of a P1 silently shipped is a release-tag rollback (or worse, npm-unpublish window expires and only deprecate-forward-fix is possible).

## Codex consult prompt template

The codex consult prompt should explicitly:

1. State the role: "You are a brutally honest technical reviewer. Pre-implementation gate for [feature]."
2. Embed full plan document content (do NOT reference paths — codex sandbox can't read outside the repo root).
3. Ask for per-item land-as-is / land-with-revision / split / reject decisions.
4. Ask for direct yes/no answers to the plan's open questions.
5. Forbid filesystem boundary excursion (skip `~/.claude/`, `~/.agents/`, `.claude/skills/` paths).

The full prompt template lives in `docs/wiki/ADR/0007-codex-adversarial-gate-prompts.md` (TODO: extract — for now, see the codex invocation in v0.13.0 part1's session log for the canonical example).

## Adversarial subagent prompt template

The adversarial subagent dispatched via the Agent tool with `subagent_type: "general-purpose"` should be instructed to:

1. Read the plan document AND the actual repo (it has tool access — codex doesn't always).
2. Specifically look for what codex MISSED. List recent codex findings in the prompt so the subagent doesn't duplicate work.
3. Pressure-test 8-10 specific failure modes (race conditions, exit timing, cross-package boundary, test isolation, doc honesty, etc.) — not generic "find bugs."
4. Output structured findings with `[SEVERITY] (confidence: N/10) location — issue. Fix: suggested fix.`
5. Permit "NO FINDINGS in category X" responses to fight padding.

## Output handling

The codex consult and adversarial subagent outputs go into a revised plan document (e.g., `coherent-v0.13.0-proposal-v2.md`). The revised plan is the implementation source of truth — not the original. Track findings as either:

- **Adopted:** revision lands in the plan + code.
- **Acknowledged + deferred:** acknowledged in the plan with a tracking issue or follow-up release note.
- **Rejected:** documented in the plan with rationale (the gate caller has veto, but rejecting all findings is a smell).

## Save trail (5+ cycles validated)

| Cycle | Codex caught | Adversarial caught | Net result |
|---|---|---|---|
| M14 (slim-mode) | Premise that anchor pre-loaded CORE_CONSTRAINTS was false. P1 silent quality regression averted. | n/a (pattern not yet established) | Optimization reverted; anchor wraps with `buildModificationPrompt` for the correct fix. |
| M15 (welcome-replacement) | Init-seed `/` Home short-circuit in `pickPrimaryRoute(dsm.config.pages)` — replacement would silently no-op. | n/a | 2 P1 findings landed in code. |
| v0.11.x hotfix line | Codex was NOT used pre-impl. 6 hotfixes shipped in 24h — lesson burnt-in. | n/a | Pattern committed to memory after the 6th hotfix. |
| v0.12.0 PR1 | Sign-off on plan via `/plan-eng-review`. Caught Item 5 scope-creep (split to v0.14.0). | Caught silent-drop on `add-layout-block`, `modify-component` fixture too loose, BREAKING message-format unflagged. | All shipped fixed BEFORE manual user testing. |
| v0.13.0 part1 | Caught Item 5 split, renamed "real-AI smoke", split items. | 7 critical issues codex missed: existing `update-notifier.ts` (Item 1 was reinventing), `publish.yml` workflow gap (RC strategy was structurally impossible), 3 CoherentError destruction sites, supply-chain attack surface in registry-sourced URLs. Plus on PR #49 implementation: `isCoherentError` was `instanceof` despite "structural marker" claim, vaporware claims in CHANGELOG, vacuous test regex. | All caught in pre-impl OR pre-merge gate. None shipped to users. |

## Trade-offs

**Cost of the gate:**
- Codex consult: ~$1-2 in tokens, ~10 minutes wall time.
- Adversarial subagent (plan + impl): ~$0.50-1, ~15-20 minutes wall time combined.
- Plan revision: 30-60 minutes after each gate.
- Total: ~1-1.5 hours of wall time and ~$2-3 per gated change.

**Cost of skipping the gate:**
- Single P1 finding shipping = at minimum a release-tag rollback or hotfix patch (1-2 hours).
- Six hotfixes (the v0.11 pattern) = 24+ hours and trust damage.
- Worst case: npm-unpublish window expires (24h after first download) and only deprecate-forward-fix is possible — meaning the broken version stays in the registry forever as a footnote.

The gate is cheap insurance. The exception is genuinely localized changes that don't meet the gate criteria above; for those, the gate is overhead.

## Consequences

- **Positive:** P1 shipping rate has dropped to near-zero across the 3 cycles since the dual-gate became standard (v0.12.0 PR1, v0.13.0 part1, this ADR). Adversarial subagent specifically catches contributor-blind-spots that same-session codex misses.
- **Positive:** Cross-package portability claims (e.g., the v0.13.0 update-notifier extension) are validated against real repo state, not assumed-from-plan.
- **Positive:** Adversarial review on the IMPLEMENTATION (not just plan) creates a feedback loop — if the gate finds something, the contributor learns the failure mode for next time.
- **Negative:** Gate adds friction to routine work if invoked incorrectly. The criteria above are deliberately specific to keep false-positive cost low.
- **Negative:** Both gates depend on external services (codex CLI, Anthropic for the subagent). If either is down or rate-limited, gate work backs up.
- **Negative:** Gate findings sometimes conflict (codex says "land row A", adversarial says "drop row A"). The contributor has to mediate. Not a real cost — just requires judgment.

## What this ADR is NOT

- Not a process to follow blindly. The criteria + judgment matter more than checking boxes.
- Not a substitute for testing. The gate finds plan-level and architecture-level issues; tests find correctness issues. Both are needed.
- Not a substitute for /qa or browser-based validation. The gate doesn't verify visual UX or production behavior; it verifies architectural soundness.
- Not a substitute for production canary. After the gate passes, RC + canary + manual validation still happen.

## References

- `feedback_codex_pre_implementation.md` (private memory) — Sergei's notes on when to invoke.
- `/tmp/coherent-v0.13.0-proposal.md` (v1) and `/tmp/coherent-v0.13.0-proposal-v2.md` (post-gate) — example of the revision flow.
- v0.12.0 CHANGELOG "Adversarial review" section — example of the save trail being made visible to users.
- v0.13.0 PR #49 commit `7fc3868` — example of the adversarial-fix commit that catches issues post-implementation.
