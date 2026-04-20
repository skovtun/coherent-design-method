# Patterns Journal

Append-only log of AI-output failure patterns observed in the wild, their root causes, and the rules / validators / patterns we added in response.

Purpose:
- Stay honest about what Coherent's rule system catches vs what slips through.
- Make recurring AI-output failure modes visible so we don't re-derive solutions.
- Show future contributors (and future-me) why a rule exists.

Format: most recent entries first. Each entry links the screenshot / transcript if available.

---

## 2026-04-19 → 2026-04-20 · session notes

### PJ-001 — Nested bordered containers ("card-in-card")

**Observed:** `~/test-app` Budget Progress section rendered three nested border+shadow layers (section card > wrapper div.border.rounded.shadow > individual Card items). Triple visual border, horizontal crowding.

**Root cause:** No explicit anti-pattern in CORE_CONSTRAINTS about nested visual containers. AI saw a parent Card and still wrapped children in another border+shadow div. Wording-only rule "one card per section" didn't cover the "div with card-like classes" case.

**Fix (v0.6.99):** New anti-pattern in CORE with BAD/GOOD example. Targets any element with `border + rounded + shadow-sm`, not only `<Card>`.

**Validator:** none direct (could add `NESTED_CONTAINERS` — deferred, low-severity).

### PJ-002 — Chart placeholders ("Chart visualization would go here")

**Observed:** Dashboard rendered "Chart visualization would go here" text + "Category breakdown chart would go here" placeholder. AI couldn't / wouldn't generate real recharts.

**Root cause:** No chart rule in constraints. No guidance on which library, data shape, colors, heights. AI fell back to text placeholder.

**Fix (v0.6.99):**
- CORE CHARTS anti-placeholder block.
- RULES_DATA_DISPLAY full pattern (shadcn Chart + recharts, chart-1..5 CSS vars, h-[200/300/400], full example).
- Plan-level auto-injection of StatsChart into sharedComponents for dashboard/analytics pages.

**Validators:** `CHART_PLACEHOLDER` (regex on stub text), `CHART_EMPTY_BOX` (empty `<div className="h-[X] bg-muted"/>`).

### PJ-003 — Double sign on currency (`--$59.99`, `++$4,850.00`)

**Observed:** Recent Transactions table showed `--$59.99` and `++$4,850.00` for expense/income amounts.

**Root cause:** AI wrote `{amount < 0 ? '-' : '+'}$\{Math.abs(amount).toFixed(2)}` — but `amount` already carried its sign, so prefixing a ternary double-stamped it.

**Fix (v0.6.99):** No constraint change (already had Intl.NumberFormat rule), only validator.

**Validator:** `DOUBLE_SIGN` — regex for `\?\s*['"][+\-]['"]\s*:\s*['"][+\-]['"]` (ternary producing +/- prefix). Flag: use `Intl.NumberFormat({ signDisplay: 'always' })` instead.

### PJ-004 — Empty table columns (headers defined, cells forgotten)

**Observed:** Recent Transactions table had 5 column headers (Overview, Account, Category, Amount, Date). Data rows populated only Overview and Amount. Account, Category, Date were blank.

**Root cause:** AI wrote TableHead list and TableCell list independently. No structural guarantee they stayed in sync. Easy off-by-one when generating, especially in long JSX.

**Fix (v0.6.99):** New validator. (v0.7.0 added structural fix via column schema rule.)

**Validator:** `TABLE_COLUMN_MISMATCH` — counts `<TableHead>` inside `<TableHeader>` block vs `<TableCell>` inside first body `<TableRow>`. Mismatch → warn.

**Structural rule (v0.7.0):** Define `columns: ColumnDef[]` once, map over it for header AND body. Makes the mismatch impossible by construction.

### PJ-005 — `--page accounts` regenerates the whole project

**Observed:** `coherent chat --page accounts "fix the table"` triggered full 6-phase pipeline, generated 16 new pages including unrelated /reports, /investments. Took 5+ minutes. The actual accounts page was not updated.

**Root cause (compound):**
1. Fuzzy match missing — "accounts" (plural) didn't find "/account" (singular).
2. `resolveTargetFlags` returned null → message treated as free-text → single-path parseModification → hit RESPONSE_TRUNCATED → fell through to `splitGeneratePages` → full architecture plan.

**Fix:**
- **v0.6.99** `resolvePageByFuzzyMatch` — handles plural↔singular, prefix, route-segment fallback.
- **v0.7.0** `--page X` skip-archplan guard — when explicit page target + RESPONSE_TRUNCATED, print clear error instead of cascading to full-project regen.

### PJ-006 — Filter bar: three different failure modes in 48h

**Observed (3 separate incidents):**

**6a.** `/transactions` Filter Transactions section: duplicate "All Categories" Select + "Categories" Button, uneven heights, 2-row layout with random gaps.

**6b.** After retry: search input stretched to ~70% width, search icon rendered BELOW input (sibling placement), Date range floating with empty space, filter funnel icon clipped off-screen.

**6c.** (not observed yet, but predicted) inconsistent filter widths on small viewports.

**Root cause:** Word-based rules ("flex-wrap items-center gap-3") gave AI latitude. Specific pattern — search icon `absolute` inside a `relative` wrapper with `pl-9` on Input — was stated once inline but not enforced.

**Fix:**
- **v0.6.100** FILTER BAR section in CORE_CONSTRAINTS with the canonical pattern and NEVER list. Example in RULES_FORMS.
- **v0.6.100** 3 validators: `FILTER_DUPLICATE`, `FILTER_HEIGHT_MISMATCH`, `SEARCH_ICON_MISPLACED`.
- **v0.7.0** Golden pattern `templates/patterns/filter-bar.tsx` — injected into the chat prompt when filter keyword matches. Complete code the AI can copy verbatim.

### PJ-007 — Inconsistent stat cards across pages

**Observed:** `/reports` stat cards (plain icon, inline trend text) vs `/investments` stat cards (blue-tinted square icon, Badge pill for trend). Same page type, different structure.

**Root cause:** `plan.sharedComponents.StatCard.usedBy` did not include `/reports`. Phase 6 per-page generator for /reports therefore got no "import StatCard" directive → freelanced a fresh card design.

**Deeper issue:** no cross-page consistency check. `coherent check` validates individual pages; does not flag that Page A's stat card differs structurally from Page B's stat card.

**Fix (v0.7.1, planned):**
- `INCONSISTENT_CARD` cross-page validator — scans all pages, clusters stat-card-like structures, warns when clusters diverge.
- Plan retrofit: at end of Phase 2, cross-reference `pageNotes[].sections` and auto-extend `usedBy` of shared components with matching page types.

### PJ-008 — Full-width Create Budget modal

**Observed:** Create New Budget dialog rendered edge-to-edge across a ~2400px screen. Content cramped on left 20%, title centered on full width, huge empty area right.

**Root cause:** AI rendered `<Dialog>` with no `max-w` on `<DialogContent>`, or built a custom `<div className="fixed inset-0">` overlay without the shadcn wrapper that sets defaults.

**Fix (v0.7.1):**
- Golden pattern `templates/patterns/dialog.tsx`.
- OVERLAYS section in CORE_CONSTRAINTS covering Dialog, AlertDialog, Sheet, DropdownMenu.
- Validator `DIALOG_FULL_WIDTH` — `<DialogContent>` without `max-w-*` class → warn.
- Validator `DIALOG_CUSTOM_OVERLAY` — custom fixed+inset-0+bg-black overlay near dialog keywords → warn.

---

## How to add a new entry

1. Observe the failure (screenshot/transcript in the repo's discussion).
2. Diagnose root cause (why did the AI produce this?).
3. Pick the right response layer:
   - **Rule** (prevention): CORE or contextual block in `design-constraints.ts`.
   - **Golden pattern** (prevention via copy): `templates/patterns/*.tsx` + inline string in `golden-patterns.ts`.
   - **Validator** (detection): regex/structural check in `quality-validator.ts`.
   - **Pipeline guard** (correctness): in `chat.ts` / `split-generator.ts`.
4. Ship as a patch release, append journal entry here with screenshot/context.

A good rule of thumb: if the same class of bug shows up twice, don't patch — add a validator. If it shows up three times, add a golden pattern.
