# Ideas Backlog

Append-only log of proposals, ideas, and potential future work for the Coherent platform. Each open/deferred idea is an indexable entry (`### ID — Title`) with YAML frontmatter so retrieval can rank by status, confidence, and freshness. Shipped items live under `####` headings so they don't bloat the retrievable corpus — full history still scannable by humans.

Statuses: `open` · `in-progress` · `shipped` · `rejected` (with reason) · `deferred`

Prefix clusters: `F` features · `M` meta-architecture · `N` nice-to-haves · `W` wiki · `J` journal · `A` ADR/process · `R` research.

---

## Shipped (historical — human-readable, not indexed)

#### v0.7.0 (2026-04-19)

- **F2** commander strict args (`allowExcessArguments(false)`)
- **F4** post-chat change summary (line delta + import diff)
- **F5** `--page` verifies target modified
- **F8** table column schema rule
- **M1** golden patterns library (4 flagship + keyword-scoped injection)
- **Bug 2** skip archplan on `--page X` + RESPONSE_TRUNCATED guard

#### v0.7.1

- 5 new golden patterns (dialog, dropdown, alert-dialog, sheet, pagination)
- 3 overlay validators (`DIALOG_FULL_WIDTH`, `DIALOG_CUSTOM_OVERLAY`, `ALERT_DIALOG_NON_DESTRUCTIVE`)

#### v0.7.2 — Wiki infrastructure (organic — not pre-planned)

- Auto-generated `RULES_MAP.md` via `generate-rules-map.mjs`
- `coherent wiki reflect` + `coherent wiki audit` CLI

#### v0.7.3 — Retrieval + auto-healing

- W6/W7 wiki retrieval hook-up
- Targeted fix guidance in `coherent fix`

#### v0.7.4 — Wiki retrieval (TF-IDF)

- AI reads platform memory at chat-time
- TF-IDF index + synonym expansion over wiki

#### v0.7.5 — delete-page / delete-component (PJ-009)

- New `ModificationRequest` types in core
- `applyModification` handler for destructive ops
- Backup via `.coherent/backups/` + `coherent undo`
- See ADR-0003

#### v0.7.6 — v0.7.11 — destructive ops hardening

- Pre-parser, synonyms, compound delete, prompt-injection guard, nav cleanup, DOUBLE_SIGN tiering, currency autofix
- See ADR-0003

#### v0.7.12 — DSButton client component

- Self-hides on `/design-system/*` via `usePathname`

#### v0.7.13 — CLI polish + autofixes

- `coherent --help` surface 22 → 15 visible
- `RAW_IMG_TAG` autofix (→ next/image)
- `SM_BREAKPOINT` rolled up per file

#### v0.7.14 — BROKEN_INTERNAL_LINK dynamic routes

- `[param]` → regex matching
- Autofix: stale href → `#` + `data-stale-href`

#### v0.7.15 — Compact fix report

- Grouped by type, `--verbose` for old dump
- `BROKEN_INTERNAL_LINK` negative lookbehind
- `HEAVY_SHADOW` exempts fixed/absolute/sticky

#### v0.7.16 hotfix — CI flakiness

- Per-test `mkdtempSync` + cleanup in plan-generator tests

#### v0.7.17 — CHART_PLACEHOLDER autofix

- Animated bar skeleton (cosmetic fallback; F9 is true prevention)

#### v0.7.18 — `coherent fix --journal` (memory loop write side)

- YAML session summary to `.coherent/fix-sessions/`
- See ADR-0002

#### v0.7.19 — `coherent journal list/aggregate` (read side)

- Ranks validators by recurrence
- Flags 3+ session occurrences as PATTERNS_JOURNAL candidates
- See ADR-0002

#### v0.7.24 — F11 interface-details + F12 Nielsen heuristic subset

- **F11 — jakub.kr "details that make interfaces feel better" (6 rules):**
  - R012 Two sizes max per component (contrast via weight/color, not a third size step)
  - R013 Concentric border radius (outer = inner + padding, child radius steps down from parent)
  - R014 Exit motion subtler than entrance (exit translate ~8px, enter ~24px)
  - R015 Grayscale antialiasing on html/body — fixes heavy light-text-on-dark on macOS
  - R016 Tabular numerals on any changing-digit UI — stops width-jitter on rerender
  - R024 Image outline overlay at low opacity — handles image-bg-matches-page-bg silent edge
- **F12 — Nielsen heuristic subset (3 rules, spread across feedback + escape-routes):**
  - R017 Focus returns to trigger element after overlay close (Nielsen #3 user control)
  - R018 Back button compatibility with modals — no back-button traps (Nielsen #3)
  - R019 High-risk destructive: type-to-confirm. Reversible destructive: optimistic + undo toast (Nielsen #5)
- Inline into existing DESIGN_QUALITY_COMMON / INTERACTION_PATTERNS / RULES_COMPONENTS_MISC blocks — no new exported constants, no new subsystem, no ADR.
- Origin: jakub.kr/writing/details-that-make-interfaces-feel-better + Nielsen 10 usability heuristics.

---

## Open ideas

Each `###` block below is an indexable entry (wiki-index.ts scans `###` headings). Frontmatter above each heading supplies id/status/target/date for retrieval weighting and filtering.

---
id: M13
type: idea
status: deferred
target: v0.9.x
effort: 4h
date: 2026-04-23
confidence: medium
---

### M13 — `coherent prompt` rewrite as phase-preps concat

Lane C's original Task 4 called for rewriting `coherent prompt` (the one-shot constraint-bundle command) as a concat of all phase preps. Deferred because phase preps have artifact dependencies: plan.prep reads plan-input.json; anchor.prep reads plan.json (written by plan.ingest); extract-style.run reads anchor.json; etc. "Concat of all preps" requires the upstream phases to have actually run with real AI responses — chicken-and-egg without AI calls inside a non-API command.

Candidate resolutions:
1. **Skeleton mode** — emit each phase's prep template with `<<artifacts from prior phase>>` placeholders. Honest about the chain without lying about resolved values.
2. **Plan-only mode** — emit only the plan phase's prep (the one phase with no prior-phase deps). Smaller, accurate, usable.
3. **--engine flag** — add `--engine` / `--phase <name>` flags. Default keeps old one-shot bundle; `--phase plan` emits just plan's prep; `--phase all` emits skeletons.
4. **Rename the goal** — Lane D's parity harness proves bundle equivalence. Keep `coherent prompt` as-is (hand-built one-shot), let skill mode use `session start` + `_phase prep/ingest` directly. This effectively retires Task 4 without rewriting.

**Why deferred:** Lane C Task 5 (skill markdown orchestrator) ships the end-of-Lane-C user-visible capability without requiring this rewrite. Revisit after Lane D parity harness shows whether `coherent prompt` still has a role distinct from the skill-mode rail.

**Target:** v0.9.x or later, once Lane D parity data makes the right answer obvious.

---
id: F11
type: idea
status: resolved
shipped_in: [0.7.24]
target: v0.7.24
effort: 1h
date: 2026-04-22
confidence: verified
---

### F11 — Interface details polish rules (from jakub.kr)

Bundled 6 interface-detail rules from jakub.kr/writing/details-that-make-interfaces-feel-better into existing always-on blocks (DESIGN_QUALITY_COMMON + RULES_COMPONENTS_MISC): two-sizes-max per component (R012), concentric radius formula (R013), subtler exit motion (R014), grayscale antialiasing (R015), tabular numerals (R016), image outline overlay (R024). Shipped v0.7.24.

**Why:** These are floor-raising rules — small, concrete, enforceable via prompt. jakub.kr is a quality touchstone for details the AI typically misses. All six were absent from CORE; five now always-on, one contextual (image). Zero token-budget concerns — added ~180 tokens total to DQ_COMMON, well under budget.

**Target:** v0.7.24.

---
id: F12
type: idea
status: resolved
shipped_in: [0.7.24]
target: v0.7.24
effort: 30min
date: 2026-04-22
confidence: verified
---

### F12 — Nielsen heuristic subset (3 rules)

Selected 3 highest-leverage heuristics from Nielsen 10 that weren't already covered by INTERACTION_PATTERNS: focus return after overlay close (R017, #3 user control), back-button compatibility with modals (R018, #3 user control), high-risk type-to-confirm + reversible undo-toast pattern (R019, #5 error prevention). Shipped v0.7.24.

**Why:** Nielsen 10 in full is too much — Coherent already implicitly covers #1 (system status), #2 (match real world), #4 (consistency), #6 (recognition not recall), #7 (flex/efficiency), #8 (aesthetic/minimalist), #10 (help docs) through existing CORE + INTERACTION_PATTERNS + golden patterns. What was genuinely missing: focus return (most AI-generated overlays break this), back-button traps (modals that aren't router-aware), and the DESTRUCTIVE_NO_CONFIRM coverage was shallow — just "show a confirm dialog", not tiered by severity. Type-to-confirm for irreversible + undo-toast for reversible = cheap interaction, same safety.

**Target:** v0.7.24.

---
id: M7
type: idea
status: resolved
shipped_in: [0.7.20]
target: v0.7.20
effort: 3-4h
date: 2026-04-19
confidence: verified
---

### M7 — Surgical edits via editPageCode()

In the `--page X` path, use `ai.editPageCode()` instead of full `parseModification` on the whole file. Feeds only the relevant section + instruction, returns the patched section, merges it back.

**Why:** `MODEL_PROFILE.md` observation: "Claude will often 'improve' an instruction — asked to fix the table, also redesigns the header, adds empty state, tweaks badges." Full-page regen = Claude touches untouched code. Confirmed across sessions. Surgical edits cap the blast radius.

**Related:** PATTERNS_JOURNAL curator notes via `coherent journal aggregate` likely show the unwanted-rewrite class of issues when we look.

**Target:** v0.7.20.

---
id: F9
type: idea
status: open
target: v0.7.20
effort: 1-2h
date: 2026-04-19
confidence: verified
---

### F9 — Deterministic StatsChart template

When `plan.sharedComponents` asks for StatsChart, generate from `templates/patterns/chart-card.tsx` deterministically BEFORE LLM fallback.

**Why:** CHART_PLACEHOLDER still fires in practice. v0.7.17 autofix is cosmetic (animated bar skeleton) — fallback, not prevention. A deterministic template for a known component = zero AI variance at the source.

**Target:** v0.7.20.

---
id: M3
type: idea
status: open
target: v0.7.20
effort: 2h
date: 2026-04-19
confidence: verified
---

### M3 — Auto-retry on validator fires

After Phase 6 (per-page generation), if validator flags critical issues (`CHART_PLACEHOLDER`, `FILTER_DUPLICATE`, `DOUBLE_SIGN`, `TABLE_COLUMN_MISMATCH`), re-prompt AI with "rule X was violated on lines A-B, fix only that part". Max 2 retries.

**Why:** Targeted re-prompt is cheap and effective per MODEL_PROFILE: "Re-prompting with 'fix ONLY X' after a failure is usually effective (one retry), sometimes two." Cleanly bounded, doesn't cascade.

**Target:** v0.7.20.

---
id: PJ-007-FIX
type: idea
status: resolved
shipped_in: [0.7.21]
target: v0.7.20
effort: 2h
date: 2026-04-19
confidence: hypothesis
---

### INCONSISTENT_CARD — cross-page consistency validator

Scan all pages, cluster stat-card-like structures, warn when clusters diverge. Resolves PJ-007.

**Why:** PJ-007 still `status: active`. `coherent check` validates individual pages — has no cross-page view. First cross-cutting validator.

**Target:** v0.7.20.

---
id: J2
type: idea
status: resolved
shipped_in: [0.7.20]
target: v0.7.20
effort: 30min
date: 2026-04-20
confidence: verified
---

### J2 — Journal retention policy

`.coherent/fix-sessions/` grows unbounded. Add `--keep-days N` flag to `coherent journal` + auto-prune after aggregation.

**Why:** Closes v0.7.18 loose end. 30-minute fix. Prevents disk bloat in long-lived projects.

**Target:** v0.7.20 (bundle with M7).

---
id: M2
type: idea
status: open
target: v0.7.21
effort: 2-3h
date: 2026-04-19
confidence: observed
---

### M2 — Pattern-based validator (AST)

Compare generated filter-bar / stat-card against golden template by AST structure, not regex. Catches what regex misses (e.g., correct classes in wrong hierarchy).

**Blocker:** requires AST parsing library choice (ts-morph vs Babel). Weighs ~500KB of deps.

**Target:** v0.7.21.

---
id: F10
type: idea
status: open
target: v0.7.21
effort: 1h
date: 2026-04-19
confidence: verified
---

### F10 — Plan retrofit for sharedComponents.usedBy

At end of Phase 2, cross-reference `pageNotes[].sections` and auto-extend `usedBy` of shared components with matching page types. Prevents AI from leaving out relevant pages.

**Why:** PJ-007 root cause was exactly this omission. Deterministic post-processing closes the gap.

**Target:** v0.7.21.

---
id: N1
type: idea
status: rejected
target: v0.7.21
effort: 15min
date: 2026-04-19
rejected: 2026-04-23
confidence: verified
---

### N1 — `coherent preview --page X`

Pass page route to preview, open browser directly to that URL.

**Why:** Small UX win; current flow opens root and requires nav.

**Rejected (2026-04-23):** not needed — nav cost trivial, dev server already auto-opens root.

---
id: N2
type: idea
status: open
target: v0.7.21
effort: 30min
date: 2026-04-19
confidence: observed
---

### N2 — `coherent diff`

Show last-chat backup vs current. Reuses existing `.coherent/backups/*` dirs.

**Why:** After a chat that changed many files, users want "what just happened" — scroll-back doesn't cut it.

**Target:** v0.7.21.

---
id: J1
type: idea
status: open
target: v0.7.21
effort: 2-3h
date: 2026-04-20
confidence: verified
---

### J1 — `coherent journal reflect`

Take top-N validators from `journal aggregate` and draft `hypothesis`-tagged PATTERNS_JOURNAL skeletons for human review. Closes the "raw data → wiki entry" gap.

**Why:** v0.7.19 ends at ranked raw data. Curator still copy-pastes into `wiki reflect`. Tight integration is the next natural step in the memory loop.

**Target:** v0.7.21.

---
id: W1
type: idea
status: open
target: v0.7.21
effort: 1h
date: 2026-04-20
confidence: observed
---

### W1 — Wiki retrieval hit-rate telemetry

Log what `coherent wiki retrieve` surfaces during chat, AND whether the retrieved snippets appeared in the final prompt. `--debug-retrieval` verbose mode.

**Why:** We don't currently know if retrieved wiki snippets actually influence generation. Without measurement, we can't tell if the TF-IDF layer earns its keep.

**Target:** v0.7.21.

---
id: W2
type: idea
status: open
target: v0.7.22
effort: 1h
date: 2026-04-20
confidence: observed
---

### W2 — Wiki stale-entry detector

Validators referenced in RULES_MAP but not found in code → flag. Versions cited in PATTERNS_JOURNAL beyond current → flag. SHA references in evidence that don't resolve via `git cat-file` → flag.

**Why:** Part of keeping the wiki honest. Currently link rot can accumulate silently.

**Target:** v0.7.22.

---
id: A1
type: idea
status: open
target: v0.7.20
effort: 2h
date: 2026-04-20
confidence: established
---

### A1 — ADR CI lint

Backfilled ADRs landed in wiki refactor (ADR-0002, ADR-0003). Add CI lint: when `package.json` minor bumps (0.7.X → 0.8.0), require a new ADR in the same commit or explicit `--no-adr-needed` annotation in commit message.

**Why:** CLAUDE.md already requires ADR for breaking/significant changes — but nothing enforces it. Backfill effort just proved enforcement isn't free.

**Target:** v0.7.20 (or later — lint is small; ADR backfill already done).

---
id: W3
type: idea
status: shipped
target: v0.7.21
effort: 30min
date: 2026-04-20
shipped_in: 0.7.31
shipped_date: 2026-04-23
confidence: observed
---

### W3 — `coherent wiki adr create` scaffold

Scaffold new ADR file with next sequential number, today's date, frontmatter template, Context/Decision/Consequences/Why-not sections.

**Why:** Every new ADR is hand-written. A scaffold ensures consistent frontmatter and reduces the friction that leads to skipping ADRs.

**Shipped (v0.7.31):** `coherent wiki adr create <slug> [--title <title>]`. Scans `docs/wiki/ADR/` for existing `NNNN-*.md`, writes next sequential number (zero-padded to 4 digits) with today's date and full skeleton (Context / Decision / Consequences / Why not alternatives / References). Rejects invalid slugs and slug collisions. Auto-creates `docs/wiki/ADR/` if missing.

---

## Deferred (longer-horizon)

---
id: M5
type: idea
status: deferred
target: v0.8.x
effort: 3-4h
date: 2026-04-19
confidence: hypothesis
---

### M5 — Dev-overlay with validator issues in preview

In `coherent preview`, overlay colored badges on the page showing live validator findings. Instant visual feedback.

**Blocker:** requires Playwright or iframe instrumentation.

---
id: M6
type: idea
status: deferred
target: v0.8.0
effort: 1-2h
date: 2026-04-19
confidence: verified
---

### M6 — Prompt caching via Anthropic cache-control

Mark design-constraints block as cacheable.

**Blocker:** AIProvider interface change (breaking). Needs design pass.

---
id: M9
type: idea
status: deferred
target: v0.8.x
effort: 2-3h
date: 2026-04-19
confidence: observed
---

### M9 — `coherent check --perf`

Runs `next build`, parses `.next/analyze/`, flags routes over 200KB.

**Blocker:** `next build` takes 30s+; UX concern.

---
id: M10
type: idea
status: deferred
target: v0.9.x
effort: 3-4h
date: 2026-04-19
confidence: observed
---

### M10 — Axe-core keyboard nav audit

`coherent check --a11y` runs Playwright + axe-core. Catches real tab-order and focus-trap issues.

**Blocker:** Playwright dep (~100MB).

---
id: M11
type: idea
status: deferred
target: v0.8.x
effort: 1-2h
date: 2026-04-19
confidence: hypothesis
---

### M11 — Dark mode consistency

Run validators in mocked dark-token mode; check that raw colors don't have missing dark variants.

---
id: M12
type: idea
status: deferred
target: v0.8.x
effort: 2-3h
date: 2026-04-19
confidence: hypothesis
---

### M12 — Cross-page consistency (general)

Extends INCONSISTENT_CARD to all repeatable structures (section spacing, hero pattern, nav shape).

---
id: N3
type: idea
status: deferred
target: v0.8.x
effort: 1h
date: 2026-04-19
confidence: observed
---

### N3 — `coherent revert --to v0.6.95`

Restore project files to state at a specific version tag.

---
id: N4
type: idea
status: deferred
target: v0.9.x
effort: 3-4h per template
date: 2026-04-19
confidence: observed
---

### N4 — Template starters

`coherent init --template saas | ecommerce | dashboard | blog`.

**Blocker:** needs template authoring discipline; starts small.

---
id: N5
type: idea
status: deferred
target: v0.8.x
effort: 1h
date: 2026-04-19
confidence: observed
---

### N5 — Slack/Discord webhooks on bug reports

When `coherent report-issue` is invoked, POST webhook.

**Blocker:** per-project config.

---

## Research / speculative

---
id: R1
type: idea
status: deferred
target: exploratory
effort: 4-6h
date: 2026-04-19
confidence: hypothesis
---

### R1 — Rule effectiveness tracker

Automatic pass: generate N test projects via real API calls, measure % of pages that pass each validator. Track trend across releases.

**Blocker:** API cost per measurement run.

---
id: R2
type: idea
status: deferred
target: future
effort: 1-2 weeks + cost
date: 2026-04-19
confidence: hypothesis
---

### R2 — Fine-tune a small model on Coherent-style output

Cheaper, faster inference for common patterns.

---
id: R3
type: idea
status: deferred
target: v1.0
effort: large refactor
date: 2026-04-19
confidence: hypothesis
---

### R3 — Design token OKLCH migration

Hex → OKLCH for perceptual uniformity. Currently in globals.css only; could extend to design-system.config.ts primary source.

---
id: R4
type: idea
status: open
target: v0.7.22
effort: 30min
date: 2026-04-19
confidence: observed
---

### R4 — Inject `.coherent/wiki/decisions.md` into every chat call

Already exists; currently under-used for styling consistency. Could inject into every chat call's prompt — closes per-project design memory loop.

**Why:** Design-memory system shipped v0.6.77 but integration with retrieval layer (v0.7.3-4) isn't verified end-to-end. Confirming it feeds the prompt unblocks the per-project loop.

---
id: R5
type: research
status: open
target: F9/Atmosphere pivot (pre-MVP)
effort: 4-6h (corpus read + pattern extraction)
date: 2026-04-23
confidence: observed
---

### R5 — TasteUI reference corpus for Atmosphere catalog

**Source:** https://tasteui.dev — `npx tasteui.dev add <user>/<skill>` installs `SKILL.md` to `.agents/skills/<user>/<skill>/`. 20 named aesthetics (neo-brutalist, Swiss, Paper, wabi-sabi, Obsidian-lime, luxury-editorial, midnight-editorial, zenith-ui, newsprint, solar-saas-ui, neon-velocity-ui, apex-ui, cosmos-ui, red-sun-ui, premium-ui, brutalist-editorial, warm-industrial, Elegant, Kinetic, brutalism-design).

**Format:** Plain markdown — visual philosophy, hex palette w/ semantic roles, typography, spacing/shadows/motion/components + rationales. Semantic-only injection (agent reads as reference). No structured tuple, no validators, no tier system.

**Strategic read:**
- Validates Atmosphere Engine pivot — 20 aesthetics on market = ceiling-problem real.
- They're ahead on catalog, behind on enforcement. Coherent's moat (validators + deterministic floor + tier-injection) stands.
- License unknown — cannot repackage.

**How to apply — reference corpus, NOT dependency:**
1. Read 10-15 SKILL.md files as research corpus.
2. Extract patterns: which names resonate, how `mood_phrase` reads, what's in a well-written palette-with-roles, which layout_archetypes cover the space.
3. Author **native Coherent Atmospheres** in the structured tuple format (typography_pair / color_system / spacing_ratio / motion_signature / layout_archetype / mood_phrase).
4. Seed the F9 MVP catalog with 8-12 atmospheres.
5. (Deferred) `coherent atmosphere import <tasteui-skill-url>` — ETL adapter SKILL.md → Atmosphere tuple — only if market pull.

**Risks of pulling directly:**
- Format mismatch (soft markdown vs typed tuple) → brittle parsing.
- Community-contributed = quality variance → dilutes "ship-quality by default".
- Semantic-only injection re-imports the very slop problem Coherent's validators solve.

**Related:** F9/Atmosphere pivot design doc (`feat/f9-deterministic-statschart` branch).

---
id: R6
type: idea
status: open
target: v0.8.x
effort: 3-4h
date: 2026-04-23
confidence: verified
---

### R6 — Run-record parity for skill-mode (`coherent prompt`)

**Source:** Discovered during v0.8.3 dogfood of `/coherent-generate` on a real Claude Code subscription session. Skill-mode path (`coherent prompt` → Claude writes files → `coherent check` → `coherent fix` loop) never writes `.coherent/runs/<timestamp>.yaml`. Only `coherent chat` (API path) instruments the run record.

**Why this matters:** Subscription users (the reason v0.8.0 skill-mode exists) are invisible to the telemetry surface that was the whole point of v0.8.2. "Did memory help?", `--mark-kept`/`--mark-rejected`, validator outcomes — all skip them. The moat (validator loop) demonstrably works for skill-mode users, but we have zero data to analyze it.

**Proposal — three options, ranked:**
1. **`coherent log-run` subcommand** called explicitly by the skill at end of its loop. Skill markdown gets a step 4: "Run `coherent log-run --intent '$ARGUMENTS' --pages '<files>' --outcome success`". Pros: stateless `coherent prompt` preserved, skill controls when. Cons: skill-drift risk if step skipped.
2. **`coherent prompt` writes a partial record** (intent, atmosphere, options, timestamp) with `outcome: pending`, then `coherent check` updates it with validator outcomes. Skill naturally completes it by running the existing commands. Pros: zero skill changes. Cons: `coherent check` becomes stateful.
3. **Leave stateless by design** — skill-mode is the stateless path, accept the telemetry gap. Rely on kept/rejected marks via aggregated CLI usage.

**Recommendation:** option 1. Cleanest separation of concerns. Update skill markdown in `packages/cli/src/utils/claude-code.ts` `COMMANDS['coherent-generate.md']` to add the log-run step, and ship a `coherent log-run` command that builds and writes a `RunRecord` from flags + disk reads (pages-written can be inferred from git status in the project root, validator outcomes from re-running `validatePageQuality`).

**Related:** v0.8.3 CHANGELOG "Known gap" note, `packages/cli/src/utils/run-record.ts`, `packages/cli/src/commands/prompt.ts`, `packages/cli/src/utils/claude-code.ts`.

---
id: M13
type: idea
status: open
target: v0.8.x
effort: 3-4h
date: 2026-04-23
confidence: verified
---

### M13 — DS tokens page: live CSS var reader by default

Scaffolded `/design-system/tokens/colors` page currently reads `design-system.config.ts` (JSON snapshot from scaffold time). When users customize brand by editing CSS vars in `globals.css` / `layout.tsx` — the recommended pattern — the snapshot goes stale silently. Result: the Coherent-generated DS page publicly contradicts the live UI. See **PJ-010**.

**Proposal:** Scaffolded DS tokens pages should treat **live CSS custom properties as source of truth**, not the config snapshot.

Implementation outline (inherits from landing-repo fix done 2026-04-23):
- Scan `document.styleSheets` for rules matching `:root` and `.dark`, extract `--*` custom properties.
- Config snapshot becomes a fallback only (e.g. when stylesheet scan returns empty due to CORS or missing sheet).
- Show a small "source: live stylesheet | config snapshot (fallback)" indicator so users and future-us can tell at a glance which path served the palette.
- Apply the same inversion to `/design-system/tokens/spacing` and `/design-system/tokens/typography` (same drift class — they read the same snapshot).

**Why:**
- Removes an entire class of silent drift between DS page and live UI — the drift that prompted PJ-010 would be structurally impossible.
- Aligns with how design tokens are actually authored in the wild (CSS vars + shadcn pattern), not an imagined "only mutate via `coherent chat`" discipline.
- Config can then shrink to metadata (token names, categories) without having to hold values.

**Complementary validator (optional):** `DS_TOKEN_DRIFT` — `coherent check` diffs `design-system.config.ts` values against `:root` / `.dark` rules in `globals.css` + inline `<style>` in `layout.tsx`. Warns on mismatch. Useful as a bridge while M13 is rolled out; can be retired once M13 ships and config-values are no longer the source of truth.

**Blocker:** None. Change is local to the page templates used by `coherent init` + `coherent scaffold`.

**Target:** v0.8.x.

---

## Meta-ideas (about the process)

- **Session memory bridging** — Claude Code memory at `~/.claude/projects/.../memory/` persists across sessions ON MY MACHINE. For contributors and other instances, they must read `docs/wiki/`. Keep both in sync. (2026-04-19)
- **Checkpoint discipline** — `/checkpoint` (gstack) before closing VS Code. Session 2026-04-20 lost context because no checkpoint. (2026-04-20)
- **Append-only principle** — when reconciling backlog (as in 2026-04-20 wiki refactor), annotate restructured entries with date + reason; don't silently rewrite. Re-reconciliation respected via `status: open/shipped/deferred` transitions. (2026-04-20)

---

## How to add a new idea

1. Pick an ID from the next free slot in the relevant cluster prefix (`F`, `M`, `N`, `W`, `J`, `A`, `R`).
2. Add YAML frontmatter:
   ```yaml
   ---
   id: <ID>
   type: idea
   status: open
   target: vX.Y.Z
   effort: <hours>
   date: YYYY-MM-DD
   confidence: hypothesis | observed | verified | established
   ---
   ```
3. Heading: `### <ID> — <Title>`.
4. Body: **Why** (rationale), optional **Blocker**, **Target**.
5. When shipped, move the frontmatter to `status: shipped`, move the entry under `## Shipped` (convert `###` to `####` to exclude from retrieval), add shipped-in version. Don't delete — keeps history.
