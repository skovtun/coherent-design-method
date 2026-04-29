# Patterns Journal

Append-only log of AI-output failure patterns observed in the wild, their root causes, and the rules / validators / patterns we added in response.

Purpose:
- Stay honest about what Coherent's rule system catches vs what slips through.
- Make recurring AI-output failure modes visible so we don't re-derive solutions.
- Show future contributors (and future-me) why a rule exists.

Format: entries in **ID-ascending order** (PJ-001 first). Each entry links the screenshot / transcript if available. Newer entries append at the bottom.

## Entry schema (v0.7.3, revised v0.7.20)

Each entry should have YAML frontmatter directly above its heading:

```yaml
---
id: PJ-NNN
type: bug
confidence: hypothesis | observed | verified | established
status: active | resolved | superseded_by: PJ-MMM
date: YYYY-MM-DD
fixed_in: [versions]
evidence: [sha:abc123, screenshot://...]
---
```

Use `coherent wiki reflect` to add new entries with frontmatter automatically. Pre-0.7.3 entries have been retrofitted with best-effort confidence tags. `date:` field added in v0.7.20 — required going forward so retrieval freshness weighting works (wiki-index.ts `freshnessWeight`).

Confidence levels:
- **hypothesis** — best guess, not verified
- **observed** — seen once in a real session
- **verified** — reproduced or confirmed in code/tests
- **established** — documented fact, cross-referenced

ID scheme: sequential `PJ-NNN` (three-digit zero-padded). Assigned in observation order. Do not renumber when resolving / superseding — mark `status:` instead.

---

## 2026-04-19 → 2026-04-20 · session notes

---
id: PJ-001
type: bug
confidence: observed
status: resolved
date: 2026-04-19
fixed_in: [0.6.99]
evidence: [screenshot://image-cache/c8ef5aa8-.../3.png]
---

### PJ-001 — Nested bordered containers ("card-in-card")

**Observed:** `~/test-app` Budget Progress section rendered three nested border+shadow layers (section card > wrapper div.border.rounded.shadow > individual Card items). Triple visual border, horizontal crowding.

**Root cause:** No explicit anti-pattern in CORE_CONSTRAINTS about nested visual containers. AI saw a parent Card and still wrapped children in another border+shadow div. Wording-only rule "one card per section" didn't cover the "div with card-like classes" case.

**Fix (v0.6.99):** New anti-pattern in CORE with BAD/GOOD example. Targets any element with `border + rounded + shadow-sm`, not only `<Card>`.

**Validator:** none direct (could add `NESTED_CONTAINERS` — deferred, low-severity).

---
id: PJ-002
type: bug
confidence: observed
status: resolved
date: 2026-04-19
fixed_in: [0.6.99]
---

### PJ-002 — Chart placeholders ("Chart visualization would go here")

**Observed:** Dashboard rendered "Chart visualization would go here" text + "Category breakdown chart would go here" placeholder. AI couldn't / wouldn't generate real recharts.

**Root cause:** No chart rule in constraints. No guidance on which library, data shape, colors, heights. AI fell back to text placeholder.

**Fix (v0.6.99):**
- CORE CHARTS anti-placeholder block.
- RULES_DATA_DISPLAY full pattern (shadcn Chart + recharts, chart-1..5 CSS vars, h-[200/300/400], full example).
- Plan-level auto-injection of StatsChart into sharedComponents for dashboard/analytics pages.

**Validators:** `CHART_PLACEHOLDER` (regex on stub text), `CHART_EMPTY_BOX` (empty `<div className="h-[X] bg-muted"/>`).

**v0.7.17 addendum:** `CHART_PLACEHOLDER` autofix ships — replaces placeholder div with animated bar skeleton (7 bars, `bg-primary/30`, `transition-colors`, `aria-hidden`). Cosmetic fallback when prevention layer fails. Root prevention still pending **F9** (deterministic StatsChart template before LLM fallback).

---
id: PJ-003
type: bug
confidence: verified
status: resolved
date: 2026-04-19
fixed_in: [0.6.99]
evidence: [sha:b4994cf]
---

### PJ-003 — Double sign on currency (`--$59.99`, `++$4,850.00`)

**Observed:** Recent Transactions table showed `--$59.99` and `++$4,850.00` for expense/income amounts.

**Root cause:** AI wrote `{amount < 0 ? '-' : '+'}$\{Math.abs(amount).toFixed(2)}` — but `amount` already carried its sign, so prefixing a ternary double-stamped it.

**Fix (v0.6.99):** No constraint change (already had Intl.NumberFormat rule), only validator.

**Validator:** `DOUBLE_SIGN` — regex for `\?\s*['"][+\-]['"]\s*:\s*['"][+\-]['"]` (ternary producing +/- prefix). Flag: use `Intl.NumberFormat({ signDisplay: 'always' })` instead.

**v0.7.10-11 addendum:** DOUBLE_SIGN tiered (warning → error when Math.abs detected nearby) + autofix for simple cases. Covers ~60% of occurrences; taste cases remain for human review.

---
id: PJ-004
type: bug
confidence: verified
status: resolved
date: 2026-04-19
fixed_in: [0.6.99, 0.7.0]
evidence: [sha:b4994cf, sha:163bf30]
---

### PJ-004 — Empty table columns (headers defined, cells forgotten)

**Observed:** Recent Transactions table had 5 column headers (Overview, Account, Category, Amount, Date). Data rows populated only Overview and Amount. Account, Category, Date were blank.

**Root cause:** AI wrote TableHead list and TableCell list independently. No structural guarantee they stayed in sync. Easy off-by-one when generating, especially in long JSX.

**Fix (v0.6.99):** New validator. (v0.7.0 added structural fix via column schema rule.)

**Validator:** `TABLE_COLUMN_MISMATCH` — counts `<TableHead>` inside `<TableHeader>` block vs `<TableCell>` inside first body `<TableRow>`. Mismatch → warn.

**Structural rule (v0.7.0):** Define `columns: ColumnDef[]` once, map over it for header AND body. Makes the mismatch impossible by construction.

---
id: PJ-005
type: bug
confidence: verified
status: resolved
date: 2026-04-19
fixed_in: [0.6.99, 0.7.0]
evidence: [sha:b4994cf, sha:163bf30]
---

### PJ-005 — `--page accounts` regenerates the whole project

**Observed:** `coherent chat --page accounts "fix the table"` triggered full 6-phase pipeline, generated 16 new pages including unrelated /reports, /investments. Took 5+ minutes. The actual accounts page was not updated.

**Root cause (compound):**
1. Fuzzy match missing — "accounts" (plural) didn't find "/account" (singular).
2. `resolveTargetFlags` returned null → message treated as free-text → single-path parseModification → hit RESPONSE_TRUNCATED → fell through to `splitGeneratePages` → full architecture plan.

**Fix:**
- **v0.6.99** `resolvePageByFuzzyMatch` — handles plural↔singular, prefix, route-segment fallback.
- **v0.7.0** `--page X` skip-archplan guard — when explicit page target + RESPONSE_TRUNCATED, print clear error instead of cascading to full-project regen.

---
id: PJ-006
type: bug-cluster
confidence: verified
status: resolved
date: 2026-04-19
fixed_in: [0.6.100, 0.7.0]
evidence: [sha:3408790, sha:163bf30]
---

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

**ADR reference:** ADR-0001 (golden patterns over word-based rules) was driven by this cluster.

---
id: PJ-007
type: bug
confidence: verified
status: resolved
date: 2026-04-19
fixed_in: [0.7.21]
evidence: [screenshot://image-cache/c8ef5aa8-.../8.png, screenshot://image-cache/c8ef5aa8-.../9.png, sha:d525d95]
---

### PJ-007 — Inconsistent stat cards across pages

**Observed:** `/reports` stat cards (plain icon, inline trend text) vs `/investments` stat cards (blue-tinted square icon, Badge pill for trend). Same page type, different structure.

**Root cause:** `plan.sharedComponents.StatCard.usedBy` did not include `/reports`. Phase 6 per-page generator for /reports therefore got no "import StatCard" directive → freelanced a fresh card design.

**Deeper issue:** no cross-page consistency check. `coherent check` validates individual pages; does not flag that Page A's stat card differs structurally from Page B's stat card.

**Fix (shipped v0.7.21):** `INCONSISTENT_CARD` cross-page validator — scans all `page.tsx` files, extracts stat-card signatures (has-tinted-square × value-size × has-trend × has-description), clusters by signature, emits warnings for minority variants when ≥3 cards share a majority signature. Includes ReDoS-hardened regex set, position-aware trend detection, self-closing `<Card />` handling, bounded try/catch. 22 tests including ReDoS guard < 2000ms. PR #28, commit `d525d95`. See `packages/cli/src/utils/cross-page-validator.ts` + `.test.ts`.

**Deferred:** plan retrofit (auto-extend `usedBy` in Phase 2) — not shipped in v0.7.21. Validator catches the drift at `coherent check` time; plan-side prevention remains an open improvement (tracked in IDEAS_BACKLOG).

---
id: PJ-008
type: bug
confidence: verified
status: resolved
date: 2026-04-19
fixed_in: [0.7.1]
evidence: [sha:a0c108b, screenshot://image-cache/c8ef5aa8-.../10.png]
---

### PJ-008 — Full-width Create Budget modal

**Observed:** Create New Budget dialog rendered edge-to-edge across a ~2400px screen. Content cramped on left 20%, title centered on full width, huge empty area right.

**Root cause:** AI rendered `<Dialog>` with no `max-w` on `<DialogContent>`, or built a custom `<div className="fixed inset-0">` overlay without the shadcn wrapper that sets defaults.

**Fix (v0.7.1):**
- Golden pattern `templates/patterns/dialog.tsx`.
- OVERLAYS section in CORE_CONSTRAINTS covering Dialog, AlertDialog, Sheet, DropdownMenu.
- Validator `DIALOG_FULL_WIDTH` — `<DialogContent>` without `max-w-*` class → warn.
- Validator `DIALOG_CUSTOM_OVERLAY` — custom fixed+inset-0+bg-black overlay near dialog keywords → warn.

---
id: PJ-009
type: bug
confidence: verified
status: resolved
date: 2026-04-20
fixed_in: [0.7.5, 0.7.7, 0.7.8]
evidence: [transcript://2026-04-20 session — "coherent chat 'delete account page'" created a Delete Account feature page instead of deleting the Account page, sha:4e692c2]
---

### PJ-009 — `delete` interpreted as feature creation instead of removal

**Observed:** `coherent chat "delete account page"` created a new `/settings/delete-account` page (with Dialog + Danger Zone UI) instead of deleting the existing Account page.

**Root cause (compound):**
1. There is no `delete-page` ModificationRequest type in the core schema — the pipeline only supports `add-page`, `update-page`, `add-component`, `modify-component`, `update-token`. Deletion simply isn't wired.
2. AI reads "delete account page" as ambiguous: "a page for deleting accounts" (feature) vs "delete the page called Account" (operation). Without a schema affordance, it falls back to feature interpretation.
3. No validator catches this — the resulting page is structurally valid, just wrong intent.

**Fix shipped:**
- **v0.7.5** — Added `delete-page` / `delete-component` ModificationRequest types in core. `applyModification` handler: rm app/<route>/page.tsx, update design-system.config.pages[], update nav snapshot. Safety: dry-run by default OR require `--force`. Undo: via `.coherent/backups/` — `coherent undo` restores.
- **v0.7.7** — Destructive pre-parser — explicit example in CORE_CONSTRAINTS teaching "delete/remove/get rid of X page" → `type: "delete-page", target: X`. Prompt-injection guard.
- **v0.7.8** — Compound delete + synonym expansion (drop / trash / erase). Prompt-injection guard hardening.
- **v0.7.9-0.7.10** — Nav cleanup on delete-page + broader auto-fix on remaining nav entries.

**ADR reference:** ADR-0003 (destructive operations architecture) — to be written.

---
id: PJ-010
type: bug
confidence: verified
status: active
date: 2026-04-23
fixed_in: []
evidence: [screenshot://2026-04-23 landing DS /design-system/tokens/colors showing generic blue/purple/orange palette while real brand is green, repo://getcoherent/export/design-system.config.ts vs app/layout.tsx inline CSS]
---

### PJ-010 — DS tokens page shows stale palette from config snapshot after CSS-vars brand change

**Observed:** On `getcoherent.design` landing (Coherent-generated), `/design-system/tokens/colors` renders the default scaffolded palette (`primary: #3B82F6` blue, `secondary: #8B5CF6` purple, `accent: #F59E0B` orange). Real brand (`#17a862` light / `#3ecf8e` dark green) is applied via CSS vars in `app/layout.tsx` inline `<style>` and is what the rest of the page actually uses. The DS tokens page contradicts the live UI.

**Root cause (compound):**
1. `design-system.config.ts` is a **JSON snapshot** of tokens at scaffold time. The tokens API route (`/api/design-system/config`) serves this snapshot.
2. The DS tokens page (`/design-system/tokens/colors/page.tsx`) fetches from that API and renders the snapshot.
3. Users who customize brand by editing CSS vars in `globals.css` / `layout.tsx` (common, because CSS vars is the recommended pattern) **do not trigger any sync** to `design-system.config.ts`. No warning, no build-time check.
4. File header says "Do not edit manually - use 'coherent chat' command to modify" — but `coherent chat` has no command to sync tokens from the live CSS vars back into the config snapshot. Drift is silent.

**User impact:** The generated DS page ships as part of the scaffolded project and is publicly reachable (landing site showed it to real visitors). Directly contradicts the value prop — "consistent UI across pages" — while the DS page shows a different palette than the UI.

**Fix shipped (this project only, not in Coherent core yet):**
- **A** — Manually updated `design-system.config.ts` `tokens.colors.light/dark` to real brand values.
- **B** — Rewrote `/design-system/tokens/colors/page.tsx` to read live CSS custom properties directly from `document.styleSheets` (scanning `:root` and `.dark` rules for `--*` props). Config snapshot is now a fallback when stylesheet scan returns empty (e.g. stylesheet behind CORS).

**Platform-level fix (proposed):** See backlog **M13 — DS tokens page: live CSS var reader by default**.

**Validator idea:** `DS_TOKEN_DRIFT` — at `coherent check` time, diff `design-system.config.ts` token values against `:root` / `.dark` rules resolved from `globals.css` + any inline `<style>` in `layout.tsx`. Warn on mismatch.

---
id: PJ-011
type: bug
confidence: verified
status: resolved
date: 2026-04-23
fixed_in: [0.7.28]
evidence: [screenshot://2026-04-23 user terminal — ERR_UNKNOWN_FILE_EXTENSION after npm install -g on Node 19.8 macOS, repo://packages/cli/bin/coherent (pre-rename) + packages/cli/package.json bin field]
---

### PJ-011 — `coherent` CLI bin extensionless file fails Node ESM resolution on fresh global install

**Observed:** User reports `npm install -g @getcoherent/cli` succeeded (after `sudo` for EACCES), but `coherent init rdesign` immediately crashed:

```
TypeError [ERR_UNKNOWN_FILE_EXTENSION]: Unknown file extension ""
for /usr/local/lib/node_modules/@getcoherent/cli/bin/coherent.
Loading extensionless files is not supported inside of
"type":"module" package.json contexts.
```

Node version: 19.8.0 (macOS, Kiboko-AirM1). Also reproduces on Node 20+ — this is strict ESM behavior, not a version-specific regression. Existed since the CLI package shipped with `"type": "module"`.

**Root cause (compound):**
1. `packages/cli/package.json` declares `"type": "module"` (ESM context for every file in the package) and `"bin": { "coherent": "./bin/coherent" }` — a path to an **extensionless file**.
2. `packages/cli/bin/coherent` was a tiny launcher: `#!/usr/bin/env node` + `import('../dist/index.js')`.
3. Under ESM, Node's module resolver refuses extensionless files — it cannot infer whether to parse as ESM or CJS. With `"type": "module"`, there is no fallback path. The shebang lets macOS / Linux find the file, but the moment Node tries to *evaluate* it as a module, resolution fails before the first line runs.
4. **Why it never caught me in dev:** `pnpm link` / local `bin` symlinks route through a different resolution path; extensionless files are tolerated via symlink + direct exec. Only *published* `npm install -g` installs expose the bug — and no one had done a fresh global install on Node 18+ until this user.

**User impact:** install-blocker. Literally the first command in the Getting Started flow (`coherent init`) crashes with an ugly stack trace. Worst possible first impression — the landing says "five commands from empty folder", first command dies.

**Fix shipped (v0.7.28):**
- **Rename** `packages/cli/bin/coherent` → `packages/cli/bin/coherent.js`. Body unchanged (`#!/usr/bin/env node` + `import('../dist/index.js')`). Exec bit preserved via `git mv`.
- **`packages/cli/package.json`** — `"bin": { "coherent": "./bin/coherent.js" }` points at the renamed file. Added `"engines": { "node": ">=18" }` so npm surfaces a readable warning on older Node instead of half-installing.
- **`files` array** already includes `bin` — rename is picked up by the published tarball without further config.

**Validator idea:** `BIN_EXTENSION_CHECK` — at pre-publish (and in CI), assert every entry in `package.json` `bin` resolves to a path ending in `.js` / `.mjs` / `.cjs` when `"type": "module"` is set. One-line check, prevents re-regression if anyone adds another bin shim later.

**Test gap to close:** the `coherent` smoke test suite never did a `npm pack → npm install -g <tgz>` on a clean Node image. Adding that as a release-gate step would have caught PJ-011 pre-publish. Not done in this PR — deferred as a follow-up task.

---
id: PJ-012
type: bug
confidence: verified
status: resolved
date: 2026-04-28
fixed_in: [0.14.4]
evidence: [sha:beaab69, repo:///tmp/dogfood-v13/calendar/page.tsx:204, repo:///tmp/dogfood-v13/notifications/page.tsx:266]
---

### PJ-012 — `<Button>` as row/cell wrapper inherits CVA defaults (notifications stack, calendar bleeds)

**Observed:** Two distinct visual failures in dogfood-v13, same root cause:

1. **Notifications page** — list items rendered as `<Button>` rows. Avatar + multi-line title + timestamp collapsed into a 36px-tall row, content overflowing horizontally and stacking on top of each other. Items unreadable.
2. **Calendar page** — month-grid cells built as `<Button>`. Day number + event chips bled across grid columns horizontally because the cell laid children out as `inline-flex items-center justify-center gap-2 whitespace-nowrap`.

Both look like layout bugs but neither page set the broken classes — they came from the shadcn `Button` CVA defaults: `inline-flex items-center justify-center gap-2 whitespace-nowrap h-9`. Adding container classes (`min-h-[92px]`, `p-3`) on top of `<Button>` doesn't override CVA — the row stays 36px tall and children stay horizontal until you explicitly write `h-auto` + `flex-col items-start`.

**Root cause:** AI uses `<Button>` as a "clickable wrapper" because it gets keyboard handling, focus ring, and hover state for free. But Button's CVA was tuned for actual buttons (single line of text, ~36px tall). When the wrapper holds an Avatar + multi-line content, CVA defaults visibly bleed through — and AI does not realize it because the broken classes are not in the page source.

Two `design-constraints.ts` rules already addressed sidebar nav (`SidebarMenuButton` over `Button variant="ghost"`) and native `<button>` over `<Button>` for icon-only triggers — but neither covered the row/cell wrapper case. Sidebar guidance in CORE was even still recommending `Button variant="ghost"`, silently contradicting `shadcn-provider.ts:153` which had said "never use `Button` for sidebar nav" since v0.6.

**Fix shipped (v0.14.4):**
- New CORE_CONSTRAINTS section "BUTTON AS CONTAINER RULES" — domain primitives (`SidebarMenuButton`, `TabsTrigger`) for nav; if you must use `Button` as a row/cell wrapper, override CVA explicitly (`h-auto`, `flex-col items-start`, `min-w-0`, `whitespace-normal`).
- Sidebar guidance reframed from `Button variant="ghost"` to `SidebarMenuButton` so CORE matches `shadcn-provider.ts`.
- **Validator `BUTTON_AS_ROW_NO_HEIGHT_OVERRIDE`** (severity: error) — `<Button>` inside `.map()` with avatar/img/`size-10`/`items-start`/`py-3-6`/`p-3-6` signals but no `h-auto` / `min-h-*` / `size-*` / `h-[*]` override. Notifications, comments, search-results pattern.
- **Validator `BUTTON_AS_CELL_NO_VERTICAL_LAYOUT`** (severity: error) — `<Button>` inside `.map()` with `min-h-[*]` and 2+ direct child divs OR `events.map(...)` but no `flex-col`. Calendar/grid cell pattern.
- **Conservative auto-fix** for the cell case — only fires when calendar markers (`calendar` / `isToday` / `setMonth` / `days.map` / `events.map`) are present. Mutates inline className strings to insert `flex-col items-start justify-start min-w-0 text-left`. `className={varName}` arrays still need a manual fix — the regression test in this PR pinned that boundary.

**Initial regression caught during dogfood:** validator missed the calendar case because the page built `cellClasses` as a const array and passed `className={cellClasses}`. Tag-only scan didn't see `min-h-[92px]`. Fixed by scanning the whole `.map()` block scope (bounded by `</Button>`), not just the Button tag.

**Codex pre-implementation gate:** plan went through `/codex consult` before any validator code. Codex caught the contradiction with the existing native-button rules at `design-constraints.ts:149/191`, tightened the validator scope (don't key on broad "multi-line content"; key on Avatar/img/size-10/items-start for row, `min-h-[*]` + 2+ child divs OR `events.map` for cell), and recommended detection-first with conservative auto-fix only. Verdict: **Go, With Scope Tightening**.

**Tests:** 15 new (5 row, 4 cell, 3 autofix, 2 CORE_CONSTRAINTS, 1 const-array regression). 1691 total passing.

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
5. Use `coherent wiki reflect` to scaffold the entry with correct frontmatter shape.

A good rule of thumb: if the same class of bug shows up twice, don't patch — add a validator. If it shows up three times, add a golden pattern.

**Curator tip (v0.7.19+):** run `coherent journal aggregate` first to see which validators are recurring. The top-3 list is where the next PJ entries should focus — raw data beats blank-page guesses.
