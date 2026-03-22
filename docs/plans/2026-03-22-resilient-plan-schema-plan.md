# Resilient Plan Schema Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix Phase 2 plan generation failures by making Zod schemas tolerant of AI synonym variations, adding diagnostic logging, and reducing false-positive warning noise.

**Architecture:** All schema changes are in `plan-generator.ts`. Synonym maps normalize AI outputs before strict enum validation. `generateArchitecturePlan` returns `{ plan, warnings }` instead of bare `plan`. Token-overlap threshold in `warnInlineDuplicates` is raised. Scaffold dedup uses AUTH_SYNONYMS.

**Tech Stack:** Zod transforms, vitest, chalk

---

### Task 1: Schema Synonym Normalization

**Files:**
- Modify: `packages/cli/src/commands/chat/plan-generator.ts`
- Test: `packages/cli/src/commands/chat/plan-generator.test.ts`

**Step 1: Write the failing tests**

Add to `plan-generator.test.ts`:

```typescript
describe('ArchitecturePlanSchema synonym normalization', () => {
  it('normalizes layout synonyms', () => {
    const plan = {
      groups: [
        { id: 'app', layout: 'horizontal', pages: ['/dashboard'] },
        { id: 'auth', layout: 'vertical', pages: ['/login'] },
      ],
      sharedComponents: [],
      pageNotes: {},
    }
    const result = ArchitecturePlanSchema.safeParse(plan)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.groups[0].layout).toBe('header')
      expect(result.data.groups[1].layout).toBe('sidebar')
    }
  })

  it('normalizes pageNote type synonyms', () => {
    const plan = {
      groups: [{ id: 'app', layout: 'sidebar', pages: ['/dashboard'] }],
      sharedComponents: [],
      pageNotes: {
        dashboard: { type: 'application', sections: ['Stats'] },
        home: { type: 'landing', sections: ['Hero'] },
        login: { type: 'authentication', sections: ['Form'] },
      },
    }
    const result = ArchitecturePlanSchema.safeParse(plan)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.pageNotes['dashboard'].type).toBe('app')
      expect(result.data.pageNotes['home'].type).toBe('marketing')
      expect(result.data.pageNotes['login'].type).toBe('auth')
    }
  })

  it('normalizes component type synonyms', () => {
    const plan = {
      groups: [],
      sharedComponents: [
        { name: 'A', description: 'd', props: '{}', usedBy: ['/x'], type: 'component' },
        { name: 'B', description: 'd', props: '{}', usedBy: ['/x'], type: 'hero' },
      ],
      pageNotes: {},
    }
    const result = ArchitecturePlanSchema.safeParse(plan)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.sharedComponents[0].type).toBe('widget')
      expect(result.data.sharedComponents[1].type).toBe('section')
    }
  })

  it('trims whitespace before normalization', () => {
    const plan = {
      groups: [{ id: 'app', layout: ' sidebar ', pages: ['/d'] }],
      sharedComponents: [],
      pageNotes: { d: { type: ' app ', sections: [] } },
    }
    const result = ArchitecturePlanSchema.safeParse(plan)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.groups[0].layout).toBe('sidebar')
      expect(result.data.pageNotes['d'].type).toBe('app')
    }
  })

  it('still rejects truly invalid values', () => {
    const plan = {
      groups: [{ id: 'app', layout: 'foobar', pages: [] }],
      sharedComponents: [],
      pageNotes: {},
    }
    expect(ArchitecturePlanSchema.safeParse(plan).success).toBe(false)
  })
})
```

**Step 2: Run tests to verify they fail**

Run: `pnpm test -- --run packages/cli/src/commands/chat/plan-generator.test.ts`
Expected: FAIL — synonyms like `"horizontal"` rejected by strict enum

**Step 3: Implement synonym maps and transforms**

In `plan-generator.ts`, add synonym maps and update schemas:

```typescript
import chalk from 'chalk'

const LAYOUT_SYNONYMS: Record<string, string> = {
  horizontal: 'header', top: 'header', nav: 'header', navbar: 'header',
  topbar: 'header', 'top-bar': 'header',
  vertical: 'sidebar', left: 'sidebar', side: 'sidebar', drawer: 'sidebar',
  full: 'both', combined: 'both',
  empty: 'none', minimal: 'none', clean: 'none',
}

const PAGE_TYPE_SYNONYMS: Record<string, string> = {
  landing: 'marketing', public: 'marketing', home: 'marketing',
  website: 'marketing', static: 'marketing',
  application: 'app', dashboard: 'app', admin: 'app',
  panel: 'app', console: 'app',
  authentication: 'auth', login: 'auth', register: 'auth',
  signin: 'auth', signup: 'auth',
}

const COMPONENT_TYPE_SYNONYMS: Record<string, string> = {
  component: 'widget', ui: 'widget', element: 'widget', block: 'widget',
  'page-section': 'section', hero: 'section', feature: 'section', area: 'section',
}

function normalizeEnum(synonyms: Record<string, string>) {
  return (v: string) => {
    const trimmed = v.trim().toLowerCase()
    return synonyms[trimmed] ?? trimmed
  }
}
```

Update `RouteGroupSchema`:
```typescript
export const RouteGroupSchema = z.object({
  id: z.string(),
  layout: z.string().transform(normalizeEnum(LAYOUT_SYNONYMS)).pipe(z.enum(['header', 'sidebar', 'both', 'none'])),
  pages: z.array(z.string()),
})
```

Update `PlannedComponentSchema`:
```typescript
export const PlannedComponentSchema = z.object({
  name: z.string(),
  description: z.string().default(''),
  props: z.string().default('{}'),
  usedBy: z.array(z.string()).default([]),
  type: z.string().transform(normalizeEnum(COMPONENT_TYPE_SYNONYMS)).pipe(z.enum(['section', 'widget'])),
  shadcnDeps: z.array(z.string()).default([]),
})
```

Update `PageNoteSchema`:
```typescript
export const PageNoteSchema = z.object({
  type: z.string().transform(normalizeEnum(PAGE_TYPE_SYNONYMS)).pipe(z.enum(['marketing', 'app', 'auth'])),
  sections: z.array(z.string()).default([]),
  links: z.record(z.string()).optional(),
})
```

Update `ArchitecturePlanSchema`:
```typescript
export const ArchitecturePlanSchema = z.object({
  appName: z.string().optional(),
  groups: z.array(RouteGroupSchema),
  sharedComponents: z.array(PlannedComponentSchema).max(8).default([]),
  pageNotes: z.record(z.string(), PageNoteSchema).default({}),
})
```

**Step 4: Run tests to verify they pass**

Run: `pnpm test -- --run packages/cli/src/commands/chat/plan-generator.test.ts`
Expected: ALL PASS

**Step 5: Commit**

```bash
git add packages/cli/src/commands/chat/plan-generator.ts packages/cli/src/commands/chat/plan-generator.test.ts
git commit -m "feat: add Zod synonym normalization for plan schema"
```

---

### Task 2: Safe Defaults

**Files:**
- Modify: `packages/cli/src/commands/chat/plan-generator.ts` (already done in Task 1)
- Test: `packages/cli/src/commands/chat/plan-generator.test.ts`

**Step 1: Write the failing test**

Add to `plan-generator.test.ts`:

```typescript
describe('ArchitecturePlanSchema safe defaults', () => {
  it('parses plan with missing optional fields', () => {
    const minimal = {
      groups: [{ id: 'app', layout: 'sidebar', pages: ['/dashboard'] }],
    }
    const result = ArchitecturePlanSchema.safeParse(minimal)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.sharedComponents).toEqual([])
      expect(result.data.pageNotes).toEqual({})
    }
  })

  it('parses shared component with missing props and description', () => {
    const plan = {
      groups: [],
      sharedComponents: [
        { name: 'Card', usedBy: ['/dashboard'], type: 'widget' },
      ],
      pageNotes: {},
    }
    const result = ArchitecturePlanSchema.safeParse(plan)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.sharedComponents[0].props).toBe('{}')
      expect(result.data.sharedComponents[0].description).toBe('')
      expect(result.data.sharedComponents[0].usedBy).toEqual(['/dashboard'])
    }
  })

  it('parses pageNote with missing sections', () => {
    const plan = {
      groups: [],
      sharedComponents: [],
      pageNotes: { home: { type: 'marketing' } },
    }
    const result = ArchitecturePlanSchema.safeParse(plan)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.pageNotes['home'].sections).toEqual([])
    }
  })
})
```

**Step 2: Run tests to verify they fail**

Run: `pnpm test -- --run packages/cli/src/commands/chat/plan-generator.test.ts`
Expected: FAIL if defaults not yet applied (they were added in Task 1, so these should PASS immediately if Task 1 was completed)

**Step 3: Verify defaults are in place (from Task 1)**

The `.default()` calls were already added in Task 1's implementation step. If tests pass, no additional code changes needed.

**Step 4: Run tests**

Run: `pnpm test -- --run packages/cli/src/commands/chat/plan-generator.test.ts`
Expected: ALL PASS

**Step 5: Commit**

```bash
git add packages/cli/src/commands/chat/plan-generator.test.ts
git commit -m "test: add safe defaults tests for plan schema"
```

---

### Task 3: Diagnostic Logging (PlanResult)

**Files:**
- Modify: `packages/cli/src/commands/chat/plan-generator.ts`
- Modify: `packages/cli/src/commands/chat/split-generator.ts`
- Test: `packages/cli/src/commands/chat/plan-generator.test.ts`

**Step 1: Write the failing tests**

Add to `plan-generator.test.ts`:

```typescript
describe('generateArchitecturePlan diagnostics', () => {
  it('returns warnings on schema validation failure', async () => {
    const mockProvider = {
      generateJSON: vi.fn().mockResolvedValue({ invalid: true }),
    }
    const result = await generateArchitecturePlan([], 'test', mockProvider as any, null)
    expect(result.plan).toBeNull()
    expect(result.warnings.length).toBeGreaterThan(0)
    expect(result.warnings[0]).toContain('Validation')
  })

  it('returns warnings on API error', async () => {
    const mockProvider = {
      generateJSON: vi.fn().mockRejectedValue(new Error('API timeout')),
    }
    const result = await generateArchitecturePlan([], 'test', mockProvider as any, null)
    expect(result.plan).toBeNull()
    expect(result.warnings.some(w => w.includes('API timeout'))).toBe(true)
  })

  it('returns empty warnings on success', async () => {
    const mockProvider = {
      generateJSON: vi.fn().mockResolvedValue({
        groups: [{ id: 'app', layout: 'sidebar', pages: ['/d'] }],
        sharedComponents: [],
        pageNotes: {},
      }),
    }
    const result = await generateArchitecturePlan(
      [{ name: 'D', id: 'd', route: '/d' }], 'test', mockProvider as any, null,
    )
    expect(result.plan).not.toBeNull()
    expect(result.warnings).toEqual([])
  })
})
```

**Step 2: Run tests to verify they fail**

Run: `pnpm test -- --run packages/cli/src/commands/chat/plan-generator.test.ts`
Expected: FAIL — `generateArchitecturePlan` returns `ArchitecturePlan | null`, not `PlanResult`

**Step 3: Implement PlanResult return type**

In `plan-generator.ts`, add the interface and update `generateArchitecturePlan`:

```typescript
export interface PlanResult {
  plan: ArchitecturePlan | null
  warnings: string[]
}

export async function generateArchitecturePlan(
  pages: Array<{ name: string; id: string; route: string }>,
  userMessage: string,
  aiProvider: AIProviderInterface,
  layoutHint: string | null,
): Promise<PlanResult> {
  const userPrompt = `Pages: ${pages.map(p => `${p.name} (${p.route})`).join(', ')}

User's request: "${userMessage}"

Navigation type requested: ${layoutHint || 'auto-detect'}`

  const warnings: string[] = []

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const raw = await aiProvider.generateJSON(PLAN_SYSTEM_PROMPT, userPrompt)
      const parsed = ArchitecturePlanSchema.safeParse(raw)
      if (parsed.success) return { plan: parsed.data, warnings }
      warnings.push(
        `Validation (attempt ${attempt + 1}): ${parsed.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ')}`,
      )
    } catch (err) {
      warnings.push(`Error (attempt ${attempt + 1}): ${err instanceof Error ? err.message : String(err)}`)
      if (attempt === 1) return { plan: null, warnings }
    }
  }
  return { plan: null, warnings }
}
```

Also update existing tests that use `generateArchitecturePlan` — they now need to destructure:

```typescript
// Old:
const result = await generateArchitecturePlan(...)
expect(result?.appName).toBe('TestApp')

// New:
const { plan } = await generateArchitecturePlan(...)
expect(plan?.appName).toBe('TestApp')
```

Update the 3 existing tests in `describe('generateArchitecturePlan')`:
- `result` → `{ plan: result }` or `{ plan }`
- `expect(result)` → `expect(plan)`

**Step 4: Update split-generator.ts caller**

In `split-generator.ts`, update the `generateArchitecturePlan` call site (around line 242):

```typescript
const { plan: generatedPlan, warnings: planWarnings } = await generateArchitecturePlan(pageNames, message, ai, layoutHint)
plan = generatedPlan
if (plan) {
  // existing success handling...
  spinner.succeed('Phase 2/6 — Architecture plan created')
  // ... group/shared/total logging ...
} else {
  spinner.warn('Phase 2/6 — Plan generation failed (continuing without plan)')
}
for (const w of planWarnings) {
  console.log(chalk.dim(`  ${w}`))
}
```

**Step 5: Add diagnostics to updateArchitecturePlan**

In `plan-generator.ts`, update `updateArchitecturePlan`:

```typescript
export async function updateArchitecturePlan(
  existingPlan: ArchitecturePlan,
  newPages: Array<{ name: string; id: string; route: string }>,
  userMessage: string,
  aiProvider: AIProviderInterface,
): Promise<ArchitecturePlan> {
  // ... existing userPrompt ...

  try {
    const raw = await aiProvider.generateJSON(PLAN_SYSTEM_PROMPT, userPrompt)
    const parsed = ArchitecturePlanSchema.safeParse(raw)
    if (parsed.success) return parsed.data
    const issues = parsed.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ')
    console.warn(chalk.dim(`  Plan update validation failed: ${issues}`))
  } catch (err) {
    console.warn(chalk.dim(`  Plan update error: ${err instanceof Error ? err.message : String(err)}`))
  }

  // Deterministic merge fallback (unchanged)
  // ...
}
```

**Step 6: Run tests**

Run: `pnpm test -- --run packages/cli/src/commands/chat/plan-generator.test.ts`
Expected: ALL PASS

**Step 7: Commit**

```bash
git add packages/cli/src/commands/chat/plan-generator.ts packages/cli/src/commands/chat/plan-generator.test.ts packages/cli/src/commands/chat/split-generator.ts
git commit -m "feat: add PlanResult with diagnostic warnings"
```

---

### Task 4: Reduce Warning Noise in warnInlineDuplicates

**Files:**
- Modify: `packages/cli/src/commands/chat/utils.ts`
- Test: `packages/cli/src/commands/chat/utils.test.ts`

**Step 1: Write the failing tests**

Add to `utils.test.ts`:

```typescript
describe('warnInlineDuplicates token-overlap threshold', () => {
  it('does not warn with low overlap (< 20 tokens)', async () => {
    const warnSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const tmpDir = mkdtempSync(join(tmpdir(), 'warn-'))
    const sharedDir = join(tmpDir, 'components', 'shared')
    mkdirSync(sharedDir, { recursive: true })
    // Write a shared component with many tokens
    writeFileSync(
      join(sharedDir, 'feature-card.tsx'),
      'import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"\nexport default function FeatureCard({ title, desc }: { title: string; desc: string }) {\n  return <Card className="p-6"><CardHeader><CardTitle>{title}</CardTitle></CardHeader><CardContent>{desc}</CardContent></Card>\n}',
    )
    // Page code with generic UI tokens that overlap slightly (12 matches)
    const pageCode = 'import { Card, CardContent, Button } from "@/components/ui"\nexport default function Dashboard() {\n  return <div className="p-6 flex items-center"><Card><CardContent><Button>Click</Button></CardContent></Card></div>\n}'
    const manifest = {
      shared: [{ id: 'CID-001', name: 'FeatureCard', type: 'widget', file: 'components/shared/feature-card.tsx' }],
    }
    await warnInlineDuplicates(tmpDir, 'Dashboard', '/dashboard', pageCode, manifest)
    const warnings = warnSpy.mock.calls.filter(c => String(c[0]).includes('FeatureCard'))
    expect(warnings).toHaveLength(0)
    warnSpy.mockRestore()
    rmSync(tmpDir, { recursive: true })
  })
})
```

**Step 2: Run test to verify it fails**

Run: `pnpm test -- --run packages/cli/src/commands/chat/utils.test.ts`
Expected: FAIL — current threshold (12) triggers the warning

**Step 3: Implement higher threshold**

In `utils.ts`, replace the threshold check in `warnInlineDuplicates`:

Replace:
```typescript
if (overlap >= 12 && sharedTokens.size >= 10) {
```

With:
```typescript
const overlapRatio = sharedTokens.size > 0 ? overlap / sharedTokens.size : 0
if (overlap >= 20 && overlapRatio >= 0.6) {
```

**Step 4: Run tests**

Run: `pnpm test -- --run packages/cli/src/commands/chat/utils.test.ts`
Expected: ALL PASS

**Step 5: Commit**

```bash
git add packages/cli/src/commands/chat/utils.ts packages/cli/src/commands/chat/utils.test.ts
git commit -m "fix: raise token-overlap threshold to reduce false positive warnings"
```

---

### Task 5: Fix Duplicate Auto-Scaffold Entries

**Files:**
- Modify: `packages/cli/src/commands/chat/chat.ts` (line ~633 and ~876)

**Step 1: Fix synonym-aware scaffold filtering**

In `chat.ts`, after line 632 (`const existingRoutes = ...`), import and use AUTH_SYNONYMS to build a normalized set:

At the top of `chat.ts`, the `AUTH_SYNONYMS` map is in `utils.ts`. Import it:
```typescript
import { requireProject, loadConfig, routeToFsPath, resolveTargetFlags, AUTH_SYNONYMS } from './chat/utils.js'
```

Then update the `missingRoutes` filter (line ~633):

```typescript
const existingRoutes = new Set(currentConfig.pages.map(p => p.route).filter(Boolean))
// Build reverse synonym map: for each existing route, also mark its synonyms as existing
const expandedExisting = new Set(existingRoutes)
for (const route of existingRoutes) {
  // Check if this route is a synonym target
  for (const [synonym, canonical] of Object.entries(AUTH_SYNONYMS)) {
    if (route === canonical) expandedExisting.add(synonym)
    if (route === synonym) expandedExisting.add(canonical)
  }
}
const missingRoutes = [...allLinkedRoutes].filter(route => {
  if (expandedExisting.has(route)) return false
  if (existsSync(routeToFsPath(projectRoot, route, false))) return false
  if (existsSync(routeToFsPath(projectRoot, route, true))) return false
  return true
})
```

**Step 2: Fix duplicate scaffold report**

In `chat.ts`, around line 879, deduplicate `scaffoldedPages` before printing:

```typescript
if (scaffoldedPages.length > 0) {
  const uniqueScaffolded = [...new Map(scaffoldedPages.map(s => [s.route, s])).values()]
  console.log(chalk.cyan('🔗 Auto-scaffolded linked pages:'))
  uniqueScaffolded.forEach(({ route, name }) => {
    console.log(chalk.white(`   ✨ ${name} → ${route}`))
  })
  console.log('')
}
```

**Step 3: Export AUTH_SYNONYMS from utils.ts**

In `packages/cli/src/commands/chat/utils.ts`, make sure `AUTH_SYNONYMS` is exported (it should already be, check):

```typescript
export const AUTH_SYNONYMS: Record<string, string> = {
  '/register': '/signup',
  '/registration': '/signup',
  '/sign-up': '/signup',
  '/signin': '/login',
  '/sign-in': '/login',
}
```

**Step 4: Run full test suite**

Run: `pnpm test -- --run`
Expected: ALL PASS

**Step 5: Commit**

```bash
git add packages/cli/src/commands/chat.ts packages/cli/src/commands/chat/utils.ts
git commit -m "fix: deduplicate auto-scaffolded pages using auth synonyms"
```

---

### Task 6: Final Verification

**Step 1: Build**

Run: `pnpm build`
Expected: Success

**Step 2: Lint**

Run: `pnpm lint`
Expected: No errors

**Step 3: Typecheck**

Run: `pnpm typecheck`
Expected: No errors

**Step 4: Format**

Run: `pnpm format`
Then: `pnpm format:check`
Expected: No issues

**Step 5: Full test suite**

Run: `pnpm test`
Expected: ALL PASS

**Step 6: Commit any format fixes**

```bash
git add -A
git commit -m "chore: format"
```
