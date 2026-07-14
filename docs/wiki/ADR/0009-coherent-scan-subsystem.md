---
id: ADR-0009
type: adr
status: accepted
date: 2026-07-13
confidence: established
shipped_in: [0.20.0]
---

# ADR 0009 — Coherent scan subsystem (Tool 2: scan → cluster → drift)

**Status:** Accepted
**Date:** 2026-07-13
**Shipped in:** v0.20.0 (B-1 + B-2a landed earlier under the same design; ADR deferred until the subsystem's final shape — B-2c — was on main)

## Context

Tool 2 answers a different question than Tool 1 (`coherent extract`, ADR-0008's DESIGN.md-as-artifact direction). Tool 1 extracts atmosphere from a *live URL*. Tool 2 reads an *existing codebase* and reverse-engineers its de-facto design system: which class-string patterns repeat, what they mean, and how they relate to the project's documented design intent.

The pilot target was a 109-file Laravel Blade app (mixed RU/EN, no component library, ~1000 distinct class-string patterns). Constraints that shaped the design:

1. **Evidence must be reproducible.** Consulting output that changes between runs is unusable for review workflows.
2. **LLM spend must be opt-in and bounded.** A scan of a mid-size app is ~$3 of Sonnet tokens; that must never happen silently.
3. **The tool proposes, the human disposes.** Generated artifacts are drafts for review, never canonical design docs.

## Decision

The subsystem is a three-stage pipeline of separately-shippable commands, each consuming the previous stage's file artifact:

```
coherent scan <dir>        → B1-EVIDENCE.json      (B-1)
coherent cluster <json>    → COHERENT-DESIGN.md    (B-2a deterministic, B-2b --llm)
                           → DRIFT-REPORT.md       (B-2c, when DESIGN.md exists)
```

### B-1 — evidence extraction (`coherent scan`)

- **Adapter contract** (`scan/adapters/types.ts`): `StackAdapter {name, filePatterns, excludes, extract()}`. Blade-only in v0; the contract is INTERNAL — TSX adapter and public `StackAdapter` API deferred to a later phase. Six `AntiPatternKind`s: `raw_button_tag`, `include_partial`, `x_component_usage`, `at_class_directive`, `conditional_class_array`, `inline_classes`.
- **JSON schema versioning** (`scan/json-output.ts`): `SCHEMA_VERSION = '1.0.0'` in `ScanRunMetadata`; every downstream stage warns on mismatch instead of guessing. Bump on any breaking shape change.
- `EvidenceRow` = `{file, line, kind, raw_class_string, surrounding_context}` — flat, direct-serializable, no derived state.

### B-2a — deterministic clustering + serializer

- **Stable cluster IDs:** `cluster_id = sha256(JSON.stringify({kind, tokens: sorted_normalized})).slice(0, 8)`. Same input → same ID across machines, runs, and model versions. IDs are safe to reference in issues and caches.
- **The LLM labels clusters but never defines membership.** Membership is deterministic (signature-based preclustering); labeling is a pluggable producer behind the `LabeledCluster` interface (`source: 'llm' | 'deterministic' | 'cache' | 'human'`). The serializer is producer-agnostic (codex Q7).
- **DRAFT banner is non-negotiable.** COHERENT-DESIGN.md opens with "DRAFT — auto-generated from code. Not canonical until reviewed." The generated file is input to human review, never output of record.

### B-2b — LLM labeler (`--llm`, opt-in)

- Sonnet (`claude-sonnet-4-6` exact pin, `temperature: 0`), stateless chunked batches under a token budget, 3-attempt repair ladder ending in deterministic fallback at confidence 0.35, project-local cache keyed on `{cluster_id, signature_hash, prompt_version, model_id, design_hash}`, cost banner + `--yes` CI gate, detect-and-warn privacy preflight. Full verdict table in `docs/wiki/PATTERNS_JOURNAL.md` era notes and code comments (codex consult 2026-05-11, 10+4 questions).
- **Opt-in, not default.** The first real eval (2026-07-11) returned `BLOCKED` for eval-methodology reasons (token-authored ground truth vs context-aware labels — see IDEAS_BACKLOG R10), and independently: an on-by-default paid operation is a cost footgun. Flip to default only after R10's re-authored eval passes major ≤ 20%.

### B-2c — conservative drift report

- When a project `DESIGN.md` exists (auto-detected at project root, or `--design <file>`), `coherent cluster` additionally emits `DRIFT-REPORT.md` next to the main output.
- **v0 does NO semantic matching** (codex Q6, locked 2026-05-11): free-form design docs (prose, mixed-language) cannot be reliably matched against class strings; a wrong "covered/not covered" verdict is worse than no verdict. The report states the DESIGN.md path, lists top-N clusters by occurrence, and says explicitly: "Semantic comparison deferred — manual review required."
- No false-confidence claims is a tested invariant (`drift-report.test.ts`).

## Consequences

**Positive:**

- Each stage is independently testable and shippable (B-1 → B-2a → B-2b → B-2c landed as four PRs: #111, #112, #113, this one).
- Stable IDs + deterministic membership make the LLM layer swappable and its failures recoverable (fallback labels, never a broken pipeline).
- The drift report creates the review-workflow surface that B-3 (merge wizard) will build on, without promising semantics we cannot deliver yet.

**Negative / accepted costs:**

- Blade-only limits the audience until a TSX adapter lands (Phase E).
- The conservative drift report pushes real comparison work onto the human; semantic matching waits for a reliable eval (R10) and possibly an embedding/judge approach.
- Scan/cluster errors still use chalk + `process.exit` instead of `CoherentError` E009/E010 — follow-up.

## Alternatives considered

- **One monolithic `coherent scan --full` command** — rejected: no reusable evidence artifact, no independent testing of stages, LLM cost coupled to every scan.
- **LLM-defined cluster membership** — rejected: non-reproducible, cache-hostile, and a model upgrade would silently reshuffle every cluster.
- **Auto semantic DESIGN.md matching in the drift report** — rejected for v0 (codex Q6): pilot DESIGN.md is RU/EN prose; header-keyword matching produced false confidence in dry runs. Deferred, gated on R10.
