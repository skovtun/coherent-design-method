# Shared Component Extraction Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add Phase 3.5 to `splitGeneratePages()` that extracts reusable content components from the anchor page via AI and registers them as shared components for all subsequent pages.

**Architecture:** New `extractSharedComponents?()` method on `AIProviderInterface` for each provider. New `extractSharedComponents()` function in `split-generator.ts` orchestrates validation, filtering, and creation. `propsInterface` field threaded through manifest → registry → generator. Summary rebuilt from manifest after extraction and passed to Phase 4.

**Tech Stack:** TypeScript, Zod, vitest, existing `@getcoherent/core` generators and `@getcoherent/cli` providers.

**Design doc:** `docs/plans/2026-03-20-shared-component-extraction-design.md`

---

### Task 1: Add `propsInterface` to manifest schema

**Files:**
- Modify: `packages/core/src/types/shared-components-manifest.ts:13-27`
- Test: `packages/core/src/types/shared-components-manifest.test.ts` (create)

**Step 1: Write the failing test**

```typescript
import { describe, it, expect } from 'vitest'
import { SharedComponentEntrySchema, SharedComponentsManifestSchema } from './shared-components-manifest.js'

describe('SharedComponentEntrySchema', () => {
  it('accepts entry with propsInterface', () => {
    const entry = {
      id: 'CID-001',
      name: 'FeatureCard',
      type: 'section',
      file: 'components/shared/feature-card.tsx',
      propsInterface: '{ icon: React.ReactNode; title: string }',
    }
    const result = SharedComponentEntrySchema.parse(entry)
    expect(result.propsInterface).toBe('{ icon: React.ReactNode; title: string }')
  })

  it('allows propsInterface to be omitted', () => {
    const entry = {
      id: 'CID-001',
      name: 'Header',
      type: 'layout',
      file: 'components/shared/header.tsx',
    }
    const result = SharedComponentEntrySchema.parse(entry)
    expect(result.propsInterface).toBeUndefined()
  })
})
```

**Step 2: Run test to verify it fails**

Run: `pnpm vitest run packages/core/src/types/shared-components-manifest.test.ts`
Expected: FAIL — `propsInterface` not in schema, Zod strips unknown keys

**Step 3: Write minimal implementation**

In `packages/core/src/types/shared-components-manifest.ts`, add `propsInterface` to `SharedComponentEntrySchema`:

```typescript
export const SharedComponentEntrySchema = z.object({
  id: z.string().regex(/^CID-\d{3,}$/, 'Must be CID-XXX with zero-padded number'),
  name: z.string(),
  type: SharedComponentTypeSchema,
  file: z.string(),
  usedIn: z.array(z.string()).default([]),
  createdAt: z.string().datetime().optional(),
  description: z.string().optional(),
  propsInterface: z.string().optional(),
})
```

**Step 4: Run test to verify it passes**

Run: `pnpm vitest run packages/core/src/types/shared-components-manifest.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/core/src/types/shared-components-manifest.ts packages/core/src/types/shared-components-manifest.test.ts
git commit -m "feat(core): add propsInterface to SharedComponentEntrySchema"
```

---

### Task 2: Thread `propsInterface` through registry and generator

**Files:**
- Modify: `packages/core/src/managers/SharedComponentsRegistry.ts:69-103`
- Modify: `packages/core/src/generators/SharedComponentGenerator.ts:81-141`
- Test: `packages/core/src/managers/SharedComponentsRegistry.test.ts` (may exist)
- Test: `packages/core/src/generators/SharedComponentGenerator.test.ts` (may exist)

**Step 1: Write the failing test for registry**

Add to the registry test file (create if needed):

```typescript
import { describe, it, expect } from 'vitest'
import { createEntry } from './SharedComponentsRegistry.js'
import type { SharedComponentsManifest } from '../types/shared-components-manifest.js'

describe('createEntry with propsInterface', () => {
  it('includes propsInterface in created entry', () => {
    const manifest: SharedComponentsManifest = { shared: [], nextId: 1 }
    const { entry } = createEntry(manifest, {
      name: 'FeatureCard',
      type: 'section',
      file: 'components/shared/feature-card.tsx',
      propsInterface: '{ title: string; description: string }',
    })
    expect(entry.propsInterface).toBe('{ title: string; description: string }')
  })

  it('omits propsInterface when not provided', () => {
    const manifest: SharedComponentsManifest = { shared: [], nextId: 1 }
    const { entry } = createEntry(manifest, {
      name: 'Header',
      type: 'layout',
      file: 'components/shared/header.tsx',
    })
    expect(entry.propsInterface).toBeUndefined()
  })
})
```

**Step 2: Run test to verify it fails**

Run: `pnpm vitest run packages/core/src/managers/SharedComponentsRegistry.test.ts`
Expected: FAIL — `propsInterface` not in `CreateSharedComponentInput` type, not set on entry

**Step 3: Write minimal implementation**

In `packages/core/src/managers/SharedComponentsRegistry.ts`:

Add `propsInterface` to `CreateSharedComponentInput`:
```typescript
export interface CreateSharedComponentInput {
  name: string
  type: SharedComponentType
  file: string
  usedIn?: string[]
  description?: string
  propsInterface?: string
}
```

Add to `createEntry()` entry construction:
```typescript
const entry: SharedComponentEntry = {
  id,
  name: input.name,
  type: input.type,
  file: input.file,
  usedIn: input.usedIn ?? [],
  description: input.description,
  propsInterface: input.propsInterface,
  createdAt: now,
}
```

In `packages/core/src/generators/SharedComponentGenerator.ts`:

Add `propsInterface` to `GenerateSharedComponentInput`:
```typescript
export interface GenerateSharedComponentInput {
  name: string
  type: SharedComponentType
  code?: string
  description?: string
  usedIn?: string[]
  overwrite?: boolean
  propsInterface?: string
}
```

Pass through in the `createEntry` call (~line 131):
```typescript
const { entry, nextManifest } = createEntry(manifest, {
  name: uniqueName,
  type: input.type,
  file: filePath,
  usedIn: input.usedIn ?? [],
  description: input.description,
  propsInterface: input.propsInterface,
})
```

**Step 4: Run tests to verify they pass**

Run: `pnpm vitest run packages/core/src/managers/SharedComponentsRegistry.test.ts packages/core/src/generators/SharedComponentGenerator.test.ts`
Expected: PASS

**Step 5: Run all tests**

Run: `pnpm test`
Expected: All green

**Step 6: Commit**

```bash
git add packages/core/src/managers/SharedComponentsRegistry.ts packages/core/src/generators/SharedComponentGenerator.ts packages/core/src/managers/SharedComponentsRegistry.test.ts
git commit -m "feat(core): thread propsInterface through registry and generator"
```

---

### Task 3: Add `extractSharedComponents?()` to `AIProviderInterface` and Zod types

**Files:**
- Modify: `packages/cli/src/utils/ai-provider.ts:29-46`
- Test: no test needed for interface-only change; Zod types tested in Task 5

**Step 1: Add the type and interface method**

In `packages/cli/src/utils/ai-provider.ts`, add the `SharedExtractionItem` type and the new method:

```typescript
export interface SharedExtractionItem {
  name: string
  type: 'section' | 'widget'
  description: string
  propsInterface: string
  code: string
}

export interface AIProviderInterface {
  // ... existing methods ...

  /** Extract reusable UI component patterns from a page's TSX code. */
  extractSharedComponents?(
    pageCode: string,
    reservedNames: string[],
    existingSharedNames: string[],
  ): Promise<{ components: SharedExtractionItem[] }>
}
```

**Step 2: Verify typecheck passes**

Run: `pnpm typecheck`
Expected: PASS — the method is optional (`?`), so existing providers don't break

**Step 3: Commit**

```bash
git add packages/cli/src/utils/ai-provider.ts
git commit -m "feat(cli): add extractSharedComponents to AIProviderInterface"
```

---

### Task 4: Implement `extractSharedComponents()` on OpenAI provider

**Files:**
- Modify: `packages/cli/src/utils/openai-provider.ts`
- Test: `packages/cli/src/utils/openai-provider.test.ts` (create or extend)

**Step 1: Write the failing test**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock the OpenAI module before importing the provider
vi.mock('openai', () => ({
  default: vi.fn().mockImplementation(() => ({
    chat: {
      completions: {
        create: vi.fn(),
      },
    },
  })),
}))

describe('OpenAIProvider.extractSharedComponents', () => {
  it('returns parsed components from AI response', async () => {
    const { OpenAIProvider } = await import('./openai-provider.js')
    const provider = new OpenAIProvider({ apiKey: 'test-key' })

    const mockResponse = {
      choices: [{
        message: {
          content: JSON.stringify({
            components: [{
              name: 'FeatureCard',
              type: 'section',
              description: 'Feature display card',
              propsInterface: '{ title: string }',
              code: '"use client"\nexport function FeatureCard({ title }: { title: string }) {\n  return <div>{title}</div>\n}',
            }],
          }),
        },
        finish_reason: 'stop',
      }],
    }

    // Access the mock to set response
    const openaiMock = (provider as any).client
    openaiMock.chat.completions.create.mockResolvedValueOnce(mockResponse)

    const result = await provider.extractSharedComponents!(
      '<div>page code</div>',
      ['Button', 'Card'],
      ['Header'],
    )

    expect(result.components).toHaveLength(1)
    expect(result.components[0].name).toBe('FeatureCard')
    expect(result.components[0].propsInterface).toBe('{ title: string }')
  })

  it('returns empty array when AI returns no components', async () => {
    const { OpenAIProvider } = await import('./openai-provider.js')
    const provider = new OpenAIProvider({ apiKey: 'test-key' })

    const mockResponse = {
      choices: [{
        message: { content: JSON.stringify({ components: [] }) },
        finish_reason: 'stop',
      }],
    }

    const openaiMock = (provider as any).client
    openaiMock.chat.completions.create.mockResolvedValueOnce(mockResponse)

    const result = await provider.extractSharedComponents!(
      '<div>page code</div>', [], [],
    )

    expect(result.components).toHaveLength(0)
  })
})
```

**Step 2: Run test to verify it fails**

Run: `pnpm vitest run packages/cli/src/utils/openai-provider.test.ts`
Expected: FAIL — `extractSharedComponents` method does not exist on provider

**Step 3: Write minimal implementation**

In `packages/cli/src/utils/openai-provider.ts`, add the method to the class. Follow the same pattern as `editSharedComponentCode` and `editPageCode`:

```typescript
async extractSharedComponents(
  pageCode: string,
  reservedNames: string[],
  existingSharedNames: string[],
): Promise<{ components: SharedExtractionItem[] }> {
  const systemPrompt = `You are a UI component extraction system. Analyze Next.js page code and identify repeating UI patterns useful as shared components across a multi-page site.
Return valid JSON: { "components": [...] }
CRITICAL: All string values in JSON must be on one line. Escape double quotes inside strings with \\". Do not include unescaped newlines or quotes in string values.`

  const userPrompt = `Analyze this page and extract reusable components.

PAGE CODE:
${pageCode}

Rules:
- Extract 1-5 components maximum
- Each component must be ≥10 lines of meaningful JSX
- Output complete, self-contained TypeScript modules with:
  - "use client" directive (if hooks or event handlers are used)
  - All necessary imports (shadcn/ui from @/components/ui/*, lucide-react, next/link, etc.)
  - A typed props interface exported as a named type
  - A named export function (not default export)
- Do NOT extract: the entire page, trivial wrappers, layout components (header, footer, nav)
- Do NOT use these names (reserved for shadcn/ui): ${reservedNames.join(', ')}
- Do NOT use these names (already shared): ${existingSharedNames.join(', ')}
- Look for: cards with icon+title+description, pricing tiers, testimonial blocks, stat displays, CTA sections

Each component object: "name" (PascalCase), "type" ("section"|"widget"), "description", "propsInterface", "code" (full TSX module as string)

If no repeating patterns found: { "components": [] }`

  const response = await this.client.chat.completions.create({
    model: this.defaultModel,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    response_format: { type: 'json_object' },
    temperature: 0.3,
    max_tokens: 16384,
  })

  const content = response.choices[0]?.message?.content
  if (!content) return { components: [] }

  try {
    const parsed = JSON.parse(content)
    return { components: Array.isArray(parsed.components) ? parsed.components : [] }
  } catch {
    return { components: [] }
  }
}
```

Import `SharedExtractionItem` from `ai-provider.ts` at the top of the file.

**Step 4: Run test to verify it passes**

Run: `pnpm vitest run packages/cli/src/utils/openai-provider.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/cli/src/utils/openai-provider.ts packages/cli/src/utils/openai-provider.test.ts
git commit -m "feat(cli): implement extractSharedComponents on OpenAI provider"
```

---

### Task 5: Implement `extractSharedComponents()` on Claude provider

**Files:**
- Modify: `packages/cli/src/utils/claude-provider.ts`
- Test: `packages/cli/src/utils/claude-provider.test.ts` (create or extend)

Follow the same pattern as Task 4 but for Claude's API. Claude doesn't use `response_format` — instead, include "Return valid JSON only" in the system prompt. Parse `content[0].text` from the response. Strip markdown fencing if present.

**Step 1: Write failing test** (same shape as Task 4)

**Step 2: Run test — FAIL**

**Step 3: Implement** — same prompt, Claude API call pattern, JSON parse with markdown stripping

**Step 4: Run test — PASS**

**Step 5: Commit**

```bash
git add packages/cli/src/utils/claude-provider.ts packages/cli/src/utils/claude-provider.test.ts
git commit -m "feat(cli): implement extractSharedComponents on Claude provider"
```

---

### Task 6: Extract `buildSharedComponentsSummary()` helper

**Files:**
- Modify: `packages/cli/src/commands/chat.ts:210-219`
- Modify: `packages/cli/src/commands/chat/split-generator.ts`
- Test: `packages/cli/src/commands/chat/split-generator.test.ts` (extend)

**Step 1: Write the failing test**

In `packages/cli/src/commands/chat/split-generator.test.ts` (or create a new focused test file):

```typescript
import { describe, it, expect } from 'vitest'
import { buildSharedComponentsSummary } from './split-generator.js'
import type { SharedComponentsManifest } from '@getcoherent/core'

describe('buildSharedComponentsSummary', () => {
  it('returns undefined for empty manifest', () => {
    const manifest: SharedComponentsManifest = { shared: [], nextId: 1 }
    expect(buildSharedComponentsSummary(manifest)).toBeUndefined()
  })

  it('formats entry without propsInterface', () => {
    const manifest: SharedComponentsManifest = {
      shared: [{
        id: 'CID-001', name: 'Header', type: 'layout',
        file: 'components/shared/header.tsx', usedIn: [],
        description: 'Main header',
      }],
      nextId: 2,
    }
    const result = buildSharedComponentsSummary(manifest)!
    expect(result).toContain('CID-001 Header (layout)')
    expect(result).toContain('Import: @/components/shared/header')
    expect(result).not.toContain('Props:')
  })

  it('includes propsInterface when present', () => {
    const manifest: SharedComponentsManifest = {
      shared: [{
        id: 'CID-003', name: 'FeatureCard', type: 'section',
        file: 'components/shared/feature-card.tsx', usedIn: [],
        description: 'Feature card',
        propsInterface: '{ icon: React.ReactNode; title: string }',
      }],
      nextId: 4,
    }
    const result = buildSharedComponentsSummary(manifest)!
    expect(result).toContain('CID-003 FeatureCard (section)')
    expect(result).toContain('Props: { icon: React.ReactNode; title: string }')
  })
})
```

**Step 2: Run test to verify it fails**

Run: `pnpm vitest run packages/cli/src/commands/chat/split-generator.test.ts`
Expected: FAIL — `buildSharedComponentsSummary` not exported

**Step 3: Write minimal implementation**

In `packages/cli/src/commands/chat/split-generator.ts`, add and export:

```typescript
export function buildSharedComponentsSummary(
  manifest: SharedComponentsManifest,
): string | undefined {
  if (manifest.shared.length === 0) return undefined
  return manifest.shared
    .map(e => {
      const importPath = e.file.replace(/^components\/shared\//, '').replace(/\.tsx$/, '')
      const desc = e.description ? ` — ${e.description}` : ''
      const propsLine = e.propsInterface ? `\n    Props: ${e.propsInterface}` : ''
      return `  ${e.id} ${e.name} (${e.type})${desc}\n    Import: @/components/shared/${importPath}${propsLine}`
    })
    .join('\n')
}
```

Import `SharedComponentsManifest` type from `@getcoherent/core`.

Then update `packages/cli/src/commands/chat.ts` to use this helper instead of inline logic. Replace lines 210-219 with:

```typescript
import { buildSharedComponentsSummary } from './chat/split-generator.js'
// ...
const sharedComponentsSummary = buildSharedComponentsSummary(manifest)
```

**Step 4: Run tests**

Run: `pnpm test`
Expected: All green (existing behavior preserved, new tests pass)

**Step 5: Commit**

```bash
git add packages/cli/src/commands/chat/split-generator.ts packages/cli/src/commands/chat.ts packages/cli/src/commands/chat/split-generator.test.ts
git commit -m "refactor(cli): extract buildSharedComponentsSummary helper"
```

---

### Task 7: Implement `extractSharedComponents()` function with Zod validation and filtering

**Files:**
- Modify: `packages/cli/src/commands/chat/split-generator.ts`
- Test: `packages/cli/src/commands/chat/split-generator.test.ts` (extend)

This is the core function. It calls the AI, validates with Zod, filters, processes each component, and returns results.

**Step 1: Write the failing tests**

```typescript
import { describe, it, expect, vi } from 'vitest'
import { extractSharedComponents } from './split-generator.js'

// Mock modules
vi.mock('../../utils/ai-provider.js', () => ({
  createAIProvider: vi.fn(),
}))
vi.mock('../../providers/index.js', () => ({
  getComponentProvider: vi.fn(() => ({
    listNames: () => ['Button', 'Card', 'Input'],
    installComponent: vi.fn(async () => ({ success: true, componentDef: null })),
  })),
}))
vi.mock('@getcoherent/core', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    loadManifest: vi.fn(async () => ({ shared: [], nextId: 1 })),
    generateSharedComponent: vi.fn(async (_root, input) => ({
      id: 'CID-001', name: input.name, file: `components/shared/${input.name.toLowerCase()}.tsx`,
    })),
  }
})
vi.mock('../../utils/quality-validator.js', () => ({
  autoFixCode: vi.fn((code) => code),
}))

describe('extractSharedComponents', () => {
  it('returns extracted components from valid AI response', async () => {
    const { createAIProvider } = await import('../../utils/ai-provider.js')
    const mockAI = {
      extractSharedComponents: vi.fn(async () => ({
        components: [{
          name: 'FeatureCard',
          type: 'section',
          description: 'A feature card',
          propsInterface: '{ title: string }',
          code: Array(15).fill('// line').join('\n'),
        }],
      })),
    }
    vi.mocked(createAIProvider).mockResolvedValue(mockAI as any)

    const result = await extractSharedComponents('page code here', '/tmp/project', 'auto')
    expect(result.components).toHaveLength(1)
    expect(result.components[0].name).toBe('FeatureCard')
  })

  it('returns empty when AI provider does not support extraction', async () => {
    const { createAIProvider } = await import('../../utils/ai-provider.js')
    vi.mocked(createAIProvider).mockResolvedValue({} as any)

    const result = await extractSharedComponents('page code', '/tmp/project', 'auto')
    expect(result.components).toHaveLength(0)
  })

  it('filters out components with shadcn name collision', async () => {
    const { createAIProvider } = await import('../../utils/ai-provider.js')
    const mockAI = {
      extractSharedComponents: vi.fn(async () => ({
        components: [{
          name: 'Card',  // collides with shadcn
          type: 'section',
          description: 'A card',
          propsInterface: '{}',
          code: Array(15).fill('// line').join('\n'),
        }],
      })),
    }
    vi.mocked(createAIProvider).mockResolvedValue(mockAI as any)

    const result = await extractSharedComponents('page code', '/tmp/project', 'auto')
    expect(result.components).toHaveLength(0)
  })

  it('filters out components with fewer than 10 lines', async () => {
    const { createAIProvider } = await import('../../utils/ai-provider.js')
    const mockAI = {
      extractSharedComponents: vi.fn(async () => ({
        components: [{
          name: 'Tiny',
          type: 'widget',
          description: 'Too small',
          propsInterface: '{}',
          code: '// only 3 lines\n// two\n// three',
        }],
      })),
    }
    vi.mocked(createAIProvider).mockResolvedValue(mockAI as any)

    const result = await extractSharedComponents('page code', '/tmp/project', 'auto')
    expect(result.components).toHaveLength(0)
  })

  it('handles AI failure gracefully', async () => {
    const { createAIProvider } = await import('../../utils/ai-provider.js')
    const mockAI = {
      extractSharedComponents: vi.fn(async () => { throw new Error('API error') }),
    }
    vi.mocked(createAIProvider).mockResolvedValue(mockAI as any)

    const result = await extractSharedComponents('page code', '/tmp/project', 'auto')
    expect(result.components).toHaveLength(0)
  })

  it('keeps first when duplicate names in AI response', async () => {
    const { createAIProvider } = await import('../../utils/ai-provider.js')
    const makeComponent = (name: string) => ({
      name, type: 'section' as const, description: 'desc',
      propsInterface: '{}', code: Array(15).fill('// line').join('\n'),
    })
    const mockAI = {
      extractSharedComponents: vi.fn(async () => ({
        components: [makeComponent('FeatureCard'), makeComponent('FeatureCard')],
      })),
    }
    vi.mocked(createAIProvider).mockResolvedValue(mockAI as any)

    const result = await extractSharedComponents('page code', '/tmp/project', 'auto')
    expect(result.components).toHaveLength(1)
  })
})
```

**Step 2: Run test to verify it fails**

Run: `pnpm vitest run packages/cli/src/commands/chat/split-generator.test.ts`
Expected: FAIL — `extractSharedComponents` not exported

**Step 3: Write minimal implementation**

In `packages/cli/src/commands/chat/split-generator.ts`:

```typescript
import { z } from 'zod'
import { loadManifest, generateSharedComponent } from '@getcoherent/core'
import type { GenerateSharedComponentResult } from '@getcoherent/core'
import { createAIProvider, type AIProvider } from '../../utils/ai-provider.js'
import { getComponentProvider } from '../../providers/index.js'
import { autoFixCode } from '../../utils/quality-validator.js'

const SharedExtractionItemSchema = z.object({
  name: z.string().min(2).max(50),
  type: z.enum(['section', 'widget']),
  description: z.string().max(200).default(''),
  propsInterface: z.string().default('{}'),
  code: z.string(),
})

const SharedExtractionResponseSchema = z.object({
  components: z.array(SharedExtractionItemSchema).max(5).default([]),
})

export type SharedExtractionItem = z.infer<typeof SharedExtractionItemSchema>

export async function extractSharedComponents(
  homePageCode: string,
  projectRoot: string,
  aiProvider: AIProvider,
): Promise<{ components: GenerateSharedComponentResult[]; summary: string | undefined }> {
  const manifest = await loadManifest(projectRoot)
  let ai
  try {
    ai = await createAIProvider(aiProvider)
  } catch {
    return { components: [], summary: buildSharedComponentsSummary(manifest) }
  }

  if (!ai.extractSharedComponents) {
    return { components: [], summary: buildSharedComponentsSummary(manifest) }
  }

  let rawItems: SharedExtractionItem[]
  try {
    const reservedNames = getComponentProvider().listNames()
    const existingNames = manifest.shared.map(e => e.name)
    const result = await ai.extractSharedComponents(homePageCode, reservedNames, existingNames)
    const parsed = SharedExtractionResponseSchema.safeParse(result)
    rawItems = parsed.success ? parsed.data.components : []
  } catch {
    return { components: [], summary: buildSharedComponentsSummary(manifest) }
  }

  // Post-Zod filtering
  const reservedSet = new Set(getComponentProvider().listNames().map(n => n.toLowerCase()))
  const existingSet = new Set(manifest.shared.map(e => e.name.toLowerCase()))
  const seenNames = new Set<string>()
  const filtered = rawItems.filter(item => {
    if (item.code.split('\n').length < 10) return false
    if (reservedSet.has(item.name.toLowerCase())) return false
    if (existingSet.has(item.name.toLowerCase())) return false
    if (seenNames.has(item.name.toLowerCase())) return false
    seenNames.add(item.name.toLowerCase())
    return true
  })

  const results: GenerateSharedComponentResult[] = []
  const provider = getComponentProvider()

  for (const item of filtered) {
    try {
      const fixedCode = autoFixCode(item.code)

      // Install shadcn dependencies
      const shadcnImports = [...fixedCode.matchAll(/from\s+["']@\/components\/ui\/(.+?)["']/g)]
      for (const match of shadcnImports) {
        await provider.installComponent(match[1], projectRoot)
      }

      const result = await generateSharedComponent(projectRoot, {
        name: item.name,
        type: item.type,
        code: fixedCode,
        description: item.description,
        propsInterface: item.propsInterface,
        usedIn: [],
      })
      results.push(result)
    } catch {
      // Skip failed component, continue with others
    }
  }

  const updatedManifest = await loadManifest(projectRoot)
  return { components: results, summary: buildSharedComponentsSummary(updatedManifest) }
}
```

**Step 4: Run tests**

Run: `pnpm vitest run packages/cli/src/commands/chat/split-generator.test.ts`
Expected: PASS

**Step 5: Run all tests**

Run: `pnpm test`
Expected: All green

**Step 6: Commit**

```bash
git add packages/cli/src/commands/chat/split-generator.ts packages/cli/src/commands/chat/split-generator.test.ts
git commit -m "feat(cli): implement extractSharedComponents with Zod validation and filtering"
```

---

### Task 8: Integrate Phase 3.5 into `splitGeneratePages()`

**Files:**
- Modify: `packages/cli/src/commands/chat/split-generator.ts:107-318` (the `splitGeneratePages` function)
- Test: `packages/cli/src/commands/chat/split-generator.test.ts` (extend)

**Step 1: Write the failing test**

Test that `splitGeneratePages` calls `extractSharedComponents` when conditions are met and updates `parseOpts`:

```typescript
describe('splitGeneratePages Phase 3.5 integration', () => {
  it('skips Phase 3.5 when fewer than 3 total pages', async () => {
    // Setup with 2 pages (anchor + 1 remaining)
    // Verify extractSharedComponents is NOT called
  })

  it('calls extractSharedComponents and updates parseOpts for Phase 4', async () => {
    // Setup with 5+ pages
    // Mock AI to return components
    // Verify parseOpts.sharedComponentsSummary is updated before Phase 4 calls
  })
})
```

**Step 2: Run test — FAIL**

**Step 3: Implement**

In `splitGeneratePages()`, after Phase 3 (style extraction, ~line 234) and before Phase 4 (parallel generation, ~line 240):

```typescript
// Phase 3.5: Extract shared components
if (remainingPages.length >= 2 && homePageCode) {
  const shouldSkip = reusedExistingAnchor &&
    (await loadManifest(projectRoot!)).shared.some(e => e.type !== 'layout')
  if (!shouldSkip && projectRoot) {
    spinner.start('Phase 3.5/5 — Extracting shared components...')
    try {
      const extraction = await extractSharedComponents(homePageCode, projectRoot, provider)
      parseOpts.sharedComponentsSummary = extraction.summary
      if (extraction.components.length > 0) {
        const names = extraction.components.map(c => c.name).join(', ')
        spinner.succeed(`Phase 3.5/5 — Extracted ${extraction.components.length} shared components (${names})`)
      } else {
        spinner.succeed('Phase 3.5/5 — No shared components extracted')
      }
    } catch {
      spinner.warn('Phase 3.5/5 — Could not extract shared components (continuing without)')
    }
  }
}
```

Update all spinner messages to use `/5` instead of `/4`:
- Phase 1/4 → Phase 1/5
- Phase 2/4 → Phase 2/5
- Phase 3/4 → Phase 3/5
- Phase 4/4 → Phase 4/5

**Step 4: Run tests**

Run: `pnpm test`
Expected: All green (update any existing tests that check spinner messages)

**Step 5: Commit**

```bash
git add packages/cli/src/commands/chat/split-generator.ts packages/cli/src/commands/chat/split-generator.test.ts
git commit -m "feat(cli): integrate Phase 3.5 shared component extraction into splitGeneratePages"
```

---

### Task 9: Verification and cleanup

**Step 1: Run full test suite**

```bash
pnpm test
```

Expected: All green

**Step 2: Run lint**

```bash
pnpm lint
```

Expected: No errors

**Step 3: Run typecheck**

```bash
pnpm typecheck
```

Expected: No errors

**Step 4: Build**

```bash
pnpm build
```

Expected: Build succeeds

**Step 5: Commit if any cleanup was needed**

```bash
git commit -m "chore: cleanup after shared component extraction feature"
```
