# Rules Map

Living index of every rule in `design-constraints.ts` with its origin bug, current validator, golden pattern, and version history.

- **Hand-maintained** tables below (origin bugs, versions, status) — these require human judgment.
- **Auto-generated** section (between the markers) — refreshed by `node packages/cli/scripts/generate-rules-map.mjs`, which parses the actual code. Single source of truth for what exists; hand-maintained section explains WHY.

When you add a rule, add a row in the hand-maintained section. Run the generator to refresh the code-extracted table. When a rule is proven ineffective, mark it deprecated with a date.

---

<!-- AUTO-GENERATED:START -->
## Constraint blocks (auto-generated)

These are the exported rule blocks Claude sees in `design-constraints.ts`. CORE and TIER-1 blocks always ship with the prompt; RULES_* blocks are keyword-matched.

| Block | First line |
|-------|------------|
| `DESIGN_THINKING` (TIER-1) | ## DESIGN THINKING (answer internally BEFORE writing code) |
| `CORE_CONSTRAINTS` (CORE) | SHADCN/UI DESIGN CONSTRAINTS (MANDATORY — these rules produce professional UI): |
| `DESIGN_QUALITY_COMMON` (TIER-1) | ## DESIGN QUALITY — COMMON |
| `VISUAL_DEPTH` (TIER-1) | ## VISUAL DEPTH TECHNIQUES (pick 1-3 per page based on context) |
| `RULES_FORMS` (TIER-2) | FORM RULES: |
| `RULES_DATA_DISPLAY` (TIER-2) | DATA DISPLAY RULES: |
| `RULES_NAVIGATION` (TIER-2) | NAVIGATION RULES: |
| `RULES_OVERLAYS` (TIER-2) | OVERLAY / MODAL RULES: |
| `RULES_FEEDBACK` (TIER-2) | FEEDBACK & STATUS RULES: |
| `RULES_CONTENT` (TIER-2) | CONTENT PAGE RULES: |
| `RULES_CARDS_LAYOUT` (TIER-2) | CARD & LAYOUT RULES: |
| `RULES_SHADCN_APIS` (TIER-2) | SHADCN COMPONENT API REFERENCE (use these exact patterns): |
| `RULES_COMPONENTS_MISC` (TIER-2) | MISCELLANEOUS COMPONENT RULES: |
| `RULES_TAILWIND_V4` (TIER-2) | TAILWIND CSS v4 RULES (this project uses Tailwind v4): |
| `RULES_NEXTJS` (TIER-2) | NEXT.JS APP ROUTER RULES: |
| `INTERACTION_PATTERNS` (TIER-1) | ## INTERACTION PATTERNS (mandatory) |

## Validator issue types (auto-generated)

Every validator fires a typed issue. Grep for the type in `quality-validator.ts` to see the detection logic.

| Issue type | Default message |
|------------|-----------------|
| `TABLE_COLUMN_MISMATCH` | Table has ${headCount} <TableHead> but first body <TableRow> has ${cellCount} <TableCell> — empty columns will render. Match counts. |
| `FILTER_DUPLICATE` | Filter dimension  |
| `FILTER_HEIGHT_MISMATCH` | Filter controls use different heights (${[...heights].join( |
| `SEARCH_ICON_MISPLACED` | Search icon appears as a sibling of <Input>, not inside. Wrap in <div className= |
| `DIALOG_FULL_WIDTH` | <${kind}Content> without a max-w-* class renders full-width on wide screens. Add max-w-lg (default) or sm:max-w-md for Sheet. |
| `DIALOG_CUSTOM_OVERLAY` | Custom fixed inset-0 overlay detected. Use shadcn <Dialog>/<AlertDialog>/<Sheet> — they handle overlay, focus trap, and Escape automatically |
| `ALERT_DIALOG_NON_DESTRUCTIVE` | AlertDialog  |
| `INLINE_MOCK_DATA` | Inline array with 5+ items — extract to src/data/<name>.ts and import |
| `SM_BREAKPOINT` | sm: breakpoint — consider if md:/lg: is sufficient${countSuffix} |
| `PLACEHOLDER` | Placeholder content detected — use real contextual content |
| `NO_RESPONSIVE` | Grid layout without responsive breakpoints (md: or lg:) |
| `NO_H1` | Page has no <h1> — every page should have exactly one h1 heading |
| `MULTIPLE_H1` | Page has ${h1Matches.length} <h1> elements — use exactly one per page |
| `SKIPPED_HEADING` | Heading level skipped: h${headingLevels[i - 1]} → h${headingLevels[i]} — don |
| `MISSING_LABEL` | Inputs found but no Label with htmlFor — every input must have a visible label |
| `PLACEHOLDER_ONLY_LABEL` | Inputs use placeholder only — add visible Label with htmlFor (placeholder is not a substitute) |
| `MISSING_FOCUS_VISIBLE` | Interactive elements without focus-visible styles — add focus-visible:ring-2 focus-visible:ring-ring |
| `CLICKABLE_DIV` | <${m[1]} onClick> without role and tabIndex — keyboard-inaccessible. Use <button>/<a> or add role= |
| `RAW_IMG_TAG` | <img> tag found — prefer <Image> from next/image for lazy-loading, format negotiation, and CLS-safe dimensions. |
| `IMAGE_MISSING_DIMENSIONS` | <Image> without width/height (and no fill prop) — causes CLS. Add width={...} height={...} or use fill inside a sized parent. |
| `MISSING_METADATA` | Marketing page without metadata export — add  |
| `NO_EMPTY_STATE` | List/table/grid without empty state handling — add friendly message + primary action |
| `NO_LOADING_STATE` | Page with data fetching but no loading/skeleton pattern — add skeleton or spinner |
| `EMPTY_ERROR_MESSAGE` | Generic error message detected — use what happened + why + what to do next |
| `DESTRUCTIVE_NO_CONFIRM` | Destructive action without confirmation dialog — add confirm before execution |
| `FORM_NO_FEEDBACK` | Form with submit but no success/error feedback pattern — add  |
| `NAV_NO_ACTIVE_STATE` | Navigation without active/current page indicator — add active state for current route |
| `BROKEN_INTERNAL_LINK` | Link to  |
| `NESTED_INTERACTIVE` | Button inside Link without asChild — causes DOM nesting error. Use <Button asChild><Link>...</Link></Button> instead |
| `LINK_MISSING_HREF` | <Link> or <a> without href prop — causes Next.js runtime error. Add href attribute. |
| `COMPONENT_TOO_LONG` | Page is ${lineCount} lines — consider extracting sections (data table, form, chart) into subcomponents. |
| `MISSING_ARIA_LABEL` | Icon-only button without aria-label — add aria-label= |
| `SMALL_TOUCH_TARGET` | Icon button may be < 44px touch target — add min-h-[44px] or increase padding |
| `EMOJI_IN_UI` | Emoji character in UI — use Lucide icon instead (vector, scalable, theme-aware) |

## Golden patterns (auto-generated)

Canonical implementations under `packages/cli/templates/patterns/`. AI is shown the inline string from `golden-patterns.ts` when keyword matches.

- [`alert-dialog.tsx`](../../packages/cli/templates/patterns/alert-dialog.tsx)
- [`chart-card.tsx`](../../packages/cli/templates/patterns/chart-card.tsx)
- [`dialog.tsx`](../../packages/cli/templates/patterns/dialog.tsx)
- [`dropdown-menu.tsx`](../../packages/cli/templates/patterns/dropdown-menu.tsx)
- [`empty-state.tsx`](../../packages/cli/templates/patterns/empty-state.tsx)
- [`filter-bar.tsx`](../../packages/cli/templates/patterns/filter-bar.tsx)
- [`pagination.tsx`](../../packages/cli/templates/patterns/pagination.tsx)
- [`sheet.tsx`](../../packages/cli/templates/patterns/sheet.tsx)
- [`stat-card.tsx`](../../packages/cli/templates/patterns/stat-card.tsx)

<!-- AUTO-GENERATED:END -->

---

## Format

| ID | Rule (what) | Block | Bug it prevents | Validator | Golden pattern | Added |
|----|-------------|-------|-----------------|-----------|----------------|-------|
| RULE_ID | one-line description | CORE / RULES_X | PJ-NNN or source | validator type or `—` | `filter-bar.tsx` or `—` | version |

Blocks: CORE = CORE_CONSTRAINTS. RULES_X = TIER-2 contextual blocks.

---

## Always-on (CORE + TIER-1)

| ID | Rule | Block | Bug | Validator | Pattern | Added |
|----|------|-------|-----|-----------|---------|-------|
| R001 | No raw Tailwind colors — semantic tokens only | CORE | Generic `bg-gray-100 text-blue-600` | `RAW_COLOR` | — | pre-0.5 |
| R002 | text-sm is base body size, not text-base | CORE | AI defaulted to text-base | `TEXT_BASE` | — | pre-0.5 |
| R003 | No heavy shadows (md/lg/xl) | CORE | Shadowed "professional" look | `HEAVY_SHADOW` | — | pre-0.5 |
| R004 | No nested bordered containers | CORE | PJ-001 Budget Progress triple-border | (soft via NESTED_CONTAINERS intent) | — | 0.6.99 |
| R005 | Charts via shadcn Chart + recharts; no placeholders | CORE + RULES_DATA_DISPLAY | PJ-002 "Chart would go here" | `CHART_PLACEHOLDER`, `CHART_EMPTY_BOX` | `chart-card.tsx` | 0.6.99 |
| R006 | Money via Intl.NumberFormat | CORE | PJ-003 `$\{v.toFixed(2)}` | `RAW_NUMBER_FORMAT` | `stat-card.tsx` | 0.6.99 |
| R007 | Mock data 5+ elements → extract to src/data/ | CORE | Inline 40-row arrays in page.tsx | `INLINE_MOCK_DATA` | — | 0.6.99 |
| R008 | Filter bar: one row, flex-wrap, h-10 uniform, no duplicates | CORE + RULES_FORMS | PJ-006 | `FILTER_DUPLICATE`, `FILTER_HEIGHT_MISMATCH`, `SEARCH_ICON_MISPLACED` | `filter-bar.tsx` | 0.6.100 |
| R009 | Table: columns schema as single source of truth | RULES_DATA_DISPLAY | PJ-004 empty columns | `TABLE_COLUMN_MISMATCH` | — | 0.7.0 |
| R010 | Overlays: shadcn primitives only, max-w-* required | CORE | PJ-008 full-width modal | `DIALOG_FULL_WIDTH`, `DIALOG_CUSTOM_OVERLAY` | `dialog.tsx`, `alert-dialog.tsx`, `sheet.tsx` | 0.7.1 |
| R011 | AlertDialog only for destructive actions | CORE | AlertDialog used for "Save" | `ALERT_DIALOG_NON_DESTRUCTIVE` | `alert-dialog.tsx` | 0.7.1 |
| R012 | Two sizes max per component — no size-soup, contrast via weight or color | DESIGN_QUALITY_COMMON | jakub.kr + Refactoring UI | — | — | 0.7.24 |
| R013 | Concentric border radius: outer = inner + padding | DESIGN_QUALITY_COMMON | jakub.kr + Refactoring UI nesting | — | — | 0.7.24 |
| R014 | Exit motion subtler than entrance (exit translate ~8px, enter ~24px) | DESIGN_QUALITY_COMMON | jakub.kr | — | — | 0.7.24 |
| R015 | Grayscale antialiasing on html/body | DESIGN_QUALITY_COMMON | jakub.kr — heavy light text on dark (macOS) | — | — | 0.7.24 |
| R016 | Tabular numerals on changing digit UI (stats, timers, cells) | DESIGN_QUALITY_COMMON | jakub.kr — width-jitter on rerender | — | — | 0.7.24 |
| R017 | Focus returns to trigger element after overlay close | INTERACTION_PATTERNS | Nielsen #3 (user control) | — | `dialog.tsx`, `sheet.tsx` | 0.7.24 |
| R018 | Back button compatibility with modals — no back-button traps | INTERACTION_PATTERNS | Nielsen #3 (user control) | — | — | 0.7.24 |
| R019 | High-risk destructive: type-to-confirm. Reversible: optimistic + undo toast | INTERACTION_PATTERNS | Nielsen #5 (error prevention) + Gmail undo | — | — | 0.7.24 |

## Contextual (TIER-2, keyword-matched)

| ID | Rule | Block | Bug | Validator | Pattern | Added |
|----|------|-------|-----|-----------|---------|-------|
| R020 | Use shadcn Select for 3+ options | RULES_FORMS | AI built custom dropdown | — | `dropdown-menu.tsx` | pre-0.6 |
| R021 | Empty state: icon + title + description + single CTA | RULES_DATA_DISPLAY | AI skipped empty state | `NO_EMPTY_STATE` | `empty-state.tsx` | 0.6.94 |
| R022 | Stat card: CardHeader flex-row pb-2, text-2xl font-bold value, arrow trend | RULES_DATA_DISPLAY | Inconsistent stat cards | — (PJ-007 needs cross-page validator) | `stat-card.tsx` | 0.7.0 |
| R023 | Pagination via shadcn Pagination | RULES_DATA_DISPLAY | Custom Prev/Next buttons | (pending) | `pagination.tsx` | 0.7.1 |
| R024 | Image outline overlay at low opacity | RULES_COMPONENTS_MISC | jakub.kr — silent edge where bg matches | — | — | 0.7.24 |

## Planned

| ID | Rule | Block | Bug | Validator | Pattern | Target |
|----|------|-------|-----|-----------|---------|--------|
| R050 | Cross-page stat-card consistency | — | PJ-007 inconsistent cards | `INCONSISTENT_CARD` | — | 0.7.1 |
| R051 | Dropdown nesting: no absolute div for menus | CORE | Custom floating panel | `DROPDOWN_CUSTOM_OVERLAY` | `dropdown-menu.tsx` | 0.7.2 |

---

## Maintenance

- Rule ID is append-only. Don't renumber when deprecating.
- When a validator proves ineffective (false positives > true positives over a month), mark ⚠ and link to the analysis in PATTERNS_JOURNAL.
- "Golden pattern" column is the **authoritative reference**. Text rules can decay; patterns are code that either compiles or doesn't.
