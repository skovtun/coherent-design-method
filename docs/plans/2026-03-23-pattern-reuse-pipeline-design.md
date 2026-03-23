# Pattern Reuse Pipeline — Design Spec

**Date:** 2026-03-23
**Status:** Draft
**Scope:** Packages `cli` and `core`

## Problem

Coherent's core promise is "generate systems, not pages." The design system should form during generation and grow with each iteration. Currently this cycle is broken:

1. **Extraction is shallow.** Only header/footer are deterministically extracted. `extractStyleContext` captures CSS classes, not component patterns. AI-proposed extraction (`extractSharedComponents`) runs only after the anchor page.

2. **No extraction between `coherent chat` calls.** If a user runs `coherent chat "add dashboard"` then later `coherent chat "add analytics"`, the second call has no knowledge of patterns established in the dashboard. Only a manual `coherent sync` bridges the gap.

3. **AI gets names, not APIs.** The prompt tells AI "CID-001 Header — Main site header" but provides no props, no usage example, no import path with enough detail. AI generates incompatible usage or ignores shared components entirely.

4. **No validation of reuse.** The prompt says "MANDATORY REUSE" but nothing checks whether the generated code actually imports and uses available shared components.

5. **Token cost concern.** Injecting full code of all shared components into every prompt is expensive and degrades AI focus. A project with 20 components would add 1000–2000 lines of context.

6. **Bugs in current pipeline:**
   - `generateSharedComponentsFromPlan` writes files but does not update `coherent.components.json`
   - `extractReusablePatterns` in `coherent sync` discards its output (prints to console, not saved)
   - `buildSharedComponentsSummary` shows only name + type + description — no props or usage

## Design

### 1. Extended Registry Schema

Extend `SharedComponentEntrySchema` in `packages/core/src/types/shared-components-manifest.ts`:

```typescript
interface SharedComponentEntry {
  // Existing fields
  id: string                     // CID-001
  name: string                   // StatsCard
  type: ComponentType            // extended enum (see below)
  file: string                   // components/shared/stats-card.tsx
  usedIn: string[]               // ['app/dashboard/page.tsx']
  description: string
  propsInterface: string         // "{ icon: LucideIcon; value: string; label: string; trend?: number }"
  createdAt: string

  // New fields
  usageExample: string           // '<StatsCard icon={Users} value="1,234" label="Total Users" />'
  dependencies: string[]         // ['lucide-react', 'components/ui/card']
  source: 'extracted' | 'generated' | 'manual'
  // source values: 'extracted' = from extraction pipeline, 'generated' = from plan-based generation,
  // 'manual' = from `coherent chat --component` or user placement in components/shared/
}

type ComponentType =
  | 'layout'         // Header, Footer, Sidebar
  | 'navigation'     // Tabs, Breadcrumbs, Pagination
  | 'data-display'   // StatsCard, DataTable, Chart
  | 'form'           // FilterToolbar, SearchInput, SettingsForm
  | 'feedback'       // EmptyState, ErrorBoundary, LoadingState
  | 'section'        // Hero, PricingCard, TestimonialCard
  | 'widget'         // backward compat
```

New fields use `.default()` in Zod so existing `coherent.components.json` files parse without errors. New fields are populated on next extraction or sync.

### 2. Tiered Prompt Injection

Instead of injecting full component code, use a two-level approach:

**Level 1 — All components (1 line each):**
```
Available shared components:
- CID-001 Header (layout) — Main site header with navigation
- CID-002 Footer (layout) — Site footer with links
- CID-003 StatsCard (data-display) — Metric card with icon, value, trend
...
```

**Level 2 — Relevant components only (5 lines each):**
Selected by matching component `type` to page type:

| Page type (existing) | Relevant component types |
|----------------------|-------------------------|
| app | data-display, form, navigation, feedback |
| auth | form, feedback |
| marketing | section, layout |

Note: the codebase uses three page types (`'marketing' | 'app' | 'auth'`). Settings pages are classified as `app`.

For each relevant component:
```
### StatsCard (CID-003)
Props: { icon: LucideIcon; value: string; label: string; trend?: number }
Usage: <StatsCard icon={Users} value="1,234" label="Total Users" trend={12} />
Import: import { StatsCard } from '@/components/shared/stats-card'
```

**Fallback instruction (1 line):**
"If you need a component from the list above that isn't detailed below, import it by path — the system will validate usage post-generation."

**Token budget:** 20 components → ~20 lines (L1) + ~25 lines (L2 for ~5 relevant) + 1 line fallback = **~46 lines** instead of 2000.

**Implementation:** New function `buildTieredComponentsPrompt(manifest, pageType)` in `packages/cli/src/commands/chat/split-generator.ts` replaces `buildSharedComponentsNote` and `buildSharedComponentsSummary`.

### 3. Extraction Pipeline

Three-level extraction, from cheapest to most expensive:

#### Level 1: File-based (0 API calls, ~50ms)

Runs after EVERY `coherent chat` generation. Scoped to changed files only.

Steps:
1. Scan changed/new files in `components/` (excluding `ui/`)
2. For each component file, extract via regex/string parsing:
   - `name` from `export function/const`
   - `propsInterface` from `interface Props` / `type Props`
   - `dependencies` from import statements
3. Scan generated page files for imports of components:
   - Update `usedIn[]` for existing manifest entries
   - Extract first JSX usage as `usageExample`
4. Register new components found in `components/shared/`
5. Flag components in `components/` (not `shared/`, not `ui/`) used on 2+ pages as shared candidates

#### Level 2: AI Classification (1 cheap API call, ~300 tokens)

Runs only when Level 1 finds NEW unclassified components.

Input (~200 tokens):
```
Classify these components:
1. stats-card.tsx: export function StatsCard({ icon, value, label, trend }: Props)
2. filter-toolbar.tsx: export function FilterToolbar({ filters, onFilterChange }: Props)
```

Output (~100 tokens):
```json
[
  { "name": "StatsCard", "type": "data-display",
    "description": "Metric card with icon, value, and trend indicator" },
  { "name": "FilterToolbar", "type": "form",
    "description": "Search and filter controls for data views" }
]
```

Multiple components can be batched in a single API call.

#### Level 3: User-driven (`coherent chat --component`)

User creates a shared component explicitly:
```bash
coherent chat --component "StatsCard" "card with icon, numeric value, label, and trend indicator"
```

Flow:
1. AI generates component code (standard generation call with design constraints)
2. `autoFixCode` post-processes
3. Write to `components/shared/stats-card.tsx`
4. Level 1 extraction (props, dependencies)
5. Level 2 classification (type, description, usageExample)
6. Full manifest registration

#### When each level runs

| Event | Level 1 | Level 2 | Level 3 |
|-------|:-------:|:-------:|:-------:|
| `coherent chat` (batch) | After each page | If new components found | — |
| `coherent chat` (subsequent) | After generation | If new components found | — |
| `coherent chat --component` | After file write | For classification | Component generation |
| `coherent sync` | Full scan | Optional | — |

#### Shared threshold

- File in `components/shared/` → immediately shared (user intent)
- File in `components/` (not `shared/`, not `ui/`) used on 2+ pages → suggest making shared
- `coherent chat --component` → immediately shared
- AI extraction during batch → immediately shared
- Files in `components/ui/` (shadcn) → never registered

### 4. Reuse Validation

New module: `packages/cli/src/utils/reuse-validator.ts`

Pure function: `validateReuse(manifest, generatedCode, pageType) → ReuseWarning[]`

Three checks, all producing warnings (not blockers):

**Check 1: Missed reuse**
For each shared component with `type` relevant to `pageType`: check if the generated code imports it. If not, and the code contains inline JSX structurally similar to the component (e.g., Card with numeric content when StatsCard exists), emit warning.

Similarity heuristic: component `type` matches a pattern in the generated code. Example: `data-display` component exists + page contains `<Card>` with `text-2xl font-bold` inside → likely missed reuse.

Warning format: "StatsCard (CID-003) is available but not used. The page contains similar inline patterns at line ~42."

**Check 2: Wrong usage**
If code imports a shared component, verify props match `propsInterface` from manifest. Check for missing required props and unknown prop names via regex on JSX attributes.

Action: warning with suggestion. Auto-fix when possible (add missing prop with sensible default).

**Check 3: Duplicate creation**
If a new component file is created, compare against existing manifest entries. Flag as potential duplicate when: same `type` + >50% overlap in prop names.

Warning format: "New MetricCard looks similar to existing StatsCard (CID-003). Consider reusing StatsCard instead."

**Integration points:**
- Called after each page generation in `coherent chat`
- Available via `coherent check` (read-only diagnostics)
- Warnings displayed in console with ora spinner

### 5. Auto-sync After `coherent chat`

At the end of every `coherent chat` (after generation, after autoFix), add a lightweight sync step:

1. Level 1 file-based extraction on changed files (~50ms)
2. Update `usedIn` for existing components
3. Register new components from `components/shared/`
4. Level 2 AI classification only if new components found (~300 tokens)
5. Save manifest

This is NOT a full `coherent sync` — no DS viewer regeneration, no `.cursorrules` update, no full project scan. Only manifest synchronization.

### 6. `coherent chat --component` Command

New flag on the existing `chat` command:

```bash
coherent chat --component "ComponentName" "description of what it should do"
```

Implementation in `packages/cli/src/commands/chat.ts`:
- If `--component` flag is present, skip normal page generation flow
- Generate component code via AI with design constraints
- Write to `components/shared/{kebab-name}.tsx`
- Run extraction pipeline (Levels 1 + 2)
- Register in manifest
- Print summary: "Created StatsCard (CID-005, data-display). Usage: ..."

### 7. Bug Fixes

**7a.** `generateSharedComponentsFromPlan` (`packages/cli/src/commands/chat/plan-generator.ts`): After writing component files, call `generateSharedComponent` (which updates manifest) instead of direct `writeFile`.

**7b.** `extractReusablePatterns` (`packages/cli/src/commands/sync.ts`): Currently returns `{pattern, count, sample}[]` but only prints to console. Reshape its output to populate `config.stylePatterns` (a typed `StylePatterns` object with named fields like `card`, `section`, etc.) which is already read by `buildExistingPagesContext`. The reshaping maps high-count className patterns to the appropriate `StylePatterns` field by matching against known categories.

**7c.** `buildSharedComponentsSummary` (`packages/cli/src/commands/chat/split-generator.ts`): Replace with `buildTieredComponentsPrompt` that includes `propsInterface` and `usageExample` for relevant components.

### 8. `.cursorrules` / `CLAUDE.md` Enrichment

When `coherent sync` or `coherent rules` regenerates editor context files, include the richer component metadata from the extended manifest: type taxonomy, usage examples, prop interfaces. This gives editor AI (Cursor, Claude Code) the same component knowledge as the CLI pipeline. No new mechanism needed — update the existing template that generates these files.

## File Change Map

### New files
| File | Purpose |
|------|---------|
| `packages/cli/src/utils/reuse-validator.ts` | Reuse validation (3 checks) |
| `packages/cli/src/utils/reuse-validator.test.ts` | Tests for reuse validation |
| `packages/cli/src/utils/component-extractor.ts` | Level 1 file-based extraction logic |
| `packages/cli/src/utils/component-extractor.test.ts` | Tests for file-based extraction |

### Modified files
| File | Changes |
|------|---------|
| `packages/core/src/types/shared-components-manifest.ts` | Add `usageExample`, `dependencies`, `source` fields; extend `ComponentType` enum |
| `packages/core/src/managers/SharedComponentsRegistry.ts` | Support new fields in `createEntry` |
| `packages/core/src/generators/SharedComponentGenerator.ts` | Pass new fields through `generateSharedComponent` |
| `packages/cli/src/commands/chat/split-generator.ts` | Replace `buildSharedComponentsNote`/`buildSharedComponentsSummary` with `buildTieredComponentsPrompt`; add inter-page extraction in Phase 5 loop; add auto-sync at end |
| `packages/cli/src/commands/chat/plan-generator.ts` | Fix: use `generateSharedComponent` instead of direct `writeFile`; extend `PlannedComponentSchema` to accept the full `ComponentType` enum (currently only allows `'section' | 'widget'`) |
| `packages/cli/src/agents/modifier.ts` | Update shared components section in `buildModificationPrompt` to use tiered format |
| `packages/cli/src/commands/chat.ts` | Add `--component` flag; add auto-sync step; integrate reuse validation |
| `packages/cli/src/commands/sync.ts` | Save `extractReusablePatterns` output; enhanced extraction with new metadata fields |
| `packages/cli/src/commands/check.ts` | Add reuse validation to diagnostics output |
| `packages/cli/src/utils/component-integrity.ts` | Enhanced `reconcileComponents` with new metadata fields |

## End-to-End Flow (After Changes)

```
coherent chat "add dashboard and analytics pages"
  │
  ├─ Phase 1: Plan pages + shared components
  ├─ Phase 2: Generate home page
  ├─ Phase 3: Extract header/footer (deterministic, unchanged)
  ├─ Phase 4: Extract style context (unchanged)
  ├─ Phase 4.5: Generate planned shared components
  │   └─ FIX: register in manifest via generateSharedComponent
  ├─ NEW: Level 1 extraction → update manifest with metadata
  ├─ NEW: Level 2 AI classify (if new components)
  │
  ├─ Phase 5: Generate dashboard
  │   ├─ NEW: Tiered injection (L1 all + L2 relevant)
  │   ├─ Generate page
  │   ├─ autoFixCode (unchanged)
  │   ├─ NEW: Reuse validation (3 checks → warnings)
  │   ├─ NEW: Level 1 extraction → update manifest
  │   └─ Manifest ready for next page
  │
  ├─ Phase 5: Generate analytics
  │   ├─ NEW: Tiered injection (includes dashboard components)
  │   ├─ Generate page
  │   ├─ autoFixCode (unchanged)
  │   ├─ NEW: Reuse validation
  │   └─ NEW: Level 1 extraction → update manifest
  │
  └─ NEW: Auto-sync (lightweight manifest finalization)
```

## Backward Compatibility

- Existing `coherent.components.json` files parse without errors (new fields have `.default()`)
- New fields populated on next `coherent sync` or `coherent chat`
- No changes to `coherent init` — new projects start with empty manifest as before
- `--component` flag is additive — existing `coherent chat` usage unchanged
- Reuse validation warnings are non-blocking — no existing workflow breaks

## Testing Strategy

- All new modules (`reuse-validator`, `component-extractor`) get co-located unit tests
- Existing tests for `SharedComponentsRegistry`, `generateSharedComponent` updated for new fields
- Integration tests: manifest round-trip with old format → new format migration
- `buildTieredComponentsPrompt` tested with various manifest sizes and page types

## Out of Scope

- AST-based code analysis (regex/string parsing sufficient for Level 1)
- MCP server for component queries (future: editor workflow enhancement)
- Component deprecation mechanism
- Auto-replacement of inline patterns with shared components (Phase 2 candidate)
- Pattern taxonomy beyond type field (Phase 3 candidate)
- Design System viewer updates for new metadata
