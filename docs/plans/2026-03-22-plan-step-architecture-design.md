# Component Architecture Plan Step — Design Spec

> Replaces post-hoc component extraction with upfront AI-driven planning.
> Fixes: false positive warnings, flat navigation, wrong spacing, shared component reuse.

## Problem Statement

The current multi-page generation pipeline extracts shared components only from the Home page (Phase 3.5). This produces landing-specific components (FeatureCard, PricingCard, HeroSection) that are irrelevant to app pages. Additionally:

- **False positive warnings**: token-overlap similarity detector flags every page for landing components
- **Flat navigation**: all pages get one nav bar regardless of context (landing vs app vs auth)
- **Wrong spacing**: `DESIGN_QUALITY` applies marketing spacing (`py-20`) to dashboard/app pages
- **No cross-page link planning**: autofix inserts `href="/"` as a blind default
- **Auth layout regression**: `isAuthRoute()` guard uses only route, missing page name check
- **Syntax errors**: `autoFixCode` HTML entity regex corrupts JSX inside attribute values

## Design

### 1. New Pipeline Flow

```
CURRENT:
Phase 1: Parse pages → Phase 2: Generate Home → Phase 3: Extract styles
→ Phase 3.5: Extract components FROM Home → Phase 4: Generate pages (parallel)

NEW:
Phase 1: Parse pages
Phase 2: Component Architecture Plan (NEW — one AI call)
Phase 3: Generate Home page (with planned components in prompt)
Phase 4: Extract styles from Home
Phase 5: Generate shared component CODE (using plan + styles)
Phase 6: Generate remaining pages in parallel (with components + styles)
```

Phase 3.5 (extraction from Home) is removed entirely. The plan replaces it.

### 2. Plan Step Output Schema

```typescript
const RouteGroupSchema = z.object({
  id: z.string(),
  layout: z.enum(['header', 'sidebar', 'none']),
  pages: z.array(z.string()),
})

const PlannedComponentSchema = z.object({
  name: z.string(),
  description: z.string(),
  props: z.string(),
  usedBy: z.array(z.string()),
  type: z.enum(['section', 'widget']),
  shadcnDeps: z.array(z.string()).default([]),
})

const PageNoteSchema = z.object({
  type: z.enum(['marketing', 'app', 'auth']),
  sections: z.array(z.string()),
  links: z.record(z.string()).optional(),
})

const ArchitecturePlanSchema = z.object({
  groups: z.array(RouteGroupSchema),
  sharedComponents: z.array(PlannedComponentSchema).max(8),
  pageNotes: z.record(z.string(), PageNoteSchema),
})
```

Example output for "Create a SaaS project management app with landing page":

```json
{
  "groups": [
    { "id": "public", "layout": "header", "pages": ["/", "/features", "/pricing"] },
    { "id": "app", "layout": "sidebar", "pages": ["/dashboard", "/projects", "/tasks", "/team", "/settings"] },
    { "id": "auth", "layout": "none", "pages": ["/login", "/register", "/forgot-password"] }
  ],
  "sharedComponents": [
    {
      "name": "StatCard",
      "description": "Metric card with icon, label, value, and optional trend indicator",
      "props": "{ icon: LucideIcon; label: string; value: string; trend?: string }",
      "usedBy": ["dashboard", "projects"],
      "type": "widget",
      "shadcnDeps": ["card"]
    },
    {
      "name": "MemberCard",
      "description": "Team member card with avatar, name, role, and status badge",
      "props": "{ name: string; role: string; avatar?: string; status: 'active' | 'away' | 'offline' }",
      "usedBy": ["team", "project-detail"],
      "type": "widget",
      "shadcnDeps": ["card", "avatar", "badge"]
    }
  ],
  "pageNotes": {
    "dashboard": {
      "type": "app",
      "sections": ["4 StatCards row", "Recent tasks table", "Team activity feed"],
      "links": { "View all tasks": "/tasks", "View project": "/projects/[id]" }
    },
    "login": {
      "type": "auth",
      "sections": ["Centered card with email/password form"],
      "links": { "Create account": "/register", "Forgot password": "/forgot-password" }
    }
  }
}
```

### 3. Dynamic Route Groups (not hardcoded)

Groups are determined by the plan AI, not by hardcoded `isAuthRoute()`/`isMarketingRoute()` functions. The vocabulary of layout types is predefined (`header`, `sidebar`, `none`), but which groups exist and which pages belong to each is AI-determined from the user's request.

After plan generation, page-to-group lookup replaces regex-based detection:

```typescript
function getPageGroup(route: string, plan: ArchitecturePlan): RouteGroup | undefined {
  return plan.groups.find(g => g.pages.includes(route))
}

function getPageType(route: string, plan: ArchitecturePlan): string {
  return plan.pageNotes[routeToKey(route)]?.type ?? 'app'
}
```

`isAuthRoute()` and `isMarketingRoute()` remain as fallbacks when no plan exists (backward compatibility).

### 4. Conditional Design Constraints

Replace the single `DESIGN_QUALITY` block with type-specific constraints:

| Page type | Spacing | Density | Key rules |
|-----------|---------|---------|-----------|
| `marketing` | `py-20 md:py-28` between sections, `mb-12 md:mb-16` title-to-content | Spacious, section-based | Full-width sections, hero blocks, generous whitespace |
| `app` | `gap-4 md:gap-6` between sections, `p-4 lg:p-6` content padding | Compact, functional | Data tables, card grids, filters. No hero/marketing sections |
| `auth` | Minimal — just card padding | Only the form | Centered card, `max-w-sm`, no nav, no section containers |

The page prompt builder selects constraints based on `pageNotes[page].type`.

### 5. Layout Generation from Plan

Instead of one flat layout, generate per-group layouts:

- `app/(public)/layout.tsx` — header nav with `groups[0].pages`
- `app/(app)/layout.tsx` — sidebar nav with `groups[1].pages`
- `app/(auth)/layout.tsx` — centered wrapper, no nav

The `regenerateLayout` function receives the plan and generates one layout file per group, using the group's `layout` type and `pages` list for navigation items.

### 6. Plan-Aware Similarity Warnings

Replace `warnInlineDuplicates()` token-overlap logic:

**Current**: Compare 600-char token snippets, fire if 12+ tokens overlap (massive false positives).

**New**: Check against the plan. If the plan says `StatCard.usedBy` includes `"dashboard"` and the Dashboard page does NOT import `@/components/shared/stat-card`, emit a warning. If a page is NOT in a component's `usedBy`, skip the check entirely.

### 7. Pre-Install shadcn Components from Plan

Before generating any page code, read `sharedComponents[].shadcnDeps` from the plan and install all required shadcn atoms:

```typescript
const allDeps = new Set(plan.sharedComponents.flatMap(c => c.shadcnDeps))
await provider.installBatch([...allDeps])
```

This eliminates the "missing component" error class during generation.

### 8. Plan Storage and Incremental Updates

Store the plan at `.coherent/plan.json`. When the user runs `coherent chat "add a billing page"`:

1. Load existing plan from `.coherent/plan.json`
2. Pass current plan + new request to AI: "Update this plan to include a billing page"
3. AI returns updated plan with the new page added to the correct group
4. Continue generation with updated plan

If no plan file exists (legacy projects), fall back to current behavior.

### 9. Plan Summary in Terminal

After plan generation, display a summary:

```
✔ Phase 2/6 — Architecture plan:
  Groups: public (header, 3 pages), app (sidebar, 7 pages), auth (none, 3 pages)
  Shared: StatCard → dashboard, projects | MemberCard → team, project-detail
  Total: 13 pages, 5 shared components
```

### 10. Remove normalizePageWrapper

With page-type-aware prompts, AI generates correct wrappers from the start:

- Marketing pages: section-based layout with generous spacing
- App pages: `<div className="space-y-6">` (compact)
- Auth pages: centered card with `flex min-h-svh items-center justify-center`

The `normalizePageWrapper()` regex post-fix is removed. Page type in the prompt replaces it.

### 11. Fallback on Plan Failure

If the plan AI call fails, returns invalid JSON, or does not pass Zod validation:

1. Log a warning: `⚠ Could not generate architecture plan — using default pipeline`
2. Fall back to current behavior (Phase 3.5 extraction from Home, flat nav)
3. System never crashes due to plan step failure

## Bugfixes (independent of plan step)

### Bug C: Auth Layout — isAuthRoute Guard

**Root cause**: `normalizePageWrapper` guard uses `!isAuthRoute(route)` but not `page.name`. Also `sign-in` is missing from `AUTH_ROUTE_SEGMENTS`.

**Fix**:
1. Add `'sign-in'` to `AUTH_ROUTE_SEGMENTS`
2. Change guard to use the broader `isAuth` variable (which checks both route and name)
3. With plan step, this becomes plan-based lookup and the regex fallback is secondary

### Bug D: Syntax Error — autoFixCode Regex

**Root cause**: HTML entity replacement (`&lt;` → `<`) fires inside attribute values and string literals, breaking JSX. Also `fixUnescapedLtInJsx()` in `self-heal.ts` doesn't handle multiline tags.

**Fix**:
1. HTML entity regex: skip matches inside quotes. Use negative lookbehind for `="` or check if match is inside a quoted string
2. `fixUnescapedLtInJsx`: exclude `\n` in the "character after `<`" set (align with the safer version in `autoFixCode`)

## Affected Files

### New files
- `packages/cli/src/commands/chat/plan-generator.ts` — plan AI call, Zod schema, prompt builder
- `packages/cli/src/commands/chat/plan-generator.test.ts` — unit tests

### Modified files
- `packages/cli/src/commands/chat/split-generator.ts` — new pipeline phases, consume plan
- `packages/cli/src/commands/chat/split-generator.test.ts` — updated tests
- `packages/cli/src/commands/chat/code-generator.ts` — layout generation from plan groups
- `packages/cli/src/commands/chat/code-generator.test.ts` — updated tests
- `packages/cli/src/commands/chat/modification-handler.ts` — page type from plan, remove normalizePageWrapper
- `packages/cli/src/commands/chat/utils.ts` — plan-aware warnInlineDuplicates
- `packages/cli/src/commands/chat/utils.test.ts` — updated tests
- `packages/cli/src/agents/design-constraints.ts` — split DESIGN_QUALITY into type-specific blocks
- `packages/cli/src/agents/modifier.ts` — page-type-aware prompt builder
- `packages/cli/src/agents/page-templates.ts` — add `sign-in` to AUTH_ROUTE_SEGMENTS
- `packages/cli/src/utils/quality-validator.ts` — fix HTML entity regex scope
- `packages/cli/src/utils/self-heal.ts` — fix fixUnescapedLtInJsx multiline
- `packages/cli/src/commands/chat.ts` — plan load/save, incremental update

## Testing Strategy

- Unit tests for plan schema validation (Zod parse/reject)
- Unit tests for `getPageGroup()`, `getPageType()` lookups
- Unit tests for type-specific design constraint selection
- Unit tests for plan-aware `warnInlineDuplicates`
- Unit tests for fixed `autoFixCode` regex (attribute values preserved)
- Unit tests for fixed `fixUnescapedLtInJsx` (multiline safety)
- Integration: plan generation → layout generation → page generation pipeline
- Fallback test: invalid plan → graceful degradation to current behavior

## Implementation Order

1. Plan schema + generator (new file, isolated)
2. Conditional design constraints (split DESIGN_QUALITY)
3. Layout generation from plan groups
4. Wire plan into split-generator pipeline
5. Plan-aware warnings (replace token overlap)
6. Plan storage + incremental updates
7. Pre-install shadcn deps from plan
8. Remove normalizePageWrapper
9. Bug C fix (isAuthRoute)
10. Bug D fix (autoFixCode regex)
11. Final integration testing
