# Pattern Reuse Pipeline — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the shared component system so patterns are extracted after every generation, stored with rich metadata (props, usage examples, dependencies), injected into prompts token-efficiently, and validated for actual reuse.

**Architecture:** Four new capabilities layered onto the existing pipeline: (1) extended registry schema in `core`, (2) file-based component extractor in `cli`, (3) tiered prompt builder replacing flat component summaries, (4) post-generation reuse validator. Bug fixes in plan-generator and sync. Auto-sync step added at end of every `coherent chat`. New `--component` flag for user-driven component creation.

**Tech Stack:** TypeScript, Vitest, Zod

**Spec:** `docs/plans/2026-03-23-pattern-reuse-pipeline-design.md`

---

### Task 1: Extend Registry Schema

**Files:**
- Modify: `packages/core/src/types/shared-components-manifest.ts`
- Modify: `packages/core/src/managers/SharedComponentsRegistry.ts`
- Modify: `packages/core/src/generators/SharedComponentGenerator.ts`
- Test: `packages/core/src/types/shared-components-manifest.test.ts` (create if absent, or find existing)

- [ ] **Step 1: Write failing test for extended schema**

In `packages/core/src/types/shared-components-manifest.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { SharedComponentsManifestSchema, SharedComponentTypeSchema } from './shared-components-manifest.js'

describe('SharedComponentTypeSchema', () => {
  it('accepts extended component types', () => {
    const types = ['layout', 'section', 'widget', 'navigation', 'data-display', 'form', 'feedback']
    for (const t of types) {
      expect(SharedComponentTypeSchema.parse(t)).toBe(t)
    }
  })
})

describe('SharedComponentsManifestSchema — extended fields', () => {
  it('parses entry with new fields', () => {
    const manifest = SharedComponentsManifestSchema.parse({
      shared: [{
        id: 'CID-001',
        name: 'StatsCard',
        type: 'data-display',
        file: 'components/shared/stats-card.tsx',
        usedIn: ['app/dashboard/page.tsx'],
        description: 'Metric card',
        propsInterface: '{ icon: LucideIcon; value: string }',
        usageExample: '<StatsCard icon={Users} value="1,234" />',
        dependencies: ['lucide-react'],
        source: 'extracted',
      }],
      nextId: 2,
    })
    expect(manifest.shared[0].usageExample).toBe('<StatsCard icon={Users} value="1,234" />')
    expect(manifest.shared[0].dependencies).toEqual(['lucide-react'])
    expect(manifest.shared[0].source).toBe('extracted')
  })

  it('provides defaults for new fields when parsing old format', () => {
    const manifest = SharedComponentsManifestSchema.parse({
      shared: [{
        id: 'CID-001',
        name: 'Header',
        type: 'layout',
        file: 'components/shared/header.tsx',
      }],
      nextId: 2,
    })
    expect(manifest.shared[0].usageExample).toBeUndefined()
    expect(manifest.shared[0].dependencies).toEqual([])
    expect(manifest.shared[0].source).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @getcoherent/core test -- --run shared-components-manifest`
Expected: FAIL — `SharedComponentTypeSchema` does not accept 'data-display', 'navigation', 'form', 'feedback'; fields `usageExample`, `dependencies`, `source` not in schema.

- [ ] **Step 3: Implement schema changes**

In `packages/core/src/types/shared-components-manifest.ts`, replace:

```typescript
export const SharedComponentTypeSchema = z.enum(['layout', 'section', 'widget'])
```

with:

```typescript
export const SharedComponentTypeSchema = z.enum([
  'layout',
  'navigation',
  'data-display',
  'form',
  'feedback',
  'section',
  'widget',
])
```

In `SharedComponentEntrySchema`, add after `propsInterface`:

```typescript
  usageExample: z.string().optional(),
  dependencies: z.array(z.string()).default([]),
  source: z.enum(['extracted', 'generated', 'manual']).optional(),
```

- [ ] **Step 4: Update `CreateSharedComponentInput` in `SharedComponentsRegistry.ts`**

In `packages/core/src/managers/SharedComponentsRegistry.ts`, update the interface (around line 80):

```typescript
export interface CreateSharedComponentInput {
  name: string
  type: SharedComponentType
  file: string
  usedIn?: string[]
  description?: string
  propsInterface?: string
  usageExample?: string
  dependencies?: string[]
  source?: 'extracted' | 'generated' | 'manual'
}
```

Update `createEntry` function (around line 95) to pass through new fields:

```typescript
  const entry: SharedComponentEntry = {
    id,
    name: input.name,
    type: input.type,
    file: input.file,
    usedIn: input.usedIn ?? [],
    description: input.description,
    propsInterface: input.propsInterface,
    usageExample: input.usageExample,
    dependencies: input.dependencies ?? [],
    source: input.source,
    createdAt: now,
  }
```

- [ ] **Step 5: Update `GenerateSharedComponentInput` in `SharedComponentGenerator.ts`**

In `packages/core/src/generators/SharedComponentGenerator.ts`, add to `GenerateSharedComponentInput` (around line 81):

```typescript
  usageExample?: string
  dependencies?: string[]
  source?: 'extracted' | 'generated' | 'manual'
```

And in `generateSharedComponent` where `createEntry` is called (around line 135), add:

```typescript
    usageExample: input.usageExample,
    dependencies: input.dependencies,
    source: input.source,
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `pnpm --filter @getcoherent/core test -- --run`
Expected: ALL PASS

- [ ] **Step 7: Commit**

```bash
git add packages/core/src/types/shared-components-manifest.ts \
       packages/core/src/types/shared-components-manifest.test.ts \
       packages/core/src/managers/SharedComponentsRegistry.ts \
       packages/core/src/generators/SharedComponentGenerator.ts
git commit -m "feat: extend registry schema with usageExample, dependencies, source, and new component types"
```

---

### Task 2: Component Extractor Module

**Files:**
- Create: `packages/cli/src/utils/component-extractor.ts`
- Create: `packages/cli/src/utils/component-extractor.test.ts`

- [ ] **Step 1: Write failing tests**

In `packages/cli/src/utils/component-extractor.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import {
  extractPropsInterface,
  extractExportedComponentName,
  extractDependencies,
  extractUsageExample,
} from './component-extractor.js'

describe('extractExportedComponentName', () => {
  it('extracts name from export function', () => {
    const code = `export function StatsCard({ icon, value }: Props) { return <div /> }`
    expect(extractExportedComponentName(code)).toBe('StatsCard')
  })

  it('extracts name from export const arrow', () => {
    const code = `export const DataTable = ({ columns }: Props) => { return <table /> }`
    expect(extractExportedComponentName(code)).toBe('DataTable')
  })

  it('extracts name from export default function', () => {
    const code = `export default function FilterToolbar() { return <div /> }`
    expect(extractExportedComponentName(code)).toBe('FilterToolbar')
  })

  it('returns null for no export', () => {
    expect(extractExportedComponentName('const x = 1')).toBeNull()
  })
})

describe('extractPropsInterface', () => {
  it('extracts interface Props', () => {
    const code = `interface Props {\n  icon: LucideIcon\n  value: string\n  label: string\n}\nexport function StatsCard(props: Props) {}`
    expect(extractPropsInterface(code)).toBe('{ icon: LucideIcon; value: string; label: string }')
  })

  it('extracts type Props', () => {
    const code = `type Props = {\n  columns: Column[]\n  data: Row[]\n}\nexport function DataTable(props: Props) {}`
    expect(extractPropsInterface(code)).toBe('{ columns: Column[]; data: Row[] }')
  })

  it('extracts inline destructured props', () => {
    const code = `export function StatsCard({ icon, value, label }: { icon: LucideIcon; value: string; label: string }) {}`
    expect(extractPropsInterface(code)).toBe('{ icon: LucideIcon; value: string; label: string }')
  })

  it('returns null when no props found', () => {
    expect(extractPropsInterface('export function App() {}')).toBeNull()
  })
})

describe('extractDependencies', () => {
  it('extracts package imports', () => {
    const code = `import { Users } from 'lucide-react'\nimport { Card } from '@/components/ui/card'\nimport { cn } from '@/lib/utils'`
    const deps = extractDependencies(code)
    expect(deps).toContain('lucide-react')
    expect(deps).toContain('components/ui/card')
    expect(deps).not.toContain('@/lib/utils')
  })
})

describe('extractUsageExample', () => {
  it('extracts first JSX usage of component', () => {
    const pageCode = `import { StatsCard } from '@/components/shared/stats-card'\nexport default function Dashboard() {\n  return <div>\n    <StatsCard icon={Users} value="1,234" label="Total Users" />\n    <StatsCard icon={Mail} value="56" label="Messages" />\n  </div>\n}`
    const usage = extractUsageExample(pageCode, 'StatsCard')
    expect(usage).toContain('<StatsCard')
    expect(usage).toContain('icon={Users}')
    expect(usage).not.toContain('<StatsCard icon={Mail}')
  })

  it('returns null when component not used', () => {
    expect(extractUsageExample('<div>hello</div>', 'StatsCard')).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @getcoherent/cli test -- --run component-extractor`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement component extractor**

Create `packages/cli/src/utils/component-extractor.ts`:

```typescript
export function extractExportedComponentName(code: string): string | null {
  const patterns = [
    /export\s+(?:default\s+)?function\s+([A-Z][a-zA-Z0-9]*)/,
    /export\s+const\s+([A-Z][a-zA-Z0-9]*)\s*[=:]/,
  ]
  for (const pattern of patterns) {
    const match = code.match(pattern)
    if (match) return match[1]
  }
  return null
}

export function extractPropsInterface(code: string): string | null {
  const interfaceMatch = code.match(/(?:interface|type)\s+Props\s*=?\s*\{([^}]*(?:\{[^}]*\}[^}]*)*)\}/)
  if (interfaceMatch) {
    const body = interfaceMatch[1]
      .split('\n')
      .map(l => l.trim())
      .filter(l => l && !l.startsWith('//'))
      .join(' ')
      .replace(/\s*;\s*$/, '')
      .replace(/\s+/g, ' ')
    const fields = body.split(/\s*[;\n]\s*/).filter(Boolean).join('; ')
    return `{ ${fields} }`
  }

  const inlineMatch = code.match(/\}\s*:\s*(\{[^)]+\})/)
  if (inlineMatch) return inlineMatch[1].replace(/\s+/g, ' ').trim()

  return null
}

export function extractDependencies(code: string): string[] {
  const deps: string[] = []
  const importRegex = /import\s+.*?from\s+['"]([^'"]+)['"]/g
  let match
  while ((match = importRegex.exec(code)) !== null) {
    const source = match[1]
    if (source.startsWith('@/components/ui/')) {
      deps.push(source.replace('@/', ''))
    } else if (!source.startsWith('.') && !source.startsWith('@/')) {
      deps.push(source)
    }
  }
  return [...new Set(deps)]
}

export function extractUsageExample(pageCode: string, componentName: string): string | null {
  const selfClosingRegex = new RegExp(`<${componentName}\\s[^>]*/>`)
  const selfMatch = pageCode.match(selfClosingRegex)
  if (selfMatch) return selfMatch[0]

  const openingRegex = new RegExp(`<${componentName}[\\s>][^]*?</${componentName}>`)
  const openMatch = pageCode.match(openingRegex)
  if (openMatch) {
    const full = openMatch[0]
    return full.length > 200 ? full.slice(0, 200) + '...' : full
  }

  return null
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @getcoherent/cli test -- --run component-extractor`
Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/utils/component-extractor.ts \
       packages/cli/src/utils/component-extractor.test.ts
git commit -m "feat: add component-extractor module for file-based metadata extraction"
```

---

### Task 3: Tiered Prompt Builder

**Files:**
- Modify: `packages/cli/src/commands/chat/split-generator.ts` (lines 118–136)
- Test: `packages/cli/src/commands/chat/split-generator.test.ts`

- [ ] **Step 1: Write failing tests**

Add to `packages/cli/src/commands/chat/split-generator.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { buildTieredComponentsPrompt } from './split-generator.js'

const mockManifest = {
  shared: [
    {
      id: 'CID-001', name: 'Header', type: 'layout' as const,
      file: 'components/shared/header.tsx', usedIn: ['app/layout.tsx'],
      description: 'Main site header', propsInterface: '{ logo?: string }',
      usageExample: '<Header logo="/logo.svg" />', dependencies: [],
    },
    {
      id: 'CID-002', name: 'StatsCard', type: 'data-display' as const,
      file: 'components/shared/stats-card.tsx', usedIn: ['app/dashboard/page.tsx'],
      description: 'Metric card with trend', propsInterface: '{ icon: LucideIcon; value: string; label: string }',
      usageExample: '<StatsCard icon={Users} value="1,234" label="Total" />', dependencies: ['lucide-react'],
    },
    {
      id: 'CID-003', name: 'FilterToolbar', type: 'form' as const,
      file: 'components/shared/filter-toolbar.tsx', usedIn: [],
      description: 'Search and filter controls', propsInterface: '{ onFilter: (q: string) => void }',
      usageExample: '<FilterToolbar onFilter={handleFilter} />', dependencies: [],
    },
    {
      id: 'CID-004', name: 'PricingCard', type: 'section' as const,
      file: 'components/shared/pricing-card.tsx', usedIn: ['app/pricing/page.tsx'],
      description: 'Pricing tier card', propsInterface: '{ title: string; price: number }',
      usageExample: '<PricingCard title="Pro" price={29} />', dependencies: [],
    },
  ],
  nextId: 5,
}

describe('buildTieredComponentsPrompt', () => {
  it('includes all components in Level 1 (one-line summaries)', () => {
    const result = buildTieredComponentsPrompt(mockManifest, 'app')
    expect(result).toContain('CID-001 Header (layout)')
    expect(result).toContain('CID-002 StatsCard (data-display)')
    expect(result).toContain('CID-003 FilterToolbar (form)')
    expect(result).toContain('CID-004 PricingCard (section)')
  })

  it('includes detailed Level 2 for relevant types only', () => {
    const result = buildTieredComponentsPrompt(mockManifest, 'app')
    expect(result).toContain('Props: { icon: LucideIcon; value: string; label: string }')
    expect(result).toContain('<StatsCard icon={Users}')
    expect(result).toContain('<FilterToolbar onFilter={handleFilter}')
    expect(result).not.toContain('Props: { title: string; price: number }')
  })

  it('selects section types for marketing pages', () => {
    const result = buildTieredComponentsPrompt(mockManifest, 'marketing')
    expect(result).toContain('<PricingCard title="Pro"')
    expect(result).not.toContain('<StatsCard icon={Users}')
  })

  it('returns undefined for empty manifest', () => {
    expect(buildTieredComponentsPrompt({ shared: [], nextId: 1 }, 'app')).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @getcoherent/cli test -- --run split-generator`
Expected: FAIL — `buildTieredComponentsPrompt` is not exported.

- [ ] **Step 3: Implement tiered prompt builder**

In `packages/cli/src/commands/chat/split-generator.ts`, add after the existing `buildSharedComponentsNote` (keep old functions for now, they'll be replaced in integration):

```typescript
const RELEVANT_TYPES: Record<string, string[]> = {
  app: ['data-display', 'form', 'navigation', 'feedback'],
  auth: ['form', 'feedback'],
  marketing: ['section', 'layout'],
}

export function buildTieredComponentsPrompt(
  manifest: SharedComponentsManifest,
  pageType: 'marketing' | 'app' | 'auth',
): string | undefined {
  if (manifest.shared.length === 0) return undefined

  const relevantTypes = new Set(RELEVANT_TYPES[pageType] || RELEVANT_TYPES.app)

  const level1Lines = manifest.shared.map(e => {
    const desc = e.description ? ` — ${e.description}` : ''
    return `- ${e.id} ${e.name} (${e.type})${desc}`
  })

  const relevantComponents = manifest.shared.filter(e => relevantTypes.has(e.type))
  const level2Blocks = relevantComponents
    .filter(e => e.propsInterface || e.usageExample)
    .map(e => {
      const importPath = e.file.replace(/^components\/shared\//, '').replace(/\.tsx$/, '')
      const lines = [`### ${e.name} (${e.id})`]
      if (e.propsInterface) lines.push(`Props: ${e.propsInterface}`)
      if (e.usageExample) lines.push(`Usage: ${e.usageExample}`)
      lines.push(`Import: import { ${e.name} } from '@/components/shared/${importPath}'`)
      return lines.join('\n')
    })

  const sections = [
    `SHARED COMPONENTS — MANDATORY REUSE:`,
    `Before implementing any section, check this list. Import and use matching components. Do NOT re-implement these patterns inline.`,
    ``,
    `Available components:`,
    ...level1Lines,
  ]

  if (level2Blocks.length > 0) {
    sections.push(
      ``,
      `Components to use on this page (detailed API):`,
      ...level2Blocks,
    )
  }

  sections.push(
    ``,
    `If you need a component from the list above that isn't detailed below, import it by path — the system will validate usage post-generation.`,
  )

  return sections.join('\n')
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @getcoherent/cli test -- --run split-generator`
Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/commands/chat/split-generator.ts \
       packages/cli/src/commands/chat/split-generator.test.ts
git commit -m "feat: add tiered prompt builder with relevance-based component injection"
```

---

### Task 4: Reuse Validator

**Files:**
- Create: `packages/cli/src/utils/reuse-validator.ts`
- Create: `packages/cli/src/utils/reuse-validator.test.ts`

- [ ] **Step 1: Write failing tests**

In `packages/cli/src/utils/reuse-validator.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { validateReuse, type ReuseWarning } from './reuse-validator.js'
import type { SharedComponentsManifest } from '@getcoherent/core'

const manifest: SharedComponentsManifest = {
  shared: [
    {
      id: 'CID-001', name: 'StatsCard', type: 'data-display',
      file: 'components/shared/stats-card.tsx', usedIn: [],
      description: 'Metric card', propsInterface: '{ icon: LucideIcon; value: string; label: string }',
      dependencies: [],
    },
    {
      id: 'CID-002', name: 'Header', type: 'layout',
      file: 'components/shared/header.tsx', usedIn: ['app/layout.tsx'],
      dependencies: [],
    },
  ],
  nextId: 3,
}

describe('validateReuse', () => {
  it('warns when relevant component is not imported', () => {
    const code = `import { Card } from '@/components/ui/card'
export default function Dashboard() {
  return <Card><div className="text-2xl font-bold">1,234</div><p>Total Users</p></Card>
}`
    const warnings = validateReuse(manifest, code, 'app')
    const missed = warnings.filter(w => w.type === 'missed-reuse')
    expect(missed.length).toBeGreaterThan(0)
    expect(missed[0].componentId).toBe('CID-001')
  })

  it('does not warn when component is imported and used', () => {
    const code = `import { StatsCard } from '@/components/shared/stats-card'
export default function Dashboard() {
  return <StatsCard icon={Users} value="1,234" label="Total" />
}`
    const warnings = validateReuse(manifest, code, 'app')
    expect(warnings.filter(w => w.type === 'missed-reuse')).toHaveLength(0)
  })

  it('does not warn for irrelevant component types', () => {
    const code = `export default function Dashboard() { return <div>Dashboard</div> }`
    const warnings = validateReuse(manifest, code, 'app')
    const headerWarnings = warnings.filter(w => w.componentId === 'CID-002')
    expect(headerWarnings).toHaveLength(0)
  })

  it('warns on duplicate creation', () => {
    const code = `export default function Dashboard() { return <div /> }`
    const newFiles = [{ name: 'MetricCard', type: 'data-display' as const, file: 'components/metric-card.tsx',
      propsInterface: '{ icon: LucideIcon; value: string; label: string }' }]
    const warnings = validateReuse(manifest, code, 'app', newFiles)
    const dupes = warnings.filter(w => w.type === 'duplicate-creation')
    expect(dupes.length).toBeGreaterThan(0)
    expect(dupes[0].message).toContain('StatsCard')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @getcoherent/cli test -- --run reuse-validator`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement reuse validator**

Create `packages/cli/src/utils/reuse-validator.ts`:

```typescript
import type { SharedComponentsManifest } from '@getcoherent/core'

export interface ReuseWarning {
  type: 'missed-reuse' | 'wrong-usage' | 'duplicate-creation'
  componentId: string
  componentName: string
  message: string
}

interface NewComponentInfo {
  name: string
  type: string
  file: string
  propsInterface?: string
}

const RELEVANT_TYPES: Record<string, Set<string>> = {
  app: new Set(['data-display', 'form', 'navigation', 'feedback']),
  auth: new Set(['form', 'feedback']),
  marketing: new Set(['section', 'layout']),
}

export function validateReuse(
  manifest: SharedComponentsManifest,
  generatedCode: string,
  pageType: 'marketing' | 'app' | 'auth',
  newComponents?: NewComponentInfo[],
): ReuseWarning[] {
  const warnings: ReuseWarning[] = []
  const relevantTypes = RELEVANT_TYPES[pageType] || RELEVANT_TYPES.app

  for (const comp of manifest.shared) {
    if (!relevantTypes.has(comp.type)) continue

    const isImported = generatedCode.includes(`from '@/components/shared/`) &&
      (generatedCode.includes(`{ ${comp.name} }`) || generatedCode.includes(`{ ${comp.name},`))

    if (!isImported) {
      warnings.push({
        type: 'missed-reuse',
        componentId: comp.id,
        componentName: comp.name,
        message: `${comp.name} (${comp.id}) is available but not imported. Consider using it instead of inline patterns.`,
      })
    } else if (comp.propsInterface) {
      const requiredProps = parseProps(comp.propsInterface)
      const usageMatch = generatedCode.match(new RegExp(`<${comp.name}\\s([^>]*?)/?>`))
      if (usageMatch) {
        const usedProps = new Set((usageMatch[1].match(/(\w+)=/g) || []).map(p => p.replace('=', '')))
        for (const req of requiredProps) {
          if (!usedProps.has(req) && !comp.propsInterface.includes(`${req}?`)) {
            warnings.push({
              type: 'wrong-usage',
              componentId: comp.id,
              componentName: comp.name,
              message: `${comp.name} (${comp.id}) is missing required prop "${req}".`,
            })
          }
        }
      }
    }
  }

  if (newComponents) {
    for (const newComp of newComponents) {
      for (const existing of manifest.shared) {
        if (existing.type !== newComp.type) continue

        const existingProps = parseProps(existing.propsInterface || '')
        const newProps = parseProps(newComp.propsInterface || '')
        const overlap = propOverlap(existingProps, newProps)

        if (overlap > 0.5) {
          warnings.push({
            type: 'duplicate-creation',
            componentId: existing.id,
            componentName: newComp.name,
            message: `New ${newComp.name} looks similar to existing ${existing.name} (${existing.id}). Consider reusing ${existing.name} instead.`,
          })
        }
      }
    }
  }

  return warnings
}

function parseProps(propsStr: string): Set<string> {
  const names = propsStr.match(/(\w+)\s*[?:]?\s*:/g) || []
  return new Set(names.map(n => n.replace(/[?:\s]/g, '')))
}

function propOverlap(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0
  let shared = 0
  for (const prop of a) {
    if (b.has(prop)) shared++
  }
  return shared / Math.max(a.size, b.size)
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @getcoherent/cli test -- --run reuse-validator`
Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/utils/reuse-validator.ts \
       packages/cli/src/utils/reuse-validator.test.ts
git commit -m "feat: add reuse-validator with missed-reuse and duplicate-creation checks"
```

---

### Task 5: AI Classification (Level 2 Extraction)

**Files:**
- Create: `packages/cli/src/utils/ai-classifier.ts`
- Create: `packages/cli/src/utils/ai-classifier.test.ts`

- [ ] **Step 1: Write failing test**

In `packages/cli/src/utils/ai-classifier.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { buildClassificationPrompt, parseClassificationResponse } from './ai-classifier.js'

describe('buildClassificationPrompt', () => {
  it('builds prompt from component signatures', () => {
    const components = [
      { name: 'StatsCard', signature: 'export function StatsCard({ icon, value, label }: Props)' },
      { name: 'FilterToolbar', signature: 'export function FilterToolbar({ filters, onFilter }: Props)' },
    ]
    const prompt = buildClassificationPrompt(components)
    expect(prompt).toContain('StatsCard')
    expect(prompt).toContain('FilterToolbar')
    expect(prompt).toContain('data-display')
  })
})

describe('parseClassificationResponse', () => {
  it('parses valid JSON response', () => {
    const response = JSON.stringify([
      { name: 'StatsCard', type: 'data-display', description: 'Metric card with trend' },
      { name: 'FilterToolbar', type: 'form', description: 'Search and filter controls' },
    ])
    const result = parseClassificationResponse(response)
    expect(result).toHaveLength(2)
    expect(result[0].type).toBe('data-display')
  })

  it('falls back to section for unknown types', () => {
    const response = JSON.stringify([
      { name: 'Widget', type: 'unknown-type', description: 'Something' },
    ])
    const result = parseClassificationResponse(response)
    expect(result[0].type).toBe('section')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @getcoherent/cli test -- --run ai-classifier`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement AI classifier**

Create `packages/cli/src/utils/ai-classifier.ts`:

```typescript
import { z } from 'zod'

const VALID_TYPES = ['layout', 'navigation', 'data-display', 'form', 'feedback', 'section', 'widget'] as const

interface ComponentSignature {
  name: string
  signature: string
}

interface ClassificationResult {
  name: string
  type: (typeof VALID_TYPES)[number]
  description: string
}

export function buildClassificationPrompt(components: ComponentSignature[]): string {
  const specs = components.map((c, i) => `${i + 1}. ${c.name}: ${c.signature}`).join('\n')
  return `Classify these React components into one of these types: ${VALID_TYPES.join(', ')}.

${specs}

Return JSON array: [{ "name": "...", "type": "...", "description": "one sentence" }]`
}

const ClassificationSchema = z.array(z.object({
  name: z.string(),
  type: z.string(),
  description: z.string().default(''),
}))

export function parseClassificationResponse(response: string): ClassificationResult[] {
  const jsonMatch = response.match(/\[[\s\S]*\]/)
  if (!jsonMatch) return []

  const parsed = ClassificationSchema.safeParse(JSON.parse(jsonMatch[0]))
  if (!parsed.success) return []

  return parsed.data.map(item => ({
    name: item.name,
    type: VALID_TYPES.includes(item.type as any) ? (item.type as any) : 'section',
    description: item.description,
  }))
}

export async function classifyComponents(
  components: ComponentSignature[],
  aiCall: (prompt: string) => Promise<string>,
): Promise<ClassificationResult[]> {
  if (components.length === 0) return []
  const prompt = buildClassificationPrompt(components)
  const response = await aiCall(prompt)
  return parseClassificationResponse(response)
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @getcoherent/cli test -- --run ai-classifier`
Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/utils/ai-classifier.ts \
       packages/cli/src/utils/ai-classifier.test.ts
git commit -m "feat: add AI classifier for Level 2 component type classification"
```

---

### Task 6: Bug Fix — Plan Generator Manifest Update

**Files:**
- Modify: `packages/cli/src/commands/chat/plan-generator.ts`
- Test: `packages/cli/src/commands/chat/plan-generator.test.ts`

- [ ] **Step 1: Find the PlannedComponentSchema and extend ComponentType**

In `packages/cli/src/commands/chat/plan-generator.ts`, find `PlannedComponentSchema` which constrains type to `z.enum(['section', 'widget'])`. Update it to:

```typescript
z.enum(['layout', 'navigation', 'data-display', 'form', 'feedback', 'section', 'widget'])
```

Also find `COMPONENT_TYPE_SYNONYMS` map and extend it to handle AI responses like "data display" → "data-display", "nav" → "navigation", "input" → "form", "error" → "feedback".

- [ ] **Step 2: Find `generateSharedComponentsFromPlan` and fix manifest registration**

In the same file, `generateSharedComponentsFromPlan` currently writes files with `writeFile` directly (around lines 340–360). Change it to call `generateSharedComponent` from `@getcoherent/core` instead, which handles both file write AND manifest registration.

Replace the direct `writeFile` call with:

```typescript
import { generateSharedComponent } from '@getcoherent/core'

// Inside the loop for each component:
const result = await generateSharedComponent(projectRoot, {
  name: comp.name,
  type: comp.type,
  code: fixedCode,
  description: comp.description,
  usedIn: [],
  source: 'generated',
  overwrite: true,
})
```

- [ ] **Step 3: Run existing tests + verify build**

Run: `pnpm --filter @getcoherent/cli test -- --run plan-generator`
Expected: ALL PASS (existing behavior preserved)

- [ ] **Step 4: Commit**

```bash
git add packages/cli/src/commands/chat/plan-generator.ts
git commit -m "fix: plan-generator now registers shared components in manifest via generateSharedComponent"
```

---

### Task 6: Bug Fix — Save extractReusablePatterns Output

**Files:**
- Modify: `packages/cli/src/commands/sync.ts`

- [ ] **Step 1: Find `extractReusablePatterns` (around line 351)**

Currently it returns `{pattern, count, sample}[]` and the result is only printed. Find where it's called (around line 467) and add logic to populate `config.stylePatterns` from its output.

Add a mapping function:

```typescript
function mapReusablePatternsToStylePatterns(
  patterns: { pattern: string; count: number }[],
  existing: StylePatterns,
): StylePatterns {
  const result = { ...existing }
  for (const p of patterns) {
    if (p.pattern.includes('rounded') && p.pattern.includes('border') && !result.card) {
      result.card = p.pattern
    }
    if (p.pattern.includes('py-') && p.pattern.includes('px-') && !result.section) {
      result.section = p.pattern
    }
  }
  return result
}
```

After `extractReusablePatterns` call, add:

```typescript
if (reusablePatterns.length > 0 && !dryRun) {
  config.stylePatterns = mapReusablePatternsToStylePatterns(reusablePatterns, config.stylePatterns || {})
}
```

- [ ] **Step 2: Run existing sync tests**

Run: `pnpm --filter @getcoherent/cli test -- --run sync`
Expected: ALL PASS

- [ ] **Step 3: Commit**

```bash
git add packages/cli/src/commands/sync.ts
git commit -m "fix: save extractReusablePatterns output to config.stylePatterns"
```

---

### Task 7: Integrate Tiered Prompt Builder into Generation Pipeline

**Files:**
- Modify: `packages/cli/src/commands/chat/split-generator.ts` (Phase 5 prompt construction)
- Modify: `packages/cli/src/agents/modifier.ts` (buildModificationPrompt shared section)

- [ ] **Step 1: Replace `buildSharedComponentsNote` usage in Phase 5**

In `packages/cli/src/commands/chat/split-generator.ts`, in the Phase 5 page generation loop (around line 470), replace:

```typescript
const sharedComponentsNote = buildSharedComponentsNote(parseOpts.sharedComponentsSummary)
```

with:

```typescript
const sharedComponentsNote = parseOpts.sharedComponentsSummary
  ? buildSharedComponentsNote(parseOpts.sharedComponentsSummary)
  : undefined
```

And in the per-page prompt construction inside the `pMap` callback (around line 488), before building the prompt, add:

```typescript
const tieredNote = buildTieredComponentsPrompt(
  await loadManifest(parseOpts.projectRoot || projectRoot),
  pageType,
)
```

Then replace `sharedComponentsNote` with `tieredNote || sharedComponentsNote` in the prompt array.

- [ ] **Step 2: Update `buildModificationPrompt` in `modifier.ts`**

In `packages/cli/src/agents/modifier.ts`, update the `buildModificationPrompt` function (around line 184) to accept `pageType` and use tiered format when manifest data is richer (has `usageExample` fields). Keep backward compatibility — if old summary format is passed, use it as-is.

Add an optional `pageType` to the options:

```typescript
options?: {
  isExpandedPageRequest?: boolean
  sharedComponentsSummary?: string
  tieredComponentsPrompt?: string
}
```

And in the function body, prefer `tieredComponentsPrompt` over `sharedComponentsSummary`:

```typescript
const sharedSection = options?.tieredComponentsPrompt
  ? `\n\n## SHARED COMPONENTS (MANDATORY REUSE)\n\n${options.tieredComponentsPrompt}\n`
  : options?.sharedComponentsSummary
    ? /* existing logic */
    : ''
```

- [ ] **Step 3: Update `buildLightweightPagePrompt` similarly**

In `packages/cli/src/agents/modifier.ts` (around line 465), add `tieredComponentsPrompt` parameter and prefer it over `sharedComponentsSummary`.

- [ ] **Step 4: Run all tests**

Run: `pnpm --filter @getcoherent/cli test -- --run`
Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/commands/chat/split-generator.ts \
       packages/cli/src/agents/modifier.ts
git commit -m "feat: integrate tiered prompt builder into generation pipeline"
```

---

### Task 8: Auto-Sync After `coherent chat`

**Files:**
- Modify: `packages/cli/src/commands/chat.ts` (after file hashing, around line 860)

- [ ] **Step 1: Add lightweight sync step**

After the file hash updates block (around line 862) and before the "recent changes" section, add:

```typescript
// Lightweight auto-sync: update manifest with metadata from generated files
try {
  const { loadManifest, saveManifest, updateEntry } = await import('@getcoherent/core')
  const { extractExportedComponentName, extractPropsInterface, extractDependencies, extractUsageExample } =
    await import('./utils/component-extractor.js')
  const currentManifest = await loadManifest(projectRoot)
  let updatedManifest = currentManifest
  let changed = false

  for (const entry of currentManifest.shared) {
    const fullPath = resolve(projectRoot, entry.file)
    if (!existsSync(fullPath)) continue

    const code = readFileSync(fullPath, 'utf-8')
    const props = extractPropsInterface(code)
    const deps = extractDependencies(code)

    if ((props && props !== entry.propsInterface) || deps.length !== (entry.dependencies?.length ?? 0)) {
      updatedManifest = updateEntry(updatedManifest, entry.id, {
        propsInterface: props ?? entry.propsInterface,
        dependencies: deps,
      })
      changed = true
    }
  }

  // Update usedIn from generated pages
  const pageFiles = Array.from(allModified).filter(f => f.startsWith('app/') && f.endsWith('page.tsx'))
  for (const pageFile of pageFiles) {
    const fullPath = resolve(projectRoot, pageFile)
    if (!existsSync(fullPath)) continue
    const pageCode = readFileSync(fullPath, 'utf-8')

    for (const entry of updatedManifest.shared) {
      const isUsed = pageCode.includes(`from '@/components/shared/`) &&
        (pageCode.includes(`{ ${entry.name} }`) || pageCode.includes(`{ ${entry.name},`))
      if (isUsed && !entry.usedIn.includes(pageFile)) {
        updatedManifest = updateEntry(updatedManifest, entry.id, {
          usedIn: [...entry.usedIn, pageFile],
        })
        changed = true

        if (!entry.usageExample) {
          const usage = extractUsageExample(pageCode, entry.name)
          if (usage) {
            updatedManifest = updateEntry(updatedManifest, entry.id, { usageExample: usage })
          }
        }
      }
    }
  }

  // Level 2: AI classify new/untyped components
  const untypedEntries = updatedManifest.shared.filter(
    e => !e.source && e.type === 'section' && e.propsInterface
  )
  if (untypedEntries.length > 0 && provider) {
    try {
      const { classifyComponents } = await import('./utils/ai-classifier.js')
      const aiProvider = await createAIProvider(provider ?? 'auto')
      const signatures = untypedEntries.map(e => ({
        name: e.name,
        signature: e.propsInterface || e.name,
      }))
      const classifications = await classifyComponents(
        signatures,
        (prompt) => aiProvider.generateCode(prompt),
      )
      for (const cls of classifications) {
        const entry = updatedManifest.shared.find(e => e.name === cls.name)
        if (entry) {
          updatedManifest = updateEntry(updatedManifest, entry.id, {
            type: cls.type as any,
            description: cls.description || entry.description,
            source: 'extracted',
          })
          changed = true
        }
      }
    } catch {
      // AI classification is best-effort
    }
  }

  if (changed) {
    await saveManifest(projectRoot, updatedManifest)
    if (DEBUG) console.log(chalk.dim('[auto-sync] Manifest updated'))
  }
} catch {
  if (DEBUG) console.log(chalk.dim('[auto-sync] Skipped'))
}
```

- [ ] **Step 2: Run full test suite**

Run: `pnpm test`
Expected: ALL PASS

- [ ] **Step 3: Commit**

```bash
git add packages/cli/src/commands/chat.ts
git commit -m "feat: add lightweight auto-sync step after coherent chat"
```

---

### Task 9: Add `--component` Flag to Chat Command

**Files:**
- Modify: `packages/cli/src/commands/chat.ts`
- Modify: `packages/cli/src/index.ts` (add option to commander)

- [ ] **Step 1: Add `--component` option to commander**

In `packages/cli/src/index.ts`, find the `chat` command definition and add:

```typescript
.option('--component <name>', 'Create a shared component instead of a page')
.option('--type <type>', 'Component type: layout, navigation, data-display, form, feedback, section')
```

- [ ] **Step 2: Handle `--component` flag in `chatCommand`**

In `packages/cli/src/commands/chat.ts`, at the beginning of `chatCommand` (after message validation), add an early return path:

```typescript
if (options.component) {
  const componentName = options.component as string
  spinner.start(`Creating shared component: ${componentName}...`)

  const aiProvider = await createAIProvider(provider ?? 'auto')
  const { generateSharedComponent } = await import('@getcoherent/core')
  const { autoFixCode } = await import('./utils/quality-validator.js')
  const { extractPropsInterface, extractDependencies } = await import('./utils/component-extractor.js')

  const prompt = `Generate a React component called "${componentName}". Description: ${message}.
Use shadcn/ui components and Tailwind CSS semantic tokens. Export the component as a named export.
Include a TypeScript props interface.`

  const result = await aiProvider.generateCode(prompt)
  const { code: fixedCode } = await autoFixCode(result)

  const props = extractPropsInterface(fixedCode)
  const deps = extractDependencies(fixedCode)

  const componentType = (options.type as string) || 'section'

  const genResult = await generateSharedComponent(projectRoot, {
    name: componentName,
    type: componentType as any,
    code: fixedCode,
    description: message,
    propsInterface: props ?? undefined,
    dependencies: deps,
    source: 'manual',
  })

  // If no --type was provided, run AI classification
  if (!options.type) {
    try {
      const { classifyComponents } = await import('./utils/ai-classifier.js')
      const classifications = await classifyComponents(
        [{ name: componentName, signature: props || componentName }],
        (p) => aiProvider.generateCode(p),
      )
      if (classifications.length > 0) {
        const { updateEntry, loadManifest, saveManifest } = await import('@getcoherent/core')
        let manifest = await loadManifest(projectRoot)
        manifest = updateEntry(manifest, genResult.id, {
          type: classifications[0].type as any,
          description: classifications[0].description || message,
        })
        await saveManifest(projectRoot, manifest)
      }
    } catch {
      // classification is best-effort
    }
  }

  spinner.succeed(`Created ${genResult.name} (${genResult.id}) at ${genResult.file}`)
  return
}
```

- [ ] **Step 3: Run build to verify**

Run: `pnpm build`
Expected: BUILD SUCCESS

- [ ] **Step 4: Commit**

```bash
git add packages/cli/src/commands/chat.ts packages/cli/src/index.ts
git commit -m "feat: add --component flag for user-driven shared component creation"
```

---

### Task 10: Integrate Reuse Validation into Chat Pipeline

**Files:**
- Modify: `packages/cli/src/commands/chat.ts` (after applyModification loop)
- Modify: `packages/cli/src/commands/check.ts` (add reuse check)

- [ ] **Step 1: Add reuse validation after modifications are applied**

In `packages/cli/src/commands/chat.ts`, after the `applyModification` loop (around line 580) and after files are written to disk, add:

```typescript
// Reuse validation
try {
  const { validateReuse } = await import('./utils/reuse-validator.js')
  const { loadManifest } = await import('@getcoherent/core')
  const manifest = await loadManifest(projectRoot)

  if (manifest.shared.length > 0) {
    for (const req of normalizedRequests) {
      if (req.type !== 'add-page') continue
      const changes = req.changes as Record<string, unknown>
      const pageCode = changes.pageCode as string | undefined
      if (!pageCode) continue

      const route = (changes.route as string) || ''
      const pageType = plan ? getPageType(route, plan) : inferPageTypeFromRoute(route)
      const warnings = validateReuse(manifest, pageCode, pageType)

      for (const w of warnings) {
        console.log(chalk.yellow(`  ⚠ ${w.message}`))
      }
    }
  }
} catch {
  // best-effort
}
```

- [ ] **Step 2: Add reuse check to `coherent check`**

In `packages/cli/src/commands/check.ts`, add a section that loads manifest and runs `validateReuse` on each page file.

- [ ] **Step 3: Run full test suite**

Run: `pnpm test`
Expected: ALL PASS

- [ ] **Step 4: Commit**

```bash
git add packages/cli/src/commands/chat.ts packages/cli/src/commands/check.ts
git commit -m "feat: integrate reuse validation into coherent chat and coherent check"
```

---

### Task 11: Update Component Integrity for New Fields

**Files:**
- Modify: `packages/cli/src/utils/component-integrity.ts`

- [ ] **Step 1: Find `reconcileComponents` function**

In `packages/cli/src/utils/component-integrity.ts`, find where new components are added during reconciliation (the loop that creates entries for unregistered components, around the `m.shared.push(...)` call).

Update the entry creation to include the new fields with defaults:

```typescript
m.shared.push({
  id,
  name: comp.name,
  type: comp.type,
  file: comp.file,
  usedIn: comp.usedIn,
  description: `Auto-registered by sync from ${comp.file}`,
  createdAt: new Date().toISOString(),
  dependencies: [],
  source: 'extracted' as const,
})
```

- [ ] **Step 2: Ensure reconciliation preserves new fields**

Find where existing entries are updated during reconciliation (the `file`/`name`/`usedIn`/`type` update logic). Make sure it does NOT overwrite `usageExample`, `dependencies`, or `source` when they already exist. The current code uses partial updates — verify it only touches the fields it explicitly sets.

- [ ] **Step 3: Run existing integrity tests**

Run: `pnpm --filter @getcoherent/cli test -- --run component-integrity`
Expected: ALL PASS

- [ ] **Step 4: Commit**

```bash
git add packages/cli/src/utils/component-integrity.ts
git commit -m "fix: component-integrity preserves new manifest fields during reconciliation"
```

---

### Task 12: Enrich `.cursorrules` / `CLAUDE.md` with Component Metadata

**Files:**
- Modify: `packages/core/src/generators/ProjectScaffolder.ts` (or wherever `.cursorrules` template is generated)

- [ ] **Step 1: Find the template that generates shared components section**

Search for where `coherent.components.json` or shared component info is written into `.cursorrules` or `CLAUDE.md`. This is likely in `ProjectScaffolder.ts` or in `packages/cli/src/commands/rules.ts`.

- [ ] **Step 2: Update the template to include richer metadata**

Where the template lists shared components, change from:

```
- CID-001 Header (layout) — Main site header
```

to:

```
- CID-001 Header (layout) — Main site header
  Props: { logo?: string }
  Usage: <Header logo="/logo.svg" />
  Import: import { Header } from '@/components/shared/header'
```

This uses `propsInterface`, `usageExample`, and `file` from the manifest entries — same data the tiered prompt builder uses.

- [ ] **Step 3: Run build to verify**

Run: `pnpm build`
Expected: BUILD SUCCESS

- [ ] **Step 4: Commit**

```bash
git add packages/core/src/generators/ProjectScaffolder.ts \
       packages/cli/src/commands/rules.ts
git commit -m "feat: enrich .cursorrules and CLAUDE.md with shared component props and usage examples"
```

---

### Task 13: Full Build, Lint, Typecheck, Test

- [ ] **Step 1: Build all packages**

Run: `pnpm build`
Expected: BUILD SUCCESS

- [ ] **Step 2: Lint**

Run: `pnpm lint`
Expected: No errors

- [ ] **Step 3: Typecheck**

Run: `pnpm typecheck`
Expected: No errors

- [ ] **Step 4: Run all tests**

Run: `pnpm test`
Expected: ALL PASS

- [ ] **Step 5: Format check**

Run: `pnpm format:check`
Expected: No style issues (run `npx prettier --write` on any flagged files)

- [ ] **Step 6: Final commit if formatting was needed**

```bash
git add -A
git commit -m "chore: format files after pattern reuse pipeline implementation"
```
