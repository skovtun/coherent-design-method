# Multi-Harness AI Context Generation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace two independent AI context builders (`cursor-rules.ts` + `claude-code.ts`) with a unified pipeline that generates `.cursorrules`, `CLAUDE.md`, and `AGENTS.md` from a single `ProjectContext`.

**Architecture:** One data layer (`buildProjectContext`) produces a structured context object. Three thin formatters (`formatForCursor`, `formatForClaude`, `formatForAgents`) transform it into harness-specific strings. One entry point (`writeAllHarnessFiles`) writes all files and `.claude/*` static assets.

**Tech Stack:** TypeScript, vitest, Node.js fs

**Spec:** `docs/superpowers/specs/2026-03-22-multi-harness-ai-context-design.md`

---

### Task 1: Snapshot Baselines — Capture Current Output

Before changing anything, capture the exact output of the current builders as regression fixtures. This protects against accidental changes during refactoring.

**Files:**
- Create: `packages/cli/src/utils/harness-context.test.ts`
- Read: `packages/cli/src/utils/cursor-rules.ts:15-82` (helper functions)
- Read: `packages/cli/src/utils/cursor-rules.ts:84-376` (`buildCursorRules` template)
- Read: `packages/cli/src/utils/claude-code.ts:13-126` (`buildClaudeMdContent` + helpers)

- [ ] **Step 1: Write snapshot test file with fixture data**

Create `packages/cli/src/utils/harness-context.test.ts` with a shared test fixture (manifest + config) and two snapshot tests that import the current builders:

```typescript
import { describe, it, expect } from 'vitest'
import { buildCursorRules } from './cursor-rules.js'
import type { SharedComponentsManifest, DesignSystemConfig } from '@getcoherent/core'

const TEST_MANIFEST: SharedComponentsManifest = {
  shared: [
    {
      id: 'CID-001',
      name: 'Header',
      type: 'layout',
      file: 'components/shared/header.tsx',
      description: 'Site header with navigation',
      propsInterface: '{ logoUrl?: string }',
      usageExample: '<Header logoUrl="/logo.svg" />',
      usedIn: ['app/layout.tsx'],
    },
    {
      id: 'CID-002',
      name: 'ActivityFeed',
      type: 'data-display',
      file: 'components/shared/activity-feed.tsx',
      description: 'Recent activity timeline',
      usedIn: ['app/(app)/dashboard/page.tsx', 'app/(app)/activity/page.tsx'],
    },
  ],
  nextId: 3,
}

const TEST_CONFIG: DesignSystemConfig = {
  tokens: {
    colors: {
      light: {
        primary: 'oklch(0.637 0.237 25.331)',
        background: 'oklch(1 0 0)',
        foreground: 'oklch(0.145 0 0)',
        muted: 'oklch(0.97 0 0)',
        border: 'oklch(0.922 0 0)',
      },
      dark: {},
    },
    spacing: {},
    radius: { md: '0.5rem' },
  },
  pages: [],
  name: 'Test Project',
}

// Also import buildClaudeMdContent (it's not exported — need to temporarily export or use
// the internal function). Since buildClaudeMdContent is not currently exported, either:
// (a) temporarily export it, or (b) inline-construct the expected output.
// Option (a) is simpler — add `export` to buildClaudeMdContent temporarily.

describe('snapshot baselines', () => {
  it('buildCursorRules matches current output', () => {
    const result = buildCursorRules(TEST_MANIFEST, TEST_CONFIG)
    expect(result).toMatchSnapshot()
  })

  // Note: buildClaudeMdContent is private. To snapshot it, temporarily
  // export it from claude-code.ts, capture the snapshot, then in Task 6
  // when we delete the function, switch this test to use formatForClaude.
})
```

- [ ] **Step 2: Run test to generate snapshot**

Run: `pnpm vitest run packages/cli/src/utils/harness-context.test.ts --update`
Expected: PASS, snapshot file created at `packages/cli/src/utils/__snapshots__/harness-context.test.ts.snap`

- [ ] **Step 3: Verify snapshot is non-empty**

Run: `wc -l packages/cli/src/utils/__snapshots__/harness-context.test.ts.snap`
Expected: 300+ lines (the full `.cursorrules` template)

- [ ] **Step 4: Commit**

```bash
git add packages/cli/src/utils/harness-context.test.ts packages/cli/src/utils/__snapshots__/
git commit -m "test: add snapshot baselines for cursor-rules output"
```

---

### Task 2: Create harness-context.ts — Data Layer

Build the new central module with `ProjectContext` interface, helper functions (moved from existing files), and `buildProjectContext()`.

**Files:**
- Create: `packages/cli/src/utils/harness-context.ts`
- Modify: `packages/cli/src/utils/harness-context.test.ts`
- Read: `packages/cli/src/utils/cursor-rules.ts:15-82` (source for `buildSharedComponentsList`, `buildDesignTokensSummary`)
- Read: `packages/cli/src/utils/claude-code.ts:13-40` (source for `buildSharedComponentsListForClaude`)

- [ ] **Step 1: Write failing tests for buildProjectContext**

Add to `harness-context.test.ts`:

```typescript
import {
  buildProjectContext,
  type ProjectContext,
} from './harness-context.js'

describe('buildProjectContext', () => {
  it('produces all required fields', () => {
    const ctx = buildProjectContext(TEST_MANIFEST, TEST_CONFIG)
    expect(ctx.sharedComponents).toContain('CID-001 Header')
    expect(ctx.sharedComponents).toContain('Import: import { Header }')
    expect(ctx.sharedComponentsCompact).toContain('CID-001 Header (layout)')
    expect(ctx.sharedComponentsCompact).not.toContain('Import:')
    expect(ctx.designTokens).toContain('Primary')
    expect(ctx.architectureDetailed).toContain('### Key directories')
    expect(ctx.architectureDetailed).toContain('### Config files')
    expect(ctx.architectureCompact).toContain('app/ —')
    expect(ctx.architectureCompact).not.toContain('### Key directories')
    expect(ctx.rulesDetailed).toContain('## Component Rules (MANDATORY)')
    expect(ctx.rulesDetailed).toContain('### Animation')
    expect(ctx.rulesCompact).toContain('ONLY use @/components/ui/*')
    expect(ctx.rulesCompact).not.toContain('## Component Rules (MANDATORY)')
    expect(ctx.designQuality).toContain('Design Quality Standards')
    expect(ctx.forms).toContain('Form Layout Rules')
    expect(ctx.accessibility).toContain('WCAG 2.2 AA')
    expect(ctx.auth).toContain('Auth Pages')
    expect(ctx.commands).toContain('coherent check')
    expect(ctx.platform).toContain('DO NOT TOUCH')
  })

  it('handles empty manifest', () => {
    const ctx = buildProjectContext({ shared: [], nextId: 1 }, null)
    expect(ctx.sharedComponents).toContain('No shared components')
    expect(ctx.sharedComponentsCompact).toContain('No shared components')
    expect(ctx.designTokens).toContain('semantic')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run packages/cli/src/utils/harness-context.test.ts`
Expected: FAIL — `buildProjectContext` does not exist yet

- [ ] **Step 3: Create harness-context.ts with interfaces and buildProjectContext**

Create `packages/cli/src/utils/harness-context.ts`. Move `buildSharedComponentsList()` from `cursor-rules.ts` (lines 15-51), `buildSharedComponentsListForClaude()` from `claude-code.ts` (lines 13-40, rename to `buildSharedComponentsListCompact`), and `buildDesignTokensSummary()` from `cursor-rules.ts` (lines 53-82). Keep the implementations identical — just move them.

Then add the `ProjectContext` and `HarnessResult` interfaces per the spec.

Implement `buildProjectContext(manifest, config)` that:
1. Calls `buildSharedComponentsList(manifest)` → `sharedComponents`
2. Calls `buildSharedComponentsListCompact(manifest)` → `sharedComponentsCompact`
3. Calls `buildDesignTokensSummary(config)` → `designTokens`
4. Returns static string constants for all other fields

For `architectureDetailed`, extract the text from `cursor-rules.ts` lines 92-106 (everything between `## Project Architecture` and `## Shared Components`).

For `architectureCompact`, extract the text from `claude-code.ts` lines 48-55 (the flat bullet list).

For `rulesDetailed`, extract the text from `cursor-rules.ts` lines 120-316 (from `## Component Rules (MANDATORY)` through `### Animation` including the last line).

For `rulesCompact`, extract the text from `claude-code.ts` lines 64-111 (the `## Rules` bullet list content, without the `## Rules` header).

For `designQuality`, extract `cursor-rules.ts` lines 318-329.
For `forms`, extract lines 337-345.
For `accessibility`, extract lines 346-354.
For `auth`, extract lines 355-359.
For `commands`, extract lines 360-364.
For `platform`, extract lines 366-375.

All these are static string constants — no dynamic content, just copy the text as-is.

```typescript
import { writeFileSync, existsSync } from 'fs'
import { join } from 'path'
import type { DesignSystemConfig, SharedComponentsManifest } from '@getcoherent/core'
import { loadManifest, DesignSystemManager } from '@getcoherent/core'
import { findConfig } from './find-config.js'
import { writeClaudeCommands, writeClaudeSkills, writeClaudeSettings } from './claude-code.js'

export interface HarnessResult {
  written: boolean
  sharedCount?: number
  tokenKeys?: number
}

export interface ProjectContext {
  sharedComponents: string
  sharedComponentsCompact: string
  designTokens: string
  architectureDetailed: string
  architectureCompact: string
  rulesDetailed: string
  rulesCompact: string
  designQuality: string
  forms: string
  accessibility: string
  auth: string
  commands: string
  platform: string
}

// ... move buildSharedComponentsList, buildSharedComponentsListCompact, buildDesignTokensSummary here ...

export function buildProjectContext(
  manifest: SharedComponentsManifest,
  config: DesignSystemConfig | null,
): ProjectContext {
  return {
    sharedComponents: buildSharedComponentsList(manifest),
    sharedComponentsCompact: buildSharedComponentsListCompact(manifest),
    designTokens: buildDesignTokensSummary(config),
    architectureDetailed: ARCHITECTURE_DETAILED,
    architectureCompact: ARCHITECTURE_COMPACT,
    rulesDetailed: RULES_DETAILED,
    rulesCompact: RULES_COMPACT,
    designQuality: DESIGN_QUALITY,
    forms: FORMS,
    accessibility: ACCESSIBILITY,
    auth: AUTH,
    commands: COMMANDS_SECTION,
    platform: PLATFORM,
  }
}
```

Where `ARCHITECTURE_DETAILED`, `ARCHITECTURE_COMPACT`, `RULES_DETAILED`, `RULES_COMPACT`, `DESIGN_QUALITY`, `FORMS`, `ACCESSIBILITY`, `AUTH`, `COMMANDS_SECTION`, `PLATFORM` are `const` strings extracted verbatim from the existing template strings.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run packages/cli/src/utils/harness-context.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/utils/harness-context.ts packages/cli/src/utils/harness-context.test.ts
git commit -m "feat: add ProjectContext data layer with buildProjectContext"
```

---

### Task 3: Add Formatters

Implement `formatForCursor`, `formatForClaude`, and `formatForAgents`. The Cursor formatter must produce output identical to current `buildCursorRules()`. The Claude formatter must match current `buildClaudeMdContent()` except for added design tokens.

**Files:**
- Modify: `packages/cli/src/utils/harness-context.ts`
- Modify: `packages/cli/src/utils/harness-context.test.ts`

- [ ] **Step 1: Write failing tests for formatters**

Add to `harness-context.test.ts`:

```typescript
import {
  buildProjectContext,
  formatForCursor,
  formatForClaude,
  formatForAgents,
} from './harness-context.js'
import { buildCursorRules } from './cursor-rules.js'

describe('formatForCursor', () => {
  it('matches current buildCursorRules output exactly', () => {
    const ctx = buildProjectContext(TEST_MANIFEST, TEST_CONFIG)
    const newOutput = formatForCursor(ctx)
    const currentOutput = buildCursorRules(TEST_MANIFEST, TEST_CONFIG)
    expect(newOutput).toBe(currentOutput)
  })

  it('includes header and auto-generated warning', () => {
    const ctx = buildProjectContext(TEST_MANIFEST, TEST_CONFIG)
    const output = formatForCursor(ctx)
    expect(output).toContain('# Coherent Design Method — Project Rules')
    expect(output).toContain('Do NOT edit manually')
  })
})

describe('formatForClaude', () => {
  it('includes compact components, compact rules, and design tokens', () => {
    const ctx = buildProjectContext(TEST_MANIFEST, TEST_CONFIG)
    const output = formatForClaude(ctx)
    expect(output).toContain('# Coherent Design Method Project')
    expect(output).toContain('CID-001 Header (layout)')
    expect(output).not.toContain('Import: import { Header }')
    expect(output).toContain('Primary')
    expect(output).toContain('ONLY use @/components/ui/*')
    expect(output).not.toContain('## Component Rules (MANDATORY)')
  })

  it('stays under 150 lines with test fixture', () => {
    const ctx = buildProjectContext(TEST_MANIFEST, TEST_CONFIG)
    const output = formatForClaude(ctx)
    const lineCount = output.split('\n').length
    expect(lineCount).toBeLessThan(150)
  })
})

describe('formatForAgents', () => {
  it('includes detailed rules, full components, neutral header', () => {
    const ctx = buildProjectContext(TEST_MANIFEST, TEST_CONFIG)
    const output = formatForAgents(ctx)
    expect(output).toContain('# Project Conventions')
    expect(output).toContain('Auto-generated by Coherent')
    expect(output).toContain('Import: import { Header }')
    expect(output).toContain('## Component Rules (MANDATORY)')
    expect(output).toContain('Primary')
  })

  it('does not reference Cursor or Claude Code', () => {
    const ctx = buildProjectContext(TEST_MANIFEST, TEST_CONFIG)
    const output = formatForAgents(ctx)
    expect(output.toLowerCase()).not.toContain('cursor')
    expect(output.toLowerCase()).not.toContain('claude')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run packages/cli/src/utils/harness-context.test.ts`
Expected: FAIL — formatters not exported yet

- [ ] **Step 3: Implement formatters in harness-context.ts**

Add `formatForCursor(ctx)`, `formatForClaude(ctx)`, `formatForAgents(ctx)` to `harness-context.ts`.

`formatForCursor` must assemble the string in exactly the same order and format as current `buildCursorRules()`:
```
header + auto-generated warning
architectureDetailed
sharedComponents (with surrounding text)
rulesDetailed
designQuality
designTokens (with surrounding text)
forms
accessibility
auth
commands
platform
```

`formatForClaude` must match the current `buildClaudeMdContent()` structure plus the new design tokens section. The current CLAUDE.md does NOT have separate sections for `designQuality`, `forms`, `accessibility`, or `auth` — those concepts are folded into the compact rules bullet list. The formatter should reproduce the existing CLAUDE.md layout:
```
header + intro line
architectureCompact
sharedComponentsCompact (with "Before creating" note)
rulesCompact (contains accessibility, forms, auth rules inline as single-line bullets)
designTokens (NEW — fixes the bug where tokens were missing)
commands
platform (compact "Do NOT modify" version)
```
Do NOT add separate `## Design Quality Standards`, `## Form Layout Rules`, `## Accessibility`, or `## Auth Pages` sections to CLAUDE.md — that would exceed 150 lines. These are only separate sections in Cursor/AGENTS.md formatters.

`formatForAgents` uses same structure as Cursor but with neutral header and no tool-specific references:
```
header + auto-generated warning
architectureDetailed
sharedComponents
rulesDetailed
designQuality
designTokens
forms
accessibility
auth
commands (with neutral wording)
platform
```

The critical test is `formatForCursor(ctx) === buildCursorRules(manifest, config)`. Match it character-for-character by preserving exact whitespace, newlines, and section ordering from the current template.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run packages/cli/src/utils/harness-context.test.ts`
Expected: PASS — especially the exact-match test against `buildCursorRules`

- [ ] **Step 5: Verify snapshot still matches**

Run: `pnpm vitest run packages/cli/src/utils/harness-context.test.ts`
Expected: PASS — snapshot test should still match since we haven't changed `buildCursorRules`

- [ ] **Step 6: Commit**

```bash
git add packages/cli/src/utils/harness-context.ts packages/cli/src/utils/harness-context.test.ts
git commit -m "feat: add formatForCursor, formatForClaude, formatForAgents formatters"
```

---

### Task 4: Add writeAllHarnessFiles and regenerateAllHarnessFiles

Implement the entry points that replace `writeCursorRules()` and `regenerateCursorRules()`.

**Files:**
- Modify: `packages/cli/src/utils/harness-context.ts`
- Modify: `packages/cli/src/utils/harness-context.test.ts`

- [ ] **Step 1: Write failing tests**

Add to `harness-context.test.ts`:

```typescript
import { writeAllHarnessFiles, regenerateAllHarnessFiles } from './harness-context.js'
import { existsSync, readFileSync, mkdirSync, writeFileSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

describe('writeAllHarnessFiles', () => {
  const tempDir = join(tmpdir(), 'coherent-harness-test-' + Date.now())

  beforeEach(() => {
    mkdirSync(tempDir, { recursive: true })
    // Create minimal coherent.components.json
    writeFileSync(join(tempDir, 'coherent.components.json'), JSON.stringify({ shared: [], nextId: 1 }))
  })

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true })
  })

  it('writes .cursorrules, CLAUDE.md, AGENTS.md', async () => {
    const result = await writeAllHarnessFiles(tempDir)
    expect(result.written).toBe(true)
    expect(existsSync(join(tempDir, '.cursorrules'))).toBe(true)
    expect(existsSync(join(tempDir, 'CLAUDE.md'))).toBe(true)
    expect(existsSync(join(tempDir, 'AGENTS.md'))).toBe(true)
  })

  it('writes .claude/* static files', async () => {
    await writeAllHarnessFiles(tempDir)
    expect(existsSync(join(tempDir, '.claude', 'commands', 'check.md'))).toBe(true)
    expect(existsSync(join(tempDir, '.claude', 'commands', 'fix.md'))).toBe(true)
    expect(existsSync(join(tempDir, '.claude', 'skills', 'coherent-project', 'SKILL.md'))).toBe(true)
    expect(existsSync(join(tempDir, '.claude', 'settings.json'))).toBe(true)
  })

  it('returns correct counts', async () => {
    const result = await writeAllHarnessFiles(tempDir)
    expect(result.sharedCount).toBe(0)
    expect(result.tokenKeys).toBeUndefined()
  })
})
```

Add a test for `regenerateAllHarnessFiles` returning `{ written: false }` outside a Coherent project:

```typescript
describe('regenerateAllHarnessFiles', () => {
  it('returns { written: false } when not in a Coherent project', async () => {
    const originalCwd = process.cwd()
    process.chdir(tmpdir())
    try {
      const result = await regenerateAllHarnessFiles()
      expect(result.written).toBe(false)
    } finally {
      process.chdir(originalCwd)
    }
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run packages/cli/src/utils/harness-context.test.ts`
Expected: FAIL — `writeAllHarnessFiles` not exported yet

- [ ] **Step 3: Implement writeAllHarnessFiles and regenerateAllHarnessFiles**

Add to `harness-context.ts` — implementation exactly as shown in the spec:

```typescript
export async function writeAllHarnessFiles(projectRoot: string): Promise<HarnessResult> {
  let manifest: SharedComponentsManifest
  try {
    manifest = await loadManifest(projectRoot)
  } catch {
    manifest = { shared: [], nextId: 1 }
  }

  let config: DesignSystemConfig | null = null
  const configPath = join(projectRoot, 'design-system.config.ts')
  if (existsSync(configPath)) {
    try {
      const dsm = new DesignSystemManager(configPath)
      await dsm.load()
      config = dsm.getConfig()
    } catch {
      // config may be invalid during init — proceed with null
    }
  }

  const ctx = buildProjectContext(manifest, config)

  writeFileSync(join(projectRoot, '.cursorrules'), formatForCursor(ctx), 'utf-8')
  writeFileSync(join(projectRoot, 'CLAUDE.md'), formatForClaude(ctx), 'utf-8')
  writeFileSync(join(projectRoot, 'AGENTS.md'), formatForAgents(ctx), 'utf-8')

  writeClaudeCommands(projectRoot)
  writeClaudeSkills(projectRoot)
  writeClaudeSettings(projectRoot)

  const tokenKeys = config?.tokens
    ? [
        ...Object.keys(config.tokens.colors?.light ?? {}),
        ...Object.keys(config.tokens.colors?.dark ?? {}),
        ...Object.keys(config.tokens.spacing ?? {}),
        ...Object.keys(config.tokens.radius ?? {}),
      ].filter((k, i, a) => a.indexOf(k) === i).length
    : 0

  return {
    written: true,
    sharedCount: manifest.shared.length,
    tokenKeys: tokenKeys || undefined,
  }
}

export async function regenerateAllHarnessFiles(): Promise<HarnessResult> {
  const project = findConfig()
  if (!project) {
    return { written: false }
  }
  return writeAllHarnessFiles(project.root)
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run packages/cli/src/utils/harness-context.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/utils/harness-context.ts packages/cli/src/utils/harness-context.test.ts
git commit -m "feat: add writeAllHarnessFiles and regenerateAllHarnessFiles"
```

---

### Task 5: Update Call Sites

Replace all `writeCursorRules()` → `writeAllHarnessFiles()` and `regenerateCursorRules()` → `regenerateAllHarnessFiles()` across 8 files. In `init.ts` and `sync.ts`, also remove the separate `generateClaudeCodeFiles()` call.

**Files:**
- Modify: `packages/cli/src/commands/init.ts:28-30,358-360`
- Modify: `packages/cli/src/commands/sync.ts:22-24,556-559`
- Modify: `packages/cli/src/commands/rules.ts:6,11,19`
- Modify: `packages/cli/src/commands/update.ts:28,100`
- Modify: `packages/cli/src/commands/components.ts:22,209`
- Modify: `packages/cli/src/commands/import-cmd.ts:32,350`
- Modify: `packages/cli/src/commands/chat/modification-handler.ts:40,236,322,428`
- Modify: `packages/cli/src/utils/file-watcher.ts:15,157,194`

- [ ] **Step 1: Update init.ts**

Replace:
```typescript
import { writeCursorRules } from '../utils/cursor-rules.js'
import { generateClaudeCodeFiles } from '../utils/claude-code.js'
```
With:
```typescript
import { writeAllHarnessFiles } from '../utils/harness-context.js'
```

Replace the two calls:
```typescript
await writeCursorRules(projectPath)
await generateClaudeCodeFiles(projectPath)
```
With:
```typescript
await writeAllHarnessFiles(projectPath)
```

- [ ] **Step 2: Update sync.ts**

Replace imports:
```typescript
import { writeCursorRules } from '../utils/cursor-rules.js'
import { generateClaudeCodeFiles } from '../utils/claude-code.js'
```
With:
```typescript
import { writeAllHarnessFiles } from '../utils/harness-context.js'
```

Replace the two calls:
```typescript
await writeCursorRules(project.root)
await generateClaudeCodeFiles(project.root)
```
With:
```typescript
await writeAllHarnessFiles(project.root)
```

Update the success message from `'Updated .cursorrules and CLAUDE.md'` to `'Updated .cursorrules, CLAUDE.md, and AGENTS.md'`.

- [ ] **Step 3: Update rules.ts**

Replace import:
```typescript
import { regenerateCursorRules } from '../utils/cursor-rules.js'
```
With:
```typescript
import { regenerateAllHarnessFiles } from '../utils/harness-context.js'
```

Replace call:
```typescript
const result = await regenerateCursorRules()
```
With:
```typescript
const result = await regenerateAllHarnessFiles()
```

Update message:
```typescript
console.log(chalk.green(`✔ Updated .cursorrules, CLAUDE.md, and AGENTS.md${summary}\n`))
```

- [ ] **Step 4: Update update.ts**

Replace import `writeCursorRules` → `writeAllHarnessFiles` (from `'../utils/harness-context.js'`).
Replace call `writeCursorRules(project.root)` → `writeAllHarnessFiles(project.root)`.

- [ ] **Step 5: Update components.ts**

Replace import `writeCursorRules` → `writeAllHarnessFiles` (from `'../utils/harness-context.js'`).
Replace call `writeCursorRules(project.root)` → `writeAllHarnessFiles(project.root)`.

- [ ] **Step 6: Update import-cmd.ts**

Replace import `writeCursorRules` → `writeAllHarnessFiles` (from `'../utils/harness-context.js'`).
Replace call `writeCursorRules(projectRoot)` → `writeAllHarnessFiles(projectRoot)`.

- [ ] **Step 7: Update modification-handler.ts**

Replace import:
```typescript
import { writeCursorRules } from '../../utils/cursor-rules.js'
```
With:
```typescript
import { writeAllHarnessFiles } from '../../utils/harness-context.js'
```

Replace all 3 calls of `writeCursorRules(projectRoot)` → `writeAllHarnessFiles(projectRoot)`.

- [ ] **Step 8: Update file-watcher.ts**

Replace import:
```typescript
import { writeCursorRules } from './cursor-rules.js'
```
With:
```typescript
import { writeAllHarnessFiles } from './harness-context.js'
```

Replace both calls of `writeCursorRules(projectRoot)` → `writeAllHarnessFiles(projectRoot)`.

- [ ] **Step 9: Verify build compiles**

Run: `pnpm build`
Expected: PASS — no TypeScript errors

- [ ] **Step 10: Commit**

```bash
git add packages/cli/src/commands/ packages/cli/src/utils/file-watcher.ts
git commit -m "refactor: switch all call sites to writeAllHarnessFiles"
```

---

### Task 6: Gut claude-code.ts and Delete cursor-rules.ts

Remove functions that moved to `harness-context.ts`. Keep only the static `.claude/*` writers in `claude-code.ts`.

**Files:**
- Modify: `packages/cli/src/utils/claude-code.ts`
- Delete: `packages/cli/src/utils/cursor-rules.ts`
- Modify: `packages/cli/src/utils/harness-context.test.ts` (remove old `buildCursorRules` import)

- [ ] **Step 1: Remove moved functions from claude-code.ts**

Remove these functions/constants from `claude-code.ts`:
- `buildSharedComponentsListForClaude` (lines 13-40)
- `buildClaudeMdContent` (lines 42-126)
- `writeClaudeMd` (lines 468-476)
- `loadManifestAndConfig` (lines 501-522)
- `updateClaudeMd` (lines 528-536)
- `generateClaudeCodeFiles` (lines 542-548)

Remove imports that are no longer needed:
- `DesignSystemConfig` (only if no remaining code uses it)
- `SharedComponentsManifest` (only if no remaining code uses it)
- `loadManifest` (only if no remaining code uses it)
- `DesignSystemManager` (only if no remaining code uses it)

The file should keep only:
- `ensureDir` helper
- `COMMANDS` constant
- `SKILL_COHERENT` constant
- `SKILL_FRONTEND_UX` constant
- `SETTINGS_JSON` constant
- `writeClaudeCommands()`
- `writeClaudeSkills()`
- `writeClaudeSettings()`

Remaining imports should be only: `writeFileSync`, `mkdirSync` from `'fs'`, `join` from `'path'`.

- [ ] **Step 2: Delete cursor-rules.ts**

Delete: `packages/cli/src/utils/cursor-rules.ts`

- [ ] **Step 3: Update test file — remove old import**

In `harness-context.test.ts`, remove the import of `buildCursorRules` from `'./cursor-rules.js'`. Update the snapshot baseline test to use `formatForCursor(buildProjectContext(...))` instead. Since the exact-match test in Task 3 already verifies `formatForCursor === buildCursorRules`, we can now use `formatForCursor` directly:

```typescript
describe('snapshot baselines', () => {
  it('formatForCursor matches snapshot', () => {
    const ctx = buildProjectContext(TEST_MANIFEST, TEST_CONFIG)
    const result = formatForCursor(ctx)
    expect(result).toMatchSnapshot()
  })
})
```

- [ ] **Step 4: Update snapshot**

Run: `pnpm vitest run packages/cli/src/utils/harness-context.test.ts --update`
Expected: PASS — snapshot updates to use new test name but content should be identical

- [ ] **Step 5: Verify no remaining references to deleted file**

Run: `rg "cursor-rules" packages/cli/src/ --type ts`
Expected: No matches (all references should be gone)

Run: `rg "generateClaudeCodeFiles|updateClaudeMd|writeClaudeMd|buildClaudeMdContent|loadManifestAndConfig" packages/cli/src/ --type ts`
Expected: No matches (all these functions have been removed)

- [ ] **Step 6: Verify build and tests**

Run: `pnpm build && pnpm vitest run packages/cli/src/utils/harness-context.test.ts`
Expected: Both PASS

- [ ] **Step 7: Commit**

```bash
git add packages/cli/src/utils/claude-code.ts packages/cli/src/utils/harness-context.test.ts
git rm packages/cli/src/utils/cursor-rules.ts
git add packages/cli/src/utils/__snapshots__/
git commit -m "refactor: consolidate context generation into harness-context.ts"
```

---

### Task 7: Update export.ts — Strip AGENTS.md

Add `AGENTS.md` to the export exclusion list so it doesn't ship in `coherent export` output.

**Files:**
- Modify: `packages/cli/src/commands/export.ts:21-36,295-303`

- [ ] **Step 1: Add AGENTS.md to COPY_EXCLUDE set**

In `export.ts`, add `'AGENTS.md'` to the `COPY_EXCLUDE` set (after `'CLAUDE.md'`):

```typescript
const COPY_EXCLUDE = new Set([
  'node_modules',
  '.next',
  '.git',
  'export',
  '.tmp-e2e',
  '.cursorrules',
  'CLAUDE.md',
  'AGENTS.md',
  '.claude',
  // ... rest unchanged
])
```

- [ ] **Step 2: Add AGENTS.md to cleanup file list**

In `stripCoherentArtifacts`, add `'AGENTS.md'` to the cleanup loop (line ~295):

```typescript
for (const name of [
  'coherent.components.json',
  'design-system.config.ts',
  '.cursorrules',
  'CLAUDE.md',
  'AGENTS.md',
  '.env',
  '.env.local',
  'recommendations.md',
]) {
```

- [ ] **Step 3: Verify build**

Run: `pnpm build`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add packages/cli/src/commands/export.ts
git commit -m "fix: strip AGENTS.md from coherent export output"
```

---

### Task 8: Final Verification

Run full CI pipeline to ensure nothing is broken.

**Files:** None (verification only)

- [ ] **Step 1: Run all tests**

Run: `pnpm test`
Expected: All tests PASS

- [ ] **Step 2: Run typecheck**

Run: `pnpm typecheck`
Expected: No errors

- [ ] **Step 3: Run lint**

Run: `pnpm lint`
Expected: No errors (or only pre-existing ones)

- [ ] **Step 4: Run build**

Run: `pnpm build`
Expected: PASS

- [ ] **Step 5: Verify AGENTS.md content manually**

Create a temporary test by running:
```typescript
// In a quick script or test
const ctx = buildProjectContext(testManifest, testConfig)
const agents = formatForAgents(ctx)
console.log(agents)
```

Verify:
- Header is `# Project Conventions`
- Has auto-generated warning
- Contains `## Project Architecture` with Key directories and Config files
- Contains shared components with import paths
- Contains `## Component Rules (MANDATORY)` (detailed rules)
- Contains `## Design Tokens` with actual token values
- Does NOT contain "Cursor", "Claude", or tool-specific language

- [ ] **Step 6: Final commit and summary**

If any fixes were needed, commit them. Then summarize:

```bash
git log --oneline -8
```

Expected: 7 commits from this plan (snapshot, data layer, formatters, entry points, call sites, cleanup, export).
