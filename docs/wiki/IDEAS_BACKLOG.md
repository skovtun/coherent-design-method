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

#### v0.10.0 — M14 skill-mode token-cost + UX optimization (2026-04-25)

- **Fenced ```tsx schema for anchor + page phases** — kills the JSON-escape failure class (the v0.9.0 dogfood 106-line `pageCode` rewrite). JSON header + ```tsx fenced block, parsed by splitting on the closing fence at end of input.
- **`PHASE_SKIP_SENTINEL` for empty components phase** — `prep()` writes empty artifact + emits `__COHERENT_PHASE_SKIPPED__\n`; skill body skips Write + ingest. Saves 3 tool calls per typical run.
- **Parallel page batching in skill body** — N parallel Bash calls per phase batch instead of strictly sequential. 12 turns → 3 turns for a 4-page run.
- **Progress lines** — `▸ [N/6] …` per phase replaces machine-speak.
- Bumped `PHASE_ENGINE_PROTOCOL` 1 → 2 (items 1 + 2 wire-incompatible).

#### v0.11.0 — M15 welcome-scaffold replacement + skill-rail layout parity (2026-04-25)

- **Welcome scaffold replaced with redirect** when first-chat plan has no `/` route. Both rails share the `replaceWelcomeWithPrimary` helper. Marker + signature detection, fail-closed on user-edits.
- **Skill rail Header / Footer / Sidebar redraw** via new `createLayoutApplier` — closes the gap where pre-M15 skill rail left welcome-scaffold chrome on top of generated pages.
- **Sidebar `navigation.items` populated** from generated app routes via shared `buildSidebarNavItems`. Append-only — preserves user-renamed labels.
- **Manifest scrub:** DSButton (Coherent platform FAB) no longer auto-registered into `coherent.components.json`. `coherent update` lazy-scrubs leaked entries from existing v0.9–v0.10 projects.
- Codex `/codex consult` ran on the M15 plan before implementation — caught two P1s that landed in the code as written: (1) `pickPrimaryRoute` filters init-seeded `/`; (2) sidebar route-group movement covered by explicit regression test.

---

## Open ideas

Each `###` block below is an indexable entry (wiki-index.ts scans `###` headings). Frontmatter above each heading supplies id/status/target/date for retrieval weighting and filtering.

> **Triage 2026-07-11** (annotation, not rewrite — per append-only principle). Many `open` items still carry `target: v0.7.20/21` — that's ~3 months stale as of v0.19.0. Recommended dispositions below; frontmatter left intact until a human confirms each call:
>
> - **R4** — RESOLVED this session (verified live). Moved to `status: resolved` above with evidence.
> - **Still valid, worth scheduling** (recommend keeping open, retargeting to vNext): **M3** auto-retry on validator fire (cheap, high-leverage), **F9** deterministic StatsChart (CHART_PLACEHOLDER autofix is still only cosmetic), **W1** retrieval telemetry (now the natural follow-up to R4 — proves whether injected memory *influences* output), **M6** prompt caching (seam friction dropped now that Tool 2 built a fresh Anthropic provider).
> - **Valid but dep-blocked** (keep, but note the gate): **M2** AST validator (needs ts-morph vs Babel call, ~500KB dep), **M10/M11/M12** (Playwright/axe deps).
> - **Likely superseded — verify then reject/close**: **W2** wiki stale-entry detector (much may already be covered by `coherent wiki audit` — confirm overlap before building), **F10** plan-retrofit `usedBy` (check whether v0.11 `buildSidebarNavItems` / reuse-planner work already closed the PJ-007 root cause).
> - **Nice-to-have, no urgency**: **N2** `coherent diff`, **J1** `journal reflect`, **A1** ADR CI lint.
> - **Strategic direction** (the real "copy styles" answer, see review): **R9** reference retrieval + **R8** structured anchor — both gated on **R7** benchmark harness for honest measurement. R7 is the unlock for grounding all of the above in data instead of vibes.

---
id: R10
type: idea
status: open
target: before flipping `--llm` to default
effort: 3-4h
date: 2026-07-11
confidence: verified
---

### R10 — B-2b eval gate: context-authored ground truth (the eval is the weak link, not the labeler)

**Source:** First real B-2b eval run, 2026-07-11 — 109-file Blade app, 1077 clusters, ~$2.26, 21.5 min. Raw gate came back `BLOCKED` (2/23 pass, 21 major). Manual inspection of all 21 "failures": **true mislabels ≈ 0-2.** The gate failed for two structural reasons, not label quality:

1. **Token-only ground truth vs context-aware labels.** `expected.json` `acceptable_labels` were authored from *token signatures alone*; the LLM labels from *code samples + DESIGN.md*. Context-derived labels are richer than any token-only guess and still miss — e.g. cluster `grid grid-cols-a1a` → LLM `"Label-Dotted-Line-Value Row"` (semantically correct, `a1a` = auto/1fr/auto = label|leader|value) vs my shallow `"Grid Layout"`.
2. **Exact-string match punished phrasing variance.** `"Form Input Field"` vs accepted `"Form Field"`, `"App Layout Shell"` vs `"App Layout"`, `"Muted Caption Text"` vs `"Muted Caption"` — all counted major.

**Shipped partial fix (2026-07-11):** `eval.ts` `matchesAny` is now fuzzy — exact OR phrase-superset OR token-Jaccard ≥ 0.6. Rescues phrasing variance without rescuing genuinely-different labels ("Wrong" vs "Correct" still fail). 3 new eval tests.

**Still open (the real fix):** fuzzy match is necessary but NOT sufficient — the gate stays conceptually blocked because ground truth is still token-derived. A valid gate needs `acceptable_labels` authored from the SAME context the LLM sees (human review of real usage, or an LLM-judge scoring semantic adequacy against the code sample), per codex's original "human curates expected.json" intent. Until then, `--llm` stays opt-in (also correct on cost-footgun grounds — see CHANGELOG). Re-run costs ~$2.26; do it once after the ground-truth authoring is fixed.

**2026-07-13 update — harness SHIPPED, authoring in progress.** Codex consult (6 verdicts, 3 P1s) reshaped the design:

1. Split gate: representative set (seeded stratified sample, ≤20% major) + separate **zero-tolerance hard-case suite** (`hard_case: true`) — a combined 25-case gate could pass with all known-hard cases failing.
2. Authoring tooling = dev-only tsup entry `dist/eval-authoring-cards.js` (no bin/commander/docs); refuses to write cards inside the public repo.
3. LLM-judge NOT built: Sonnet-judging-Sonnet has correlated bias; human context-authored truth suffices for the flip.
4. F13 eval support: `must_be_generic` per-case flag with ASYMMETRIC matching (extra qualifiers fail even where symmetric superset/Jaccard would pass); each failure individually major.
5. cluster_ids are NOT committable (unsalted sha256 of low-entropy signatures, dictionary-recoverable) — expected.json + cards live in the pilot project, referenced by absolute `--eval` path.
6. This is a **versioned pilot gate** (`meta.corpus`/`eval_version` in expected.json), not a permanent benchmark; held-out multi-project suites are future work. Also fixed: eval now actually checks confidence (`max_confidence` → minor), matching the docstring's claim.

Remaining: author `acceptable_labels` from the generated cards (28 cases: 3 hard + 25 representative, seed 42) → paid re-run (~$2.26) → flip decision.

**Target:** before any future attempt to flip `--llm` to default.

---
id: F13
type: idea
status: open
target: B-2c / next cluster prompt revision
effort: 1-2h
date: 2026-07-11
confidence: observed
---

### F13 — LLM over-specializes high-frequency generic utility clusters

**Source:** Same 2026-07-11 B-2b run. The one genuine label-quality signal (vs the eval-methodology noise in R10): the labeler names a **high-occurrence generic utility cluster after a single observed usage context**. Examples:

- `text-grey_light_text` (47 occurrences) → `"Breadcrumb Separator"`
- `container … text-sm` (23 occurrences) → `"Page Breadcrumb Nav"`
- plus two more breadcrumb-themed labels on generic flex/text utilities.

Breadcrumbs are genuinely pervasive in the pilot app (28 files, NOT a DESIGN.md hallucination — DESIGN.md has 0 "breadcrumb" mentions), so the LLM saw real breadcrumb usage. But a class used 47× across the app is almost certainly generic muted text used in many contexts; naming the whole cluster after one usage is too narrow.

**Proposal:** in the cluster-labeling prompt, add guidance: for clusters with high occurrence count (or many distinct source files), prefer the **general role** over a specific usage-derived name — reserve specific/semantic names for low-occurrence, single-context clusters. Occurrence count and file-spread are already in the cluster signature, so this can be conditioned deterministically in the prompt.

**Blocker:** validate against R10's fixed eval so we don't tune the prompt against a broken measurement.

**2026-07-13 update:** the MEASUREMENT side landed with R10's eval v2 — `must_be_generic` cases with asymmetric matching encode exactly this failure class, and the hard-case suite is zero-tolerance, so an unfixed F13 now BLOCKS the `--llm` flip by construction. Still open: the prompt-side fix itself (expose occurrence count + distinct-file spread to the labeler — codex noted the model currently receives neither — plus generic-role guidance for high-spread clusters).

**2026-07-14 update — prompt fix IMPLEMENTED (`labeler-v2`), awaiting validation run.** The 2026-07-14 eval run (r10-v2.1, first on the fixed harness) confirmed the diagnosis: representative suite passed 23/25 (8% major vs 20% gate), and the ONLY remaining failures were 3 F13-class over-specializations ("Breadcrumb Separator" on the 47×/25-file subtle-text token, "Breadcrumb Current Page Item", "Block Label Wrapper"). Shipped in `labeler-v2`: `occurrences` + `distinct_files` in the compact payload, explicit scope rule (≥15 occ AND ≥8 files → general role, NEVER observed usage), 2-4-word label-brevity preference (user request 2026-07-14), third exemplar teaching the rule on a NEUTRAL example (footer copyright → "Muted text" — deliberately not an eval case, no teaching to the test). PROMPT_VERSION bump invalidates the whole cache: validation re-run costs full ~$2.5. **Flip `--llm` default when that run passes both suites.**

**Target:** next cluster prompt revision, after R10's expected.json is authored.

---
id: F14
type: idea
status: open
target: vNext, AFTER R10 + B-2c (codex sequencing verdict)
effort: ~1 week (v1 codex-cut scope; full original scope was 3-4 weeks)
date: 2026-07-12
confidence: codex-gated (GO-WITH-CHANGES, 2026-07-12)
---

### F14 — DESIGN.md as INPUT: Stitch-format import (`coherent import design`)

**Source:** 2026-07-12 review of `voltagent/awesome-design-md` (101k stars, #150 on GitHub, MIT): 73 DESIGN.md files extracted from real brand sites (Linear, Stripe, Vercel...). DESIGN.md is Google Stitch's concept — a plain-markdown design system that AI agents read — and is becoming a de-facto standard.

**Gap:** v0.18 (ADR-0008) ships DESIGN.md as OUTPUT only. Input is URL-only via `coherent extract`. Missing piece: parse an external Stitch-format DESIGN.md into coherent tokens (atmosphere seed).

**Why on-thesis (vs the rejected 21st.dev integration, 2026-07-11):** 21st.dev = raw markup → re-imports slop, bypasses the validator. awesome-design-md = design DECISIONS (color/typography/spacing tokens + prose rationale) — exactly what `extract` already treats as first-class input. The corpus is pre-extracted, MIT, community-maintained.

**v1 scope (codex-cut, GO-WITH-CHANGES 2026-07-12):**
0. **Grammar priority amendment (platform plan, 2026-07-12):** the parser's FIRST supported grammar is the **Coherent extract format** (our own serializer output — gallery M1 files depend on it); the Stitch grammar is the second target. Also reads an optional site-injected `source:` frontmatter token for gallery attribution.
1. Standalone `coherent import design <file>` with mandatory `--dry-run` support. NO `coherent chat --design` in v1 — codex finding: `Atmosphere` carries only coarse descriptors + `primaryHint` (`split-generator.ts:525`); an exact imported palette routed through chat would be silently discarded while appearing to work.
2. Dedicated partial `ImportedDesignSeed` schema — do NOT force Stitch data through `ExtractedDesignTokensSchema` (`url-extract/types.ts:232` requires ~20 categories Stitch lacks: shadows, motion, breakpoints, focus rings...).
3. Colors + font-family ONLY in v1. Keep existing spacing/radius/status colors/dark theme unless explicitly present in the file. Excluded from v1: dark-mode synthesis, role-scale typography mapping (their per-role px → our fixed `xs`–`4xl` is lossy/ambiguous), prose interpretation.
4. Import = atomic config patch + CSS regeneration into an initialized project (backup + diff; do not silently use cwd like the Figma importer).
5. Mandatory mapping/repair report: imported / mapped / synthesized / dropped / repaired per token. Minimum-usable-fields threshold — fail nonzero below it ("fail soft per-section" alone can report success after importing nothing).
6. Safe YAML: no custom tags/aliases/merge bombs, file-size + depth limits.

**Codex reuse-claim corrections (encode before implementing):**
- `token-normalizer.ts:172` dedupes already-structured tokens — it does NOT map external names, complete missing tokens, derive themes, or validate contrast. New adapter code, not reuse.
- No "extract font fallback policy" exists — extract just records observed font-family strings (`computed-style-extractor.ts:175`). Fallback policy must be designed fresh.
- Target vocabulary correction: `ColorTokenSchema` (`types/design-system.ts:24`) has no `card`/`surface` tokens — mapping target is `primary/secondary/4 status/background/foreground/muted/border`.
- Validation gap: Zod checks hex syntax only; no WCAG contrast validation between token pairs exists; foreground derivation is a crude luminance threshold (`tailwind-version.ts:42`). **Contrast repair policy DECIDED (user, 2026-07-12): accept-with-warning.** Imported palette is preserved as-is (fidelity wins); failing token pairs produce a warning in the import report AND a persistent recommendations note in the generated design-system output (e.g. "foreground/background 3.2:1 — below AA 4.5:1, suggest #XXX"). No silent repair, no rejection.

**Deferred (were in the original sketch):**
- `coherent chat --design` — needs a real exact-token injection path first (post-v1).
- Output alignment with the Stitch shape — separate project, NOT bundled. Codex: two different serializers already exist (`cli/utils/design-md.ts:19` vs `core/url-extract/design-md-serializer.ts:40`); changing output during R10/B-2c would mutate cluster prompt context mid-evaluation; the listing/distribution upside is speculative. **Strategy DECIDED (user, 2026-07-12): superset, not mere compliance** — our output becomes a valid Stitch core (frontmatter + colors/typography maps) PLUS Coherent extension sections (atmosphere, voice, pages, CID components); ambition: "our file is stronger than Google's." Includes spec version pin in frontmatter + a spec-change watch (Stitch is `version: alpha` and will move). Timing unchanged: after R10 + B-2c close; also gates gallery scale-up (M2 in the 2026-07-12 platform design doc).

**What NOT to do:** don't vendor the 73 files into this repo — trade-dress gray zone on brand styles, staleness, and MIT-on-the-repo ≠ rights to a brand's design language. Users bring their own file; publication risk stays with VoltAgent/the user.

**Sequencing:** after [[R10]] and B-2c (avoid changing DESIGN.md context mid-evaluation).

**Source:** 2026-07-12 codex pre-implementation consult (session `019f585a`, ~1.13M tokens), verdict GO-WITH-CHANGES. Original 1-2 week estimate judged dishonest for full scope (3-4 weeks); v1 cut ≈ 1 week.

**Target:** vNext, after R10 + B-2c.

---
id: M15F
type: idea
status: open
target: v0.12
effort: 3h
date: 2026-04-25
confidence: medium
---

### M15F — Carry-forward items from v0.11.0 ship (M15 follow-up)

Surfaced during v0.10/v0.11 dogfood, intentionally cut from M15 to keep the PR focused. Triage candidates for the next milestone.

**1. AppSidebar manifest filter — open product call.** M15 filtered DSButton (Coherent platform FAB) but left `AppSidebar` registered as a shared component. Open question: is AppSidebar "user's component" (they ask for a sidebar, get one — visible in `/design-system` viewer) or "platform widget" (Coherent generates from their config — hidden)? If platform widget, extend `PLATFORM_INTERNAL_NAMES` in `component-integrity.ts`. If user component, document why DSButton was special. Probably the former — AppSidebar represents an actual UI element of the user's app.

**2. Nav-items removal-on-page-delete.** `buildSidebarNavItems` is append-only, mirroring API rail's pre-M15 behavior. Delete a page — its sidebar entry stays until the user hand-edits `design-system.config.ts`. Potential fix: add a sweep step in `coherent fix` that drops items whose route doesn't match any registered page. Risk: trampling user-curated entries. Solve by gating on auto-source markers.

**3. Welcome-scaffold signature substring cleanup.** Current detection in `welcome-replacement.ts` falls back to substring signatures (`Describe an app.`, `useState<Mode>`, etc.) for v0.9–v0.10 backfill. Frozen for the v0.11 rollout window per codex P2 #4. Once v0.11 has propagated for a release window (call it v0.13+), remove the signatures and rely on marker-only detection. Saves ~30 lines of fragile string matching.

**4. Layer leak: phase-engine appliers import command-layer `regenerateLayout`.** Codex P2 #3 — accepted for M15. Long-term clean-up: extract `regenerateLayout` to a layer that both rails own, e.g. `utils/layout-regen.ts`. Not urgent unless future layout work forces it.

**5. CI publish auth verified — first end-to-end test on next release.** v0.11.0 ship added `NPM_TOKEN` Granular Access Token with "Bypass 2FA when publishing" to repo secrets. Verified during the cycle (run 24925811309) — auth works; failed only on "version 0.11.0 already published" because v0.11.0 was hand-published mid-cycle. Next release (v0.11.1 or v0.12.0) is the actual end-to-end CI publish test.

**6. DSButton FAB — product decision still open.** M15 took the manifest-filter option. Two alternatives stay valid for v0.12+: hide DSButton in the `/design-system` viewer (manifest stays clean for new entries but old auto-registered ones still need scrub on update — already shipped); drop the FAB entirely in favor of explicit user navigation to `/design-system`. Worth a 5-min product call before shipping additional manifest hygiene.

**Effort estimate:** 3h split across items. Items 1, 2, 5 are smallest (each ~30 min); items 3, 4, 6 deserve standalone PRs.

---
id: M14
type: idea
status: resolved
shipped_in: [0.10.0]
target: v0.10
effort: 6h
date: 2026-04-25
confidence: verified
---

### M14 — Skill-mode rail token-cost + UX optimization (post-v0.9.0)

Source: `/ultraplan` proposal validated against codex consult. v0.9.0 dogfood: 4-page generation took 7m42s with 17+ visible Bash calls and a 106-line `page-settings-response.md` rewrite due to JSON-escape failure inside `pageCode`. The four targeted fixes:

**1. TSX out of JSON via fenced ```tsx (biggest win — kills the JSON-escape failure class).**
- `prompt-builders/page.ts` — change output contract: model returns JSON header (id, name, route, layout, ...) followed by ```tsx fenced code block. No more pageCode-as-escaped-string.
- `phases/page.ts` ingest() — split rawResponse on `^{...}\n+\`\`\`tsx\n(.*)\n\`\`\`$`, attach TSX as `request.changes.pageCode`. Keep legacy fallback (try JSON.parse first, use as-is if `pageCode` present) for one release so older skill markdown still works.
- New tests: `page.fenced-tsx.test.ts` covering corner cases (TSX with embedded ``` , leading ```json fence before header, empty TSX).

**2. PHASE_SKIP_SENTINEL for empty components phase.**
- v0.9.0 already has a one-line prompt when sharedComponents is empty, but the skill body still does Read + Write + ingest (3 wasted tool calls per run). Cleaner: `prep()` writes empty `components-generated.json` and returns `'__COHERENT_PHASE_SKIPPED__\n'` to stdout. Skill body instructs Claude to detect sentinel and skip Write+ingest entirely.
- `phase-engine/phase.ts` — export the constant.
- Update SKILL_COHERENT_CHAT step 5: "if first Bash output is exactly the sentinel, jump to step 6".

**3. Parallel page batching in skill body.**
- Doc-only change. Tell Claude in step 6 to issue N parallel Bash calls for `_phase prep page:<id>` in one message, then N parallel Write calls for response files, then N parallel ingest Bash calls. CLI is already idempotent per-id, no logic change needed. 12 turns → 3 turns for a 4-page run.

**4. Progress lines in skill body.**
- Pure UX. Mini-section telling Claude to print one line per phase: `▸ [1/6] Planning pages…`, `▸ [4/6] No shared components — skipping`, `▸ [5/6] Generating /balance, /transactions, /settings in parallel…`. Replace current "Plan ingested. Anchor prep." machine-speak.

**Bumps `PHASE_ENGINE_PROTOCOL` 1→2** because items 1+2 are wire-incompatible. Existing projects need `coherent update` to refresh `.claude/skills/coherent-chat/SKILL.md`. The protocol-mismatch error E004 fires on stale skill.

**NOT in this milestone:** dropping the `> *-prompt.md` redirect (codex consult-2 noted Bash stdout truncates large outputs; prompts are 1245+ lines for anchor with full bundle, risky).

**Verification gates before ship:**
- Real run on the dogfood scenario (4 Russian pages: dashboard/balance/transactions/settings) reproduces the v0.9.0 7m42s baseline → expect ≤ 4 minutes wall time, no Settings JSON retry, ≤ 10 visible Bash calls.
- Tier 1 parity harness stays green (chat rail + skill rail share `createPagePhase`).
- `coherent check` after end produces score ≥ existing 78/100.
- Backward compat: legacy JSON-with-pageCode still ingests via fallback branch.

**Why deferred from v0.9.0:** v0.9.0 is already validated, committed, pushed (PR #40). Shipping it gives a clean baseline to measure M14's actual wall-time + tool-call reduction against. Bundling M14 into v0.9.0 risks regressions on a release that's already proven.

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
status: resolved
target: v0.7.22
effort: 30min
date: 2026-04-19
verified_date: 2026-07-11
confidence: verified
---

### R4 — Inject `.coherent/wiki/decisions.md` into every chat call

Already exists; currently under-used for styling consistency. Could inject into every chat call's prompt — closes per-project design memory loop.

**Why:** Design-memory system shipped v0.6.77 but integration with retrieval layer (v0.7.3-4) isn't verified end-to-end. Confirming it feeds the prompt unblocks the per-project loop.

**Resolved (2026-07-11) — VERIFIED LIVE end-to-end.** Traced the full loop in the live `coherent chat` path:
- **Write:** `split-generator.ts:1040-1041` → `extractDecisionsFromCode(finalPageCode)` → `appendDecisions(...)` → `utils/design-memory.ts:100-110` writes `.coherent/wiki/decisions.md` (best-effort try/catch, won't abort generation).
- **Read + inject:** `split-generator.ts:857` reads via `formatMemoryForPrompt(readDesignMemory(projectRoot))`, placed as last element of the per-page prompt array at `:969`, assembled into the real `parseModification(...)` AI call at `:976`. Same behavior in the extracted `phase-engine/prompt-builders/page.ts:74,113`.
- **Second live consumer:** `coherent prompt` (`commands/prompt.ts:60`, injected at `:353-359`).
- **Timing (correct by design, not a bug):** read happens once before the parallel page loop, so a run injects *prior*-run decisions while appending *current*-run decisions for the next run. Cross-run memory loop is genuinely closed.

No action needed — the loop works. If we want proof it *influences output* (not just that it reaches the prompt), that's **W1** (retrieval hit-rate telemetry), still open.

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
id: M17
type: idea
status: open
target: post-PR2 (after applyRequests pipeline + chat.ts facade ship)
effort: 0.5h
date: 2026-04-25
confidence: verified
---

### M17 — Share DSM/CM/PM construction across appliers via `ArtifactApplierContext`

**Source:** Eng-review of `docs/plans/2026-04-25-skill-rail-architecture-review.md` (skill-rail architecture decision). Surfaced as performance side-finding.

**Current state:** Each applier in `phase-engine/appliers.ts` re-instantiates `DesignSystemManager` / `ComponentManager` / `PageManager` and calls `dsm.load()`. With 7 entries in `defaultAppliers()`, that's 7 disk reads + parses of `design-system.config.ts` per session-end. See appliers.ts:206-210, repeated in `createConfigDeltaApplier`, `createComponentsApplier`, `createPagesApplier`, `createReplaceWelcomeApplier`, `createLayoutApplier`, `createFixGlobalsCssApplier`.

**Why this matters:** Not a perf bug today — `design-system.config.ts` is small, parse is sub-ms. But it's a constant tax on every session-end and grows linearly with applier count. After PR2 lands ADR-0005 (chat.ts facade), `sessionStart` becomes the natural place to load the trio once and seed it into `ArtifactApplierContext`. Appliers read the seeded value instead of re-loading.

**Proposal:**
1. Extend `ArtifactApplierContext` (`phase-engine/session-lifecycle.ts:83`) with `dsm: DesignSystemManager`, `cm: ComponentManager`, `pm: PageManager` fields.
2. `sessionStart` constructs them once after config snapshot, attaches to context.
3. Appliers drop their inline `new DesignSystemManager(configPath); await dsm.load()` blocks.
4. Mutation appliers must call `applyManagerResult(ctx.dsm, ctx.cm, ctx.pm, newConfig)` (already extracted to `apply-requests/managers.ts` per plan) so cross-applier mutations stay synchronized.

**Blocker:** Depends on PR2 landing first — PR2 finishes the facade refactor that makes `ArtifactApplierContext` the canonical seam between rails. Doing this before PR2 means edits to ctx shape that PR2 then re-edits.

**Target:** post-PR2 cleanup, ~30 min CC+gstack.

---
id: R7
type: idea
status: open
target: vNext (multi-quarter)
effort: 1-2 weeks initial harness; ongoing
date: 2026-05-06
confidence: methodology-proven
---

### R7 — Anti-slop benchmark harness (stratified multi-domain)

Codified methodology for measuring generation quality across domains. Avoids the n=1-then-overconfident-conclusions trap (which session 2026-05-06 walked into and codex challenge mode caught).

**Methodology:**
1. Stratified prompts spanning domains where CDM is likely weakest: B2B logistics, healthcare scheduling, legal intake, construction field ops, etc. Generic SaaS (CRM/dashboard/auth) gets the SaaS-template-friendly verdict for free; the test is whether CDM holds up outside.
2. Each prompt declares **core entities** + **primary workflows** explicitly so the bench can verify domain-vocab adoption + workflow-to-page mapping.
3. Detectors layered:
   - Existing `quality-validator.ts` (already covers 60+ types — surface, hierarchy, state, accessibility, content-quality)
   - Anti-slop scan script (`/tmp/anti-slop-scan.sh` 2026-05-06 prototype) — visual surface tells codex named: 4-stat-row, bento, "Built for X", buzzwords, fake-headshot testimonials, decorative gradients
   - State-design coverage: `disabled={...}`, `useOptimistic`, AlertDialog confirms, empty states (validator already detects, harness measures coverage at scale)
   - Card-overuse ratio: `<Card>` count / total structural-element count — possible "Everything is a Card" signal at scale
4. Comparative baselines: same prompt against v0, Bolt/Lovable, raw Claude (no CDM) — codex's strongest critique was that "no slop tells" doesn't equal "doesn't look AI-generated"; pairwise human/LLM ranking against external baselines closes that loop.
5. Behavioral runs (Playwright): primary user flow per app boots without runtime errors, navigation works, forms submit.

**Empirical proof methodology works:** session 2026-05-06 ran 4 stratified prompts × ~$13 API spend. Found:
- 1 critical bug (multi-page domain detection, fixed in PR #105 — domain-specific app prompts like "logistics dispatcher" routed to single-page modification rail)
- 2 systemic gen-time gaps (NO_EMPTY_STATE + STUCK_ON_SELECTION not promoted to errors, fixed in PR #106)
- 1 validator regex leak (banned names in JSX text content, fixed in PR #104)
- Refuted peer-2's "font/icon swap = top ROI" claim (CDM already mandates Lucide, no Inter usage)
- Refuted codex's "CDM degrades on specific domains" claim (real freight terminology generated cleanly)

**Why R-prefix not F:** harness is research infrastructure, not a user-facing feature. It informs which F/M items ship, in what order. Output: data-grounded roadmap instead of vibes-grounded roadmap.

**Effort:** Initial scaffold ~1 week (12-prompt corpus, Playwright integration, detector AST upgrade, comparative baselines). Then ongoing — every release runs the harness against current `coherent chat` to catch quality regressions.

**Blocker:** Requires API budget per run (~$50-100 for 12 prompts × 3 outputs). Worth it pre-major-release; not worth it nightly.

**Source:** Session 2026-05-06 anti-slop discussion + codex consult (medium reasoning) + codex challenge (high reasoning, demolished n=1 conclusions).

---
id: R8
type: idea
status: deferred
target: vNext (post-R7)
effort: 1-2 weeks
date: 2026-05-06
confidence: codex-recommended
---

### R8 — Structured anchor contract (not string field)

Per codex consult 2026-05-06: peer-recommended `anchor: string` field is overstated — adding a string to config is just a longer prompt. Real paradigm shift is anchor as a **structured, testable design contract**:

```ts
anchor: {
  thesis: string             // workflow assertion ("density-as-trust for high-frequency expert comparison")
  references: string[]       // physical-world refs ("Bloomberg Terminal", "DOT signage")
  refusals: string[]         // SaaS defaults to refuse ("4-stat-card row", "centered hero")
  density: 'compact' | 'comfortable' | 'spacious'
  interactionModel: 'keyboard-first' | 'touch-first' | 'mouse-with-shortcuts'
  dataArtifacts: string[]    // domain-specific layouts ("invoice", "manifest", "BOL")
  layoutGrammar: 'asymmetric-editorial' | 'symmetric-dashboard' | 'industrial-grid'
  copyRules: { ban: string[]; require: string[] }
  detectors: string[]        // 3-5 measurable patterns that prove anchor adherence
}
```

**Path:** anchor field → compiled constraints → generated anchor page → screenshot audit against anchor → repair loop on drift.

**Why deferred:** Big concept shift, deserves ADR. Should land AFTER R7 benchmark harness — without measurement we can't prove structured anchor outperforms current atmosphere system. Otherwise it's vibes-vs-vibes again.

**Source:** Session 2026-05-06 codex consult identified this as "the 10x lever" (vs font/icon swap which codex called "fake leverage").

---
id: R9
type: idea
status: deferred
target: vNext (post-R7, multi-quarter)
effort: 4-8 weeks
date: 2026-05-06
confidence: codex-flagged-as-competitive-threat
---

### R9 — Reference retrieval before generation (Refero-style)

Codex 2026-05-06: "A constraint system without references risks becoming a taste rulebook. A constraint system plus retrieval plus rendered audit is defensible."

Refero.styles is positioned as the strategic threat — they sell **real product screens + flows for agents to study before building**. Their public positioning is "real design taste" via real screens, not anti-pattern bans. If Refero ships code generation + validators, they invade CDM's thesis from the stronger taste side.

**Proposal:** Curated reference packs per atmosphere/domain. At chat time, retrieve 3-5 real product screen examples (HTML + CSS, not images) matching the request — inject as inspiration context for generation. Different from cargo-cult (we don't copy structure) — closer to "show, don't tell" prompting.

**Why deferred:** Multi-quarter scope. Requires:
- Reference corpus curation (hundreds of real apps tagged by domain/density/atmosphere)
- Retrieval index (semantic embeddings + filtering)
- Prompt-injection budget (token cost trade-off)
- Legal/licensing for using real product screens

**Why important enough to track:** Per codex, this is the **highest-leverage anti-slop move** — but we can't ship it cheaply. Document as the long-term direction so we don't drift toward incremental fixes that miss the strategic threat.

**Source:** Session 2026-05-06 codex consult flagged Refero as the most strategically relevant competitor (more so than v0 / Aura / Galileo).

> **Update 2026-07-12:** the "reference corpus curation" economics changed. `voltagent/awesome-design-md` (101k stars, MIT) provides 73 brand-extracted DESIGN.md files, community-maintained — a design-DECISIONS corpus (tokens + prose), not screens. It does not replace R9's screen-level retrieval, but an F14-style DESIGN.md import gives a cheap R9-lite: retrieval-by-user-choice (the user picks the seed file) with zero curation cost and no legal exposure on our side. Also note Google Stitch pushing DESIGN.md as a standard changes the competitive frame R9 was written in (Refero's DESIGN.md output is now one of several). R9 stays deferred; re-evaluate scope after [[F14]].

---
id: F11
type: idea
status: resolved
target: v0.19.0
effort: 4-6h
date: 2026-05-06
fixed_in: [0.19.0]
confidence: empirical-n3
---

### F11 — `disabled={...}` enforcement on mutating buttons

Benchmark scan 2026-05-06: **0 instances of `disabled={...}` across 171 .tsx files** (test-projector 64 files + logistics-dispatch 72 + 35 from baseline run). Generated apps don't disable buttons during pending mutations — every form/action ships without the basic "click guard" that prevents double-submit.

**Shipped (v0.19.0):** Validator rule `BUTTON_NO_DISABLED_ON_MUTATING` at `severity: 'error'`. Detects:
1. Inline async onClick: `<Button onClick={async () => ...}>`
2. Submit button in a form with onSubmit on the same page

Skip rules: `variant="link"`, `asChild`, already-disabled, explicit `data-no-disable-needed` opt-out. Tag scanner walks brace/string depth (handles `=>`-in-attrs corruption hazard).

Plus rewrite of LOADING STATES section in `INTERACTION_PATTERNS` — soft prose → HARD RULE with canonical useTransition + local-pending-flag patterns. AI generates with disabled proactively now, validator enforces on retry.

11 unit tests added; full suite 2113 → 2124. See PJ-015.

**Source:** Session 2026-05-06 benchmark gap-analysis. Codex consult correctly identified state design as real lever (vs visual surface which is already solved).

---
id: F12
type: idea
status: deferred
target: post-F11 + R7 measurement
effort: 8-12h
date: 2026-05-06
confidence: empirical-n3-but-may-be-domain-specific
---

### F12 — Optimistic UI / `useOptimistic` pattern coverage

Same n=3 scan: **0 instances of `useOptimistic` / `useTransition` / `startTransition` across 171 files**. Codex flagged this as part of state-design gap.

**Why deferred (not F11):** A static marketing page should not need optimistic rollback. Some legitimate domains (forms with server validation, payment flows) actively SHOULDN'T optimistic-render. Per codex challenge: "regex-weak and context-free — A static marketing page should not need optimistic rollback. A CRUD table probably should."

**Gate harder than F11:** Only fire on app-page mutations against entity tables/lists where the mutation is idempotent (delete, status-toggle). Probably needs LLM-classifier in validator, not pure regex. Out of scope without R7 benchmark to validate the rule doesn't false-fire.

**Blocker:** R7 measurement first. Otherwise we ship a rule that flags things AI can't fix → infinite retry loop fallback.

**Source:** Session 2026-05-06 benchmark.

---
id: M18
type: idea
status: resolved
target: v0.19.1
effort: 1-2h
date: 2026-05-06
fixed_in: [0.19.1]
confidence: validated
---

### M18 — AST-based validator-rule extraction for auto-generated wiki

Discovered 2026-05-06 while writing PR #106: comments placed BETWEEN `type:` and `message:` inside `issues.push({...})` broke the regex in `scripts/generate-rules-map.mjs:54` — affected types silently disappeared from RULES_MAP.md (auto-generated wiki).

**Shipped (v0.19.1):** Migrated `extractValidatorTypes` from regex to TypeScript AST walk. Finds every `ObjectLiteralExpression` with both `type` and `message` properties regardless of comment placement, key order, surrounding wrapper (issues.push, push(...arr), helper return), or template-literal substitutions. Side benefit: messages with `${...}` interpolations now render with `…` placeholders instead of being truncated at the first quote.

10 unit tests cover the regression cases plus general AST shape:
1. Basic `issues.push` — extracted.
2. Comments BETWEEN type and message — extracted (the original M18 case).
3. Template literal without substitutions — extracted as plain text.
4. Template literal with substitutions — head + spans rendered, interpolations as `…`.
5. Object missing type or message — skipped.
6. Lowercase / dash-cased type values — rejected.
7. Duplicate types — first occurrence wins.
8. Rules nested inside helpers and conditionals — found.
9. Long messages — truncated to 140 chars for table-cell readability.
10. Constraint-block extractor — sanity check (regex retained, separate concern).

Same 41 validator types reported on real code; regex and AST agree on shape but AST renders messages more readably.

**Source:** Session 2026-05-06 PR #106 first-commit had comments inline; auto-rebuild silently dropped 3 types from RULES_MAP. Caught by `git diff` review before push, fixed by amend.

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
