# Component Architecture Plan Step — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace post-hoc shared component extraction with an upfront AI-driven Component Architecture Plan that determines route groups, shared components, page types, and cross-page links before generating any page code.

**Architecture:** New Phase 2 (plan generation) produces a structured `ArchitecturePlan` consumed by all downstream phases. Plan is stored at `.coherent/plan.json` for incremental updates. Existing Phase 3.5 extraction is retained as fallback behind `if (!plan)` gate. Design constraints are split into type-specific blocks (marketing/app/auth).

**Tech Stack:** TypeScript, Zod, vitest, pnpm monorepo (packages/cli + packages/core)

**Spec:** `docs/plans/2026-03-22-plan-step-architecture-design.md`

---

## File Structure

### New files
- `packages/cli/src/commands/chat/plan-generator.ts` — Zod schemas, plan AI call, shared component code generation, plan I/O
- `packages/cli/src/commands/chat/plan-generator.test.ts` — unit tests

### Modified files
- `packages/cli/src/agents/design-constraints.ts` — split DESIGN_QUALITY into type-specific blocks
- `packages/cli/src/commands/chat/split-generator.ts` — new pipeline phases, consume plan
- `packages/cli/src/commands/chat/split-generator.test.ts` — updated tests
- `packages/cli/src/commands/chat/utils.ts` — plan-aware routeToFsPath/routeToRelPath, warnInlineDuplicates, AUTH_ROUTE_SLUGS
- `packages/cli/src/commands/chat/utils.test.ts` — updated tests
- `packages/cli/src/commands/chat/code-generator.ts` — layout generation from plan groups
- `packages/cli/src/commands/chat/code-generator.test.ts` — updated tests
- `packages/cli/src/commands/chat/modification-handler.ts` — page type from plan, scope normalizePageWrapper
- `packages/cli/src/agents/modifier.ts` — page-type-aware lightweight prompt
- `packages/cli/src/agents/page-templates.ts` — add sign-in to AUTH_ROUTE_SEGMENTS
- `packages/cli/src/utils/quality-validator.ts` — fix HTML entity regex scope
- `packages/cli/src/utils/self-heal.ts` — fix fixUnescapedLtInJsx multiline
- `packages/cli/src/commands/chat.ts` — plan load/save, pass plan to downstream

---

### Task 1: Plan Zod Schema + Helpers

**Files:**
- Create: `packages/cli/src/commands/chat/plan-generator.ts`
- Create: `packages/cli/src/commands/chat/plan-generator.test.ts`

- [ ] **Step 1: Write failing tests for schema validation**

```typescript
// plan-generator.test.ts
import { describe, it, expect } from 'vitest'
import {
  ArchitecturePlanSchema,
  routeToKey,
  getPageGroup,
  getPageType,
} from './plan-generator.js'

describe('routeToKey', () => {
  it('strips leading slash', () => {
    expect(routeToKey('/dashboard')).toBe('dashboard')
  })
  it('returns "home" for root', () => {
    expect(routeToKey('/')).toBe('home')
  })
  it('handles nested routes', () => {
    expect(routeToKey('/projects/[id]')).toBe('projects/[id]')
  })
})

describe('ArchitecturePlanSchema', () => {
  const validPlan = {
    appName: 'TaskFlow',
    groups: [
      { id: 'app', layout: 'sidebar', pages: ['/dashboard', '/tasks'] },
      { id: 'auth', layout: 'none', pages: ['/login'] },
    ],
    sharedComponents: [
      {
        name: 'StatCard',
        description: 'Metric card',
        props: '{ label: string; value: string }',
        usedBy: ['/dashboard'],
        type: 'widget',
        shadcnDeps: ['card'],
      },
    ],
    pageNotes: {
      dashboard: { type: 'app', sections: ['Stats row', 'Tasks table'] },
      login: { type: 'auth', sections: ['Login form'] },
    },
  }

  it('parses a valid plan', () => {
    const result = ArchitecturePlanSchema.safeParse(validPlan)
    expect(result.success).toBe(true)
  })

  it('rejects plan with invalid layout type', () => {
    const bad = { ...validPlan, groups: [{ id: 'x', layout: 'invalid', pages: [] }] }
    expect(ArchitecturePlanSchema.safeParse(bad).success).toBe(false)
  })

  it('defaults shadcnDeps to empty array', () => {
    const noDeps = {
      ...validPlan,
      sharedComponents: [{
        name: 'X', description: 'd', props: '{}',
        usedBy: ['/a'], type: 'widget',
      }],
    }
    const result = ArchitecturePlanSchema.parse(noDeps)
    expect(result.sharedComponents[0].shadcnDeps).toEqual([])
  })

  it('caps sharedComponents at 8', () => {
    const tooMany = {
      ...validPlan,
      sharedComponents: Array.from({ length: 9 }, (_, i) => ({
        name: `C${i}`, description: 'd', props: '{}',
        usedBy: ['/a'], type: 'widget',
      })),
    }
    expect(ArchitecturePlanSchema.safeParse(tooMany).success).toBe(false)
  })
})

describe('getPageGroup', () => {
  const plan = ArchitecturePlanSchema.parse({
    groups: [
      { id: 'app', layout: 'sidebar', pages: ['/dashboard'] },
      { id: 'auth', layout: 'none', pages: ['/login'] },
    ],
    sharedComponents: [],
    pageNotes: {},
  })

  it('finds group for known route', () => {
    expect(getPageGroup('/dashboard', plan)?.id).toBe('app')
  })

  it('returns undefined for unknown route', () => {
    expect(getPageGroup('/unknown', plan)).toBeUndefined()
  })
})

describe('getPageType', () => {
  const plan = ArchitecturePlanSchema.parse({
    groups: [],
    sharedComponents: [],
    pageNotes: {
      dashboard: { type: 'app', sections: [] },
      home: { type: 'marketing', sections: [] },
    },
  })

  it('returns type from pageNotes', () => {
    expect(getPageType('/dashboard', plan)).toBe('app')
  })

  it('returns type for root route', () => {
    expect(getPageType('/', plan)).toBe('marketing')
  })

  it('defaults to app for unknown page', () => {
    expect(getPageType('/unknown', plan)).toBe('app')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @getcoherent/cli test -- --run plan-generator`
Expected: FAIL — module not found

- [ ] **Step 3: Implement schema and helpers**

```typescript
// plan-generator.ts
import { z } from 'zod'

export const RouteGroupSchema = z.object({
  id: z.string(),
  layout: z.enum(['header', 'sidebar', 'both', 'none']),
  pages: z.array(z.string()),
})

export const PlannedComponentSchema = z.object({
  name: z.string(),
  description: z.string(),
  props: z.string(),
  usedBy: z.array(z.string()),
  type: z.enum(['section', 'widget']),
  shadcnDeps: z.array(z.string()).default([]),
})

export const PageNoteSchema = z.object({
  type: z.enum(['marketing', 'app', 'auth']),
  sections: z.array(z.string()),
  links: z.record(z.string()).optional(),
})

export const ArchitecturePlanSchema = z.object({
  appName: z.string().optional(),
  groups: z.array(RouteGroupSchema),
  sharedComponents: z.array(PlannedComponentSchema).max(8),
  pageNotes: z.record(z.string(), PageNoteSchema),
})

export type ArchitecturePlan = z.infer<typeof ArchitecturePlanSchema>
export type RouteGroup = z.infer<typeof RouteGroupSchema>

export function routeToKey(route: string): string {
  return route.replace(/^\//, '') || 'home'
}

export function getPageGroup(route: string, plan: ArchitecturePlan): RouteGroup | undefined {
  return plan.groups.find(g => g.pages.includes(route))
}

export function getPageType(route: string, plan: ArchitecturePlan): 'marketing' | 'app' | 'auth' {
  return (plan.pageNotes[routeToKey(route)]?.type as 'marketing' | 'app' | 'auth') ?? 'app'
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @getcoherent/cli test -- --run plan-generator`
Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/commands/chat/plan-generator.ts packages/cli/src/commands/chat/plan-generator.test.ts
git commit -m "feat: add ArchitecturePlan Zod schema and helper functions"
```

---

### Task 2: Plan AI Prompt + Generator Function

**Files:**
- Modify: `packages/cli/src/commands/chat/plan-generator.ts`
- Modify: `packages/cli/src/commands/chat/plan-generator.test.ts`

`generateArchitecturePlan` accepts the AI provider as a parameter (dependency injection) — matching the pattern where `splitGeneratePages` receives `provider` as a parameter.

- [ ] **Step 1: Write failing tests for plan generation**

```typescript
// plan-generator.test.ts — add to existing file
import { vi } from 'vitest'

describe('generateArchitecturePlan', () => {
  it('returns parsed plan from AI response', async () => {
    const mockProvider = {
      parseModification: vi.fn().mockResolvedValue({
        appName: 'TestApp',
        groups: [{ id: 'app', layout: 'sidebar', pages: ['/dashboard'] }],
        sharedComponents: [],
        pageNotes: { dashboard: { type: 'app', sections: ['Stats'] } },
      }),
    }

    const { generateArchitecturePlan } = await import('./plan-generator.js')
    const result = await generateArchitecturePlan(
      [{ name: 'Dashboard', id: 'dashboard', route: '/dashboard' }],
      'Create a dashboard app',
      mockProvider as any,
      'sidebar',
    )
    expect(result?.appName).toBe('TestApp')
    expect(result?.groups[0].id).toBe('app')
  })

  it('returns null on AI failure', async () => {
    const mockProvider = { parseModification: vi.fn().mockRejectedValue(new Error('fail')) }

    const { generateArchitecturePlan } = await import('./plan-generator.js')
    const result = await generateArchitecturePlan([], 'test', mockProvider as any, null)
    expect(result).toBeNull()
  })

  it('returns null on invalid schema', async () => {
    const mockProvider = { parseModification: vi.fn().mockResolvedValue({ invalid: true }) }

    const { generateArchitecturePlan } = await import('./plan-generator.js')
    const result = await generateArchitecturePlan([], 'test', mockProvider as any, null)
    expect(result).toBeNull()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

- [ ] **Step 3: Implement generateArchitecturePlan**

Add to `plan-generator.ts`: the `PLAN_SYSTEM_PROMPT`, the `generateArchitecturePlan` function. Signature:

```typescript
export async function generateArchitecturePlan(
  pages: Array<{ name: string; id: string; route: string }>,
  userMessage: string,
  aiProvider: AIProvider,
  layoutHint: string | null,
): Promise<ArchitecturePlan | null>
```

Calls `aiProvider.parseModification` with the prompt, validates via `ArchitecturePlanSchema.safeParse()`, retries once on failure, returns `null` if both attempts fail.

- [ ] **Step 4: Run tests to verify they pass**

- [ ] **Step 5: Commit**

```bash
git commit -m "feat: add plan AI generation with prompt and validation"
```

---

### Task 3: Plan I/O (save/load/cache)

**Files:**
- Modify: `packages/cli/src/commands/chat/plan-generator.ts`
- Modify: `packages/cli/src/commands/chat/plan-generator.test.ts`

- [ ] **Step 1: Write failing tests for plan I/O**

```typescript
describe('savePlan / loadPlan', () => {
  it('saves and loads plan from .coherent/plan.json', () => {
    const tmpDir = mkdtempSync(join(tmpdir(), 'plan-'))
    mkdirSync(join(tmpDir, '.coherent'), { recursive: true })
    const plan = ArchitecturePlanSchema.parse({
      groups: [{ id: 'app', layout: 'sidebar', pages: ['/dash'] }],
      sharedComponents: [],
      pageNotes: {},
    })
    savePlan(tmpDir, plan)
    const loaded = loadPlan(tmpDir)
    expect(loaded?.groups[0].id).toBe('app')
    rmSync(tmpDir, { recursive: true })
  })

  it('loadPlan returns null when file missing', () => {
    expect(loadPlan('/nonexistent')).toBeNull()
  })

  it('loadPlan returns null on corrupt JSON', () => {
    const tmpDir = mkdtempSync(join(tmpdir(), 'plan-'))
    mkdirSync(join(tmpDir, '.coherent'), { recursive: true })
    writeFileSync(join(tmpDir, '.coherent', 'plan.json'), 'not json')
    expect(loadPlan(tmpDir)).toBeNull()
    rmSync(tmpDir, { recursive: true })
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**
- [ ] **Step 3: Implement savePlan and loadPlan**

`savePlan` must clear module-level `cachedPlan` variable (set to `null`) to prevent stale reads after incremental updates.

- [ ] **Step 4: Run tests to verify they pass**

- [ ] **Step 5: Add cache invalidation test**

```typescript
it('savePlan clears cached plan', () => {
  const tmpDir = mkdtempSync(join(tmpdir(), 'plan-'))
  mkdirSync(join(tmpDir, '.coherent'), { recursive: true })
  const planV1 = ArchitecturePlanSchema.parse({
    groups: [{ id: 'v1', layout: 'sidebar', pages: ['/a'] }],
    sharedComponents: [], pageNotes: {},
  })
  const planV2 = ArchitecturePlanSchema.parse({
    groups: [{ id: 'v2', layout: 'header', pages: ['/b'] }],
    sharedComponents: [], pageNotes: {},
  })
  savePlan(tmpDir, planV1)
  loadPlan(tmpDir) // populates cache
  savePlan(tmpDir, planV2) // must clear cache
  const loaded = loadPlan(tmpDir)
  expect(loaded?.groups[0].id).toBe('v2')
  rmSync(tmpDir, { recursive: true })
})
```

- [ ] **Step 6: Commit**

```bash
git commit -m "feat: add plan save/load with .coherent/plan.json"
```

---

### Task 3.5: Shared Component Code Generation (Phase 5)

**Files:**
- Modify: `packages/cli/src/commands/chat/plan-generator.ts`
- Modify: `packages/cli/src/commands/chat/plan-generator.test.ts`

This implements the Phase 5 function that generates TSX code for planned shared components.

- [ ] **Step 1: Write failing tests**

```typescript
describe('generateSharedComponentsFromPlan', () => {
  it('returns generated component code for each planned component', async () => {
    const mockProvider = {
      parseModification: vi.fn().mockResolvedValue({
        requests: [{ type: 'add-page', changes: {
          name: 'StatCard',
          pageCode: 'import { Card } from "@/components/ui/card"\nexport default function StatCard({ label, value }: { label: string; value: string }) { return <Card><p>{label}</p><p>{value}</p></Card> }',
        }}],
      }),
    }
    const plan = ArchitecturePlanSchema.parse({
      groups: [],
      sharedComponents: [{
        name: 'StatCard', description: 'Metric card',
        props: '{ label: string; value: string }',
        usedBy: ['/dashboard'], type: 'widget', shadcnDeps: ['card'],
      }],
      pageNotes: {},
    })
    const results = await generateSharedComponentsFromPlan(plan, 'dark theme', '/tmp', mockProvider as any)
    expect(results).toHaveLength(1)
    expect(results[0].name).toBe('StatCard')
    expect(results[0].code).toContain('export default')
  })

  it('skips components that fail generation', async () => {
    const callCount = { n: 0 }
    const mockProvider = {
      parseModification: vi.fn().mockImplementation(() => {
        callCount.n++
        if (callCount.n === 1) throw new Error('AI fail')
        return { requests: [{ type: 'add-page', changes: {
          name: 'B', pageCode: 'export default function B() { return <div/> }',
        }}]}
      }),
    }
    const plan = ArchitecturePlanSchema.parse({
      groups: [],
      sharedComponents: [
        { name: 'A', description: 'd', props: '{}', usedBy: ['/x'], type: 'widget' },
        { name: 'B', description: 'd', props: '{}', usedBy: ['/x'], type: 'widget' },
      ],
      pageNotes: {},
    })
    const results = await generateSharedComponentsFromPlan(plan, '', '/tmp', mockProvider as any)
    expect(results).toHaveLength(1)
    expect(results[0].name).toBe('B')
  })

  it('rejects code missing export default', async () => {
    const mockProvider = {
      parseModification: vi.fn().mockResolvedValue({
        requests: [{ type: 'add-page', changes: {
          name: 'Bad', pageCode: 'function Bad() { return <div/> }',
        }}],
      }),
    }
    const plan = ArchitecturePlanSchema.parse({
      groups: [],
      sharedComponents: [{
        name: 'Bad', description: 'd', props: '{}',
        usedBy: ['/x'], type: 'widget',
      }],
      pageNotes: {},
    })
    const results = await generateSharedComponentsFromPlan(plan, '', '/tmp', mockProvider as any)
    expect(results).toHaveLength(0)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

- [ ] **Step 3: Implement generateSharedComponentsFromPlan**

Signature:
```typescript
export async function generateSharedComponentsFromPlan(
  plan: ArchitecturePlan,
  styleContext: string,
  projectRoot: string,
  aiProvider: AIProvider,
): Promise<Array<{ name: string; code: string; file: string }>>
```

Builds a **single batched prompt** listing all `plan.sharedComponents` (name, description, props, shadcnDeps) + style context. Calls `aiProvider.parseModification` once. Response should contain one `add-page` request per component. Validates each output contains `export default` — valid components are written to `components/shared/<kebab-name>.tsx`, invalid ones are skipped with a warning. This is intentionally a single AI call (not N calls) to maximize style consistency across components.

- [ ] **Step 4: Run tests to verify they pass**
- [ ] **Step 5: Commit**

```bash
git commit -m "feat: add generateSharedComponentsFromPlan (Phase 5)"
```

---

### Task 4: Conditional Design Constraints

**Files:**
- Modify: `packages/cli/src/agents/design-constraints.ts`
- Create or modify test file if one exists

- [ ] **Step 1: Write failing tests**

```typescript
// Add to split-generator.test.ts or create design-constraints.test.ts
import { getDesignQualityForType, inferPageTypeFromRoute, DESIGN_QUALITY_COMMON } from '../../agents/design-constraints.js'

describe('getDesignQualityForType', () => {
  it('returns marketing constraints with py-20', () => {
    const result = getDesignQualityForType('marketing')
    expect(result).toContain('py-20')
    expect(result).not.toContain('gap-4 md:gap-6')
  })

  it('returns app constraints with compact spacing', () => {
    const result = getDesignQualityForType('app')
    expect(result).toContain('gap-4')
    expect(result).not.toContain('py-20')
  })

  it('returns auth constraints with centered card', () => {
    const result = getDesignQualityForType('auth')
    expect(result).toContain('max-w-sm')
  })
})

describe('inferPageTypeFromRoute', () => {
  it('returns auth for /login', () => {
    expect(inferPageTypeFromRoute('/login')).toBe('auth')
  })
  it('returns marketing for /pricing', () => {
    expect(inferPageTypeFromRoute('/pricing')).toBe('marketing')
  })
  it('returns app for /dashboard', () => {
    expect(inferPageTypeFromRoute('/dashboard')).toBe('app')
  })
})

describe('DESIGN_QUALITY_COMMON', () => {
  it('contains typography rules', () => {
    expect(DESIGN_QUALITY_COMMON).toContain('font')
  })
  it('does not contain spacing rhythm', () => {
    expect(DESIGN_QUALITY_COMMON).not.toContain('py-20')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**
- [ ] **Step 3: Split DESIGN_QUALITY into COMMON + MARKETING + APP + AUTH, export getDesignQualityForType and inferPageTypeFromRoute**

Read current `DESIGN_QUALITY` in `design-constraints.ts`. Move spacing/layout rules to type-specific blocks. Keep typography, colors, icons, accessibility in COMMON.

- [ ] **Step 4: Run tests to verify they pass**
- [ ] **Step 5: Run full test suite to ensure no regressions**

Run: `pnpm test`

- [ ] **Step 6: Commit**

```bash
git commit -m "feat: split DESIGN_QUALITY into type-specific constraint blocks"
```

---

### Task 5: Plan-Aware Route Functions

**Files:**
- Modify: `packages/cli/src/commands/chat/utils.ts`
- Modify: `packages/cli/src/commands/chat/utils.test.ts`

- [ ] **Step 1: Write failing tests for updated routeToFsPath**

```typescript
import { ArchitecturePlanSchema } from './plan-generator.js'

const testPlan = ArchitecturePlanSchema.parse({
  groups: [
    { id: 'public', layout: 'header', pages: ['/features'] },
    { id: 'app', layout: 'sidebar', pages: ['/dashboard'] },
    { id: 'auth', layout: 'none', pages: ['/login'] },
  ],
  sharedComponents: [],
  pageNotes: {},
})

describe('routeToFsPath with plan', () => {
  it('puts /dashboard in (app) group', () => {
    const result = routeToFsPath('/tmp', '/dashboard', testPlan)
    expect(result).toContain('(app)')
    expect(result).toContain('dashboard')
  })

  it('puts /login in (auth) group', () => {
    const result = routeToFsPath('/tmp', '/login', testPlan)
    expect(result).toContain('(auth)')
  })

  it('puts /features in (public) group', () => {
    const result = routeToFsPath('/tmp', '/features', testPlan)
    expect(result).toContain('(public)')
  })

  it('root route always goes to app/page.tsx', () => {
    const result = routeToFsPath('/tmp', '/', testPlan)
    expect(result).toMatch(/app\/page\.tsx$/)
    expect(result).not.toContain('(public)')
  })

  it('backward compat: boolean isAuth still works', () => {
    const result = routeToFsPath('/tmp', '/login', true)
    expect(result).toContain('(auth)')
  })

  it('backward compat: no third arg uses default behavior', () => {
    const result = routeToFsPath('/tmp', '/dashboard')
    expect(result).toContain('dashboard')
    expect(result).toContain('page.tsx')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**
- [ ] **Step 3: Update routeToFsPath and routeToRelPath to accept plan (union type signature)**
- [ ] **Step 4: Run tests to verify they pass**
- [ ] **Step 5: Run full test suite**
- [ ] **Step 6: Commit**

```bash
git commit -m "feat: plan-aware routeToFsPath and routeToRelPath"
```

---

### Task 6: Layout Generation from Plan Groups

**Files:**
- Modify: `packages/cli/src/commands/chat/code-generator.ts`
- Modify: `packages/cli/src/commands/chat/code-generator.test.ts`

- [ ] **Step 1: Write failing tests for per-group layout generation**

Test that `regenerateLayout` with a plan produces layout files for each group with correct nav items and layout type (header vs sidebar vs none).

- [ ] **Step 2: Run tests to verify they fail**
- [ ] **Step 3: Extend regenerateLayout to accept optional plan, generate per-group layouts**
- [ ] **Step 4: Run tests to verify they pass**
- [ ] **Step 5: Commit**

```bash
git commit -m "feat: generate per-group layouts from architecture plan"
```

---

### Task 7: Wire Plan into Split-Generator Pipeline

**Files:**
- Modify: `packages/cli/src/commands/chat/split-generator.ts`
- Modify: `packages/cli/src/commands/chat/split-generator.test.ts`

This is the largest task — integrates the plan into the main pipeline.

- [ ] **Step 1: Write failing tests for new pipeline phases**

Test that `splitGeneratePages` calls plan generation, passes plan to downstream, returns plan in result. Test that Phase 6 prompts include page-type constraints. Explicit fallback tests:

```typescript
it('falls back to Phase 3.5 extraction when plan generation returns null', async () => {
  // Mock generateArchitecturePlan to return null
  // Verify pipeline completes successfully without plan
  // Verify existing Phase 3.5 extraction logic runs
  // Verify no uncaught exceptions escape
})

it('pipeline produces valid output without a plan', async () => {
  // Full pipeline test with plan=null
  // Verify pages are generated with default DESIGN_QUALITY
  // Verify routeToFsPath works without plan (boolean fallback)
})
```

- [ ] **Step 2: Run tests to verify they fail**
- [ ] **Step 3: Implement new pipeline**

1. After Phase 1 (parse pages), add Phase 2: call `generateArchitecturePlan`
2. If plan succeeds: use `plan.groups` for routing, `plan.pageNotes` for section guidance, `plan.sharedComponents` for component planning
3. Phase 3 (Home generation): pass plan for context but do NOT import shared components
4. Phase 4 (style extraction): unchanged
5. Phase 5 (shared component code generation): call `generateSharedComponentsFromPlan`
6. Phase 6 (remaining pages): use `getDesignQualityForType(pageType)` in prompts, include `sharedComponentsNote`, include `authNote` based on plan page type
7. If plan fails: fall back to existing Phase 3.5 extraction
8. Return plan from `splitGeneratePages`

- [ ] **Step 4: Run tests to verify they pass**
- [ ] **Step 5: Run full test suite**
- [ ] **Step 6: Commit**

```bash
git commit -m "feat: wire architecture plan into split-generator pipeline"
```

---

### Task 8: Plan-Aware Similarity Warnings

**Files:**
- Modify: `packages/cli/src/commands/chat/utils.ts`
- Modify: `packages/cli/src/commands/chat/utils.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
describe('warnInlineDuplicates with plan', () => {
  it('warns when planned component is not imported', async () => {
    const consoleSpy = vi.spyOn(console, 'log')
    const plan = ArchitecturePlanSchema.parse({
      groups: [],
      sharedComponents: [{
        name: 'StatCard', description: 'd', props: '{}',
        usedBy: ['/dashboard'], type: 'widget',
      }],
      pageNotes: {},
    })
    const manifest = { shared: [{ id: 'CID-001', name: 'StatCard', type: 'widget', file: 'components/shared/stat-card.tsx' }] }
    await warnInlineDuplicates('/tmp', 'Dashboard', '/dashboard', 'export default function Page() { return <div>no import</div> }', manifest, plan)
    expect(consoleSpy).toHaveBeenCalled()
  })

  it('does NOT warn when page is not in usedBy', async () => {
    const consoleSpy = vi.spyOn(console, 'log')
    const plan = ArchitecturePlanSchema.parse({
      groups: [],
      sharedComponents: [{
        name: 'StatCard', description: 'd', props: '{}',
        usedBy: ['/projects'], type: 'widget',
      }],
      pageNotes: {},
    })
    const manifest = { shared: [{ id: 'CID-001', name: 'StatCard', type: 'widget', file: 'components/shared/stat-card.tsx' }] }
    await warnInlineDuplicates('/tmp', 'Dashboard', '/dashboard', 'export default function Page() {}', manifest, plan)
    expect(consoleSpy).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**
- [ ] **Step 3: Update warnInlineDuplicates to accept `route` parameter and optional `plan`, use plan-based logic**

New signature: `warnInlineDuplicates(projectRoot, pageName, route, code, manifest, plan?)`
When `plan` is provided: for each planned component where `route` is in `usedBy`, check if the page code imports the component. If not, warn.
- [ ] **Step 4: Run tests to verify they pass**
- [ ] **Step 5: Commit**

```bash
git commit -m "feat: plan-aware similarity warnings (replace token overlap)"
```

---

### Task 9: Chat.ts Integration (plan threading + save + incremental updates)

**Files:**
- Modify: `packages/cli/src/commands/chat.ts`
- Modify: `packages/cli/src/commands/chat/plan-generator.ts`
- Modify: `packages/cli/src/commands/chat/plan-generator.test.ts`

- [ ] **Step 1: Write failing tests for incremental plan update**

```typescript
describe('updateArchitecturePlan', () => {
  it('sends existing plan as context to AI and returns updated plan', async () => {
    const existingPlan = ArchitecturePlanSchema.parse({
      appName: 'MyApp',
      groups: [{ id: 'app', layout: 'sidebar', pages: ['/dashboard'] }],
      sharedComponents: [],
      pageNotes: { dashboard: { type: 'app', sections: ['Stats'] } },
    })
    const mockProvider = {
      parseModification: vi.fn().mockResolvedValue({
        appName: 'MyApp',
        groups: [{ id: 'app', layout: 'sidebar', pages: ['/dashboard', '/billing'] }],
        sharedComponents: [],
        pageNotes: {
          dashboard: { type: 'app', sections: ['Stats'] },
          billing: { type: 'app', sections: ['Plans table'] },
        },
      }),
    }
    const result = await updateArchitecturePlan(
      existingPlan,
      [{ name: 'Billing', id: 'billing', route: '/billing' }],
      'Add a billing page',
      mockProvider as any,
    )
    expect(result?.groups[0].pages).toContain('/billing')
    expect(result?.pageNotes['billing']).toBeDefined()
    expect(mockProvider.parseModification).toHaveBeenCalledWith(
      expect.stringContaining('"dashboard"'),
    )
  })

  it('deterministically merges new pages into existing plan when AI update fails', async () => {
    const existingPlan = ArchitecturePlanSchema.parse({
      groups: [{ id: 'app', layout: 'sidebar', pages: ['/dashboard'] }],
      sharedComponents: [],
      pageNotes: {},
    })
    const mockProvider = {
      parseModification: vi.fn().mockRejectedValue(new Error('AI fail')),
    }
    const result = await updateArchitecturePlan(
      existingPlan,
      [{ name: 'Billing', id: 'billing', route: '/billing' }],
      'Add billing',
      mockProvider as any,
    )
    // Fallback: new page appended to largest group, minimal pageNotes entry
    expect(result.groups[0].pages).toContain('/billing')
    expect(result.pageNotes['billing']).toBeDefined()
    expect(result.pageNotes['billing'].type).toBe('app')
    // Existing pages preserved
    expect(result.groups[0].pages).toContain('/dashboard')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

- [ ] **Step 3: Implement updateArchitecturePlan**

Signature:
```typescript
export async function updateArchitecturePlan(
  existingPlan: ArchitecturePlan,
  newPages: Array<{ name: string; id: string; route: string }>,
  userMessage: string,
  aiProvider: AIProvider,
): Promise<ArchitecturePlan>
```

Sends a prompt containing the existing plan JSON + "Update this plan to include these pages: ..." to the AI. Validates response via `ArchitecturePlanSchema.safeParse()`.

On failure (AI error or invalid schema): **deterministic merge** — append new page routes to the largest existing group, add minimal `pageNotes` entries with `type: 'app'` and `sections: []`. This ensures new pages are never lost, per spec Section 12 fallback chain item 1.

- [ ] **Step 4: Run tests to verify they pass**

- [ ] **Step 5: Update chat.ts to thread plan**

After `splitGeneratePages` returns:
1. If a plan was generated, save to `.coherent/plan.json` via `savePlan()`.
2. Pass plan to `regenerateFiles` and `regenerateLayout`.
3. On subsequent `coherent chat` calls:
   a. Load existing plan via `loadPlan(projectRoot)`.
   b. If existing plan exists, call `updateArchitecturePlan(existingPlan, newPages, userMessage, provider)` to get an updated plan.
   c. Pass updated plan to `splitGeneratePages`.
   d. Save the updated plan via `savePlan()` after successful generation.

- [ ] **Step 6: Run full test suite**

Run: `pnpm test`

- [ ] **Step 7: Commit**

```bash
git commit -m "feat: thread plan through chat.ts with incremental updates"
```

---

### Task 10: Pre-Install shadcn Deps + Scope normalizePageWrapper

**Files:**
- Modify: `packages/cli/src/commands/chat/split-generator.ts`
- Modify: `packages/cli/src/commands/chat/modification-handler.ts`

- [ ] **Step 1: Add pre-install logic in split-generator after plan generation**

```typescript
if (plan && plan.sharedComponents.length > 0) {
  const allDeps = new Set(plan.sharedComponents.flatMap(c => c.shadcnDeps))
  if (allDeps.size > 0) {
    await provider.installBatch([...allDeps], projectRoot)
  }
}
```

- [ ] **Step 2: Scope normalizePageWrapper to app pages only**

In `modification-handler.ts`, there are **two call sites** for `normalizePageWrapper` (approx. line 585 and line 792). Update BOTH with the plan-based guard. The `plan` parameter comes from either a threaded function parameter or `loadPlan(projectRoot)` — see Task 9 for how plan is threaded through the system:

```typescript
const pageType = plan ? getPageType(route, plan) : (isMarketingRoute(route) ? 'marketing' : isAuth ? 'auth' : 'app')
if (pageType === 'app') {
  const { code: normalized, fixed: wrapperFixed } = normalizePageWrapper(codeToWrite)
  // ...
}
```

- [ ] **Step 3: Run full test suite**
- [ ] **Step 4: Commit**

```bash
git commit -m "feat: pre-install shadcn deps from plan, scope normalizePageWrapper to app pages"
```

---

### Task 11: Bug C — isAuthRoute Guard Fix

**Files:**
- Modify: `packages/cli/src/agents/page-templates.ts`
- Modify: `packages/cli/src/commands/chat/utils.ts`
- Modify: `packages/cli/src/commands/chat/utils.test.ts`

Note: `AUTH_ROUTE_SEGMENTS` lives in `page-templates.ts` and `AUTH_ROUTE_SLUGS` lives in `utils.ts`. Both must be updated. Consider future consolidation into one canonical set re-exported, but for this task adding to both is acceptable.

- [ ] **Step 1: Write failing test in utils.test.ts**

```typescript
it('isAuthRoute recognizes sign-in', () => {
  expect(isAuthRoute('/sign-in')).toBe(true)
  expect(isAuthRoute('sign-in')).toBe(true)
})
```

- [ ] **Step 2: Run test to verify it fails**
- [ ] **Step 3: Add 'sign-in' and 'signin' to AUTH_ROUTE_SEGMENTS and AUTH_ROUTE_SLUGS**
- [ ] **Step 4: Run tests to verify they pass**
- [ ] **Step 5: Commit**

```bash
git commit -m "fix: add sign-in/signin to auth route detection"
```

---

### Task 12: Bug D — autoFixCode Regex Fix

**Files:**
- Modify: `packages/cli/src/utils/quality-validator.ts`
- Modify: `packages/cli/src/utils/quality-validator.test.ts`
- Modify: `packages/cli/src/utils/self-heal.ts`

- [ ] **Step 1: Write failing tests**

```typescript
describe('autoFixCode HTML entity safety', () => {
  it('does NOT replace &lt; inside attribute values', () => {
    const code = 'export default function P() { return <div title="value &lt; 10">text</div> }'
    const { code: fixed } = autoFixCode(code, '/test')
    expect(fixed).toContain('&lt;')
    expect(fixed).not.toContain('title="value < 10"')
  })
})

describe('fixUnescapedLtInJsx multiline safety', () => {
  it('does not corrupt multiline JSX tags', () => {
    const code = '>\n<div className="test">'
    const result = fixUnescapedLtInJsx(code)
    expect(result).toContain('<div')
    expect(result).not.toContain('&lt;div')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**
- [ ] **Step 3: Fix HTML entity regex to use isInsideCommentOrString check; fix fixUnescapedLtInJsx to exclude newlines**
- [ ] **Step 4: Run tests to verify they pass**
- [ ] **Step 5: Run full test suite**
- [ ] **Step 6: Commit**

```bash
git commit -m "fix: prevent autoFixCode from corrupting JSX inside strings"
```

---

### Task 13: Update Retry Prompts + Plan Summary

**Files:**
- Modify: `packages/cli/src/agents/modifier.ts`
- Modify: `packages/cli/src/commands/chat/split-generator.ts`

**Important:** Do NOT modify `buildModificationPrompt` — it parses user intent, not generates page code. Page-type constraints apply only in Phase 6 page generation prompts, retry prompts (`buildLightweightPagePrompt`), and `editPageCode` flows.

- [ ] **Step 1: Add pageType parameter to buildLightweightPagePrompt**

Include `getDesignQualityForType(pageType)` in the lightweight prompt when `pageType` is provided.

- [ ] **Step 2: Add plan summary display in split-generator**

After plan generation, log:
```
✔ Phase 2/6 — Architecture plan:
  Groups: public (header, 3 pages), app (sidebar, 7 pages), auth (none, 3 pages)
  Shared: StatCard → /dashboard, /projects | MemberCard → /team
  Total: 13 pages, 2 shared components
```

- [ ] **Step 3: Run full test suite**
- [ ] **Step 4: Commit**

```bash
git commit -m "feat: page-type-aware retry prompts and plan summary display"
```

---

### Task 14: Final Verification

- [ ] **Step 1: Run full CI pipeline**

```bash
pnpm build && pnpm lint && pnpm typecheck && pnpm test
```

All must pass.

- [ ] **Step 2: Run pnpm format**

```bash
pnpm format:check
```

Fix any issues with `pnpm format`.

- [ ] **Step 3: Review all changes**

Verify no dead code, no TODO comments left, no console.log debugging statements.

- [ ] **Step 4: Final commit if needed**

```bash
git commit -m "chore: final cleanup for plan step architecture"
```
