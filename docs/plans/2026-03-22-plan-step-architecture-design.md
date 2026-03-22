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

All identifiers use **route-based keys** (e.g., `/dashboard`, `/projects/[id]`). The helper `routeToKey` strips the leading slash and defaults to `"home"` for `/`:

```typescript
function routeToKey(route: string): string {
  return route.replace(/^\//, '') || 'home'
}
```

```typescript
const RouteGroupSchema = z.object({
  id: z.string(),
  layout: z.enum(['header', 'sidebar', 'both', 'none']),
  pages: z.array(z.string()),   // routes: ["/dashboard", "/projects"]
})

const PlannedComponentSchema = z.object({
  name: z.string(),
  description: z.string(),
  props: z.string(),            // human-readable hint injected into prompts, not parsed
  usedBy: z.array(z.string()),  // routes: ["/dashboard", "/projects"]
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
  pageNotes: z.record(z.string(), PageNoteSchema),  // keyed by routeToKey()
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
      "usedBy": ["/dashboard", "/projects"],
      "type": "widget",
      "shadcnDeps": ["card"]
    },
    {
      "name": "MemberCard",
      "description": "Team member card with avatar, name, role, and status badge",
      "props": "{ name: string; role: string; avatar?: string; status: 'active' | 'away' | 'offline' }",
      "usedBy": ["/team", "/projects/[id]"],
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

Groups are determined by the plan AI, not by hardcoded `isAuthRoute()`/`isMarketingRoute()` functions. The vocabulary of layout types is predefined (`header`, `sidebar`, `both`, `none`), but which groups exist and which pages belong to each is AI-determined from the user's request.

After plan generation, page-to-group lookup replaces regex-based detection:

```typescript
function routeToKey(route: string): string {
  return route.replace(/^\//, '') || 'home'
}

function getPageGroup(route: string, plan: ArchitecturePlan): RouteGroup | undefined {
  return plan.groups.find(g => g.pages.includes(route))
}

function getPageType(route: string, plan: ArchitecturePlan): string {
  return plan.pageNotes[routeToKey(route)]?.type ?? 'app'
}
```

`isAuthRoute()` and `isMarketingRoute()` remain as fallbacks when no plan exists (backward compatibility).

**File system path mapping**: The existing `routeToFsPath()` in `utils.ts` is updated to use the plan's group ID as the Next.js route group directory:

```typescript
function routeToFsPath(route: string, plan?: ArchitecturePlan): string {
  if (plan) {
    const group = getPageGroup(route, plan)
    if (group && group.id !== 'root') {
      // e.g., group.id="app" → app/(app)/dashboard/page.tsx
      const slug = route.replace(/^\//, '') || ''
      return `app/(${group.id})/${slug}/page.tsx`
    }
  }
  // Root route "/" → app/page.tsx (no group wrapper)
  if (route === '/') return 'app/page.tsx'
  // Fallback to existing regex-based logic
  return existingRouteFsPath(route)
}
```

The root route `/` always stays at `app/page.tsx` (no group wrapper). Other routes are placed inside their group's directory: `app/(public)/features/page.tsx`, `app/(app)/dashboard/page.tsx`, `app/(auth)/login/page.tsx`.

This is NOT a breaking change for existing projects: `routeToFsPath` only runs during generation. Existing files are not moved. When a plan is absent, the existing logic applies unchanged.

### 4. Conditional Design Constraints

Replace the single `DESIGN_QUALITY` block with type-specific constraint functions:

```typescript
// design-constraints.ts — new exports
export function getDesignQualityForType(type: 'marketing' | 'app' | 'auth'): string

// Internals:
// DESIGN_QUALITY_MARKETING — current DESIGN_QUALITY "Spacing Rhythm" section (py-20, mb-12, etc.)
//   + "Full-width sections, hero blocks, generous whitespace"
//   + "NEVER include app-style elements (sidebar widgets, data tables, filters)"
//
// DESIGN_QUALITY_APP — new compact rules:
//   + "gap-4 md:gap-6 between sections, p-4 lg:p-6 content padding"
//   + "Data tables, card grids, filters. No hero/marketing sections"
//   + "NEVER include marketing sections (hero, pricing, testimonials)"
//
// DESIGN_QUALITY_AUTH — minimal:
//   + "Centered card, max-w-sm, no nav, no section containers"
//   + "flex min-h-svh items-center justify-center wrapper"
```

| Page type | Spacing | Density | Key rules |
|-----------|---------|---------|-----------|
| `marketing` | `py-20 md:py-28` between sections, `mb-12 md:mb-16` title-to-content | Spacious, section-based | Full-width sections, hero blocks, generous whitespace |
| `app` | `gap-4 md:gap-6` between sections, `p-4 lg:p-6` content padding | Compact, functional | Data tables, card grids, filters. No hero/marketing sections |
| `auth` | Minimal — just card padding | Only the form | Centered card, `max-w-sm`, no nav, no section containers |

The shared `DESIGN_QUALITY` rules that apply to ALL types (typography scale, color tokens, icon sizing, accessibility) remain in a common `DESIGN_QUALITY_COMMON` block. Only spacing, layout patterns, and content rules differ.

The prompt builder in `modifier.ts` selects the right block:

```typescript
const pageType = plan ? getPageType(route, plan) : inferPageTypeFromRoute(route)
const qualityBlock = `${DESIGN_QUALITY_COMMON}\n${getDesignQualityForType(pageType)}`
```

### 5. Plan Generation Prompt

The plan AI call uses a focused system prompt and structured output:

```typescript
// plan-generator.ts
const PLAN_SYSTEM_PROMPT = `You are a UI architect. Given a list of pages for a web application, create a Component Architecture Plan.

Your task:
1. Group pages by navigation context (e.g., public marketing pages, authenticated app pages, auth flows)
2. Identify reusable UI components that appear on 2+ pages
3. Describe each page's sections and cross-page links

Rules:
- Each group gets a layout type: "header" (horizontal nav), "sidebar" (vertical nav), "both", or "none" (no nav)
- Shared components must be genuinely reusable (appear on 2+ pages). Do NOT create a shared component for patterns used on only one page.
- Page types: "marketing" (landing, features, pricing — spacious, section-based), "app" (dashboard, settings — compact, data-dense), "auth" (login, register — centered card form)
- Component props should be a TypeScript-like interface string
- shadcnDeps lists the shadcn/ui atoms the component will need (e.g., "card", "badge", "avatar")
- Cross-page links: map link labels to target routes (e.g., {"Sign in": "/login"})

Respond with valid JSON matching the schema.`

// User message:
const userMessage = `Pages: ${pages.map(p => `${p.name} (${p.route})`).join(', ')}

User's request: "${originalMessage}"

Navigation type requested: ${navType || 'auto-detect'}`
```

The response is validated by `ArchitecturePlanSchema.safeParse()`. If validation fails, the system retries once with a simplified prompt. If the retry also fails, it falls back to Phase 3.5 behavior.

### 6. Layout Generation from Plan

Instead of one flat layout, generate per-group layouts:

- `app/(public)/layout.tsx` — header nav with `groups[0].pages`
- `app/(app)/layout.tsx` — sidebar nav with `groups[1].pages`
- `app/(auth)/layout.tsx` — centered wrapper, no nav

The existing `regenerateLayout()` function in `code-generator.ts` is extended to accept an optional plan parameter:

```typescript
export async function regenerateLayout(
  config: DesignSystemConfig,
  projectRoot: string,
  options?: { plan?: ArchitecturePlan }
): Promise<void>
```

When a plan is provided, it generates one layout file per group. When no plan is provided, it uses the existing flat-nav logic (backward compatibility). Each layout template is selected by `group.layout`:

- `'header'` → horizontal nav with group's pages
- `'sidebar'` → sidebar nav with group's pages
- `'both'` → sidebar + header combo
- `'none'` → centered wrapper, no nav elements

### 7. Plan-Aware Similarity Warnings

Replace `warnInlineDuplicates()` token-overlap logic:

**Current**: Compare 600-char token snippets, fire if 12+ tokens overlap (massive false positives).

**New**: Check against the plan. If the plan says `StatCard.usedBy` includes `"dashboard"` and the Dashboard page does NOT import `@/components/shared/stat-card`, emit a warning. If a page is NOT in a component's `usedBy`, skip the check entirely.

### 8. Pre-Install shadcn Components from Plan

Before generating any page code, read `sharedComponents[].shadcnDeps` from the plan and install all required shadcn atoms:

```typescript
const allDeps = new Set(plan.sharedComponents.flatMap(c => c.shadcnDeps))
await provider.installBatch([...allDeps], projectRoot)
```

This eliminates the "missing component" error class during generation.

### 9. Plan Storage and Incremental Updates

Store the plan at `.coherent/plan.json`. When the user runs `coherent chat "add a billing page"`:

1. Load existing plan from `.coherent/plan.json`
2. Pass current plan + new request to AI: "Update this plan to include a billing page"
3. AI returns updated plan with the new page added to the correct group
4. Continue generation with updated plan

If no plan file exists (legacy projects), fall back to current behavior.

### 10. Plan Summary in Terminal

After plan generation, display a summary:

```
✔ Phase 2/6 — Architecture plan:
  Groups: public (header, 3 pages), app (sidebar, 7 pages), auth (none, 3 pages)
  Shared: StatCard → /dashboard, /projects | MemberCard → /team, /projects/[id]
  Total: 13 pages, 2 shared components
```

### 11. Remove normalizePageWrapper

With page-type-aware prompts, AI generates correct wrappers from the start:

- Marketing pages: section-based layout with generous spacing
- App pages: `<div className="space-y-6">` (compact)
- Auth pages: centered card with `flex min-h-svh items-center justify-center`

`normalizePageWrapper()` is kept as a lightweight safety net for `type: 'app'` pages only (in case AI still produces marketing-style wrappers despite the prompt). For `marketing` and `auth` pages, no wrapper normalization runs — the type-specific prompt is the primary mechanism.

### 12. Fallback on Plan Failure

Fallback chain (ordered):

1. **Plan update fails** (incremental `coherent chat`): use existing `.coherent/plan.json` unchanged, add new page to it without AI re-planning
2. **Plan generation fails** (first-time multi-page): fall back to Phase 3.5 extraction from Home + flat nav (current behavior). Phase 3.5 code is retained behind a `if (!plan)` gate, not deleted
3. **System never crashes** due to plan step failure

## Bugfixes (independent of plan step)

### Bug C: Auth Layout — isAuthRoute Guard

**Root cause**: `normalizePageWrapper` guard uses `!isAuthRoute(route)` but not `page.name`. Also `sign-in` is missing from `AUTH_ROUTE_SEGMENTS` in `page-templates.ts` AND `AUTH_ROUTE_SLUGS` in `utils.ts`.

**Fix**:
1. Add `'sign-in'` and `'signin'` to both `AUTH_ROUTE_SEGMENTS` (`page-templates.ts`) and `AUTH_ROUTE_SLUGS` (`utils.ts`). Consider consolidating into one shared constant to prevent future drift.
2. Change `normalizePageWrapper` guard to use the broader `isAuth` variable (which checks both route and name)
3. With plan step, this becomes plan-based lookup and the regex fallback is secondary

### Bug D: Syntax Error — autoFixCode Regex

**Root cause**: HTML entity replacement (`&lt;` → `<`) fires inside attribute values and string literals, breaking JSX. Also `fixUnescapedLtInJsx()` in `self-heal.ts` doesn't handle multiline tags.

**Fix**:
1. HTML entity regex (lines 634-635 of `quality-validator.ts`): use the existing `isInsideCommentOrString()` helper (line 34) to skip matches that fall inside quoted strings or template literals. For each regex match, check `isInsideCommentOrString(code, matchIndex)` and skip if true.
2. `fixUnescapedLtInJsx` in `self-heal.ts` (line 256): add `\n` to the exclusion set in the second regex, aligning with the safer version already in `autoFixCode` (line 643):
   ```typescript
   // self-heal.ts — change from:
   out = out.replace(/>([^<]*)<([^/a-zA-Z!{>])/g, '>$1&lt;$2')
   // to:
   out = out.replace(/>([^<{}\n]*)<([^/a-zA-Z!{>\n])/g, '>$1&lt;$2')
   ```

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
- `packages/cli/src/commands/chat/utils.ts` — plan-aware warnInlineDuplicates, updated routeToFsPath/routeToRelPath for plan-based groups, add `sign-in`/`signin` to AUTH_ROUTE_SLUGS
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
