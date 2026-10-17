---
id: ADR-0011
type: adr
status: proposed
date: 2026-10-17
confidence: verified
shipped_in: []
---

# ADR 0011 — Governance, not authorship: the model designs, Coherent governs

**Status:** Proposed (vertical slice on `feat/governance-graph`)
**Date:** 2026-10-17

## Context

A/B on the SubmitAd spec (same spec text, same model `claude-sonnet-5`, same stack Next.js + Tailwind v4 + shadcn):

- **A**: plain Claude Code, one headless agent, whole app in one context, ~30 min. Correct app shell (sidebar, role switcher, wallet), working charts, semantically correct AI-flag UI, own browser QA that fixed 3 visual bugs. Clean, not "wow".
- **B**: the `coherent chat` pipeline (6 phases, ~20K-token constraint preamble, template Header/Footer from `PageGenerator.ts`, pages generated 3-at-a-time each told "generate one page only"). Marketing header + footer on every app page, empty chart, AI review flags rendered with the creator-matching component ("96% match", "Swap"), squeezed text.

A won on all 8 matched screens. Every B defect traces to a Coherent step: template chrome, keyword-category reuse (`reuse-planner.ts` / `ComponentManager.findBestMatch` pick the first category match — how an AI creator suggestion became an AI review flag), per-page fragmentation, plan compression. The 2026-07 differentiation benchmark already found prompt-injected rules do little against a frontier baseline; this is the stronger form: they actively hurt.

## Decision

Coherent stops authoring design. The coding model generates the app (and its shared components) freely, in one coherent workspace. Coherent owns what a plain agent does not provide:

1. **Code-derived graph** (`governance/graph.ts`): nodes, exports, props signatures, client boundary and import edges from the TypeScript AST on every run. Impact is **transitive** (Page → Shell → TopBar → WalletDialog) and **layout-scoped** (a layout's subtree governs every route under its directory). Code is the source of truth; no stored registry that can drift.
2. **Scoped edit routing** (`governance/router.ts`, `coherent edit`): request → scope (`tokens` | `component` | `variant` | `page` | `new-component`) chosen by the model from the code-derived inventory, with semantic-not-shape reuse rules. **The write set is enforced in code**: the apply step may only write files the plan declared.
3. **Transactions with byte-exact undo** (`governance/transaction.ts`): whole-tree snapshot; rollback restores modified/deleted, removes created files and empty dirs, then re-hashes. Replaces the gap in `utils/backup.ts` (never removed created files; only app/ + components/).
4. **Rendered verification** (`governance/verify.ts`): typecheck (one repair pass), then before/after screenshots. Affected routes must change; control routes — including other consumers of a component under a `variant` edit — must be pixel-identical.
5. **Identity-leak detection** (`governance/privacy.ts`): agents paste `git config user.name/email` into mock UI (observed in A). Hard check before any generated app is shown or published.

Post-hoc extraction (turning inline JSX into shared components) is **optional remediation** — for imported unstructured projects or detected duplicates, proposal-only, never auto-merged. It is not the default architecture: A authored a sound shared layer itself (15 components, reach computed by the graph).

## Consequences

- `coherent chat` generation order is not changed by this ADR. Codex review (2026-10-17) and the A/B both say per-page parallel generation is the likely cause of B's incoherence; the next generation design must keep whole-app context (sequential, A-style) and is a separate decision gated on this slice.
- "Wow" is not governance's job. Candidate: optional pre-build direction fork (2–3 shell + anchor-screen directions, human picks), then free generation. Separate decision.
- `typescript` moves from devDependencies to dependencies of `@getcoherent/cli` (the graph needs the compiler at runtime; bundling it into the ESM output broke the whole CLI with "Dynamic require of fs"). `coherent edit` is lazy-loaded so other commands don't pay the compiler's startup cost.
- Two registry models already exist (`DesignSystemConfig.components` and `coherent.components.json`); this slice adds neither. Converging them onto the code-derived graph is follow-up work.

## Go / no-go for the slice

Six edits on project A (2 tokens, 2 shared component, 2 page-local incl. one variant): every intended consumer changes, zero unintended files written, typecheck + rendered checks pass, controls pixel-identical, and undo restores the tree byte-for-byte.

**Result (2026-10-17, third run, cold builds + exact pixel diff):** all six passed. Routing 6/6 (tokens→`globals.css`; component→one file; variant→`KpiCard` + Earnings page only); write set held on every edit; typecheck clean without repair; control routes 0.00% changed, including the two other `KpiCard` consumers under the variant; undo of all six restored the tree byte-for-byte (verified via `git status` against the baseline commit), and the undo guard refused to roll back an edit with newer edits on top. Two verifier defects found and fixed on the way (PJ-027).

**Hardening (2026-10-17, Codex review before agent mode):** the slice committed before verifying, could report an unrendered edit as OK, accepted `../` create paths, warned about identity leaks only before the edit, copied `.env` into snapshots, and rolled back the whole tree (erasing concurrent IDE edits). Fixed: verification precedes commit and a failed edit is rolled back; four explicit verdicts; transactions persist state and write set, one open per project; rollback restores only the transaction's own files; paths normalized and symlink-checked; secrets never snapshotted. Live re-check on A: page edit `VERIFIED` (controls 0.00%), undo restored the edited file while a concurrent hand edit to another file survived.

## Alternatives rejected

- **DesignDirection schema compiled into restyled primitives + AI chrome before generation** (Codex consult, 2026-10-16): keeps Coherent as design author; the A/B showed the authoring layer is the problem.
- **AST-similarity auto-extraction as the core**: shape ≠ meaning (the B bug), and moving JSX changes state, keys, focus and server/client boundaries. Candidate generator only.
- **Parallel per-page generation for speed**: already in place and implicated in B's failures; optimise latency only after matching A's quality.
