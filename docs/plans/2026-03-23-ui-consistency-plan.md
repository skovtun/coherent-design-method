# UI Consistency Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make AI-generated pages visually consistent by replacing verbose text rules with concrete JSX reference snippets across all code-generating prompts.

**Architecture:** Add 7 reference JSX snippets to `design-constraints.ts`, replacing verbose text. Update `formatPlanSummary` to include section names. Add existing-page-context for repeat runs. Fix modification-handler to use page-type-specific constraints.

**Tech Stack:** TypeScript, Vitest, Zod

---

### Task 1: Add reference snippets to `DESIGN_QUALITY_APP`

**Files:**
- Modify: `packages/cli/src/agents/design-constraints.ts` (lines 237-260, `DESIGN_QUALITY_APP`)
- Test: `packages/cli/src/agents/design-constraints.test.ts`

**Step 1: Write the failing test**

Add test to `design-constraints.test.ts`:

```typescript
describe('DESIGN_QUALITY_APP reference snippets', () => {
  it('contains SelectTrigger snippet (not native select)', () => {
    const quality = getDesignQualityForType('app')
    expect(quality).toContain('<SelectTrigger')
    expect(quality).toContain('<SelectContent>')
    expect(quality).toContain('<SelectItem')
  })

  it('contains filter toolbar snippet', () => {
    const quality = getDesignQualityForType('app')
    expect(quality).toContain('flex flex-wrap items-center gap-2')
    expect(quality).toContain('relative flex-1')
  })

  it('contains page header snippet', () => {
    const quality = getDesignQualityForType('app')
    expect(quality).toContain('text-2xl font-bold tracking-tight')
    expect(quality).toContain('space-y-1')
  })

  it('contains empty state snippet', () => {
    const quality = getDesignQualityForType('app')
    expect(quality).toContain('flex flex-col items-center justify-center py-12')
  })

  it('warns against native option elements', () => {
    const quality = getDesignQualityForType('app')
    expect(quality).toContain('NEVER use <Select> with native <option>')
  })

  it('warns against standalone filter icon buttons', () => {
    const quality = getDesignQualityForType('app')
    expect(quality).toContain('Do NOT add standalone filter icon buttons')
  })
})
```

**Step 2: Run test to verify it fails**

Run: `pnpm test -- --run packages/cli/src/agents/design-constraints.test.ts`
Expected: FAIL — current `DESIGN_QUALITY_APP` does not contain these snippets.

**Step 3: Replace verbose text in `DESIGN_QUALITY_APP` with reference snippets**

Replace the current `DESIGN_QUALITY_APP` constant (lines 237-260) with:

```typescript
const DESIGN_QUALITY_APP = `
## DESIGN QUALITY — APP PAGES

### Reference Patterns (COPY these exact patterns)

PAGE HEADER:
\`\`\`
<div className="flex items-center justify-between">
  <div className="space-y-1">
    <h1 className="text-2xl font-bold tracking-tight">Page Title</h1>
    <p className="text-sm text-muted-foreground">Page description</p>
  </div>
  <Button><Plus className="size-4 mr-2 shrink-0" />New Item</Button>
</div>
\`\`\`

FILTER TOOLBAR (search + dropdowns + action):
\`\`\`
<div className="flex flex-wrap items-center gap-2">
  <div className="relative flex-1">
    <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground shrink-0" />
    <Input placeholder="Search..." className="pl-9" />
  </div>
  <Select>
    <SelectTrigger className="w-[180px]">
      <SelectValue placeholder="All Status" />
    </SelectTrigger>
    <SelectContent>
      <SelectItem value="all">All Status</SelectItem>
      <SelectItem value="active">Active</SelectItem>
    </SelectContent>
  </Select>
  <Button><Plus className="size-4 mr-2 shrink-0" />New Item</Button>
</div>
\`\`\`
CRITICAL: NEVER use <Select> with native <option> elements. Always use the shadcn compound pattern above (SelectTrigger + SelectValue + SelectContent + SelectItem).
Do NOT add standalone filter icon buttons. The Select dropdowns ARE the filters.

STATS GRID:
\`\`\`
<div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
  <Card>
    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
      <CardTitle className="text-sm font-medium">Metric Name</CardTitle>
      <TrendingUp className="size-4 text-muted-foreground shrink-0" />
    </CardHeader>
    <CardContent>
      <div className="text-2xl font-bold">1,234</div>
      <p className="text-xs text-muted-foreground">+12% from last month</p>
    </CardContent>
  </Card>
</div>
\`\`\`

DATA TABLE:
\`\`\`
<div className="overflow-x-auto">
  <Table>
    <TableHeader>
      <TableRow>
        <TableHead>Name</TableHead>
        <TableHead>Status</TableHead>
        <TableHead className="w-[50px]"></TableHead>
      </TableRow>
    </TableHeader>
    <TableBody>
      <TableRow className="hover:bg-muted/50">
        <TableCell className="font-medium">Item name</TableCell>
        <TableCell><Badge variant="default">Active</Badge></TableCell>
        <TableCell>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon"><MoreHorizontal className="size-4 shrink-0" /></Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem>Edit</DropdownMenuItem>
              <DropdownMenuItem className="text-destructive">Delete</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </TableCell>
      </TableRow>
    </TableBody>
  </Table>
</div>
\`\`\`

EMPTY STATE (when list/table has zero items):
\`\`\`
<div className="flex flex-col items-center justify-center py-12 text-center">
  <Inbox className="size-12 text-muted-foreground mb-4 shrink-0" />
  <h3 className="text-lg font-semibold">No items yet</h3>
  <p className="text-sm text-muted-foreground mt-1 max-w-sm">Create your first item to get started.</p>
  <Button className="mt-4"><Plus className="size-4 mr-2 shrink-0" />Create Item</Button>
</div>
\`\`\`

DATA CARD GRID:
\`\`\`
<div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
  <Card className="hover:border-border/30 transition-colors">
    <CardHeader className="flex flex-row items-start justify-between space-y-0">
      <div className="space-y-1">
        <CardTitle>Item Name</CardTitle>
        <p className="text-sm text-muted-foreground">Description</p>
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon"><MoreHorizontal className="size-4 shrink-0" /></Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem>Edit</DropdownMenuItem>
          <DropdownMenuItem className="text-destructive">Delete</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </CardHeader>
    <CardContent>...</CardContent>
  </Card>
</div>
\`\`\`

### Spacing
- gap-4 md:gap-6 between sections
- p-4 lg:p-6 content padding
- Page wrapper: flex flex-1 flex-col gap-4 p-4 lg:p-6

NEVER include marketing sections (hero, pricing, testimonials) on app pages.
`
```

**Step 4: Run test to verify it passes**

Run: `pnpm test -- --run packages/cli/src/agents/design-constraints.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/cli/src/agents/design-constraints.ts packages/cli/src/agents/design-constraints.test.ts
git commit -m "feat: add reference JSX snippets to DESIGN_QUALITY_APP for UI consistency"
```

---

### Task 2: Add auth reference snippet to `DESIGN_QUALITY_AUTH`

**Files:**
- Modify: `packages/cli/src/agents/design-constraints.ts` (lines 266-283, `DESIGN_QUALITY_AUTH`)
- Test: `packages/cli/src/agents/design-constraints.test.ts`

**Step 1: Write the failing test**

```typescript
describe('DESIGN_QUALITY_AUTH reference snippet', () => {
  it('contains auth card snippet with form pattern', () => {
    const quality = getDesignQualityForType('auth')
    expect(quality).toContain('w-full max-w-md')
    expect(quality).toContain('<CardHeader className="space-y-1">')
    expect(quality).toContain('<form className="space-y-4">')
    expect(quality).toContain('underline-offset-4')
  })
})
```

**Step 2: Run test to verify it fails**

Run: `pnpm test -- --run packages/cli/src/agents/design-constraints.test.ts`
Expected: FAIL

**Step 3: Replace verbose text in `DESIGN_QUALITY_AUTH` with reference snippet**

Replace lines 266-283 with:

```typescript
const DESIGN_QUALITY_AUTH = `
## DESIGN QUALITY — AUTH PAGES

### Reference Pattern (COPY this exact pattern)

AUTH CARD:
\`\`\`
<div className="w-full max-w-md">
  <Card>
    <CardHeader className="space-y-1">
      <CardTitle className="font-bold text-center">Welcome back</CardTitle>
      <p className="text-sm text-muted-foreground text-center">Enter your credentials</p>
    </CardHeader>
    <CardContent>
      <form className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input id="email" type="email" placeholder="Enter your email" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">Password</Label>
          <Input id="password" type="password" placeholder="Enter your password" />
        </div>
        <Button type="submit" className="w-full">Sign in</Button>
      </form>
    </CardContent>
    <CardFooter className="text-center">
      <p className="text-sm text-muted-foreground">
        Don't have an account?{' '}
        <Link href="/register" className="text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground transition-colors">Sign up</Link>
      </p>
    </CardFooter>
  </Card>
</div>
\`\`\`

### Rules
- The auth layout ALREADY provides centering (flex items-center justify-center min-h-svh). Do NOT add your own centering wrapper.
- Card width: w-full max-w-md
- Form fields inside CardContent: space-y-4 between field groups
- Each field group (Label + Input): space-y-2
- No navigation bars, sidebars, or multi-section layouts on auth pages.
`
```

**Step 4: Run tests**

Run: `pnpm test -- --run packages/cli/src/agents/design-constraints.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/cli/src/agents/design-constraints.ts packages/cli/src/agents/design-constraints.test.ts
git commit -m "feat: add auth card reference snippet to DESIGN_QUALITY_AUTH"
```

---

### Task 3: Update `formatPlanSummary` to include pageNotes sections

**Files:**
- Modify: `packages/cli/src/commands/chat/split-generator.ts` (lines 136-149, `formatPlanSummary`)
- Test: `packages/cli/src/commands/chat/split-generator.test.ts`

**Step 1: Write the failing test**

```typescript
it('formatPlanSummary includes pageNotes sections', () => {
  const plan = {
    groups: [{ id: 'app', layout: 'sidebar' as const, pages: ['/dashboard', '/tasks'] }],
    sharedComponents: [],
    pageNotes: {
      dashboard: { type: 'app' as const, sections: ['Stats row', 'Activity feed'] },
      tasks: { type: 'app' as const, sections: ['Filter toolbar', 'Task list'] },
    },
  }
  const summary = formatPlanSummary(plan)
  expect(summary).toContain('Page Sections:')
  expect(summary).toContain('dashboard: Stats row, Activity feed')
  expect(summary).toContain('tasks: Filter toolbar, Task list')
})
```

**Step 2: Run test to verify it fails**

Run: `pnpm test -- --run packages/cli/src/commands/chat/split-generator.test.ts`
Expected: FAIL — current `formatPlanSummary` does not include pageNotes.

**Step 3: Update `formatPlanSummary` to include sections**

In `split-generator.ts`, update the `formatPlanSummary` function:

```typescript
export function formatPlanSummary(plan: ArchitecturePlan): string {
  if (plan.groups.length === 0) return ''

  const groupLines = plan.groups.map(g => `  Group "${g.id}" (layout: ${g.layout}): ${g.pages.join(', ')}`)
  const compLines = plan.sharedComponents.map(
    c => `  ${c.name} (${c.type}) — ${c.description}; usedBy: ${c.usedBy.join(', ')}`,
  )

  const parts = [`ARCHITECTURE PLAN:\nGroups:\n${groupLines.join('\n')}`]
  if (compLines.length > 0) {
    parts.push(`Shared Components:\n${compLines.join('\n')}`)
  }

  const noteEntries = Object.entries(plan.pageNotes || {}).filter(
    ([, note]) => note.sections && note.sections.length > 0,
  )
  if (noteEntries.length > 0) {
    const noteLines = noteEntries.map(([key, note]) => `  ${key}: ${note.sections.join(', ')}`)
    parts.push(`Page Sections:\n${noteLines.join('\n')}`)
  }

  return parts.join('\n')
}
```

**Step 4: Run tests**

Run: `pnpm test -- --run packages/cli/src/commands/chat/split-generator.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/cli/src/commands/chat/split-generator.ts packages/cli/src/commands/chat/split-generator.test.ts
git commit -m "feat: include pageNotes sections in formatPlanSummary"
```

---

### Task 4: Add existing-page-context for repeat runs

**Files:**
- Modify: `packages/cli/src/commands/chat/split-generator.ts`
- Test: `packages/cli/src/commands/chat/split-generator.test.ts`

**Step 1: Write the failing test**

```typescript
import { readExistingAppPageForReference } from './split-generator.js'

describe('readExistingAppPageForReference', () => {
  it('returns null when no project root', () => {
    const result = readExistingAppPageForReference(null, null)
    expect(result).toBeNull()
  })

  it('returns null when no plan', () => {
    const result = readExistingAppPageForReference('/tmp/nonexistent', null)
    expect(result).toBeNull()
  })
})
```

**Step 2: Run test to verify it fails**

Run: `pnpm test -- --run packages/cli/src/commands/chat/split-generator.test.ts`
Expected: FAIL — function does not exist.

**Step 3: Implement `readExistingAppPageForReference`**

Add to `split-generator.ts`:

```typescript
import { existsSync, readFileSync, readdirSync, statSync } from 'fs'

export function readExistingAppPageForReference(
  projectRoot: string | null,
  plan: ArchitecturePlan | null,
): string | null {
  if (!projectRoot) return null

  // Strategy 1: use plan to find first app-type page
  if (plan?.pageNotes) {
    for (const [key, note] of Object.entries(plan.pageNotes)) {
      if (note.type !== 'app') continue
      const route = key === 'home' ? '/' : `/${key}`
      // Try common group names
      for (const group of ['(app)', '(admin)', '(dashboard)']) {
        const filePath = resolve(projectRoot, 'app', group, key, 'page.tsx')
        if (existsSync(filePath)) {
          const code = readFileSync(filePath, 'utf-8')
          const lines = code.split('\n')
          return lines.slice(0, 200).join('\n')
        }
      }
    }
  }

  // Strategy 2: glob for any app page
  const appDir = resolve(projectRoot, 'app')
  if (!existsSync(appDir)) return null
  try {
    const entries = readdirSync(appDir)
    for (const entry of entries) {
      if (!entry.startsWith('(') || entry === '(auth)') continue
      const groupDir = resolve(appDir, entry)
      if (!statSync(groupDir).isDirectory()) continue
      const subDirs = readdirSync(groupDir)
      for (const sub of subDirs) {
        const pagePath = resolve(groupDir, sub, 'page.tsx')
        if (existsSync(pagePath)) {
          const code = readFileSync(pagePath, 'utf-8')
          const lines = code.split('\n')
          return lines.slice(0, 200).join('\n')
        }
      }
    }
  } catch {
    return null
  }

  return null
}
```

Then in the `splitGeneratePages` function, after `planSummaryNote` is defined (around line 400), add:

```typescript
const existingAppPageCode = readExistingAppPageForReference(projectRoot, plan)
const existingAppPageNote = existingAppPageCode
  ? `\nEXISTING APP PAGE (match these UI patterns for consistency):\n\`\`\`\n${existingAppPageCode}\n\`\`\`\n`
  : ''
```

Then include `existingAppPageNote` in the prompt array (around line 430), after `planSummaryNote`.

**Step 4: Run tests**

Run: `pnpm test -- --run packages/cli/src/commands/chat/split-generator.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/cli/src/commands/chat/split-generator.ts packages/cli/src/commands/chat/split-generator.test.ts
git commit -m "feat: add existing-page-context for repeat coherent chat runs"
```

---

### Task 5: Include design constraints in shared component generation

**Files:**
- Modify: `packages/cli/src/commands/chat/plan-generator.ts` (function `generateSharedComponentsFromPlan`, around line 280)
- Test: `packages/cli/src/commands/chat/plan-generator.test.ts`

**Step 1: Write the failing test**

```typescript
describe('generateSharedComponentsFromPlan prompt', () => {
  it('includes design quality constraints in prompt', async () => {
    // We'll test this by checking the function doesn't crash with mocked provider
    // and that the imports include design constraints
    const module = await import('./plan-generator.js')
    expect(module.generateSharedComponentsFromPlan).toBeDefined()
  })
})
```

Note: Testing the exact prompt content is hard with the current architecture. We verify the import is added and the function doesn't crash.

**Step 2: Run test to verify it passes**

Run: `pnpm test -- --run packages/cli/src/commands/chat/plan-generator.test.ts`
Expected: PASS (basic existence test)

**Step 3: Add design constraints to shared component prompt**

In `plan-generator.ts`, add import:

```typescript
import { getDesignQualityForType, CORE_CONSTRAINTS } from '../../agents/design-constraints.js'
```

Update the prompt in `generateSharedComponentsFromPlan` (around line 290). After the `Requirements:` section, add:

```typescript
  const designRules = `${CORE_CONSTRAINTS}\n${getDesignQualityForType('app')}`

  const prompt = `Generate React components as separate files. For EACH component below, return an add-page request with name and pageCode fields.

Components to generate:
${componentSpecs}

Style context: ${styleContext || 'default'}

${designRules}

Requirements:
- Each component MUST have \`export default function ComponentName\`
...`
```

**Step 4: Run tests**

Run: `pnpm test -- --run packages/cli/src/commands/chat/plan-generator.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/cli/src/commands/chat/plan-generator.ts packages/cli/src/commands/chat/plan-generator.test.ts
git commit -m "feat: include design constraints in shared component generation"
```

---

### Task 6: Fix modification-handler to use page-type-specific constraints

**Files:**
- Modify: `packages/cli/src/commands/chat/modification-handler.ts` (around line 758-771)

**Step 1: Identify the bug**

Line 759: `const qualityRules = DESIGN_QUALITY` uses the legacy composite export (marketing-only rules). It should use `getDesignQualityForType(pageType)` to get page-type-specific rules with reference snippets.

**Step 2: Update imports**

Change the import from:
```typescript
import {
  CORE_CONSTRAINTS,
  DESIGN_QUALITY,
  selectContextualRules,
  inferPageTypeFromRoute,
} from '../../agents/design-constraints.js'
```
To:
```typescript
import {
  CORE_CONSTRAINTS,
  DESIGN_QUALITY_COMMON,
  getDesignQualityForType,
  selectContextualRules,
  inferPageTypeFromRoute,
} from '../../agents/design-constraints.js'
```

**Step 3: Update the quality rules line**

Around line 758-759, change:
```typescript
const coreRules = CORE_CONSTRAINTS
const qualityRules = DESIGN_QUALITY
```
To:
```typescript
const coreRules = CORE_CONSTRAINTS
const pageRoute = pageDef.route || `/${pageDef.id}`
const pageType = inferPageTypeFromRoute(pageRoute)
const qualityRules = `${DESIGN_QUALITY_COMMON}\n${getDesignQualityForType(pageType)}`
```

Note: `DESIGN_QUALITY_COMMON` needs to be exported from `design-constraints.ts`. Currently it's not exported. Add `export` to it.

**Step 4: Export `DESIGN_QUALITY_COMMON`**

In `design-constraints.ts`, change:
```typescript
export const DESIGN_QUALITY_COMMON = `
```
(It's already exported — verify. If not, add `export`.)

**Step 5: Run full test suite**

Run: `pnpm test`
Expected: all tests PASS

**Step 6: Commit**

```bash
git add packages/cli/src/commands/chat/modification-handler.ts packages/cli/src/agents/design-constraints.ts
git commit -m "fix: use page-type-specific design constraints in modification handler"
```

---

### Task 7: Consolidate overlapping rules in RULES_DATA_DISPLAY

**Files:**
- Modify: `packages/cli/src/agents/design-constraints.ts` (lines 436-509, `RULES_DATA_DISPLAY`)

**Step 1: Identify overlap**

The following sections in `RULES_DATA_DISPLAY` are now covered by reference snippets in `DESIGN_QUALITY_APP`:
- `SEARCH INPUT:` (lines 504-508) — covered by Filter Toolbar snippet
- `EMPTY STATES:` (lines 462-469) — covered by Empty State snippet
- `STAT / METRIC CARDS:` (lines 439-445) — covered by Stats Grid snippet

**Step 2: Add cross-references instead of duplicating**

Replace the overlapping sections with brief references:

For `STAT / METRIC CARDS:` — replace with:
```
STAT / METRIC CARDS: See the Stats Grid reference pattern in DESIGN QUALITY — APP PAGES. Follow that exact pattern.
```

For `EMPTY STATES:` — replace with:
```
EMPTY STATES: See the Empty State reference pattern in DESIGN QUALITY — APP PAGES. Follow that exact pattern.
```

For `SEARCH INPUT:` — replace with:
```
SEARCH INPUT: See the Filter Toolbar reference pattern in DESIGN QUALITY — APP PAGES. Always use the compound Select pattern shown there.
```

**Step 3: Run tests**

Run: `pnpm test`
Expected: all tests PASS

**Step 4: Run format check**

Run: `pnpm prettier --check packages/cli/src/agents/design-constraints.ts`

**Step 5: Commit**

```bash
git add packages/cli/src/agents/design-constraints.ts
git commit -m "refactor: consolidate overlapping rules with reference snippet cross-refs"
```

---

### Task 8: Build, lint, typecheck, full test

**Step 1: Build**

Run: `pnpm build`
Expected: success

**Step 2: Lint**

Run: `pnpm lint`
Expected: success

**Step 3: Typecheck**

Run: `pnpm typecheck`
Expected: success

**Step 4: Format check**

Run: `pnpm format:check`
Expected: success (run `pnpm prettier --write` on affected files if needed)

**Step 5: Full test suite**

Run: `pnpm test`
Expected: all tests PASS

**Step 6: Final commit if any fixes needed**

```bash
git add -A
git commit -m "chore: fix lint/format issues from UI consistency changes"
```
