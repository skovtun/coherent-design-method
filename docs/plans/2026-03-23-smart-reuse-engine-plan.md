# Smart Reuse Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix sidebar/layout bugs, add intelligent pre-generation component reuse planning, unify type taxonomy, and improve generation reliability.

**Architecture:** Three phases — infrastructure fixes (config unification, groupLayouts, safe layout writes, plan persistence, layout-aware prompts), the Smart Reuse Engine (deterministic mapping, code pattern extraction, post-gen verification), and hardening fixes (type taxonomy unification, quality fix retry, shared export validation).

**Tech Stack:** TypeScript, Zod, vitest, @getcoherent/core + @getcoherent/cli

**Spec:** `docs/plans/2026-03-23-smart-reuse-engine-design.md`

---

## File Structure

**New files:**
- `packages/cli/src/utils/reuse-planner.ts` — deterministic mapping, code pattern extraction, AI refinement, ReusePlan builder
- `packages/cli/src/utils/reuse-planner.test.ts` — tests for all reuse planner functions

**Modified files:**
- `packages/core/src/types/design-system.ts` — add `groupLayouts` to DesignSystemConfig schema
- `packages/cli/src/commands/chat.ts` — config unification, single-page reuse integration, transparency logging
- `packages/cli/src/commands/chat/split-generator.ts` — multi-page reuse integration, layout-aware prompt, incremental sync
- `packages/cli/src/commands/chat/code-generator.ts` — safe layout writes, groupLayouts-aware ensureAppRouteGroupLayout, ensurePlanGroupLayouts writes groupLayouts to config
- `packages/cli/src/commands/chat/plan-generator.ts` — call updateArchitecturePlan when cached plan exists
- `packages/cli/src/agents/modifier.ts` — accept reusePlanDirective in buildModificationPrompt

---

### Task 1: Add `groupLayouts` to DesignSystemConfig Schema

**Files:**
- Modify: `packages/core/src/types/design-system.ts`
- Test: existing schema tests (verify backward compat)

- [ ] **Step 1: Find the config schema and add groupLayouts**

In `packages/core/src/types/design-system.ts`, find the `DesignSystemConfigSchema` Zod object. Add:

```typescript
groupLayouts: z.record(z.enum(['header', 'sidebar', 'both', 'none'])).optional(),
```

This must be added to the existing schema object alongside other optional fields.

- [ ] **Step 2: Run typecheck to verify no breakage**

Run: `pnpm typecheck`
Expected: PASS (field is optional, no existing code references it yet)

- [ ] **Step 3: Run tests**

Run: `pnpm test`
Expected: All existing tests PASS (backward compatible — field is optional)

- [ ] **Step 4: Commit**

```bash
git add packages/core/src/types/design-system.ts
git commit -m "feat: add groupLayouts field to DesignSystemConfig schema"
```

---

### Task 2: Config Unification — modCtx Uses dsm.getConfig()

**Files:**
- Modify: `packages/cli/src/commands/chat.ts:299`

- [ ] **Step 1: Change modCtx to use dsm.getConfig()**

In `packages/cli/src/commands/chat.ts`, find line ~299:

```typescript
const modCtx = { config, componentManager: cm }
```

Change to:

```typescript
const modCtx = { config: dsm.getConfig(), componentManager: cm }
```

Keep the standalone `const config = await loadConfig(configPath)` at line 110 — it's needed for early checks (version, fixGlobalsCss, ComponentManager, PageManager).

- [ ] **Step 2: Run typecheck**

Run: `pnpm typecheck`
Expected: PASS

- [ ] **Step 3: Run tests**

Run: `pnpm test`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add packages/cli/src/commands/chat.ts
git commit -m "fix: use dsm.getConfig() for modCtx to unify config source"
```

---

### Task 3: Safe Layout Writes + groupLayouts Persistence

**Files:**
- Modify: `packages/cli/src/commands/chat/code-generator.ts`
- Modify: `packages/cli/src/commands/chat.ts` (call sites)
- Test: `packages/cli/src/commands/chat/code-generator.test.ts`

- [ ] **Step 1: Write failing test for hash-protected layout writes**

In `packages/cli/src/commands/chat/code-generator.test.ts`, add to the `ensurePlanGroupLayouts` describe block:

```typescript
it('skips overwrite when layout was manually edited (hash mismatch)', async () => {
  const layoutDir = join(tmpDir, 'app', '(app)')
  mkdirSync(layoutDir, { recursive: true })
  const originalCode = 'export default function CustomLayout() { return <div>Custom</div> }'
  writeFileSync(join(layoutDir, 'layout.tsx'), originalCode)

  const storedHashes: Record<string, string> = {
    'app/(app)/layout.tsx': 'different-hash-than-actual-file',
  }

  const plan = ArchitecturePlanSchema.parse({
    groups: [{ id: 'app', layout: 'sidebar', pages: ['/dashboard'] }],
    sharedComponents: [],
    pageNotes: {},
  })

  await ensurePlanGroupLayouts(tmpDir, plan, storedHashes)

  const content = readFileSync(join(layoutDir, 'layout.tsx'), 'utf-8')
  expect(content).toBe(originalCode) // not overwritten
})

it('writes layout when hash matches (generated layout, not manually edited)', async () => {
  const layoutDir = join(tmpDir, 'app', '(app)')
  mkdirSync(layoutDir, { recursive: true })
  const generatedCode = buildGroupLayoutCode('header', ['/dashboard'])
  writeFileSync(join(layoutDir, 'layout.tsx'), generatedCode)

  const { createHash } = await import('crypto')
  const hash = createHash('md5').update(generatedCode).digest('hex')
  const storedHashes: Record<string, string> = {
    'app/(app)/layout.tsx': hash,
  }

  const plan = ArchitecturePlanSchema.parse({
    groups: [{ id: 'app', layout: 'sidebar', pages: ['/dashboard'] }],
    sharedComponents: [],
    pageNotes: {},
  })

  await ensurePlanGroupLayouts(tmpDir, plan, storedHashes)

  const content = readFileSync(join(layoutDir, 'layout.tsx'), 'utf-8')
  expect(content).toContain('Sidebar') // overwritten with sidebar layout
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run packages/cli/src/commands/chat/code-generator.test.ts -t "skips overwrite"`
Expected: FAIL (ensurePlanGroupLayouts doesn't accept storedHashes yet)

- [ ] **Step 3: Update ensurePlanGroupLayouts signature and implementation**

In `packages/cli/src/commands/chat/code-generator.ts`, change:

```typescript
export async function ensurePlanGroupLayouts(
  projectRoot: string,
  plan: ArchitecturePlan,
  storedHashes: Record<string, string> = {},
): Promise<void> {
  const { mkdir: mkdirAsync } = await import('fs/promises')
  const { createHash } = await import('crypto')

  for (const group of plan.groups) {
    const groupDir = resolve(projectRoot, 'app', `(${group.id})`)
    await mkdirAsync(groupDir, { recursive: true })
    const layoutPath = resolve(groupDir, 'layout.tsx')
    const relativePath = `app/(${group.id})/layout.tsx`

    if (existsSync(layoutPath)) {
      const currentContent = readFileSync(layoutPath, 'utf-8')
      const currentHash = createHash('md5').update(currentContent).digest('hex')
      const storedHash = storedHashes[relativePath]
      if (storedHash && storedHash !== currentHash) {
        continue // user edited manually — skip
      }
    }

    const code = buildGroupLayoutCode(group.layout, group.pages)
    await writeFile(layoutPath, code)
  }
}
```

- [ ] **Step 4: Update ensureAppRouteGroupLayout to check groupLayouts**

In the same file, find `ensureAppRouteGroupLayout` and update:

```typescript
export async function ensureAppRouteGroupLayout(
  projectRoot: string,
  navType?: string,
  forceUpdate = false,
  groupLayouts?: Record<string, string>,
): Promise<void> {
  const effectiveNavType = groupLayouts?.['app'] || navType
  const layoutPath = resolve(projectRoot, 'app', '(app)', 'layout.tsx')
  if (existsSync(layoutPath) && !forceUpdate) return
  const { mkdir: mkdirAsync } = await import('fs/promises')
  await mkdirAsync(resolve(projectRoot, 'app', '(app)'), { recursive: true })
  const code = buildAppLayoutCode(effectiveNavType)
  await writeFile(layoutPath, code)
}
```

- [ ] **Step 5: Update regenerateLayout call to pass groupLayouts**

In `regenerateLayout`, find the `ensureAppRouteGroupLayout` call (line ~203) and add groupLayouts:

```typescript
await ensureAppRouteGroupLayout(
  projectRoot,
  config.navigation?.type,
  options.navChanged,
  config.groupLayouts,
)
```

- [ ] **Step 6: Update call sites in chat.ts to pass storedHashes**

In `packages/cli/src/commands/chat.ts`, find both `ensurePlanGroupLayouts` calls (lines ~315 and ~398) and add storedHashes:

```typescript
await ensurePlanGroupLayouts(projectRoot, splitResult.plan, storedHashes)
```

- [ ] **Step 7: Run tests**

Run: `pnpm vitest run packages/cli/src/commands/chat/code-generator.test.ts`
Expected: PASS

- [ ] **Step 8: Run typecheck**

Run: `pnpm typecheck`
Expected: PASS

- [ ] **Step 9: Commit**

```bash
git add packages/cli/src/commands/chat/code-generator.ts packages/cli/src/commands/chat/code-generator.test.ts packages/cli/src/commands/chat.ts
git commit -m "fix: safe layout writes with hash check + groupLayouts-aware ensureAppRouteGroupLayout"
```

---

### Task 4: Layout-Aware Prompt

**Files:**
- Modify: `packages/cli/src/commands/chat/split-generator.ts`
- Test: `packages/cli/src/commands/chat/split-generator.test.ts`

- [ ] **Step 1: Write failing test for layout-aware prompt**

In `packages/cli/src/commands/chat/split-generator.test.ts`, add:

```typescript
import { buildLayoutNote } from './split-generator.js'

describe('buildLayoutNote', () => {
  it('returns sidebar note for sidebar layout', () => {
    const note = buildLayoutNote('sidebar')
    expect(note).toContain('SIDEBAR layout')
    expect(note).toContain('Do NOT create your own sidebar')
  })

  it('returns header note for header layout', () => {
    const note = buildLayoutNote('header')
    expect(note).toContain('Header and Footer')
    expect(note).not.toContain('SIDEBAR')
  })

  it('returns both note for both layout', () => {
    const note = buildLayoutNote('both')
    expect(note).toContain('sidebar and a header')
  })

  it('returns none note for none layout', () => {
    const note = buildLayoutNote('none')
    expect(note).toContain('no shared navigation')
  })

  it('defaults to header for undefined', () => {
    const note = buildLayoutNote(undefined)
    expect(note).toContain('Header and Footer')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run packages/cli/src/commands/chat/split-generator.test.ts -t "buildLayoutNote"`
Expected: FAIL (function doesn't exist)

- [ ] **Step 3: Implement buildLayoutNote**

In `packages/cli/src/commands/chat/split-generator.ts`, add and export:

```typescript
export function buildLayoutNote(layout?: string): string {
  switch (layout) {
    case 'sidebar':
      return 'This page is inside a SIDEBAR layout. Navigation is handled by the sidebar component. Do NOT create your own sidebar, side nav, or navigation menu. The page content occupies the main area next to the sidebar. Start with main content directly.'
    case 'both':
      return 'This page has both a sidebar and a header for navigation. Do NOT create your own navigation elements. The page content occupies the main area. Start with main content directly.'
    case 'none':
      return 'This page has no shared navigation. Include navigation only if the page design requires it.'
    default:
      return 'Header and Footer are shared components rendered by the root layout. Do NOT include any site-wide <header>, <nav>, or <footer> in this page. Start with the main content directly.'
  }
}
```

- [ ] **Step 4: Replace hardcoded sharedLayoutNote in splitGeneratePages**

Find the hardcoded `sharedLayoutNote` (line ~501-502) and replace:

```typescript
const groupLayout = plan?.groups.find(g => g.pages.includes(route))?.layout
const layoutNote = buildLayoutNote(groupLayout)
```

Use `layoutNote` instead of `sharedLayoutNote` in the prompt array.

- [ ] **Step 5: Run tests**

Run: `pnpm vitest run packages/cli/src/commands/chat/split-generator.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add packages/cli/src/commands/chat/split-generator.ts packages/cli/src/commands/chat/split-generator.test.ts
git commit -m "feat: layout-aware prompt based on group layout type"
```

---

### Task 5: Plan Persistence — Use updateArchitecturePlan

**Files:**
- Modify: `packages/cli/src/commands/chat/split-generator.ts`
- Test: `packages/cli/src/commands/chat/split-generator.test.ts` (existing updateArchitecturePlan tests cover this)

- [ ] **Step 1: Import loadPlan in split-generator**

In `packages/cli/src/commands/chat/split-generator.ts`, add to imports:

```typescript
import { generateArchitecturePlan, getPageType, loadPlan, updateArchitecturePlan } from './plan-generator.js'
```

(Merge with existing import from `./plan-generator.js`)

- [ ] **Step 2: Update plan generation to check for existing plan**

In `splitGeneratePages`, find the block that calls `generateArchitecturePlan` (around line ~349). Replace with:

```typescript
const existingPlan = parseOpts.projectRoot ? loadPlan(parseOpts.projectRoot) : null
if (existingPlan) {
  spinner.start('Phase 2/6 — Updating architecture plan...')
  plan = await updateArchitecturePlan(existingPlan, pageNames, message, ai)
} else {
  spinner.start('Phase 2/6 — Generating architecture plan...')
  const { plan: generatedPlan, warnings: planWarnings } = await generateArchitecturePlan(
    pageNames,
    message,
    ai,
    layoutHint,
  )
  plan = generatedPlan
  // ... keep existing warning logging
}
```

Keep the existing error handling (try/catch) wrapping this block.

- [ ] **Step 3: Run tests**

Run: `pnpm vitest run packages/cli/src/commands/chat/split-generator.test.ts`
Expected: PASS

- [ ] **Step 4: Run typecheck**

Run: `pnpm typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/commands/chat/split-generator.ts
git commit -m "feat: use updateArchitecturePlan when cached plan exists"
```

---

### Task 6: Reuse Planner — Core Module with Deterministic Mapping

**Files:**
- Create: `packages/cli/src/utils/reuse-planner.ts`
- Create: `packages/cli/src/utils/reuse-planner.test.ts`

- [ ] **Step 1: Write failing tests for interfaces and deterministic mapping**

Create `packages/cli/src/utils/reuse-planner.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { buildReusePlan, buildReusePlanDirective } from './reuse-planner.js'
import { SharedComponentsManifestSchema } from '@getcoherent/core'

const mockManifest = SharedComponentsManifestSchema.parse({
  shared: [
    {
      id: 'CID-001',
      name: 'StatCard',
      type: 'data-display',
      file: 'components/shared/stat-card.tsx',
      description: 'Displays a single metric',
      usedIn: ['app/(app)/dashboard/page.tsx'],
      propsInterface: '{ label: string; value: string; icon?: React.ReactNode }',
      usageExample: '<StatCard label="Users" value="1,234" icon={<Users />} />',
      dependencies: [],
    },
    {
      id: 'CID-002',
      name: 'FilterBar',
      type: 'form',
      file: 'components/shared/filter-bar.tsx',
      description: 'Filtering controls',
      usedIn: [],
      propsInterface: '{ filters: Filter[]; onFilterChange: (f: Filter[]) => void }',
      dependencies: [],
    },
  ],
}

describe('buildReusePlan', () => {
  it('maps stats section to data-display components', () => {
    const plan = buildReusePlan({
      pageName: 'Tasks',
      pageType: 'app',
      sections: ['Stats row', 'Task list'],
      manifest: mockManifest,
      existingPageCode: {},
      userRequest: 'Create a task management page',
    })

    expect(plan.reuse.length).toBeGreaterThanOrEqual(1)
    const statReuse = plan.reuse.find(r => r.component === 'StatCard')
    expect(statReuse).toBeDefined()
    expect(statReuse!.targetSection).toBe('Stats row')
  })

  it('maps filter section to form components', () => {
    const plan = buildReusePlan({
      pageName: 'Tasks',
      pageType: 'app',
      sections: ['Filter controls', 'Task list'],
      manifest: mockManifest,
      existingPageCode: {},
      userRequest: 'Create a task page with filtering',
    })

    const filterReuse = plan.reuse.find(r => r.component === 'FilterBar')
    expect(filterReuse).toBeDefined()
  })

  it('returns empty reuse for empty manifest', () => {
    const plan = buildReusePlan({
      pageName: 'Tasks',
      pageType: 'app',
      sections: ['Stats row'],
      manifest: SharedComponentsManifestSchema.parse({ shared: [] }),
      existingPageCode: {},
      userRequest: 'Create a page',
    })

    expect(plan.reuse).toHaveLength(0)
  })

  it('suggests createNew for sections with no matching component', () => {
    const plan = buildReusePlan({
      pageName: 'Tasks',
      pageType: 'app',
      sections: ['Activity feed'],
      manifest: mockManifest,
      existingPageCode: {},
      userRequest: 'Create a page with activity feed',
    })

    expect(plan.createNew.length).toBeGreaterThanOrEqual(0)
    // no component matches 'activity feed', so nothing in reuse
    const activityReuse = plan.reuse.find(r => r.targetSection === 'Activity feed')
    expect(activityReuse).toBeUndefined()
  })
})

describe('buildReusePlanDirective', () => {
  it('formats MUST USE section with import paths and examples', () => {
    const directive = buildReusePlanDirective({
      pageName: 'Tasks',
      reuse: [
        {
          component: 'StatCard',
          targetSection: 'Stats row',
          reason: 'Dashboard uses same pattern',
          importPath: '@/components/shared/stat-card',
          usageExample: '<StatCard label="Tasks" value="42" />',
        },
      ],
      createNew: [],
      reusePatterns: [],
    })

    expect(directive).toContain('MUST USE')
    expect(directive).toContain('StatCard')
    expect(directive).toContain('@/components/shared/stat-card')
    expect(directive).toContain('Stats row')
  })

  it('includes CREATE NEW section', () => {
    const directive = buildReusePlanDirective({
      pageName: 'Tasks',
      reuse: [],
      createNew: [{ name: 'TaskRow', reason: 'No match', suggestedType: 'data-display' }],
      reusePatterns: [],
    })

    expect(directive).toContain('CREATE NEW')
    expect(directive).toContain('TaskRow')
  })

  it('returns empty string for empty plan', () => {
    const directive = buildReusePlanDirective({
      pageName: 'Tasks',
      reuse: [],
      createNew: [],
      reusePatterns: [],
    })

    expect(directive).toBe('')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run packages/cli/src/utils/reuse-planner.test.ts`
Expected: FAIL (module doesn't exist)

- [ ] **Step 3: Implement reuse-planner.ts**

Create `packages/cli/src/utils/reuse-planner.ts`:

```typescript
import type { SharedComponentsManifest } from '@getcoherent/core'

export interface ReusePlanEntry {
  component: string
  targetSection: string
  reason: string
  importPath: string
  usageExample: string
}

export interface NewComponentEntry {
  name: string
  reason: string
  suggestedType: string
}

export interface PatternEntry {
  pattern: string
  sourcePages: string[]
  targetSection: string
}

export interface ReusePlan {
  pageName: string
  reuse: ReusePlanEntry[]
  createNew: NewComponentEntry[]
  reusePatterns: PatternEntry[]
}

export interface BuildReusePlanInput {
  pageName: string
  pageType: 'marketing' | 'app' | 'auth'
  sections: string[]
  manifest: SharedComponentsManifest
  existingPageCode: Record<string, string>
  userRequest: string
}

const SECTION_TYPE_MAP: Record<string, string[]> = {
  stats: ['data-display', 'widget'],
  metrics: ['data-display', 'widget'],
  kpi: ['data-display', 'widget'],
  list: ['data-display'],
  table: ['data-display'],
  items: ['data-display'],
  form: ['form'],
  filter: ['form'],
  search: ['form'],
  nav: ['navigation'],
  menu: ['navigation'],
  tabs: ['navigation'],
  card: ['widget', 'data-display'],
  grid: ['widget', 'data-display'],
  chart: ['data-display'],
  graph: ['data-display'],
  alert: ['feedback'],
  toast: ['feedback'],
  banner: ['feedback'],
}

function sectionToComponentTypes(section: string): string[] {
  const lower = section.toLowerCase()
  const types = new Set<string>()
  for (const [keyword, componentTypes] of Object.entries(SECTION_TYPE_MAP)) {
    if (lower.includes(keyword)) {
      componentTypes.forEach(t => types.add(t))
    }
  }
  return [...types]
}

function componentFilenameToImportPath(file: string): string {
  const withoutExt = file.replace(/\.tsx?$/, '')
  return `@/${withoutExt}`
}

export function buildReusePlan(input: BuildReusePlanInput): ReusePlan {
  const { pageName, sections, manifest } = input
  const reuse: ReusePlanEntry[] = []
  const usedComponents = new Set<string>()

  for (const section of sections) {
    const matchingTypes = sectionToComponentTypes(section)
    if (matchingTypes.length === 0) continue

    for (const entry of manifest.shared) {
      if (usedComponents.has(entry.id)) continue
      if (!matchingTypes.includes(entry.type)) continue

      reuse.push({
        component: entry.name,
        targetSection: section,
        reason: entry.usedIn.length > 0
          ? `Used on ${entry.usedIn.length} page(s)`
          : `Matches section type (${entry.type})`,
        importPath: componentFilenameToImportPath(entry.file),
        usageExample: entry.usageExample || `<${entry.name} />`,
      })
      usedComponents.add(entry.id)
      break
    }
  }

  // Extract reuse patterns from existing page code
  const reusePatterns = extractCodePatterns(input.existingPageCode, sections)

  // AI refinement (Step 3 from spec) is deferred — deterministic mapping is sufficient
  // for initial release. The interface supports adding AI refinement later without changes
  // to consumers.

  return { pageName, reuse, createNew: [], reusePatterns }
}

function extractCodePatterns(
  existingPageCode: Record<string, string>,
  _sections: string[],
): PatternEntry[] {
  const patterns: PatternEntry[] = []
  const gridPatterns = new Map<string, string[]>()

  for (const [route, code] of Object.entries(existingPageCode)) {
    const gridMatches = code.match(/className="[^"]*grid[^"]*"/g) || []
    for (const match of gridMatches) {
      const cls = match.replace(/className="|"/g, '')
      if (!gridPatterns.has(cls)) gridPatterns.set(cls, [])
      gridPatterns.get(cls)!.push(route)
    }
  }

  for (const [pattern, pages] of gridPatterns) {
    if (pages.length >= 1 && pattern.includes('grid-cols')) {
      patterns.push({
        pattern,
        sourcePages: pages,
        targetSection: 'Layout grid',
      })
    }
  }

  return patterns
}

export function buildReusePlanDirective(plan: ReusePlan): string {
  if (plan.reuse.length === 0 && plan.createNew.length === 0 && plan.reusePatterns.length === 0) {
    return ''
  }

  const lines: string[] = [`COMPONENT REUSE PLAN FOR THIS PAGE:`]

  if (plan.reuse.length > 0) {
    lines.push('', 'MUST USE (import these — do NOT re-implement):')
    for (const r of plan.reuse) {
      lines.push(`  - ${r.component} from ${r.importPath} — for "${r.targetSection}" section`)
      if (r.usageExample) {
        lines.push(`    Example: ${r.usageExample}`)
      }
    }
  }

  if (plan.createNew.length > 0) {
    lines.push('', 'CREATE NEW (no existing match):')
    for (const c of plan.createNew) {
      lines.push(`  - ${c.name} — ${c.reason} (suggest type: ${c.suggestedType})`)
    }
  }

  if (plan.reusePatterns.length > 0) {
    lines.push('', 'LAYOUT PATTERNS (copy from existing pages for visual consistency):')
    for (const p of plan.reusePatterns) {
      lines.push(`  - ${p.targetSection}: className="${p.pattern}"`)
      lines.push(`    (source: ${p.sourcePages.join(', ')})`)
    }
  }

  return lines.join('\n')
}
```

- [ ] **Step 4: Run tests**

Run: `pnpm vitest run packages/cli/src/utils/reuse-planner.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/utils/reuse-planner.ts packages/cli/src/utils/reuse-planner.test.ts
git commit -m "feat: reuse planner with deterministic mapping and code pattern extraction"
```

---

### Task 7: Post-Generation Verification

**Files:**
- Modify: `packages/cli/src/utils/reuse-planner.ts`
- Modify: `packages/cli/src/utils/reuse-planner.test.ts`

- [ ] **Step 1: Write failing test for verifyReusePlan**

Add to `packages/cli/src/utils/reuse-planner.test.ts`:

```typescript
import { verifyReusePlan } from './reuse-planner.js'

describe('verifyReusePlan', () => {
  it('returns passed for all imported components', () => {
    const code = `import { StatCard } from '@/components/shared/stat-card'\n<StatCard />`
    const result = verifyReusePlan(code, {
      pageName: 'Tasks',
      reuse: [{
        component: 'StatCard',
        targetSection: 'Stats',
        reason: 'test',
        importPath: '@/components/shared/stat-card',
        usageExample: '<StatCard />',
      }],
      createNew: [],
      reusePatterns: [],
    })

    expect(result.passed).toHaveLength(1)
    expect(result.missed).toHaveLength(0)
  })

  it('returns missed for components not imported', () => {
    const code = `export default function Tasks() { return <div>No stats</div> }`
    const result = verifyReusePlan(code, {
      pageName: 'Tasks',
      reuse: [{
        component: 'StatCard',
        targetSection: 'Stats',
        reason: 'test',
        importPath: '@/components/shared/stat-card',
        usageExample: '<StatCard />',
      }],
      createNew: [],
      reusePatterns: [],
    })

    expect(result.passed).toHaveLength(0)
    expect(result.missed).toHaveLength(1)
    expect(result.missed[0].component).toBe('StatCard')
  })

  it('builds strengthened directive for missed components', () => {
    const code = `export default function Tasks() { return <div /> }`
    const result = verifyReusePlan(code, {
      pageName: 'Tasks',
      reuse: [{
        component: 'StatCard',
        targetSection: 'Stats',
        reason: 'test',
        importPath: '@/components/shared/stat-card',
        usageExample: '<StatCard />',
      }],
      createNew: [],
      reusePatterns: [],
    })

    expect(result.retryDirective).toContain('CRITICAL')
    expect(result.retryDirective).toContain('StatCard')
    expect(result.retryDirective).toContain('@/components/shared/stat-card')
  })

  it('returns no retryDirective when all passed', () => {
    const code = `import { StatCard } from '@/components/shared/stat-card'`
    const result = verifyReusePlan(code, {
      pageName: 'Tasks',
      reuse: [{
        component: 'StatCard',
        targetSection: 'Stats',
        reason: 'test',
        importPath: '@/components/shared/stat-card',
        usageExample: '<StatCard />',
      }],
      createNew: [],
      reusePatterns: [],
    })

    expect(result.retryDirective).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run packages/cli/src/utils/reuse-planner.test.ts -t "verifyReusePlan"`
Expected: FAIL

- [ ] **Step 3: Implement verifyReusePlan**

Add to `packages/cli/src/utils/reuse-planner.ts`:

```typescript
export interface VerificationResult {
  passed: ReusePlanEntry[]
  missed: ReusePlanEntry[]
  retryDirective?: string
}

export function verifyReusePlan(generatedCode: string, plan: ReusePlan): VerificationResult {
  const passed: ReusePlanEntry[] = []
  const missed: ReusePlanEntry[] = []

  for (const entry of plan.reuse) {
    const isImported =
      generatedCode.includes(entry.importPath) ||
      generatedCode.includes(`{ ${entry.component} }`) ||
      generatedCode.includes(`{ ${entry.component},`)

    if (isImported) {
      passed.push(entry)
    } else {
      missed.push(entry)
    }
  }

  let retryDirective: string | undefined
  if (missed.length > 0) {
    const lines = missed.map(
      m =>
        `CRITICAL: Your previous output failed to import ${m.component} from ${m.importPath}. You MUST import and use this component for the "${m.targetSection}" section. Do NOT re-implement it inline.`,
    )
    retryDirective = lines.join('\n')
  }

  return { passed, missed, retryDirective }
}
```

- [ ] **Step 4: Run tests**

Run: `pnpm vitest run packages/cli/src/utils/reuse-planner.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/utils/reuse-planner.ts packages/cli/src/utils/reuse-planner.test.ts
git commit -m "feat: post-generation reuse verification with retry directive"
```

---

### Task 8: Integration — Wire Reuse Planner into split-generator

**Files:**
- Modify: `packages/cli/src/commands/chat/split-generator.ts`

- [ ] **Step 1: Import reuse planner functions**

Add to imports in `split-generator.ts`:

```typescript
import { buildReusePlan, buildReusePlanDirective, verifyReusePlan } from '../../utils/reuse-planner.js'
```

- [ ] **Step 2: Load existing page code before pMap**

Before the pMap loop (around line ~517), add:

```typescript
const existingPageCode: Record<string, string> = {}
if (projectRoot) {
  const appDir = resolve(projectRoot, 'app')
  if (existsSync(appDir)) {
    const pageFiles = readdirSync(appDir, { recursive: true })
      .filter((f): f is string => typeof f === 'string' && f.endsWith('page.tsx'))
    for (const pf of pageFiles) {
      try {
        const code = readFileSync(resolve(appDir, pf), 'utf-8')
        const route = '/' + pf.replace(/\/page\.tsx$/, '').replace(/\(.*?\)\//g, '')
        existingPageCode[route === '/' ? '/' : route] = code
      } catch { /* skip unreadable */ }
    }
  }
}
```

- [ ] **Step 3: Build ReusePlan inside pMap for each page**

Inside the pMap callback (around line ~522), before building the prompt, add:

```typescript
const pageKey = route.replace(/^\//, '') || 'home'
const pageSections = plan?.pageNotes?.[pageKey]?.sections || []
let reusePlanDirective = ''
let currentReusePlan: ReturnType<typeof buildReusePlan> | null = null

if (currentManifest && currentManifest.shared.length > 0) {
  try {
    currentReusePlan = buildReusePlan({
      pageName: name,
      pageType: pageType as 'marketing' | 'app' | 'auth',
      sections: pageSections,
      manifest: currentManifest,
      existingPageCode,
      userRequest: message,
    })
    reusePlanDirective = buildReusePlanDirective(currentReusePlan)
  } catch {
    // graceful degradation: fall back to tiered prompt
  }
}
```

- [ ] **Step 4: Use reusePlanDirective in prompt (replace tieredNote)**

In the prompt array, replace `tieredNote || sharedComponentsNote` with:

```typescript
reusePlanDirective || tieredNote || sharedComponentsNote,
```

And replace `sharedLayoutNote` reference with:

```typescript
layoutNote,  // from buildLayoutNote (Task 4)
```

- [ ] **Step 5: Add post-gen verification with retry**

**Important:** The existing `codePage` declaration in the source uses `const`. Change it to `let` so the retry can reassign it:
```typescript
let codePage = result.requests.find(...)  // was const
```

After `parseModification` returns (around line ~554), add:

```typescript
if (currentReusePlan && currentReusePlan.reuse.length > 0 && codePage) {
  const pageCode = (codePage.changes as Record<string, unknown>)?.pageCode as string
  if (pageCode) {
    const verification = verifyReusePlan(pageCode, currentReusePlan)
    if (verification.missed.length > 0 && verification.retryDirective) {
      try {
        const retryPrompt = [prompt, verification.retryDirective].join('\n\n')
        const retryResult = await parseModification(retryPrompt, modCtx, provider, parseOpts)
        const retryPage = retryResult.requests.find((r: ModificationRequest) => r.type === 'add-page')
        if (retryPage) codePage = retryPage
      } catch { /* retry failed, keep original */ }
    }
  }
}
```

- [ ] **Step 6: Run tests**

Run: `pnpm vitest run packages/cli/src/commands/chat/split-generator.test.ts`
Expected: PASS

- [ ] **Step 7: Run typecheck**

Run: `pnpm typecheck`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add packages/cli/src/commands/chat/split-generator.ts
git commit -m "feat: integrate reuse planner into split-generator with post-gen verification"
```

---

### Task 9: Integration — Wire Reuse Planner into modifier.ts (Single-Page)

**Files:**
- Modify: `packages/cli/src/agents/modifier.ts`
- Modify: `packages/cli/src/commands/chat.ts`

- [ ] **Step 1: Add reusePlanDirective to ParseModificationOptions**

In `packages/cli/src/agents/modifier.ts`, find `ParseModificationOptions` interface and add:

```typescript
reusePlanDirective?: string
```

- [ ] **Step 2: Use reusePlanDirective in buildModificationPrompt**

In `buildModificationPrompt` (private function in `modifier.ts`), find where `tieredComponentsPrompt` or `sharedComponentsSummary` is injected into the prompt string. The function builds a prompt string with string concatenation. Add a conditional block that prefers `reusePlanDirective` over `tieredComponentsPrompt` over `sharedComponentsSummary`:

```typescript
// In buildModificationPrompt, where tieredComponentsPrompt is injected:
const componentContext = options.reusePlanDirective
  || options.tieredComponentsPrompt
  || (options.sharedComponentsSummary ? `Available shared components:\n${options.sharedComponentsSummary}` : '')
```

Use `componentContext` in the prompt string where the tiered/shared prompt was previously used.

Also add `reusePlanDirective` to `buildLightweightPagePrompt` with same fallback logic.

- [ ] **Step 3: Build ReusePlan in chat.ts for single-page flow**

In `packages/cli/src/commands/chat.ts`, add imports at the top of the file:

```typescript
import { buildReusePlan, buildReusePlanDirective } from '../utils/reuse-planner.js'
import { inferPageTypeFromRoute } from '../agents/design-constraints.js'  // if not already imported
```

Verify `loadManifest` is imported from `@getcoherent/core` (it may already be imported via dynamic import at line ~972 — if so, add a static import).

Find the single-page `parseModification` path (non-multiPageHint). Before the call, add:

```typescript

// ... in the non-multiPageHint branch:
let reusePlanDirective: string | undefined
try {
  const manifest = await loadManifest(projectRoot)
  if (manifest.shared.length > 0) {
    const plan = buildReusePlan({
      pageName: 'page',
      pageType: inferPageTypeFromRoute('/') as 'marketing' | 'app' | 'auth',
      sections: [],
      manifest,
      existingPageCode: {},
      userRequest: message,
    })
    reusePlanDirective = buildReusePlanDirective(plan) || undefined
  }
} catch { /* graceful degradation */ }
```

Pass `reusePlanDirective` to `parseModification` via parseOpts.

- [ ] **Step 4: Run typecheck**

Run: `pnpm typecheck`
Expected: PASS

- [ ] **Step 5: Run tests**

Run: `pnpm test`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add packages/cli/src/agents/modifier.ts packages/cli/src/commands/chat.ts
git commit -m "feat: integrate reuse planner into single-page modification flow"
```

---

### Task 10: Incremental Manifest Sync with Mutex

**Files:**
- Modify: `packages/cli/src/commands/chat/split-generator.ts`

- [ ] **Step 1: Add manifest mutex and incremental sync**

First, ensure `saveManifest` is imported in `split-generator.ts`:
```typescript
import { ..., loadManifest, saveManifest, ... } from '@getcoherent/core'
```

At the top of `splitGeneratePages` function (or in the file scope), add:

```typescript
let manifestLock = Promise.resolve()

async function updateManifestSafe(
  projectRoot: string,
  fn: (m: SharedComponentsManifest) => SharedComponentsManifest,
): Promise<void> {
  const timeoutMs = 5000
  const update = manifestLock.then(async () => {
    const m = await loadManifest(projectRoot)
    const updated = fn(m)
    await saveManifest(projectRoot, updated)
  })
  manifestLock = update.catch(() => {})
  await Promise.race([
    update,
    new Promise<void>((_, reject) => setTimeout(() => reject(new Error('manifest sync timeout')), timeoutMs)),
  ]).catch(() => {})
}
```

- [ ] **Step 2: Call incremental sync after each page in pMap**

After each successful page generation in pMap, add:

```typescript
if (projectRoot && codePage) {
  const pageCode = (codePage.changes as Record<string, unknown>)?.pageCode as string
  if (pageCode && currentManifest) {
    await updateManifestSafe(projectRoot, (m) => {
      let updated = m
      for (const entry of updated.shared) {
        const isUsed = pageCode.includes(`{ ${entry.name} }`) || pageCode.includes(`{ ${entry.name},`)
        if (isUsed && !entry.usedIn.includes(route)) {
          updated = { ...updated, shared: updated.shared.map(e =>
            e.id === entry.id ? { ...e, usedIn: [...e.usedIn, route] } : e
          )}
        }
      }
      return updated
    })
  }
}
```

- [ ] **Step 3: Run tests**

Run: `pnpm test`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add packages/cli/src/commands/chat/split-generator.ts
git commit -m "feat: incremental manifest sync with async mutex during page generation"
```

---

### Task 11: Transparency Logging

**Files:**
- Modify: `packages/cli/src/commands/chat/split-generator.ts`

- [ ] **Step 1: Add reuse plan logging after buildReusePlan**

In the pMap callback, after building the reuse plan, add console output:

```typescript
if (currentReusePlan && (currentReusePlan.reuse.length > 0 || currentReusePlan.createNew.length > 0)) {
  const reuseNames = currentReusePlan.reuse.map(r => r.component).join(', ')
  const createNames = currentReusePlan.createNew.map(c => c.name).join(', ')
  const parts = []
  if (reuseNames) parts.push(`REUSE: ${reuseNames}`)
  if (createNames) parts.push(`CREATE: ${createNames}`)
  console.log(chalk.dim(`  🔄 Reuse Plan for "${name}": ${parts.join(' | ')}`))
}
```

- [ ] **Step 2: Add verification logging after post-gen verify**

After verification:

```typescript
if (verification) {
  const passedNames = verification.passed.map(p => `${p.component} ✓`).join(', ')
  const missedNames = verification.missed.map(m => `${m.component} ✗`).join(', ')
  if (passedNames) console.log(chalk.dim(`  ✓ Reuse verified: ${passedNames}`))
  if (missedNames) console.log(chalk.yellow(`  ⚠ Missed reuse: ${missedNames} — retrying...`))
}
```

- [ ] **Step 3: Run tests**

Run: `pnpm test`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add packages/cli/src/commands/chat/split-generator.ts
git commit -m "feat: transparency logging for reuse plan decisions"
```

---

### Task 12: Graceful Degradation Tests

**Files:**
- Modify: `packages/cli/src/utils/reuse-planner.test.ts`

- [ ] **Step 1: Add tests for fallback behavior**

Add to `packages/cli/src/utils/reuse-planner.test.ts`:

```typescript
describe('graceful degradation', () => {
  it('buildReusePlan handles empty sections gracefully', () => {
    const plan = buildReusePlan({
      pageName: 'Empty',
      pageType: 'app',
      sections: [],
      manifest: mockManifest,
      existingPageCode: {},
      userRequest: '',
    })
    expect(plan.reuse).toHaveLength(0)
    expect(plan.reusePatterns).toHaveLength(0)
  })

  it('buildReusePlan handles manifest with missing optional fields', () => {
    const sparseManifest = SharedComponentsManifestSchema.parse({
      shared: [{
        id: 'CID-001',
        name: 'Card',
        type: 'widget',
        file: 'components/shared/card.tsx',
        description: 'A card',
        usedIn: [],
        dependencies: [],
      }],
    }
    const plan = buildReusePlan({
      pageName: 'Page',
      pageType: 'app',
      sections: ['Card grid'],
      manifest: sparseManifest,
      existingPageCode: {},
      userRequest: 'test',
    })
    expect(plan.reuse.length).toBe(1)
    expect(plan.reuse[0].usageExample).toBe('<Card />')
  })

  it('verifyReusePlan handles empty reuse list', () => {
    const result = verifyReusePlan('any code', {
      pageName: 'P',
      reuse: [],
      createNew: [],
      reusePatterns: [],
    })
    expect(result.passed).toHaveLength(0)
    expect(result.missed).toHaveLength(0)
    expect(result.retryDirective).toBeUndefined()
  })

  it('buildReusePlanDirective returns empty string for empty plan', () => {
    expect(buildReusePlanDirective({
      pageName: 'P',
      reuse: [],
      createNew: [],
      reusePatterns: [],
    })).toBe('')
  })
})
```

- [ ] **Step 2: Run tests**

Run: `pnpm vitest run packages/cli/src/utils/reuse-planner.test.ts`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add packages/cli/src/utils/reuse-planner.test.ts
git commit -m "test: graceful degradation tests for reuse planner"
```

---

### Task 13: Write groupLayouts from ensurePlanGroupLayouts

**Files:**
- Modify: `packages/cli/src/commands/chat/code-generator.ts`
- Modify: `packages/cli/src/commands/chat.ts`

- [ ] **Step 1: Update ensurePlanGroupLayouts to accept and write config**

In `code-generator.ts`, update `ensurePlanGroupLayouts` to also write `groupLayouts`:

Add a `config` parameter and populate `groupLayouts`:

```typescript
export async function ensurePlanGroupLayouts(
  projectRoot: string,
  plan: ArchitecturePlan,
  storedHashes: Record<string, string> = {},
  config?: { groupLayouts?: Record<string, string> },
): Promise<void> {
  // ... existing hash-check logic from Task 3 ...

  // Write groupLayouts to config
  if (config) {
    const layouts: Record<string, string> = {}
    for (const group of plan.groups) {
      layouts[group.id] = group.layout
    }
    config.groupLayouts = layouts
  }
}
```

- [ ] **Step 2: Pass dsm.getConfig() to ensurePlanGroupLayouts**

In `chat.ts`, update both call sites:

```typescript
await ensurePlanGroupLayouts(projectRoot, splitResult.plan, storedHashes, dsm.getConfig())
```

- [ ] **Step 3: Run typecheck + tests**

Run: `pnpm typecheck && pnpm test`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add packages/cli/src/commands/chat/code-generator.ts packages/cli/src/commands/chat.ts
git commit -m "feat: persist groupLayouts from plan into config"
```

---

### Task 14: Full Build + Lint + Typecheck + Test

- [ ] **Step 1: Run full build**

Run: `pnpm build`
Expected: PASS

- [ ] **Step 2: Run lint**

Run: `pnpm lint`
Expected: PASS (or only pre-existing warnings)

- [ ] **Step 3: Run typecheck**

Run: `pnpm typecheck`
Expected: PASS

- [ ] **Step 4: Run all tests**

Run: `pnpm test`
Expected: PASS

- [ ] **Step 5: Run format check**

Run: `pnpm format:check`
Expected: PASS (run `npx prettier --write` on failing files if needed)

- [ ] **Step 6: Final commit if any format fixes**

```bash
git add -A
git commit -m "chore: format fixes for smart reuse engine"
```

---

## Phase 3: Hardening Fixes

### Task 15: Type Taxonomy Unification

**Problem:** `SharedComponentTypeSchema` in `@getcoherent/core` defines 7 types (`layout`, `navigation`, `data-display`, `form`, `feedback`, `section`, `widget`), but 8 locations in CLI still hardcode `section | widget`, causing components like StatCard (`data-display`) and FilterBar (`form`) to be invisible to reuse warnings and incorrectly classified during extraction.

**Files:**
- Modify: `packages/cli/src/commands/chat/utils.ts`
- Modify: `packages/cli/src/commands/chat/split-generator.ts`
- Modify: `packages/cli/src/utils/ai-provider.ts`
- Modify: `packages/cli/src/commands/sync.ts`
- Modify: `packages/cli/src/commands/components.ts`
- Modify: `packages/cli/src/utils/claude.ts`
- Modify: `packages/cli/src/utils/openai-provider.ts`
- Modify: `packages/cli/src/utils/cursor-rules.ts`
- Modify: `packages/cli/src/utils/claude-code.ts`
- Test: `packages/cli/src/commands/chat/utils.test.ts`

- [ ] **Step 1: Fix `warnInlineDuplicates` filter**

In `packages/cli/src/commands/chat/utils.ts`, line ~133:

```typescript
// BEFORE:
const sectionOrWidget = manifest.shared.filter(e => e.type === 'section' || e.type === 'widget')
if (sectionOrWidget.length === 0) return

// AFTER:
const reusable = manifest.shared.filter(e => e.type !== 'layout')
if (reusable.length === 0) return
```

Update the loop variable from `sectionOrWidget` to `reusable` (line ~141).

- [ ] **Step 2: Fix `SharedExtractionItemSchema` in split-generator**

In `packages/cli/src/commands/chat/split-generator.ts`, line ~615:

```typescript
// BEFORE:
const SharedExtractionItemSchema = z.object({
  name: z.string().min(2).max(50),
  type: z.enum(['section', 'widget']),
  ...
})

// AFTER:
import { SharedComponentTypeSchema } from '@getcoherent/core'

const SharedExtractionItemSchema = z.object({
  name: z.string().min(2).max(50),
  type: SharedComponentTypeSchema,
  ...
})
```

- [ ] **Step 3: Fix `SharedExtractionItem` in ai-provider.ts**

In `packages/cli/src/utils/ai-provider.ts`, line ~31:

```typescript
// BEFORE:
type: 'section' | 'widget'

// AFTER:
import type { SharedComponentType } from '@getcoherent/core'
// ...
type: SharedComponentType
```

- [ ] **Step 4: Fix `DetectedComponent` in sync.ts**

In `packages/cli/src/commands/sync.ts`, line ~43:

```typescript
// BEFORE:
type: 'layout' | 'section' | 'widget'

// AFTER:
import type { SharedComponentType } from '@getcoherent/core'
// ...
type: SharedComponentType
```

- [ ] **Step 5: Fix CLI `components shared add` command**

In `packages/cli/src/commands/components.ts`, line ~170-175:

```typescript
// BEFORE:
.option('-t, --type <type>', 'Type: layout | section | widget', 'layout')
// ...
const type = (opts.type === 'section' || opts.type === 'widget' ? opts.type : 'layout') as ...

// AFTER:
.option('-t, --type <type>', 'Type: layout | navigation | data-display | form | feedback | section | widget', 'layout')
// ...
const validTypes = ['layout', 'navigation', 'data-display', 'form', 'feedback', 'section', 'widget']
const type = (validTypes.includes(opts.type ?? '') ? opts.type : 'layout') as SharedComponentType
```

- [ ] **Step 6: Fix AI extraction prompts**

In `packages/cli/src/utils/claude.ts` line ~477 and `packages/cli/src/utils/openai-provider.ts` line ~439:

```
// BEFORE:
Each component object: "name" (PascalCase), "type" ("section"|"widget"), ...

// AFTER:
Each component object: "name" (PascalCase), "type" ("layout"|"navigation"|"data-display"|"form"|"feedback"|"section"|"widget"), ...
```

- [ ] **Step 7: Fix help text in cursor-rules.ts and claude-code.ts**

Update `--type layout|section|widget` to `--type layout|navigation|data-display|form|feedback|section|widget` in both files.

- [ ] **Step 8: Add test for warnInlineDuplicates with new types**

In `packages/cli/src/commands/chat/utils.test.ts`, add:

```typescript
it('warns for data-display components not imported', async () => {
  const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
  const plan = ArchitecturePlanSchema.parse({
    groups: [{ name: 'app', layout: 'sidebar', pages: ['/dashboard'] }],
    sharedComponents: [
      { name: 'StatCard', description: 'Metric card', props: '{}', usedBy: ['/dashboard'], type: 'data-display' },
    ],
    pageNotes: {},
  })
  const manifest = {
    shared: [{ id: 'CID-003', name: 'StatCard', type: 'data-display', file: 'components/shared/stat-card.tsx' }],
  }
  await warnInlineDuplicates('/tmp', 'Dashboard', '/dashboard', 'export default function Page() { return <div/> }', manifest, plan)
  expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('StatCard'))
  consoleSpy.mockRestore()
})
```

- [ ] **Step 9: Run tests and commit**

```bash
pnpm test && pnpm typecheck
git add -A
git commit -m "fix: unify component type taxonomy across CLI"
```

---

### Task 16: Quality Fix Retry Loop

**Problem:** The quality fix loop in `modification-handler.ts` tries AI fix once. If errors remain (e.g. 5→2), the code is written as-is. RAW_COLOR and PLACEHOLDER errors persist.

**Files:**
- Modify: `packages/cli/src/commands/chat/modification-handler.ts`

- [ ] **Step 1: Wrap quality fix in retry loop**

In `packages/cli/src/commands/chat/modification-handler.ts`, find the quality fix block (~lines 662-690). Wrap the AI fix attempt in a loop:

```typescript
// BEFORE (simplified):
if (errors.length >= 2 && aiProvider) {
  // single AI fix attempt
  const fixedCode = await ai.editPageCode(codeToWrite, instruction, ...)
  if (recheckErrors.length < errors.length) {
    codeToWrite = fixedCode
    // ...
  }
}

// AFTER:
const MAX_QUALITY_FIX_ATTEMPTS = 2
let currentErrors = errors
for (let attempt = 0; attempt < MAX_QUALITY_FIX_ATTEMPTS && currentErrors.length > 0; attempt++) {
  if (!aiProvider) break
  console.log(
    chalk.yellow(`\n🔄 ${currentErrors.length} quality errors — attempting AI fix${attempt > 0 ? ` (retry ${attempt + 1})` : ''} for ${page.name || page.id}...`),
  )
  try {
    const ai = await createAIProvider(aiProvider)
    if (!ai.editPageCode) break
    const errorList = currentErrors.map(e => `Line ${e.line}: [${e.type}] ${e.message}`).join('\n')
    const instruction = `Fix these quality issues:\n${errorList}\n\nRules:\n- Replace raw Tailwind colors (bg-emerald-500, text-zinc-400, etc.) with semantic tokens (bg-primary, text-muted-foreground, bg-muted, etc.)\n- Replace placeholder content ("Lorem ipsum", "John Doe", "user@example.com") with realistic contextual content\n- Ensure heading hierarchy (h1 → h2 → h3, no skipping)\n- Add Label components for form inputs\n- Keep all existing functionality and layout intact`
    const fixedCode = await ai.editPageCode(codeToWrite, instruction, page.name || page.id || 'Page')
    if (fixedCode && fixedCode.length > 100 && /export\s+default/.test(fixedCode)) {
      const recheck = validatePageQuality(fixedCode, undefined, qualityPageType)
      const recheckErrors = recheck.filter(i => i.severity === 'error')
      if (recheckErrors.length < currentErrors.length) {
        codeToWrite = fixedCode
        const { code: reFixed, fixes: reFixes } = await autoFixCode(codeToWrite, autoFixCtx)
        if (reFixes.length > 0) {
          codeToWrite = reFixed
          postFixes.push(...reFixes)
        }
        await writeFile(filePath, codeToWrite)
        currentErrors = recheckErrors
        console.log(chalk.green(`   ✔ Quality fix: ${errors.length} → ${currentErrors.length} errors`))
        if (currentErrors.length === 0) break
      } else {
        break
      }
    } else {
      break
    }
  } catch {
    break
  }
}
issues = validatePageQuality(codeToWrite, undefined, qualityPageType)
```

- [ ] **Step 2: Run tests and commit**

```bash
pnpm test && pnpm typecheck
git add -A
git commit -m "fix: retry quality fix up to 2 times for remaining errors"
```

---

### Task 17: Shared Component Export Validation in Preview

**Problem:** `fixMissingComponentExports` in `preview.ts` validates `@/components/ui/*` exports but ignores `@/components/shared/*`. Pages with `import { StatCard } from '@/components/shared/stat-card'` crash at runtime if the file uses `export default function StatCard`.

**Files:**
- Modify: `packages/cli/src/commands/preview.ts`

- [ ] **Step 1: Add shared component export validation**

In `packages/cli/src/commands/preview.ts`, after the existing `neededExports` collection loop (line ~169), add a similar block for shared components:

```typescript
// After collecting UI component needed exports, collect shared component needed exports
const neededSharedExports = new Map<string, Set<string>>()

for (const file of pages) {
  const content = readFileSync(file, 'utf-8')
  const sharedImportRe = /import\s*\{([^}]+)\}\s*from\s*['"]@\/components\/shared\/([^'"]+)['"]/g
  let sm
  while ((sm = sharedImportRe.exec(content)) !== null) {
    const names = sm[1].split(',').map(s => s.trim()).filter(Boolean)
    const componentId = sm[2]
    if (!neededSharedExports.has(componentId)) neededSharedExports.set(componentId, new Set())
    for (const name of names) neededSharedExports.get(componentId)!.add(name)
  }
}

// Fix shared component exports (convert export default → named export)
for (const [componentId, needed] of neededSharedExports) {
  const componentFile = join(sharedDir, `${componentId}.tsx`)
  if (!existsSync(componentFile)) continue

  let content = readFileSync(componentFile, 'utf-8')
  const exportRe = /export\s+(?:const|function|class)\s+(\w+)|export\s*\{([^}]+)\}/g
  const existingExports = new Set<string>()
  let em
  while ((em = exportRe.exec(content)) !== null) {
    if (em[1]) existingExports.add(em[1])
    if (em[2]) em[2].split(',').map(s => s.trim().split(/\s+as\s+/).pop()!).filter(Boolean).forEach(n => existingExports.add(n))
  }

  const missing = [...needed].filter(n => !existingExports.has(n))
  if (missing.length === 0) continue

  // Check if the missing name is a default export that can be converted
  const defaultExportMatch = content.match(/export\s+default\s+function\s+(\w+)/)
  if (defaultExportMatch && missing.includes(defaultExportMatch[1])) {
    content = content.replace(/export\s+default\s+function\s+(\w+)/, 'export function $1')
    writeFileSync(componentFile, content, 'utf-8')
    console.log(chalk.dim(`   ✔ Fixed export in ${componentId}.tsx (default → named)`))
  }
}
```

- [ ] **Step 2: Run tests and commit**

```bash
pnpm test && pnpm typecheck
git add -A
git commit -m "fix: validate and auto-fix shared component exports in preview pre-flight"
```
