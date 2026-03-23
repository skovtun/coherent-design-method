# Smart Reuse Engine & Infrastructure Fixes

> Design spec for intelligent component reuse and sidebar/layout bug fixes.

## Problem Statement

The coherent platform generates UI pages but fails to reuse existing shared components effectively. The Pattern Reuse Pipeline (v0.6.14) added metadata infrastructure (manifest enrichment, tiered prompts, reuse validation) but lacks the **intelligence layer** that maps specific user requests to specific components. Additionally, a chain of infrastructure bugs prevents sidebar layouts from working.

### Bugs Found

| # | Bug | Root Cause |
|---|-----|-----------|
| 0 | Sidebar layout never works | `config` (line 110) and `dsm.getConfig()` (line 135) in `chat.ts` are separate objects. `split-generator.ts` mutates `modCtx.config.navigation.type = 'sidebar'` but `dsm` never sees it. Later `ensureAppRouteGroupLayout(projectRoot, dsm.getConfig().navigation.type, navChanged)` overwrites sidebar layout with header layout. |
| A | Group layouts lost between sessions | Plan stores per-group layouts (`app: sidebar`, `public: header`) but config only has global `navigation.type`. No persistence. |
| E | AI doesn't know page is inside sidebar | `sharedLayoutNote` hardcoded: "Header and Footer are shared components." No mention of sidebar. AI generates inline navigation. |
| F | Manual layout edits overwritten | `ensurePlanGroupLayouts` writes all layouts unconditionally — no hash check, no existence check. |
| G | Plan regenerated from scratch | `updateArchitecturePlan` exists but is never called in production. Second `coherent chat` loses previous plan. |

### Architecture Gaps

| # | Gap | Impact |
|---|-----|--------|
| B | Auto-sync timing | Components from page N unavailable for page N+1. Manifest updated only after ALL pages. |
| C | Reuse warnings without action | `validateReuse` logs warnings but nothing acts on them. |
| H | No request-aware component mapping | Tiered prompts list components by page TYPE. No analysis of what the specific REQUEST needs and what existing code provides. |

## Design

### Section 1: Smart Reuse Engine

New module: `packages/cli/src/utils/reuse-planner.ts`

Called BEFORE each page generation (both multi-page split-generator and single-page parseModification flows).

#### Interface

```typescript
interface ReusePlanEntry {
  component: string        // "StatCard"
  targetSection: string    // "Stats row"
  reason: string           // "Dashboard uses same pattern"
  importPath: string       // "@/components/shared/stat-card"
  exampleUsage: string     // "<StatCard label='...' value='...' />"
}

interface NewComponentEntry {
  name: string             // "TaskRow"
  reason: string           // "No existing component matches task list items"
  suggestedType: string    // "data-display"
}

interface PatternEntry {
  pattern: string          // "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4"
  sourcePages: string[]    // ["/dashboard"]
  targetSection: string    // "Stats row"
}

interface ReusePlan {
  pageName: string
  reuse: ReusePlanEntry[]
  createNew: NewComponentEntry[]
  reusePatterns: PatternEntry[]
}
```

#### Input

- User request (full text)
- Shared components manifest (with metadata from Pattern Reuse Pipeline)
- Existing page code (actual TSX files, not just pageAnalysis)
- Architecture plan (groups, pageNotes, sections) — or null for single-page
- Page type (marketing / app / auth)

#### Logic (Hybrid: Rules + AI)

**Step 1 — Deterministic mapping.** Match plan `pageNotes.sections` against manifest components by type:

| Section keyword | Component types to search |
|----------------|--------------------------|
| stats, metrics, kpi | data-display |
| list, table, items | data-display |
| form, filter, search | form |
| nav, menu, tabs | navigation |
| card, grid | widget, data-display |
| chart, graph | data-display |
| alert, toast, banner | feedback |

For each match: check if a component with overlapping props exists in manifest. If found → add to `reuse` array with `exampleUsage` from manifest.

**Step 2 — Code pattern extraction.** Scan existing page TSX files for recurring inline patterns:

- Grid layouts (extract `className` patterns from elements containing 3+ similar children)
- Card structures (JSX subtrees with similar shape on 2+ pages)
- Import patterns (which shared components are actually used, and how)

Matches → `reusePatterns` array.

**Step 3 — AI refinement (optional, ~200 tokens).** If deterministic mapping is uncertain (e.g., section "Activity feed" — is it data-display or widget?), one lightweight AI call:

```
Given component ActivityFeed (props: {items: Activity[]}) and section "Recent activity",
should this component be used? Respond: yes/no/reason
```

If AI call fails → skip, use deterministic result only. Reuse planner must never block pipeline.

#### Prompt Directive Output

`buildReusePlanDirective(plan: ReusePlan): string` converts the plan into a prompt section that **replaces** (not adds to) the following existing prompt parts:

- `tieredNote` (replaced by `reuse` array with specific directives)
- `sharedComponentsNote` (covered by `reuse` entries)
- `sharedLayoutNote` (covered by infrastructure fix 2d)

Result: prompt may be **shorter** than current while being more specific.

Format:

```
COMPONENT REUSE PLAN FOR THIS PAGE:

MUST USE (import these — do NOT re-implement):
  - StatCard from @/components/shared/stat-card — for "Stats row" section
    Example: <StatCard label="Active Tasks" value="12" icon={<CheckCircle />} />
  - FilterBar from @/components/shared/filter-bar — for "Filters" section
    Example: <FilterBar filters={[...]} onFilterChange={handleFilter} />

CREATE NEW (no existing match):
  - TaskRow — for individual task items in the list (suggest type: data-display)

LAYOUT PATTERNS (copy from existing pages for visual consistency):
  - Stats grid: className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4"
    (source: /dashboard)
```

#### Reuse Plan for Modifications (update-page)

When the user modifies an existing page, the reuse planner receives:
- Current page code (instead of pageNotes)
- User's modification request
- Manifest

It produces the same `ReusePlan` output. Section mapping comes from analyzing the modification request rather than plan pageNotes.

#### Post-Generation Verification

After page generation, compare generated code against the `ReusePlan`:

1. For each `reuse` entry: check if the component is imported in the generated code.
2. If a MUST USE component is missing: retry generation once with strengthened directive.
3. If retry also fails: log warning (don't block pipeline).
4. Report verification results to user via spinner/console output.

#### Pattern Graduation

After all pages in a batch are generated:

1. Scan generated page files for inline patterns that appear on 2+ pages.
2. For each qualifying pattern: create a shared component automatically.
3. Update manifest with the new component.
4. The next generation cycle (or next batch page via incremental sync) benefits from the new component.

Timing: runs in auto-sync phase, after generation, before final manifest save.

### Section 2: Infrastructure Fixes

#### 2a. Config Unification

In `chat.ts`: remove standalone `const config = loadConfig(configPath)` (line 110). Use `dsm.getConfig()` for `modCtx` and all config reads. Single source of truth.

Impact: when `split-generator.ts` mutates `modCtx.config.navigation.type`, the change is visible to `regenerateLayout` because it reads from the same DSM instance.

#### 2b. `groupLayouts` in Config

Add to `DesignSystemConfig` schema:

```typescript
groupLayouts?: Record<string, 'header' | 'sidebar' | 'both' | 'none'>
```

Written by `ensurePlanGroupLayouts`. Read by `regenerateLayout` → `ensureAppRouteGroupLayout`.

When `ensureAppRouteGroupLayout` runs:
1. Check `config.groupLayouts?.['app']` first
2. Fall back to `config.navigation?.type` if `groupLayouts` absent
3. This preserves backward compatibility — no migration needed

Zod schema: `.optional()` with no default (undefined = use old behavior).

#### 2c. Safe Layout Writes

`ensurePlanGroupLayouts` must check before overwriting:

1. If layout file exists: compute hash, compare with stored hash
2. If hashes differ (user edited manually): skip overwrite, log warning
3. If hashes match or file doesn't exist: write and store new hash

Uses existing `canOverwriteShared` pattern from `regenerateLayout`.

#### 2d. Layout-Aware Prompt

Dynamic `sharedLayoutNote` in `split-generator.ts` based on group layout:

- `sidebar`: "This page is inside a SIDEBAR layout. Navigation is handled by the sidebar component. Do NOT create your own sidebar, side nav, or navigation menu. The page content occupies the main area next to the sidebar. Start with main content directly."
- `header`: "Header and Footer are shared components rendered by the root layout. Do NOT include any site-wide header, nav, or footer. Start with main content directly."
- `none`: "This page has no shared navigation. Include navigation only if the page design requires it."

Source: `plan.groups.find(g => g.pages.includes(route))?.layout` or `config.groupLayouts`.

#### 2e. Plan Persistence

In `splitGeneratePages`, before generating a new plan:

```typescript
const existingPlan = loadPlan(projectRoot)
if (existingPlan) {
  plan = await updateArchitecturePlan(existingPlan, newPages, message, ai)
} else {
  const { plan: generated } = await generateArchitecturePlan(pages, message, ai, layoutHint)
  plan = generated
}
```

`updateArchitecturePlan` already exists (line 215 in `plan-generator.ts`) — just needs to be called.

#### 2f. Incremental Manifest Sync

Inside the pMap loop (Phase 5), after each page is successfully generated:

1. Extract metadata from generated page code (props, component imports)
2. Update manifest entries with new `usedIn` references
3. For concurrent execution (AI_CONCURRENCY = 3): use a simple async mutex

```typescript
let manifestLock = Promise.resolve()

async function updateManifestSafe(fn: (m: Manifest) => Manifest) {
  manifestLock = manifestLock.then(async () => {
    const m = await loadManifest(projectRoot)
    const updated = fn(m)
    await saveManifest(projectRoot, updated)
  })
  return manifestLock
}
```

This ensures the reuse planner for page N+1 sees components used/created by page N.

### Section 3: Integration

#### Full Pipeline Flow

```
coherent chat:
  1. Load config via dsm.getConfig() [FIXED: single source]
  2. Load manifest + loadPlan()
  3. Parse request → multiPageHint?

  IF multi-page (split-generator):
    Phase 1: Extract pages
    Phase 2: loadPlan() → updateArchitecturePlan() or generateArchitecturePlan() [FIXED]
    Phase 3: Generate shared components → register in manifest
    Phase 4: ensurePlanGroupLayouts() [FIXED: hash check + groupLayouts]
    Phase 5: For each page:
      5a. buildReusePlan(request, manifest, existingPages, plan, pageType) [NEW]
      5b. Convert ReusePlan → prompt directive (REPLACES tiered/shared/layout notes)
      5c. Generate page code with layout-aware prompt [FIXED]
      5d. Post-gen verify: compare code vs ReusePlan [NEW]
      5e. If MUST USE ignored → retry once [NEW]
      5f. Incremental manifest sync [FIXED: per-page with mutex]
    Phase 6: Pattern graduation scan [NEW]

  IF single-page (parseModification):
    4a. buildReusePlan(request, manifest, existingPages, null, pageType) [NEW]
    4b. Inject ReusePlan into modification prompt (REPLACES tiered/shared notes)
    4c. Generate/modify page with layout-aware prompt [FIXED]
    4d. Post-gen verify + retry if needed [NEW]

  ALWAYS after generation:
    - regenerateFiles() with groupLayouts-aware config [FIXED]
    - Auto-sync manifest (existing behavior)
    - Pattern graduation (if batch > 1 page) [NEW]
    - Save config + manifest
```

#### Transparency Logging

User sees reuse decisions in spinner/console output:

```
🔄 Reuse Plan for "Tasks":
   ✦ REUSE: StatCard (from Dashboard), FilterBar
   ✦ CREATE: TaskRow (data-display)
   ✦ PATTERNS: stats grid layout (from /dashboard)
```

After generation:

```
✓ Reuse verified: StatCard ✓, FilterBar ✓, TaskRow created
```

Or on retry:

```
⚠ StatCard not used — retrying with stronger directive...
✓ Retry successful: StatCard ✓
```

#### Graceful Degradation

If reuse planner fails at any step:
- Deterministic mapping throws → fall back to existing tiered prompts
- AI refinement fails → use deterministic result only
- Post-gen verification fails → skip retry, continue normally
- Manifest mutex deadlocks → 5s timeout, skip sync for this page

The entire reuse planner is an enhancement. Pipeline must work without it.

#### Backward Compatibility

- `groupLayouts` field is optional in config schema — old projects work unchanged
- Reuse planner only activates when manifest has entries — empty manifests get current behavior
- `buildReusePlanDirective` falls back to `buildTieredComponentsPrompt` if ReusePlan is empty

### Testing Strategy

| Module | Test approach |
|--------|--------------|
| `reuse-planner.ts` deterministic mapping | Unit tests with mock manifests and pageNotes |
| `reuse-planner.ts` code pattern extraction | Unit tests with sample TSX strings |
| `reuse-planner.ts` AI refinement | Mock AI provider, test prompt construction and response parsing |
| `buildReusePlanDirective` | Unit tests: verify output format, verify it replaces (not adds to) existing notes |
| Post-gen verification | Unit tests: generated code with/without expected imports |
| Config unification | Integration test: mutate modCtx.config, verify dsm.getConfig() reflects change |
| `groupLayouts` | Unit tests: schema parsing, fallback behavior |
| Safe layout writes | Unit tests with hash comparison |
| Plan persistence | Unit tests: loadPlan → updateArchitecturePlan flow |
| Incremental manifest sync | Unit tests: mutex behavior, manifest state after concurrent updates |
| Pattern graduation | Unit tests: inline pattern detection across multiple TSX strings |

### Future Enhancements (Out of Scope)

- `coherent check` with reuse planner for richer diagnostics
- Component versioning/variants (StatCard → StatCardWithTrend)
- Learning from user edits (feedback loop)
- Visual diff of reuse plan vs generated output

### Files Changed

New:
- `packages/cli/src/utils/reuse-planner.ts`
- `packages/cli/src/utils/reuse-planner.test.ts`

Modified:
- `packages/cli/src/commands/chat.ts` — config unification, reuse planner integration for single-page
- `packages/cli/src/commands/chat/split-generator.ts` — reuse planner integration, layout-aware prompt, incremental sync
- `packages/cli/src/commands/chat/code-generator.ts` — safe layout writes, groupLayouts-aware ensureAppRouteGroupLayout
- `packages/cli/src/commands/chat/plan-generator.ts` — call updateArchitecturePlan when plan exists
- `packages/core/src/types/design-system.ts` — add `groupLayouts` to schema
