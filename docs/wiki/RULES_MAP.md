# Rules Map

Living index of every rule in `design-constraints.ts` with its origin bug, current validator, golden pattern, and version history.

When you add a rule, add a row. When a rule is proven ineffective, mark it deprecated with a date.

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

## Contextual (TIER-2, keyword-matched)

| ID | Rule | Block | Bug | Validator | Pattern | Added |
|----|------|-------|-----|-----------|---------|-------|
| R020 | Use shadcn Select for 3+ options | RULES_FORMS | AI built custom dropdown | — | `dropdown-menu.tsx` | pre-0.6 |
| R021 | Empty state: icon + title + description + single CTA | RULES_DATA_DISPLAY | AI skipped empty state | `NO_EMPTY_STATE` | `empty-state.tsx` | 0.6.94 |
| R022 | Stat card: CardHeader flex-row pb-2, text-2xl font-bold value, arrow trend | RULES_DATA_DISPLAY | Inconsistent stat cards | — (PJ-007 needs cross-page validator) | `stat-card.tsx` | 0.7.0 |
| R023 | Pagination via shadcn Pagination | RULES_DATA_DISPLAY | Custom Prev/Next buttons | (pending) | `pagination.tsx` | 0.7.1 |

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
