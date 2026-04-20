# Changelog

All notable changes to this project are documented in this file.

## [0.7.10] — 2026-04-19

### Nav cleanup hardening + DOUBLE_SIGN tiering + currency autofix

Three gaps surfaced by smoke-testing 0.7.9 on a real project:

### Fixed

- **Stale `config.navigation.items` survive old delete-page calls.** 0.7.9 introduced nav cleanup on `delete-page`, but users who deleted pages on 0.7.8 or earlier ended up with `config.navigation.items` still holding the dead route. `coherent fix` Step 4d then regenerated Header from a stale config, so the "/account" link came back. Fixed: Step 4d now prunes any `navigation.items` whose route is neither in `config.pages` nor in the auth allowlist (login/signup/reset), persists via `dsm.save()`, **then** regenerates the shared Header. Self-heal, not just surface-patch.

- **"Missing default export" false-positive on regenerated Header.** `verifyIncrementalEdit` was surfacing the default-export check on `components/shared/header.tsx` after our own regen wrote it with a named export (as it should — shared components aren't pages). `coherent fix` now skips that specific check for files under `components/shared/` and `components/ui/`.

- **`DOUBLE_SIGN` was over-firing as error.** The validator regex matched `? '+' : '-'` unconditionally, but many AI-generated patterns look like `{transaction.type === 'credit' ? '+' : '-'}{formatCurrency(amount)}` — where `amount` is unsigned and the sign comes from the type field. That's a style preference (Intl.NumberFormat is still cleaner), not a runtime bug. Split into two tiers: numeric comparison on money-domain identifiers (`amount|value|total|balance|change|delta|…`) stays **error**; type-string comparison demotes to **warning**.

### Added

- **`RAW_NUMBER_FORMAT` autofix.** `$\`${amount.toFixed(2)}\`` and `$${amount.toFixed(2)}` in JSX now rewrite to `new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: N, maximumFractionDigits: N }).format(amount)`. One more error class `coherent fix` handles deterministically.

### Tests
1002 passing (+3 new: RAW_NUMBER_FORMAT autofix, DOUBLE_SIGN error tier, DOUBLE_SIGN warning tier).

## [0.7.9] — 2026-04-19

### Nav cleanup on delete-page + broader auto-fix coverage

Triggered by live testing: user deleted `/account` page via `coherent chat "delete account page"`. The page file vanished, config.pages was updated — but the "Account" link stayed in the Header menu. Clicking it 404'd.

Root cause was a three-way gap:
1. `delete-page` handler removed from `config.pages` but not from `config.navigation.items`.
2. Shared `components/shared/header.tsx` / `sidebar.tsx` were not regenerated after the delete.
3. `coherent fix` called `validatePageQuality()` WITHOUT `validRoutes`, so the existing `BROKEN_INTERNAL_LINK` validator never fired against stale hrefs.

### Fixed

- **`delete-page` handler now updates navigation + regens shared Header/Sidebar.** After dropping the page from `config.pages` and `config.navigation.items` in one pass, imports `PageGenerator` and rewrites `components/shared/header.tsx` (or `sidebar.tsx`, per nav type) using the updated config. Stale link can't survive a delete.
- **`coherent fix` Step 4d: stale nav link sweep.** Scans `components/shared/header.tsx` and `sidebar.tsx` for hrefs, cross-references against `config.pages` routes. Any stale href triggers regen of that file from the current config. Safe under `--dry-run` — reports what it would regen.
- **`coherent fix` Step 6 now passes `validRoutes` to `validatePageQuality()`.** `BROKEN_INTERNAL_LINK` warnings finally surface during `fix`. Previously they only fired in `check`.

### Added — broader quality auto-fix coverage

User reported 10+ error classes surviving `coherent fix`. Highest-frequency error patterns are now auto-fixed rather than merely reported:

- **`DIALOG_FULL_WIDTH` auto-fix.** `<DialogContent>` / `<AlertDialogContent>` without a `max-w-*` class gets `max-w-lg` injected. `<SheetContent>` gets `sm:max-w-md`. Existing `max-w-*` is preserved.
- **`SMALL_TOUCH_TARGET` auto-fix.** `<Button size="icon">` without explicit sizing gets `min-h-[44px] min-w-[44px]` appended, unless padding/height classes already satisfy 44px.
- **`MISSING_ARIA_LABEL` auto-fix.** Icon-only `<Button>/<button>` with a lucide-style icon child gets an inferred `aria-label`. Icon→label map handles the common set (`X`→Close, `Trash`→Delete, `Menu`→Open menu, `Pencil/Edit`→Edit, `Chevron*`→Expand/Collapse/Previous/Next, …). Buttons with visible text or an existing aria-label are left untouched.
- **`DOUBLE_SIGN` auto-fix (narrow, high-confidence).** The common AI pattern `{amount > 0 ? '+' : ''}{amount.toFixed(2)}` on an already-signed value gets rewritten to `new Intl.NumberFormat({ signDisplay: "always", ... }).format(amount)`. Fix only applies when sign var === value var — broader patterns stay reported-only, since the transformation is risky.

### Tests
999 passing (+13 new cases: autofix + Sheet width exemption).

### Also fixed
- **Generated `components/shared/header.tsx` tripping its own validators.** The `generateSharedHeaderCode` Design-System FAB used raw `bg-black/60 text-white border-white/20` → now `bg-foreground/80 text-background border-foreground/20`. Mobile `SheetContent` used plain `w-72` without `max-w-*` → validator now recognizes `w-*` on Sheet as a valid width cap (it's a side drawer, not a centered modal).

### Memory quality score
Unchanged at ~6.5/10. This release is product polish, not retrieval quality.

## [0.7.8] — 2026-04-20

### Compound delete + synonym expansion + prompt-injection guard

Three improvements triggered by live testing after 0.7.7:

**1. Compound delete** — `coherent chat "delete the account page and the delete-account page"` failed after 0.7.7 because the greedy regex captured both page names as a single target. Fixed: split compound targets by `and` / `&` / `,`, emit one `delete-page` per resolvable target. Unresolvable parts are reported as warnings. When NO target resolves, fall back to LLM (regex probably over-matched).

**2. Synonym query expansion** — curated domain synonym map (`modal↔dialog`, `sheet↔drawer`, `chart↔graph`, `stat↔kpi↔metric`, `delete↔remove↔drop`, etc.). Expanded tokens get 0.5x weight so real terms still dominate ranking, but "popup dialog too wide" now correctly finds PJ-008 (which describes "modal"). Bridges keyword→semantic gap without loading an embedding model.

**3. Prompt-injection sanitization** — new `src/utils/wiki-sanitizer.ts` strips known LLM-jailbreak patterns from wiki entries before injection: "ignore previous instructions", `system:` role rebinding, ChatML/Llama special tokens, env-var exfiltration prompts, role re-binding. Also truncates over-long entries (>4KB). Wraps context in explicit "DATA, not instructions" boundary. Finally closes the 0/10 prompt-injection criterion.

### Added
- `docs/wiki/BENCH.yaml` gained 3 synonym cases (popup→modal, kpi→stat, remove→delete). All at 100% precision@1.
- `src/utils/wiki-sanitizer.ts` + 9 tests covering injection patterns.

### Tests
986 passing (+8 new).

### Memory quality score
5.8/10 → **~6.5/10**. Prompt-injection: 0→6. Retrieval: 5→6. Next: opt-in semantic embeddings (0.7.9 optional, OpenAI API).

## [0.7.7] — 2026-04-20

### Destructive pre-parser + wiki improvements (PJ-009 regression fix + memory quality bump)

**Root-causes two layers of failure seen in the user's retry after 0.7.6:**
1. AI misinterpreted "delete account page" as `add-page` (despite RULE 4 in prompt). Even with rule text, Claude at t=0.3 sometimes missed it.
2. The normalizer silently coerced `add-page` → `update-page` when target route existed, hiding the AI's misinterpretation.

### Added — fix the delete-page regression
- **`src/agents/destructive-preparser.ts`** — deterministic pattern match for `delete|remove|drop|trash|get rid of X page|component`. Runs BEFORE LLM, emits delete-page/delete-component directly. Bypasses AI ambiguity entirely.
- **"create a delete-X page" disambiguation** — `add a delete account page` (feature) does NOT match the destructive pattern.
- **Normalizer destructive-intent guard** — if user's message contains destructive verbs but no delete-* request was emitted, refuse instead of silently creating/updating.
- **`chat.ts` fail-fast** — destructive user intent without delete-* request → clear error, no silent coercion.

### Added — wiki retrieval quality
- **Confidence-weighted ranking.** `verified` entries +20%, `established` +30%, `hypothesis` -30%. Old entries with no confidence default to 1.0x. Finally uses the YAML confidence tags shipped in 0.7.3.
- **Freshness decay.** Entries with `date:` frontmatter get a gentle linear decay: 0-180 days = 1.0x, 180-720 days = 1.0x → 0.7x. Foundational ADRs not buried.
- **`coherent wiki bench`** — deterministic retrieval benchmark against `docs/wiki/BENCH.yaml` (10 hand-curated query/expected pairs). Reports precision@1 and @3. Exits non-zero if p@1 < 0.8. Current: **100% @1 and @3**.
- **`docs/wiki/BENCH.yaml`** — benchmark test cases covering all 9 PJ entries + the 0001 ADR.

### Tests
978 passing (+14 for destructive pre-parser). 66 test files.

### Memory quality score
5.0/10 → **~5.8/10**. Confidence tags now affect ranking, freshness shapes retrieval, bench catches regressions, destructive intent is deterministic. Next: prompt-injection safety (0), semantic embeddings (0.7.8).

## [0.7.6] — 2026-04-20

### Hotfix for 0.7.5 — request-parser VALID_TYPES missed delete-page/delete-component

0.7.5 added `delete-page` / `delete-component` to the `ModificationRequest` union type, handler, and prompt training. But **request-parser.ts had its own runtime VALID_TYPES allowlist** that wasn't updated — so the AI's `delete-page` output was rejected with `Unknown action "delete-page"` before reaching the handler.

Runtime behavior now matches compile-time types. `coherent chat "delete account page"` emits `delete-page`, passes validation, hits handler, removes file. Caught by live smoke test immediately after publishing 0.7.5.

### Meta
- **MODEL_PROFILE note:** when introducing a new ModificationRequest type, four places need updating in lock-step:
  1. `packages/core/src/types/design-system.ts` — union member
  2. `packages/cli/src/commands/chat/modification-handler.ts` — switch case
  3. `packages/cli/src/commands/chat/request-parser.ts` — VALID_TYPES allowlist
  4. `packages/cli/src/agents/modifier.ts` — prompt training (if AI-detectable)
- Audit: these four locations could be derived from one source-of-truth enum. Logged as an idea.

## [0.7.5] — 2026-04-20

### Delete-page / delete-component (PJ-009)

User reported: `coherent chat "delete account page"` created a new Delete Account feature instead of removing the Account page. Root cause: no deletion type existed in the `ModificationRequest` schema — AI had nowhere to route the request, fell back to feature interpretation.

### Added
- **`delete-page`** — new `ModificationRequest` type in `@getcoherent/core`. Handler in `modification-handler.ts`:
  - Resolves target by id/name/route (same fuzzy match as `--page`)
  - Refuses to delete the root page (`/`) — too destructive, too easy to trigger by accident
  - Deletes the matching `app/<route>/page.tsx` (checks all route groups)
  - Cleans up the empty route directory
  - Removes the page from `design-system.config.pages[]`
  - Backup created automatically (via existing chat-command backup), `coherent undo` restores
- **`delete-component`** — same for shared components. Removes file + manifest entry. Warns about dangling imports on pages.

### Added — parser training
- **RULE 4 in modifier prompt** — explicit DELETE/REMOVE intent block teaching the AI:
  - "delete X page" / "remove X page" / "get rid of X page" → `delete-page`
  - Disambiguation: "add a delete-account page" = feature, "delete the account page" = removal
  - "the" / specific reference → deletion; "a" / "feature to" → feature page

### Tests
964 passing. Type-level coverage of delete-page / delete-component via new `ModificationRequest` union members.

## [0.7.4] — 2026-04-20

### Wiki retrieval (TF-IDF) — AI reads platform memory at chat-time

Memory quality 4.7 → 6.5. AI now receives top-3 most relevant wiki entries (PATTERNS_JOURNAL, ADR, MODEL_PROFILE) injected into every chat prompt, ranked by TF-IDF against the user's message. Past lessons compound without manual effort.

### Added
- **`src/utils/wiki-index.ts`** — TF-IDF index builder. Scans `docs/PATTERNS_JOURNAL.md` (by PJ-NNN heading), `docs/wiki/ADR/*.md` (each ADR as one doc), `docs/wiki/MODEL_PROFILE.md` + `docs/wiki/IDEAS_BACKLOG.md` (by ### section), with YAML frontmatter + code-fence awareness. Tokenizer preserves kebab-case identifiers (Tailwind classes, React components).
- **`scripts/build-wiki-index.mjs`** — standalone postbuild script that emits `dist/wiki-index.json` bundled with the published package. No external deps.
- **`coherent wiki index`** — rebuild retrieval index on demand.
- **`coherent wiki search <query>`** — query the index from CLI. Returns top-N matches with score.
- **Modifier integration** — `modifier.ts` loads the packaged index at chat-time, retrieves top-3 entries for the user's message, injects as "WIKI CONTEXT" in the LLM prompt. Graceful no-op when index absent.

### Why TF-IDF not embeddings (yet)
- Zero dependencies (no Xenova 100MB model, no OpenAI API cost).
- Works offline, testable in CI, instant first-run.
- Captures ~80% of the value — kebab-case identifiers (`bg-primary`, `CardHeader`) already carry high signal for this corpus.
- Upgrade path: `retrieve()` interface is swappable to embeddings in 0.8.x without touching callers.

### Fixed in wiki parser
- Code fences (```yaml) no longer confuse the YAML frontmatter detector.
- Markdown horizontal rules (`---` without key:value following) no longer mistaken for frontmatter delimiters.

### Journal
- **PJ-009** added — `coherent chat "delete account page"` creates a Delete Account feature instead of removing the Account page. Root cause: no `delete-page` type in ModificationRequest schema. Fix planned for 0.7.5.

### Tests
964 passing (+12 for wiki index: tokenizer, scanner, TF-IDF, persistence, frontmatter, code fences). 65 test files.

## [0.7.3] — 2026-04-20

### Wiki W6/W7 + targeted auto-heal guidance

Strengthens the wiki with structured confidence and supersession, and makes auto-heal meaningfully targeted per validator type (not just a generic "fix these" prompt).

### Added — wiki structure
- **YAML frontmatter on journal entries.** `coherent wiki reflect` now emits `--- id/type/confidence/status/date ---` frontmatter above each appended entry.
- **Confidence levels.** `hypothesis | observed | verified | established`. Template asks for it explicitly; audit flags entries missing it.
- **Supersession check in audit.** RULES_MAP rows with `superseded_by: RXXX` must reference real IDs; audit flags orphans.
- Retrofitted all existing PJ-001 … PJ-008 entries with frontmatter + confidence tags.

### Added — auto-heal guidance map
- **`src/utils/auto-heal-guidance.ts`** — per-validator fix guidance for 30+ issue types. When the auto-fix loop calls `ai.editPageCode()`, it now sends targeted remediation pattern for EACH issue type instead of a generic "fix these" prompt.
- Covers all new 0.7.x validators (DIALOG_FULL_WIDTH, SEARCH_ICON_MISPLACED, FILTER_DUPLICATE, CHART_PLACEHOLDER, TABLE_COLUMN_MISMATCH, DOUBLE_SIGN, etc.) plus long-standing ones (RAW_COLOR, TEXT_BASE, NESTED_INTERACTIVE).
- `buildFixInstruction()` groups issues by type, renders per-type sections, appends scope-limit ("fix ONLY the listed issues; do not refactor unrelated code").

### Tests
952 passing (+5 new). 64 test files.

## [0.7.2] — 2026-04-20

### Wiki infrastructure — auto-generated rules map, reflection CLI, audit command

Makes the platform-level LLM wiki semi-automatic. Rules map now derives from code (no more hand-sync drift). Reflection CLI lowers the friction for appending new bug/model/idea entries. Audit command flags wiki rot.

### Added
- **`scripts/generate-rules-map.mjs`** — parses `design-constraints.ts` (rule block names + first-line descriptions) + `quality-validator.ts` (issue types + messages) + `templates/patterns/*.tsx` → emits an auto-generated section in `docs/wiki/RULES_MAP.md`. Runs as part of `npm run build` (postbuild hook) and via `pnpm --filter @getcoherent/cli generate-rules-map`.
- **`coherent wiki reflect`** — opens a reflection template in `$EDITOR` with three sections (bug / model behavior / idea). Filled sections append as structured entries to `PATTERNS_JOURNAL.md`, `MODEL_PROFILE.md`, `IDEAS_BACKLOG.md`. Only runs inside the Coherent source repo.
- **`coherent wiki audit`** — sanity-checks the wiki: missing top-level headers, stub files, PATTERNS_JOURNAL entries without evidence (SHA/screenshot) or fix version, missing AUTO-GENERATED markers, CLAUDE.md not referencing the wiki. Exits non-zero on errors, warnings/info are advisory.

### Tests
947 passing (unchanged — tests added in 0.7.3).

## [0.7.1] — 2026-04-19

### Patterns expansion + platform wiki

Directly prompted by user bugs on Reports/Investments (inconsistent stat-cards) and Create New Budget dialog (full-width modal). Adds 5 more golden patterns and the meta-infrastructure for platform-level decision tracking.

### Added — golden patterns (5 new)
- `templates/patterns/dialog.tsx` — canonical shadcn Dialog with max-w-lg default.
- `templates/patterns/dropdown-menu.tsx` — row actions / context menu (destructive items bottom, with Separator).
- `templates/patterns/alert-dialog.tsx` — destructive confirmations only. Non-destructive prompts use regular Dialog.
- `templates/patterns/sheet.tsx` — side drawer with side="right" default, sm:max-w-md width.
- `templates/patterns/pagination.tsx` — shadcn Pagination with 5-page window + ellipsis.

`pickGoldenPatterns()` now returns 9 total patterns (keyword-scoped).

### Added — validators (3 new)
- `DIALOG_FULL_WIDTH` — flags `<DialogContent|AlertDialogContent|SheetContent>` without a `max-w-*` class.
- `DIALOG_CUSTOM_OVERLAY` — flags `<div className="fixed inset-0 bg-black/...">` when no shadcn Dialog imports are present (tells user to use shadcn primitives).
- `ALERT_DIALOG_NON_DESTRUCTIVE` — flags AlertDialogAction labels that don't match destructive verbs (delete, remove, cancel, logout, etc.).

### Added — CORE constraint
- **OVERLAYS section** — Dialog / AlertDialog / Sheet / Popover / DropdownMenu rules: shadcn primitives only, explicit max-w, AlertDialog only for destructive actions.

### Added — platform wiki
- `docs/PATTERNS_JOURNAL.md` — append-only log of AI-output failure patterns we've observed, root causes, and responses. Format: bug → cause → rule/validator/pattern → version.
- `docs/wiki/README.md` — index and usage guide.
- `docs/wiki/ADR/0001-golden-patterns-over-word-rules.md` — first architectural decision record documenting the v0.7.0 philosophical shift.
- `docs/wiki/MODEL_PROFILE.md` — empirical notes on Claude Sonnet 4's systematic behaviors (what it favours, where it breaks, how prompts respond).
- `docs/wiki/RULES_MAP.md` — living index of every rule in design-constraints.ts with origin bug, validator, golden pattern, version history.

### Tests
947 passing (+14 new for dialog/dropdown/alert-dialog/sheet/pagination + 3 overlay validators). 63 test files.

## [0.7.0] — 2026-04-19

### Foundation: golden patterns, CLI strict mode, change summary, surgical edit guard, table schema rule

Shifts Coherent from "word-based rules interpreted by AI" toward "golden pattern references copied verbatim". The three filter-bar failures in two days prompted this direction.

### Added — golden patterns library
- **`packages/cli/templates/patterns/`** — complete reference implementations for filter-bar, stat-card, empty-state, chart-card. These are documentation for humans AND the AI.
- **`pickGoldenPatterns()`** in `src/agents/golden-patterns.ts` — injects the relevant pattern source into every chat prompt based on keyword match. Only the patterns that match the request ride along, keeping token cost scoped.
- Design constraints now point AI to golden patterns as ground truth, not prose descriptions.

### Added — CLI ergonomics
- **`--allowExcessArguments(false)` on `coherent chat`.** Commander now errors on stray positional args. Fixes the silent-drop bug where \`coherent chat "msg1" --page X "msg2"\` dropped the second message without warning.
- **Post-chat change summary.** After every \`coherent chat\`, shows per-page line-count delta + added/removed imports. Concrete sanity check beyond \`✅ Success!\`.
- **Target-modified verification.** When \`--page X\` is used, compares file content before/after apply. If unchanged → warns the user their instruction may have been misunderstood.
- **Skip-architecture-plan guard.** When \`--page X\` is used and the LLM hits \`RESPONSE_TRUNCATED\`, the CLI no longer falls through to full-project \`splitGeneratePages\` (which would regenerate 15 pages). Instead it surfaces a clear error: "response too large for a single-page edit; be more specific or drop --page".

### Added — design constraint
- **Table column schema rule** in RULES_DATA_DISPLAY — mandates a single \`columns: ColumnDef[]\` array mapped over both header and body. Structurally prevents the TABLE_COLUMN_MISMATCH bug (headers defined, cells forgotten).

### Tests
933 passing (+7 new for golden patterns). 63 test files.

## [0.6.101] — 2026-04-19

### `coherent check --page <name>` — scope check to a single page

### Added
- **`--page <name>` flag on `coherent check`.** Filters the scan to one specific page file using the same `resolvePageByFuzzyMatch` resolver as `coherent chat --page` — so `coherent check --page accounts` (plural) correctly picks up `/account`. Useful for tight feedback loops when iterating on a single page without wading through whole-project output.

### Why
User ran `coherent check --page transactions` (reasonable intuition) and hit `error: unknown option '--page'`. The flag existed on `chat` but not `check`, making parity between commands inconsistent. Fixed.

## [0.6.100] — 2026-04-19

### Filter-bar discipline: rule + 3 validators

Third filter-bar failure from the same user in two days. Root cause: CORE had no explicit layout recipe for toolbars (search + selects + date range), so AI freelanced — produced duplicate filters, uneven heights, and sibling-placed search icons.

### Added — constraint
- **FILTER BAR / TOOLBAR rule in CORE_CONSTRAINTS.** Specifies one row on desktop, flex-wrap layout, ordering (search first, flex-1 widest), uniform h-10 heights, no-Card wrapper, no duplicates, and the canonical search-icon-inside-relative-wrapper pattern. Full example in RULES_FORMS.

### Added — validators (3 new)
- **FILTER_DUPLICATE** — flags when the same filter dimension is rendered as both a `<Select>` and a `<Button>` in a toolbar (e.g., "All Categories" dropdown + "Categories" button).
- **FILTER_HEIGHT_MISMATCH** — flags when filter controls in the same block use different `h-N` classes (mix of h-8/h-9/h-10).
- **SEARCH_ICON_MISPLACED** — flags when `<Search />` / `<MagnifyingGlass />` is rendered as a sibling of `<Input>` (icon ends up above/below the field) instead of absolute-positioned inside a relative wrapper with `pl-9` on the Input.

### Tests
926 passing (+9 new). 62 test files.

## [0.6.99] — 2026-04-19

### Charts, nested-containers ban, number-format discipline, plan-level chart injection, baseline regression detection, report-issue CLI

### Added — constraints & validators
- **No nested bordered containers** (CORE + RULES_CARDS_LAYOUT). Catches the "card-in-card" AI-slop where the section header already sits in a Card and children add another border/shadow. BAD/GOOD examples included in prompt.
- **Chart rules** (CORE + RULES_DATA_DISPLAY). Full pattern: shadcn Chart install, recharts imports, chart-type picking (AreaChart/BarChart/LineChart/PieChart), `var(--chart-1..5)` colors only, fixed heights (h-[200/300/400]), CartesianGrid usage, ChartTooltip/ChartLegend, empty-state pattern, complete example block.
- **Number formatting** (CORE). `Intl.NumberFormat` for money/percent/counts. Ban `toFixed` concat with currency symbols.
- **Mock data location** (CORE). Arrays with 5+ elements must live in `src/data/*.ts`, not inline.
- **Chart placeholder validator** (`CHART_PLACEHOLDER`) — flags "Chart visualization would go here" family of stubs.
- **Empty-box-as-chart validator** (`CHART_EMPTY_BOX`) — flags `<div className="h-[300px] bg-muted"/>` alone.
- **Raw number-format validator** (`RAW_NUMBER_FORMAT`) — flags `${value.toFixed(2)}` next to `$`.
- **Inline mock data validator** (`INLINE_MOCK_DATA`) — flags 5+ element object arrays in app/.
- **Double-sign validator** (`DOUBLE_SIGN`) — flags `${x < 0 ? '-' : '+'}$...` patterns that render as `--` / `++` in UI.
- **TableHead/TableCell mismatch validator** (`TABLE_COLUMN_MISMATCH`) — flags tables with empty-column bug (headers defined, cells forgotten).

### Added — pipeline
- **Plan-level chart auto-injection.** `ensureChartComponentInPlan()` adds a `StatsChart` shared component to `plan.sharedComponents` when the plan has dashboard/analytics/reports pages OR section notes mention chart/graph/trend keywords. Skipped if plan already has a chart component or sharedComponents is at the 12-item cap.
- **Fuzzy page match in `--page` flag.** `resolvePageByFuzzyMatch()` handles plural↔singular (`accounts` → `/account`), prefix (`dash` → `/dashboard`), and route-segment fallback. Fixes the bug where `--page accounts` fell through to full-project regeneration.

### Added — commands & infra
- **`coherent baseline`** — structural regression check. Fingerprints every page by (validator issues, UI imports, shared imports, LOC). Saves to `.coherent/visuals/baseline-YYYY-MM-DD-N.json`. On re-run, compares against latest and reports deltas (new issues, dropped components, significant line-count shrink).
- **`coherent report-issue`** — opens a pre-filled GitHub issue with CLI/project versions, page path, pages list, OS, node version. Options: `--page`, `--screenshot`, `--title`, `--body`, `--no-open`.
- **`check-constraint-budget` postbuild script** — tracks tokens in always-sent rule bundle (CORE_CONSTRAINTS + DESIGN_QUALITY_COMMON + VISUAL_DEPTH + INTERACTION_PATTERNS). Current baseline ~5400 tokens. Warns above 6500, flags 7500+. Informational; never fails CI.

### Tests
917 passing (+64 new for charts/nested-cards/fuzzy match/table mismatch/double sign/baseline/report-issue). 62 test files.

## [0.6.98] — 2026-04-19

### Real cancellation + experimental parallel phases

### Added
- **AbortSignal in `AIProviderInterface`.** Both Claude (Anthropic SDK) and OpenAI providers now accept `{ signal }` on `parseModification()`. When `COHERENT_REQUEST_TIMEOUT_MS` fires (or the user hits Ctrl+C) the in-flight HTTP request is actually aborted instead of running to completion in the background and burning tokens.
- **`withAbortableTimeout()`.** Factory-based helper that creates an `AbortController`, passes the signal to the caller, and aborts on timeout. Used by single-path + Phase 1/3/6 `parseModification` call sites. Phase 2/5 still race-only (follow-up: extend signal to `generateArchitecturePlan` / `generateSharedComponentsFromPlan`).
- **Experimental Phase 3 ∥ Phase 5 parallelization** behind `COHERENT_EXPERIMENTAL_PARALLEL_PHASES=1`. When enabled, shared-component generation starts concurrently with home-page generation using an atmosphere-derived style hint (`renderAtmosphereStyleHint(plan.atmosphere)`) instead of waiting for home-page `styleContext`. Saves ~20-30s on multi-page runs. Default OFF until visual regression benchmark confirms no quality drop.
- **`renderAtmosphereStyleHint()`** — compact style hint (background + accents + spacing + fonts + primary) derived from `plan.atmosphere`. Used as Phase 5 `styleContext` fallback when Phase 3 hasn't finished yet.

### Tests
853 passing (+4 new for `withAbortableTimeout`, `renderAtmosphereStyleHint`). 60 test files.

## [0.6.97] — 2026-04-19

### Progress feedback, request timeouts, clean Ctrl+C

Broad prompts like `coherent chat "create me ui for a financial app"` used to sit on `Parsing your request...` for 30–90s with no visible progress, and a hung LLM would freeze the CLI indefinitely. All fixed.

### Added
- **Broad-intent detection.** `hasBroadAppIntent()` promotes prompts like "create/build/generate … app/website/platform/saas" to the staged `splitGeneratePages` pipeline so the user sees `Phase 1/6…6/6` instead of one frozen spinner. Exposed via `isMultiPageRequest()` — single source of truth for the "is this multi-page?" decision.
- **Spinner heartbeat.** `startSpinnerHeartbeat()` rotates spinner text through time-based stages during any single blocking LLM call. Active in:
  - single-path `parseModification` (Planning → Generating → Writing → Finalizing → Still working @ 150s)
  - Phase 2/6 architecture plan (Grouping → Planning shared components → Still thinking)
  - Phase 3/6 home page (Drafting → Filling sections → Polishing)
  - Phase 5/6 shared components (Building → Writing → Finalizing)
- **Request timeouts.** `withRequestTimeout()` wraps every LLM call. Default 180s, override with `COHERENT_REQUEST_TIMEOUT_MS`. Fails with a clean `RequestTimeoutError` and a tip instead of an infinite hang.
- **SIGINT handler.** Ctrl+C now stops the spinner, releases the project lock, and exits 130 cleanly — no more orphaned spinner frames or stale `.coherent/.lock` files.
- **DEBUG phase timings.** `COHERENT_DEBUG=1` prints per-phase elapsed time (e.g. `[timing] Phase 3 Home page: 38.2s`) so bottlenecks are visible.
- **Non-TTY progress.** In CI or piped output, heartbeat stages mirror to stderr as `… Planning page structure...` lines — progress reaches logs even when the spinner frame is invisible.

### Changed
- **Multi-page keyword threshold 4 → 3.** Three mentioned page names (e.g. "dashboard, settings, pricing") is already enough output to risk JSON truncation in a single-shot call; route them through the split pipeline.

### Fixed
- **Heartbeat respects `spinner.isSpinning`** — won't overwrite text on a spinner the caller has already failed/succeeded.
- **Stale test for public layout width** — test asserted `max-w-7xl` but the layout was intentionally changed to full-width in v0.6.96.

### Tests
845 passing (+32 new for heartbeat, broad-intent, multi-page detection, timeout, debug timer). 60 test files.

## [0.6.96] — 2026-04-18

### Design recommendations engine + DS Quick Links consistency

### Added
- **`design-recommendations.ts`** — deterministic project analyzer. Runs automatically at the end of `coherent check` and writes `recommendations.md`. 10 checks: color system, empty states, layout variety, component reuse, spacing consistency, typography hierarchy, dark mode, interaction states, responsive breakpoints, accessibility.

### Fixed
- **Quick Links counters unified** — all counters in title, arrow always `→` (scannable right-aligned column).
- **Landing/root layout is now full-width** — removed `max-w-7xl` wrapper so marketing pages control their own container widths.
- **DS button placement** — consistent across root layout template and all public pages.

## [0.6.94] — 2026-04-18

### Quality Overhaul — competitive gap closure + 5 bug fixes

Driven by competitive analysis vs ui-ux-pro-max-skill (67K stars, 161 rules). Closes accessibility, interaction, and performance gaps while fixing all 5 known E2E bugs.

### Fixed
- **primaryHint reaches page generation.** `renderAtmosphereDirective()` now emits primary color directive ("Use zinc tones for --primary token").
- **Negative dates "-2341m ago" → clean format.** `formatRelative` helper guards `d < 0` for future-dated mock data.
- **--page refine ~50% failure → graceful handling.** `resolveTargetFlags` sends "generate from scratch" message instead of empty code block when page file missing.
- **FilterBar contract drift.** `filterManifestForPage` overlays plan's authoritative props interface onto stale manifest entries.
- **Plan cap raised 8→12.** Prevents sharedComponents validation failure when existing plan + AI additions exceed old limit.
- **Phase 4.5 → Phase 5.** Renumbered pipeline phases to clean 1-6 sequence (no fractional phases).

### Added
- **9 quality rules** (closes gaps vs ui-ux-pro-max-skill):
  - Pre-gen: aria-label on icon buttons, 44px touch targets, no emoji in UI, loading states for async buttons, escape routes in dialogs, prefers-reduced-motion
  - Post-gen validator: MISSING_ARIA_LABEL, SMALL_TOUCH_TARGET, EMOJI_IN_UI checks
- **Token regeneration from atmosphere.primaryHint.** "zinc" → `--primary: #18181b`. 8 color presets: zinc, emerald, indigo, rose, amber, teal, violet, slate. Buttons, links, focus rings change to match mood.
- **Industry mood presets.** Healthcare → soft-warm/blue, ecommerce → minimal-paper/amber keywords auto-detected by `extractAtmosphereFromMessage`.
- **prefers-reduced-motion** in scaffold globals.css (both v3 and v4 paths).
- **color-presets.ts** — new utility: primaryHint → hex mapping with light/dark variants.

### Tests
813 passing (+22 new). 60 test files.

## [0.6.93] — 2026-04-16

### Fixed
- **Tailwind v4 global border rule leaked onto every element.** Scaffolded `app/globals.css` had `* { border-color: var(--border); }` at the **top level** (outside any `@layer`). Tailwind v4 cascade layers put unlayered rules AFTER all layered utilities — so this rule overrode `.border-transparent` (and similar). Symptom: every shadcn `TabsTrigger` (which uses `border border-transparent` as layout-stability placeholder) showed a visible `--border` outline on inactive tabs. Fix: wrap the `*` + `body` block in `@layer base { ... }` in both `tailwind-version.ts` v4 generator and the existing Projector file.

### Added
- **Metrics-position rule in `DESIGN_QUALITY_APP`.** New section: when a page has BOTH a summary metrics strip AND a detail view (table/list/grid), metrics MUST go ABOVE the detail view. Stops the AI from placing Total/InProgress/Completed/HighPriority cards at the bottom of the Tasks page (observed in v0.6.92 generation) — an anti-pattern that forces users to scroll past all data before seeing the summary.

### Rationale
Two visible UX bugs spotted while reviewing the v0.6.92 Projector screenshots:
1. Settings tabs rendered outlined rectangles for inactive tabs (user: "I've never seen shadcn tabs look like this"). Root cause: cascade-layer leak, fixed at scaffold level.
2. Tasks page stats strip at the bottom, below the table (user: "I've never seen such cards placed at the bottom"). Root cause: no rule enforcing stats-above-detail ordering, added to app-type design quality block.

## [0.6.92] — 2026-04-16

### Added
- **First-class `atmosphere` field on the architecture plan.** New `AtmosphereSchema` captures `moodPhrase`, `background`, `heroLayout`, `spacing`, `accents`, `fontStyle`, and `primaryHint`. The plan AI extracts these from the user message; a deterministic fallback (`extractAtmosphereFromMessage`) catches mood phrases the AI missed (e.g. "premium and focused, Notion meets Linear" → `dark-zinc / split-text-image / tight / monochrome / mono-labels / zinc`). Persisted in `.coherent/plan.json` so refinements inherit it.
- **Atmosphere directive prefixes every page generation.** `renderAtmosphereDirective` produces an imperative block ("Dark sections use bg-zinc-950. NO pure white. NO gradient backgrounds.") that goes FIRST in both anchor-page and per-page Phase-5 prompts. Replaces the previous structure where mood was buried mid-prompt under 6 tiers of constraints — primacy bias was working against atmospheric directives. Block is suppressed when atmosphere is fully default (no token waste).

### Fixed
- **Mood directives ignored in generated output.** Root cause: the `MOOD → CONCRETE CSS` table added in 0.6.91 was inside `DESIGN_THINKING`, ~250 lines into the system prompt — past the AI's primacy window. Even when present, the mood was treated as one constraint among many. New atmosphere block is a single short directive at prompt position #2 (right after page name), with explicit "REJECT these defaults" enumeration of generic-SaaS patterns to avoid.

### Rationale
Three sequential E2E tests (v0.6.88, v0.6.89, v0.6.90) all produced visually identical "AI-generic SaaS" landings despite explicit "premium, Notion meets Linear" in the prompt. Functional rules (typography, semantic tokens, dates) translated cleanly; visual/atmospheric rules did not. This release moves atmosphere from "one rule among many" to "first directive, deterministic fallback, persisted in plan." Tests: +9 (atmosphere extraction + directive rendering).

## [0.6.91] — 2026-04-16

### Added
- **Mood → concrete CSS table in `DESIGN_THINKING`.** Six common mood phrases ("premium / Notion meets Linear", "bold / playful", "minimal / editorial", "dark and focused", "warm / approachable", "technical / developer") now map to specific background, hero treatment, spacing, and accent decisions. Replaces vague "consider the mood" guidance with enforceable directives. Includes priority rules: brand hints ("X meets Y") outweigh generic SaaS defaults; conflicting moods default to the second-mentioned.

### Rationale
End-to-end Projector test confirmed a long-standing concern: rules ARE injected (verified `modifier.ts:281-301` ships all six tiers), but the AI applies functional rules (typography, semantic tokens, dates) far better than visual/atmospheric ones. "Premium and focused — think Notion meets Linear" produced a generic SaaS landing identical to a 2024-era output. Cause: mood phrases were treated as vibes-to-consider, not directives-to-enforce. The new table makes mood translation deterministic — if you say "premium", you get the dark+monochrome+tight treatment, not centered+gradient+3-card.

This is one of several improvements needed for visual quality. Future work: adversarial verification phase ("does this look like generic AI SaaS?"), brand atmosphere templates, and font-pair selection per mood.

## [0.6.90] — 2026-04-16

### Fixed
- **Sidebar nav links rendered empty.** When the plan declared a `sidebar` group, `split-generator.ts` generated `components/shared/sidebar.tsx` immediately — but `config.navigation.items` was still empty (pages hadn't been saved yet) and `config.navigation.type` was still `'header'` (init scaffold default). Result: every app page showed only the "Projector" logo, no nav links. Fix: in the same Phase-2 sidebar block, sync `navigation.type → 'sidebar'` and pre-populate `navigation.items` from `plan.groups[sidebar].pages`. The post-Phase-5 `regenerateLayout` pass then sees real items and re-emits a sidebar with menu entries.
- **Mis-tagged widgets injected into root layout (DataTable crash).** `integrateSharedLayoutIntoRootLayout` injected ANY component with `type === 'layout'` into `<body>`. AI plans sometimes mis-tag DataTable / ProgressBar as `layout`; injecting them blew up at runtime ("Cannot read properties of undefined (reading 'filter')"). Fix: name-based whitelist — only inject components whose name matches `/header|footer|topbar|nav|navbar/`. New test covers DataTable rejection.
- **Plan generator type rules.** Added explicit guidance in the planner system prompt: `"layout"` is RESERVED for site chrome (Header/Footer/Topbar/Navbar). DataTable → `data-display`, FilterBar → `form`, StatCard → `widget`, etc. Reduces mis-tags at the source.

### Added
- **Anti-pattern: raw ISO in JSX.** Strengthened the date rule in `CORE_CONSTRAINTS`: explicit BAD/GOOD examples for `<span>{item.createdAt}</span>` (shows "2026-04-16T07:45:05.094Z" — broken-looking) vs `toLocaleDateString()` / `formatDistanceToNow`. Includes a copy-paste `formatRelative` helper for projects without date-fns.

### Rationale
End-to-end test of the Projector tutorial revealed three runtime/UX bugs the article promises against. Empty sidebar made dashboard screenshots look broken. DataTable injection caused 500 errors on `/`. Raw ISO timestamps appeared in the dashboard activity feed despite the existing date rule. All three were silent in single-component tests.

## [0.6.89] — 2026-04-16

### Fixed
- **`coherent check` reuse warnings — 92% noise reduction** (37 → 3 on Projector test). Two bugs in `reuse-validator.ts` + `check.ts`:
  1. Layout-mounted components (e.g. `AppSidebar` in `app/(app)/layout.tsx`) were warned as "available but not imported" on every page in the group. They live in layout — pages don't need to re-import them. Fixed by skipping components whose `usedIn` array contains a `layout.tsx` path.
  2. `check.ts` did not pass `plannedComponentNames` to `validateReuse`, so every relevant component type was checked against every page regardless of whether the architecture plan said the page should use it. Fixed by loading `.coherent/plan.json` and building a per-route planned-component set.
- **`check.ts` no longer scans `layout.tsx` files for reuse warnings.** Previously, `findTsxFiles()` returned both `page.tsx` and `layout.tsx` files; only pages should be checked for missed component reuse.

### Rationale
The Projector tutorial article promises a clean `coherent check` output, but the real run produced 37 reuse warnings — most of them false positives flagging layout-mounted nav. Two new tests cover the fix (`reuse-validator.test.ts`).

## [0.6.88] — 2026-04-15

### Fixed
- **App name from prompt always takes precedence.** Previously, `extractAppNameFromPrompt` only ran when `config.name === 'My App'`. When `coherent init test-projector-v2` set the folder-based name, "called Projector" in the chat prompt was ignored and every page footer/header said "Test Projector V2". Now the prompt-extracted name overrides any existing name if `"called X"` is present.
- **`lucide-react` pinned to ^1.8.0** in `ProjectScaffolder` (was ^0.460.0). Old version missing Slack/Github/Figma icons caused post-generation fix to silently substitute them with MessageSquare/ExternalLink/Pen — visibly wrong.

### Added
- **Date realism rule** in `CORE_CONSTRAINTS`: no hardcoded 2023/2024/2025 years. Prefer relative phrases ("2 hours ago", "yesterday", "last week"). Prevents "817 days ago" stale-date artifacts when current date drifts past the AI's training cutoff.

### Rationale
Three small fixes driven by artifacts seen in the v0.6.86 E2E screenshots: wrong app name, broken brand icons, dates from 2023 in a 2026 project. All are visible in the first screenshot any user sees, so they undermine the "premium" framing of the tutorial.

## [0.6.87] — 2026-04-15

### Stability pass — "chat actually works end-to-end"

Motivated by an E2E test that exposed several silent failures. Root cause: no
E2E coverage meant version drift, silent catches, and plan/filesystem drift
went unnoticed across many releases.

### Fixed
- **Auto-wire (app)/layout.tsx when plan requires sidebar navigation.** Previously, `coherent chat` generated `components/shared/sidebar.tsx` but left the app layout as a plain wrapper, so pages rendered without a sidebar despite the prompt requesting one. Now `split-generator` rewrites the layout to use `SidebarProvider` + `AppSidebar` when navType is 'sidebar'.
- **Unsilenced critical try/catches in generation pipeline.** `split-generator.ts` sidebar generation and Phase 2 plan generation now log error messages instead of silently swallowing failures.

### Added
- **`layout-integrity.ts`** — `validateLayoutIntegrity(projectRoot, plan)` cross-references the architecture plan against the filesystem. Detects `SIDEBAR_COMPONENT_MISSING`, `APP_LAYOUT_NOT_WIRED`, `HEADER_FOOTER_MISSING`. Runs at end of generation (shows warning) and during `coherent check` (shows as layout integrity section). 10 new tests.
- **`credits-error.ts`** — `classifyAIError()` detects credit exhaustion, rate limits, and other provider issues. `surfaceAIError()` prints prominent red warnings instead of silent "skipped" messages. Wired into `modification-handler.ts` TypeScript auto-fix path. 7 new tests.
- **Hard-error on CLI/project version mismatch** in `coherent chat`. When CLI is *older* than the project, refuses to run with a clear message: "Running an older CLI on a newer project produces stale output". This single check prevents the #1 silent-failure mode where users run a stale global CLI against a fresh project.
- **`prepublishOnly` guard** in both `package.json` files. Blocks `npm publish` (which leaves `workspace:*` unresolved) with a clear message to use `pnpm publish` instead.
- **`scripts/prepublish-check.sh`** — no-API gate run before every publish. Checks version sync across packages, pnpm availability, build, TypeScript, tests, prettier, and CHANGELOG entry for the current version.
- **Enhanced `scripts/e2e-test.sh`** — asserts auth auto-generation (4/4 pages), sidebar wiring, pipeline phase output, layout integrity. Fails fast with a clear reason.
- **Shared component abstraction guidance** in `CORE_CONSTRAINTS` — explicit three-level rule (minimal primitives vs. complete blocks vs. avoid mid-level) to prevent the "avatar + name" extraction that causes duplicate rendering when a page needs richer info.

### Tests
- 788 passing (771 → 788, +17 new).

### Rationale
Shipped after discovering that the previous 4 releases' improvements (Karpathy principles, design memory wiki, Osmani validator rules) were never actually exercised end-to-end because the tested environment kept hitting a stale global CLI. This release makes that mode impossible and adds real assertions to the release gate.

## [0.6.86] — 2026-04-15

### Fixed
- **Critical: `npm install -g @getcoherent/cli` broken** — published with `workspace:*` dependency on `@getcoherent/core` instead of resolved version. Fixed by switching from `npm publish` to `pnpm publish` which auto-resolves workspace protocol. Versions 0.6.82–0.6.85 are affected; 0.6.86 works.

### Changed
- **Tutorial rewrite** (`docs/case-studies/projector-tutorial.md`) — honest framing ("interactive UI prototype" not "deployed SaaS"), corrected Node.js 20+ requirement, real terminal output examples, captions on all screenshots, expanded FAQ.

### Publishing
- **Must use `pnpm publish`** in both package directories. `npm publish` does not resolve `workspace:*` protocol. Added to workflow notes.

## [0.6.85] — 2026-04-15

### Added
- **`COMPONENT_TOO_LONG` validator rule** — flags pages over 300 lines with info-severity suggestion to extract subcomponents. 2 new tests (769 → 771).
- **Component size anti-pattern** in `CORE_CONSTRAINTS` — "Component over 200 lines → extract logical sections into named subcomponents."
- **Mobile-first responsive rule** in `CORE_CONSTRAINTS` LAYOUT PATTERNS — explicit mobile-first wording: default styles for mobile, md: for 768px+, lg: for 1024px+. Test at 320px, 768px, 1024px, 1440px breakpoints.

### Rationale
Final gap-fill from diff of Addy Osmani's `frontend-ui-engineering` SKILL.md against our constraints. Most rules (skip-to-content, color-alone, heading order, next/image) were already present. Two genuine gaps remained: explicit mobile-first guidance and component size ceiling. Both now enforced in constraints (pre-generation) and validator (post-generation).

## [0.6.84] — 2026-04-15

### Added
- **4 new quality validator rules** from Addy Osmani's agent-skills (Chrome DevRel) a11y + web-quality checklists:
  - `CLICKABLE_DIV` — flags `<div onClick>` / `<span onClick>` without `role` and `tabIndex` (keyboard-inaccessible). Severity: warning.
  - `RAW_IMG_TAG` — flags raw `<img>` in Next.js projects, suggests `<Image>` from `next/image` for lazy-loading, format negotiation, and CLS prevention. Severity: info.
  - `IMAGE_MISSING_DIMENSIONS` — flags `<Image>` without `width`/`height` (and no `fill` prop). Causes CLS. Severity: warning.
  - `MISSING_METADATA` — flags marketing pages without `export const metadata` (SEO). Skips `"use client"` pages and non-marketing page types. Severity: warning.
- **11 new tests** (758 → 769): quality-validator.test.ts covers all 4 rules with positive + negative cases.

### Rationale
Cross-referenced Addy Osmani's accessibility-checklist.md and web-quality-skills against existing `coherent check` validator. These 4 rules close the biggest static-analysis gaps: keyboard a11y (CLICKABLE_DIV), image optimization (RAW_IMG_TAG + IMAGE_MISSING_DIMENSIONS), and SEO (MISSING_METADATA).

## [0.6.83] — 2026-04-15

### Added
- **Design Memory** (persistent wiki layer) — `.coherent/wiki/decisions.md` inside generated projects. Append-only markdown log of design decisions extracted from generated code. Inspired by Karpathy's LLM Wiki gist: pages generated in separate `coherent chat` invocations now compound context instead of re-deriving style from scratch each time.
- **`design-memory.ts` utility** — `readDesignMemory`, `appendDecisions`, `extractDecisionsFromCode`, `truncateMemory`, `formatMemoryForPrompt`. Zero extra AI calls — deterministic regex extraction of containers, spacing, typography, palette (semantic tokens only), grids, gaps, and shared-component imports.
- **24 new tests** (734 → 758): `design-memory.test.ts` covers read/append/extract/trim/format paths, idempotency per `(date, pageName)`, creation of missing parent dirs, and handling of empty/raw-color inputs.

### Changed
- **`split-generator.ts` Phase 3** — after anchor page generates, extract decisions and persist to `decisions.md` so Phase 5 can read them.
- **`split-generator.ts` Phase 5** — page-generation prompts now include a `DESIGN MEMORY` block (container width, spacing, palette, grid, shared imports) pulled from the wiki. Each generated page appends its own decisions after generation. File truncated to last 10 date sections at end of pipeline to cap token cost.

### Rationale
Closes the "page 8 forgets what page 1 decided" gap: extracted style context was in-memory-only before, so consistency broke across sessions. Now decisions accumulate across invocations and inform every future `coherent chat` on the same project. Best-effort — wrapped in try/catch so memory failures never break generation.

## [0.6.82] — 2026-04-15

### Added
- **Simplicity discipline** in `DESIGN_THINKING` — anti-overengineering rules. No speculative fields, no hypothetical abstractions, no dead affordances, no unrequested settings panels. "Solve today's problem, not tomorrow's" (Karpathy principle).
- **Self-check verification list** in `DESIGN_THINKING` — six-item pre-return checklist (hierarchy, tokens, real content, page-type fit, slop absence, scope discipline). AI validates output before returning.
- **Surgical edit rules** in `editPageCode` prompt (Claude + OpenAI providers) — minimal-diff enforcement for `coherent chat` modifications. Blocks "while we're here" rewrites, quote-style reformats, and unrequested feature creep.

### Rationale
Applied Andrej Karpathy's four LLM coding principles (Think Before Coding, Simplicity First, Surgical Changes, Goal-Driven Execution) to the generation pipeline. Zero new exports, no architecture change — inline additions to existing prompts and the Tier 0 design-thinking block.

## [0.6.76] — 2026-04-09

### Added
- **`--dry-run` flag** for `coherent chat` — shows planned modifications without applying
- **E2E test script** (`scripts/e2e-test.sh`) — automated init → chat → check → fix → export
- **20 new tests** (711 → 731): modification-handler (19), split-generator fix (1)
- **Banned names/copy validator** — warns on "John Doe", "Acme Corp", "Seamless", "Elevate"
- **`inferPageType` expanded** — forgot-password, features, projects, project-detail

### Changed
- **Async I/O in preview.ts** — parallel file reads via Promise.all (was sequential readFileSync)

## [0.6.74] — 2026-04-09

### Added
- **25 new tests** (686 → 711): export.test.ts (10), check.test.ts (7), quality-validator (8)
- **Banned names validator** — catches "John Doe", "Jane Smith", "Acme Corp", "TechCorp"
- **Banned copy validator** — catches "Seamless", "Elevate", "Unleash", "Next-Gen", "Game-changer"
- **Dynamic component discovery** — `listNames()` scans `components/ui/` on disk, future-proof for new shadcn components

## [0.6.73] — 2026-04-09

### Fixed
- **Export ShowWhenNotAuthRoute** — regex corruption when stripping /design-system from array
- **Export next.config.mjs** — regex now matches `export default {}` (not just `const nextConfig`)
- **ComponentManager null guards** — variants/sizes arrays guarded for old config compatibility
- **Lockfile sync** — pnpm-lock.yaml updated after dependency changes (CI --frozen-lockfile fix)

### Added
- **Dynamic component discovery** — `listNames()` scans `components/ui/` directory, discovers components installed via `npx shadcn add` without CLI update
- **CLAUDE.md** — comprehensive 300-line project guide for Claude Code sessions

### Changed
- **check.ts performance** — file contents cached on first read, eliminating duplicate I/O for quality + link scanning
- **CLAUDE.md version** — updated to reflect 0.6.73, 686 tests

## [0.6.70] — 2026-04-09

### Fixed
- **Export security** — `.env.development`, `.env.production`, `.env.test` now excluded from export (prevents secret leakage)
- **Export cleanup** — `coherent.figma-import.json` and `coherent.figma-component-map.json` excluded from export
- **ESM compliance** — replaced `require('fs')` with static import in update.ts
- **baseUrl deprecation** — removed `baseUrl` from both tsconfig.json files (deprecated in TS 7, unnecessary with moduleResolution: "bundler")

### Added
- **Validator: transition-all** — detects `transition-all` (should use specific transition-colors/transform)
- **Validator: excessive padding** — detects `p-8` through `p-20` (max is p-6 per constraints)
- **QUICK_REFERENCE** — added `update`, `rules`, `migrate` commands

### Changed
- **Removed unused handlebars** from core dependencies
- **Removed dead code** — `logger.ts` (never imported), `setDefaultLightTheme` (never called)

## [0.6.69] — 2026-04-09

### Added
- **Quality score** — `coherent check` shows 0-100 score (Excellent/Good/Needs work/Critical). Available in JSON output for CI.
- **Tailwind v4 auto-detection** — reads package.json for @tailwindcss/postcss, injects v4-specific constraints (CSS-first config, @theme, @utility)
- **Project context** — reads components.json and installed UI components before generation. AI knows what's available.

## [0.6.67] — 2026-04-09

### Added
- **WCAG AA contrast** — minimum 4.5:1 text, 3:1 UI elements, verify muted-on-muted passes
- **Skip link** — sr-only + focus:not-sr-only pattern in root layout
- **Focus trap + tab order** — modal focus trap requirement, no tabIndex > 0
- **Scroll anchoring** — scroll-margin-top: 4rem on [id] for sticky header
- **View Transitions API** — progressive enhancement for page navigation
- **@property animated CSS vars** — enable smooth animation of custom properties
- **Tooltip group pattern** — instant after first open (Radix delayDuration)
- **Drag performance** — direct style.transform, never CSS variable updates

### Changed
- **Removed 84 stale docs** — plans, stories, QA reports, archive, superpowers, old templates (33,571 lines)
- **Updated CHANGELOG** — full log from v0.6.52 through v0.6.67
- **Updated QUICK_REFERENCE** — added --page, --component flags, components list, status

## [0.6.66] — 2026-04-09

### Added
- **Anti-slop design rules** — banned AI aesthetic fingerprints: identical 3-column grids, centered everything, gradient text on metrics, cyan-on-dark, neon accents, generic names/copy
- **Motion system** — exponential easing curves (quart/expo/circ/iOS), hover instant-on/ease-off, blur masking, grid-template-rows height animation, animation-fill-mode:backwards, motion decision framework
- **ARIA accessibility rules** — sr-only for icon buttons, aria-expanded, aria-live, aria-describedby, semantic HTML elements
- **Next.js App Router rules** — "use client" vs Server Component, next/image performance, SEO metadata, loading/error/not-found patterns
- **Context engineering** — per-page component filtering from architecture plan, page-type contextual rule injection, max 3→4 contextual blocks
- **Auto-inject shared component imports** — when plan says use a component but AI doesn't import it, auto-add the import statement
- **Sidebar generated in chat** — AppSidebar + shadcn sidebar UI component created in Phase 2, no separate `coherent fix` needed
- **Layout variety** — 5 alternative dashboard layouts (Overview, Feed, Detail, Kanban, Split) to avoid identical pages
- **Design System FAB on sidebar pages** — floating "Design System" button added to AppSidebar, not just Header
- **Modern CSS** — container queries, CSS has(), text-wrap: balance/pretty, letter-spacing by size
- **Comprehensive design constraints** — atmosphere language, AI slop test, progressive disclosure, optimistic UI, mock data separation, context-dependent animation intensity

### Fixed
- **Container centering** — Tailwind v4 removed default container centering; added `@utility container` with margin-inline, padding-inline, max-width
- **--page flag scoping** — skip multiPageHint when --page or --component explicitly set
- **--component crash** — guard against undefined baseClassName in isSimilarClassName
- **Sidebar install** — `coherent fix` now installs shadcn sidebar UI component before generating AppSidebar
- **Orange accent** — default accent was #F59E0B (amber), changed to muted values matching shadcn defaults
- **Escaped quotes** — handle AI-generated `\'Text'` (escaped opening quotes from JSON serialization)
- **Provider scope** — `provider` variable referenced outside scope in fix command sidebar block
- **Type-specific quality rules** — modifier.ts was always injecting marketing design quality; now uses page-type inference

### Changed
- **Token optimization** — compressed system messages in claude.ts and openai-provider.ts (~240 tokens saved per request)
- **Removed legacy exports** — DESIGN_QUALITY and DESIGN_CONSTRAINTS composites (dead code)
- **Removed unused skills/** — 5 unconnected md files (554 lines of dead content)
- **Removed duplicate docs** — FAQ_AI_PROVIDERS.md, PROVIDER_SELECTION.md merged into AI_PROVIDERS.md
- **Updated case study** — projector-tutorial.md rewritten for beginners, fresh v0.6.66 screenshots

## [Unreleased]

### Added
- **Auto-scaffold linked pages** — when `settings.autoScaffold` is enabled, creating a page (e.g. Login) auto-generates related pages (Sign Up, Forgot Password). Depth-1 only, with cost/time warning. Opt-in via `coherent init` prompt.
- **Fallback component styles** — components beyond the 9 core dedicated generators (Button, Card, Switch, Input, Textarea, Label, Badge, Checkbox, Select) now receive sensible fallback styles even when AI omits `className`. Covers 17 known component types + a universal fallback for unknown types.
- **Atomic file writes** — all file writes now use write-to-temp-then-rename pattern to prevent corruption on crash mid-write.
- **Project-level file lock** — `.coherent.lock` prevents parallel `coherent chat` commands from corrupting the config. Auto-cleans stale locks (>5 min or dead PID).
- **Batch write with rollback** — `batchWriteFiles()` utility backs up files before multi-file operations and restores on failure.
- **Shared component name deduplication** — `resolveUniqueName()` appends numeric suffix (e.g. Header → Header2) when creating shared components with duplicate names.
- **Unit tests** — 20 new tests across `ComponentGenerator.test.ts` (8 tests: dedicated generators + fallback styles) and `quality-validator.test.ts` (12 tests: validator detection + autoFixCode).
- **CI-safe init** — `coherent init` auto-scaffold prompt gracefully skips when stdin is not interactive (CI/CD), defaults to `autoScaffold: true`.

### Fixed
- **Shadowed import** — removed duplicate local `getInstalledPackages()` in `chat.ts` that shadowed the safer import from `self-heal.js` (missing null-safety for `dependencies`/`devDependencies`).
- **Custom component path missing fallbacks** — components with no variants/sizes going through `generateCustomComponent` now get `getFallbackBaseClassName()` instead of rendering with empty styles.
- **Double name deduplication** — removed redundant `resolveUniqueName()` call inside `createEntry()` (generator already deduplicates before building file path; double-call could cause name/path mismatch).
- **Validator false positives** — `<button`, `<select>`, `<table>`, `<input type="checkbox">` checks now skip matches inside single-line comments (`//`), multi-line comments (`/* */`), and string literals.
- **Multi-line comment tracking** — `checkLines()` now tracks `/* ... */` block comment state across lines.

### Changed
- **Next.js upgraded** from `15.0.3` (deprecated, security vulnerability) to `15.2.4`. Updated `create-next-app`, `FRAMEWORK_VERSIONS`, and `eslint-config-next`.
- **autoFixCode expanded** — now also fixes: `text-lg/xl/2xl` in CardTitle (removed), missing `'use client'` when hooks detected, double-space cleanup in className.
- **Auto-scaffold cost warning** — displays number of additional AI calls and how to disable before proceeding.
- **Welcome page v2** — complete redesign with navbar, hero, features grid, 3-step workflow, project examples with hover cards, FAQ accordion, CTA, and full footer. All validator-clean.
- **Self-heal hardening** — input type guard in `extractNpmPackagesFromCode`, package name sanitization to prevent command injection, `readdir` error handling in `collectImportedPackages`, added `async_hooks`/`diagnostics_channel`/`test` to NODE_BUILTINS.
- **Export pipeline robustness** — `ensureReadmeDeploySection` and `countPages` now handle file read errors gracefully.
- **Figma client retry** — 429 rate-limit responses now trigger automatic retry with `Retry-After` header. JSON parsing wrapped in `safeJson()`. `extractFileKey` supports `figma.com/design/` URLs.
- **Figma parser safety** — null guards on `file.components` and `file.styles` entries. Non-FRAME fallback nodes no longer treated as pages.
- **Figma import CLI** — `urlOrKey` validated before processing.
- **Auto-scaffold auth fix** — existence check now also looks in `app/(auth)/` directory to avoid duplicating already-created auth pages.

## [0.1.0] — Initial Release

### Core Features
- `coherent init` — scaffolds Next.js 15 + Tailwind v3 project with design system config
- `coherent chat` — AI-powered page and component generation from natural language
- `coherent validate` — quality checks for generated code (semantic tokens, accessibility, UX rules)
- `coherent preview` — dev server with live reload
- `coherent export` — strip platform overlay for production deployment

### Design System
- 9 dedicated component generators (Button, Card, Switch, Input, Textarea, Label, Badge, Checkbox, Select)
- Design tokens: colors (light/dark), spacing, typography, radius
- Component variants and sizes via `class-variance-authority`
- Design System viewer with interactive component showcase

### AI & Generation
- Modifier agent with design constraints and interaction patterns
- Page templates for common layouts (dashboard, settings, auth, etc.)
- Component reuse detection and auto-installation
- Quality validation with auto-fix for common issues

### Shared Components (Epic 2)
- CID-based manifest system (`coherent.components.json`)
- `promote-and-link`, `link-shared`, `modify-layout-block` operations
- Inline duplicate detection

### Figma Import (Epic 3)
- Figma API integration for token extraction
- Component normalization and page generation from Figma frames

### Self-Healing
- Dependency scanning and auto-installation
- Node.js built-in module exclusion (fs, path, crypto)
- Post-generation validation and auto-fix
- `'use client'` injection for hook-using components
