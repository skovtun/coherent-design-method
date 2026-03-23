# Tailwind v4 CSS Compatibility Fix — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the CSS runtime layer so all shadcn/ui components render correctly in Tailwind v4 projects by completing `generateV4GlobalsCss` with missing theme tokens and improving detection/validation.

**Architecture:** The fix centers on `packages/cli/src/utils/tailwind-version.ts` which generates v4-compatible `globals.css`. We add missing CSS variables (`--color-transparent`, `--color-black`, `--color-white`, sidebar, chart, `--radius-xs`), strengthen `needsGlobalsFix` detection, add a read-only CSS validator, and catch a known AI junk class in `autoFixCode`.

**Tech Stack:** TypeScript, Vitest, CSS

---

### Task 1: Add test coverage for `isTailwindV4`

**Files:**
- Create: `packages/cli/src/utils/tailwind-version.test.ts`

- [ ] **Step 1: Write the tests**

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { isTailwindV4 } from './tailwind-version.js'
import { existsSync, readFileSync } from 'fs'

vi.mock('fs', () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
}))

const mockExistsSync = vi.mocked(existsSync)
const mockReadFileSync = vi.mocked(readFileSync)

describe('isTailwindV4', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('detects @tailwindcss/postcss in devDependencies', () => {
    mockExistsSync.mockReturnValue(true)
    mockReadFileSync.mockReturnValue(JSON.stringify({
      devDependencies: { '@tailwindcss/postcss': '^4.0.0' },
    }))
    expect(isTailwindV4('/project')).toBe(true)
  })

  it('detects tailwindcss: "^4" in dependencies', () => {
    mockExistsSync.mockReturnValue(true)
    mockReadFileSync.mockReturnValue(JSON.stringify({
      dependencies: { tailwindcss: '^4.0.0' },
    }))
    expect(isTailwindV4('/project')).toBe(true)
  })

  it('detects tailwindcss: "4.x" in dependencies', () => {
    mockExistsSync.mockReturnValue(true)
    mockReadFileSync.mockReturnValue(JSON.stringify({
      dependencies: { tailwindcss: '4.1.0' },
    }))
    expect(isTailwindV4('/project')).toBe(true)
  })

  it('detects @import "tailwindcss" in globals.css', () => {
    mockExistsSync.mockReturnValue(true)
    mockReadFileSync.mockImplementation((p: any) => {
      if (String(p).includes('package.json')) return JSON.stringify({ dependencies: {} })
      return '@import "tailwindcss";'
    })
    expect(isTailwindV4('/project')).toBe(true)
  })

  it('returns false for v3 project', () => {
    mockExistsSync.mockReturnValue(true)
    mockReadFileSync.mockImplementation((p: any) => {
      if (String(p).includes('package.json')) return JSON.stringify({ dependencies: { tailwindcss: '^3.4.0' } })
      return '@tailwind base;\n@tailwind components;\n@tailwind utilities;'
    })
    expect(isTailwindV4('/project')).toBe(false)
  })

  it('returns false when no package.json and no globals.css', () => {
    mockExistsSync.mockReturnValue(false)
    expect(isTailwindV4('/project')).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it passes**

Run: `cd packages/cli && npx vitest run src/utils/tailwind-version.test.ts`
Expected: PASS (these test existing behavior, not new code)

- [ ] **Step 3: Commit**

```bash
git add packages/cli/src/utils/tailwind-version.test.ts
git commit -m "test: add coverage for isTailwindV4 detection"
```

---

### Task 2: Complete `generateV4GlobalsCss` with all missing tokens

**Files:**
- Modify: `packages/cli/src/utils/tailwind-version.ts:65-96` (the `@theme inline` block)
- Modify: `packages/cli/src/utils/tailwind-version.ts:98-149` (the `:root` and `.dark` blocks)
- Test: `packages/cli/src/utils/tailwind-version.test.ts`

- [ ] **Step 1: Write the failing tests**

Add to `packages/cli/src/utils/tailwind-version.test.ts`:

```typescript
import { generateV4GlobalsCss } from './tailwind-version.js'
import type { DesignSystemConfig } from '@getcoherent/core'

const mockConfig: DesignSystemConfig = {
  name: 'Test',
  theme: { defaultMode: 'light' as const },
  tokens: {
    colors: {
      light: {
        background: '#ffffff',
        foreground: '#09090b',
        primary: '#2563eb',
        secondary: '#f1f5f9',
        muted: '#f1f5f9',
        accent: '#f1f5f9',
        border: '#e2e8f0',
        success: '#16a34a',
        warning: '#eab308',
        error: '#dc2626',
        info: '#2563eb',
      },
      dark: {
        background: '#09090b',
        foreground: '#fafafa',
        primary: '#3b82f6',
        secondary: '#1e293b',
        muted: '#1e293b',
        accent: '#1e293b',
        border: '#1e293b',
        success: '#22c55e',
        warning: '#facc15',
        error: '#ef4444',
        info: '#3b82f6',
      },
    },
    radius: { sm: '0.25rem', md: '0.5rem', lg: '0.75rem', xl: '1rem' },
    spacing: {},
    typography: {},
  },
  components: [],
  pages: [],
} as unknown as DesignSystemConfig

describe('generateV4GlobalsCss', () => {
  const css = generateV4GlobalsCss(mockConfig)

  it('contains --color-transparent in @theme inline', () => {
    expect(css).toContain('--color-transparent: transparent')
  })

  it('contains --color-black and --color-white', () => {
    expect(css).toContain('--color-black:')
    expect(css).toContain('--color-white:')
  })

  it('contains all 10 sidebar color aliases in @theme inline', () => {
    const sidebarVars = [
      '--color-sidebar-background',
      '--color-sidebar-foreground',
      '--color-sidebar-primary',
      '--color-sidebar-primary-foreground',
      '--color-sidebar-accent',
      '--color-sidebar-accent-foreground',
      '--color-sidebar-border',
      '--color-sidebar-ring',
      '--color-sidebar-muted',
      '--color-sidebar-muted-foreground',
    ]
    for (const v of sidebarVars) {
      expect(css).toContain(v)
    }
  })

  it('contains chart color aliases in @theme inline', () => {
    for (let i = 1; i <= 5; i++) {
      expect(css).toContain(`--color-chart-${i}`)
    }
  })

  it('contains --radius-xs', () => {
    expect(css).toContain('--radius-xs')
  })

  it('contains sidebar base variables in :root', () => {
    expect(css).toContain('--sidebar-background:')
    expect(css).toContain('--sidebar-foreground:')
    expect(css).toContain('--sidebar-muted:')
    expect(css).toContain('--sidebar-muted-foreground:')
  })

  it('contains chart base variables in :root', () => {
    expect(css).toContain('--chart-1:')
    expect(css).toContain('--chart-5:')
  })

  it('contains sidebar and chart variables in .dark', () => {
    const darkSection = css.split('.dark {')[1]
    expect(darkSection).toBeDefined()
    expect(darkSection).toContain('--sidebar-background:')
    expect(darkSection).toContain('--chart-1:')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/cli && npx vitest run src/utils/tailwind-version.test.ts`
Expected: FAIL — `--color-black`, sidebar vars, chart vars, `--radius-xs` are not present

- [ ] **Step 3: Implement — add missing tokens to `@theme inline`**

In `packages/cli/src/utils/tailwind-version.ts`, add these lines inside the `@theme inline { ... }` block, after `--color-popover-foreground`:

```
  --color-black: #000;
  --color-white: #fff;
  --color-sidebar-background: var(--sidebar-background);
  --color-sidebar-foreground: var(--sidebar-foreground);
  --color-sidebar-primary: var(--sidebar-primary);
  --color-sidebar-primary-foreground: var(--sidebar-primary-foreground);
  --color-sidebar-accent: var(--sidebar-accent);
  --color-sidebar-accent-foreground: var(--sidebar-accent-foreground);
  --color-sidebar-border: var(--sidebar-border);
  --color-sidebar-ring: var(--sidebar-ring);
  --color-sidebar-muted: var(--sidebar-muted);
  --color-sidebar-muted-foreground: var(--sidebar-muted-foreground);
  --color-chart-1: var(--chart-1);
  --color-chart-2: var(--chart-2);
  --color-chart-3: var(--chart-3);
  --color-chart-4: var(--chart-4);
  --color-chart-5: var(--chart-5);
```

Add `--radius-xs` alongside the other radius tokens:

```
  --radius-xs: 0.125rem;
```

- [ ] **Step 4: Implement — add sidebar and chart base variables to `:root` and `.dark`**

Add at the end of the `:root { ... }` block (before closing `}`):

```
  --sidebar-background: ${light.background};
  --sidebar-foreground: ${light.foreground};
  --sidebar-primary: ${light.primary};
  --sidebar-primary-foreground: ${contrastFg(light.primary)};
  --sidebar-accent: ${light.accent || light.muted};
  --sidebar-accent-foreground: ${light.foreground};
  --sidebar-border: ${light.border};
  --sidebar-ring: ${light.primary};
  --sidebar-muted: ${light.muted};
  --sidebar-muted-foreground: ${blendColors(light.foreground, light.background, 0.45)};
  --chart-1: ${light.primary};
  --chart-2: ${light.success};
  --chart-3: ${light.warning};
  --chart-4: ${light.error};
  --chart-5: ${light.info || light.primary};
```

Add the same pattern to `.dark { ... }`, using `dark.*` values.

- [ ] **Step 5: Run test to verify it passes**

Run: `cd packages/cli && npx vitest run src/utils/tailwind-version.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add packages/cli/src/utils/tailwind-version.ts packages/cli/src/utils/tailwind-version.test.ts
git commit -m "feat: complete generateV4GlobalsCss with sidebar, chart, black/white, radius-xs tokens"
```

---

### Task 3: Update `needsGlobalsFix` to check for all critical tokens

**Files:**
- Modify: `packages/cli/src/utils/fix-globals-css.ts:19-41`
- Create: `packages/cli/src/utils/fix-globals-css.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `packages/cli/src/utils/fix-globals-css.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { needsGlobalsFix } from './fix-globals-css.js'
import { existsSync, readFileSync } from 'fs'

vi.mock('fs', () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
}))

vi.mock('./tailwind-version.js', () => ({
  isTailwindV4: vi.fn(),
  generateV4GlobalsCss: vi.fn(() => '/* mock */'),
}))

const mockExistsSync = vi.mocked(existsSync)
const mockReadFileSync = vi.mocked(readFileSync)
const { isTailwindV4: mockIsTailwindV4 } = await import('./tailwind-version.js')

describe('needsGlobalsFix', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('returns false when globals.css does not exist', () => {
    mockExistsSync.mockReturnValue(false)
    expect(needsGlobalsFix('/project')).toBe(false)
  })

  it('returns true for v4 project missing --color-transparent', () => {
    mockExistsSync.mockReturnValue(true)
    vi.mocked(mockIsTailwindV4).mockReturnValue(true)
    mockReadFileSync.mockReturnValue('@import "tailwindcss";\n@theme inline {\n  --color-background: var(--background);\n}')
    expect(needsGlobalsFix('/project')).toBe(true)
  })

  it('returns true for v4 project missing --color-sidebar-background', () => {
    mockExistsSync.mockReturnValue(true)
    vi.mocked(mockIsTailwindV4).mockReturnValue(true)
    mockReadFileSync.mockReturnValue(
      '@import "tailwindcss";\n@theme inline {\n  --color-transparent: transparent;\n  --color-background: var(--background);\n}'
    )
    expect(needsGlobalsFix('/project')).toBe(true)
  })

  it('returns true for v4 project missing --color-black', () => {
    mockExistsSync.mockReturnValue(true)
    vi.mocked(mockIsTailwindV4).mockReturnValue(true)
    mockReadFileSync.mockReturnValue(
      '@import "tailwindcss";\n@theme inline {\n  --color-transparent: transparent;\n  --color-sidebar-background: var(--sidebar-background);\n  --color-chart-1: var(--chart-1);\n}'
    )
    expect(needsGlobalsFix('/project')).toBe(true)
  })

  it('returns true for v4 project missing --radius-xs', () => {
    mockExistsSync.mockReturnValue(true)
    vi.mocked(mockIsTailwindV4).mockReturnValue(true)
    mockReadFileSync.mockReturnValue(
      '@import "tailwindcss";\n@theme inline {\n  --color-transparent: transparent;\n  --color-sidebar-background: x;\n  --color-chart-1: x;\n  --color-black: #000;\n  --color-white: #fff;\n}'
    )
    expect(needsGlobalsFix('/project')).toBe(true)
  })

  it('returns false for complete v4 globals', () => {
    mockExistsSync.mockReturnValue(true)
    vi.mocked(mockIsTailwindV4).mockReturnValue(true)
    const completeV4 = `@import "tailwindcss";
@theme inline {
  --color-transparent: transparent;
  --color-black: #000;
  --color-white: #fff;
  --color-sidebar-background: var(--sidebar-background);
  --color-chart-1: var(--chart-1);
  --radius-xs: 0.125rem;
}`
    mockReadFileSync.mockReturnValue(completeV4)
    expect(needsGlobalsFix('/project')).toBe(false)
  })

  it('returns true for v3-style globals in v4 project', () => {
    mockExistsSync.mockReturnValue(true)
    vi.mocked(mockIsTailwindV4).mockReturnValue(true)
    mockReadFileSync.mockReturnValue('@tailwind base;\n@tailwind components;\n@tailwind utilities;')
    expect(needsGlobalsFix('/project')).toBe(true)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/cli && npx vitest run src/utils/fix-globals-css.test.ts`
Expected: FAIL — tests for `--color-sidebar-background`, `--color-black`, `--radius-xs` will fail since current `needsGlobalsFix` doesn't check them

- [ ] **Step 3: Implement — update `needsGlobalsFix` in `fix-globals-css.ts`**

Replace the v4 check block in `needsGlobalsFix` (lines 27-33) with:

```typescript
    if (!content.includes('@theme inline')) return true
    if (content.includes('@tailwind base')) return true
    const REQUIRED_V4_TOKENS = [
      '--color-transparent',
      '--color-sidebar-background',
      '--color-chart-1',
      '--color-black',
      '--color-white',
      '--radius-xs',
    ]
    for (const token of REQUIRED_V4_TOKENS) {
      if (!content.includes(token)) return true
    }
    return false
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/cli && npx vitest run src/utils/fix-globals-css.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/utils/fix-globals-css.ts packages/cli/src/utils/fix-globals-css.test.ts
git commit -m "feat: needsGlobalsFix checks for all critical v4 tokens"
```

---

### Task 4: Add CSS validation function

**Files:**
- Create: `packages/cli/src/utils/css-validator.ts`
- Create: `packages/cli/src/utils/css-validator.test.ts`
- Modify: `packages/cli/src/commands/preview.ts:525-537`

- [ ] **Step 1: Write the failing tests**

Create `packages/cli/src/utils/css-validator.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { validateV4GlobalsCss } from './css-validator.js'

describe('validateV4GlobalsCss', () => {
  it('catches missing --color-transparent', () => {
    const css = '@import "tailwindcss";\n@theme inline {\n  --color-background: var(--background);\n}\n:root {\n  --background: #fff;\n}'
    const issues = validateV4GlobalsCss(css)
    expect(issues).toContain('Missing @theme token: --color-transparent')
  })

  it('catches missing sidebar tokens', () => {
    const css = '@import "tailwindcss";\n@theme inline {\n  --color-transparent: transparent;\n}\n:root {\n  --background: #fff;\n}'
    const issues = validateV4GlobalsCss(css)
    expect(issues.some(i => i.includes('--color-sidebar-background'))).toBe(true)
  })

  it('catches stale v3 directives in v4 CSS', () => {
    const css = '@tailwind base;\n@import "tailwindcss";'
    const issues = validateV4GlobalsCss(css)
    expect(issues.some(i => i.includes('@tailwind'))).toBe(true)
  })

  it('returns empty array for complete v4 CSS', () => {
    const css = `@import "tailwindcss";
@theme inline {
  --color-transparent: transparent;
  --color-black: #000;
  --color-white: #fff;
  --color-background: var(--background);
  --color-sidebar-background: var(--sidebar-background);
  --color-sidebar-foreground: var(--sidebar-foreground);
  --color-sidebar-primary: var(--sidebar-primary);
  --color-sidebar-primary-foreground: var(--sidebar-primary-foreground);
  --color-sidebar-accent: var(--sidebar-accent);
  --color-sidebar-accent-foreground: var(--sidebar-accent-foreground);
  --color-sidebar-border: var(--sidebar-border);
  --color-sidebar-ring: var(--sidebar-ring);
  --color-sidebar-muted: var(--sidebar-muted);
  --color-sidebar-muted-foreground: var(--sidebar-muted-foreground);
  --color-chart-1: var(--chart-1);
  --color-chart-2: var(--chart-2);
  --color-chart-3: var(--chart-3);
  --color-chart-4: var(--chart-4);
  --color-chart-5: var(--chart-5);
  --radius-xs: 0.125rem;
}
:root {
  --background: #fff;
  --sidebar-background: #fff;
  --sidebar-foreground: #09090b;
  --sidebar-primary: #2563eb;
  --sidebar-primary-foreground: #fafafa;
  --sidebar-accent: #f1f5f9;
  --sidebar-accent-foreground: #09090b;
  --sidebar-border: #e2e8f0;
  --sidebar-ring: #2563eb;
  --sidebar-muted: #f1f5f9;
  --sidebar-muted-foreground: #64748b;
  --chart-1: #2563eb;
  --chart-2: #16a34a;
  --chart-3: #eab308;
  --chart-4: #dc2626;
  --chart-5: #2563eb;
}`
    const issues = validateV4GlobalsCss(css)
    expect(issues).toHaveLength(0)
  })

  it('catches @theme token without corresponding :root variable', () => {
    const css = `@import "tailwindcss";
@theme inline {
  --color-transparent: transparent;
  --color-black: #000;
  --color-white: #fff;
  --color-sidebar-background: var(--sidebar-background);
  --color-sidebar-foreground: var(--sidebar-foreground);
  --color-sidebar-primary: var(--sidebar-primary);
  --color-sidebar-primary-foreground: var(--sidebar-primary-foreground);
  --color-sidebar-accent: var(--sidebar-accent);
  --color-sidebar-accent-foreground: var(--sidebar-accent-foreground);
  --color-sidebar-border: var(--sidebar-border);
  --color-sidebar-ring: var(--sidebar-ring);
  --color-sidebar-muted: var(--sidebar-muted);
  --color-sidebar-muted-foreground: var(--sidebar-muted-foreground);
  --color-chart-1: var(--chart-1);
  --color-chart-2: var(--chart-2);
  --color-chart-3: var(--chart-3);
  --color-chart-4: var(--chart-4);
  --color-chart-5: var(--chart-5);
  --radius-xs: 0.125rem;
}
:root {
  --background: #fff;
}`
    const issues = validateV4GlobalsCss(css)
    expect(issues.some(i => i.includes('--sidebar-background') && i.includes(':root'))).toBe(true)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/cli && npx vitest run src/utils/css-validator.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement `validateV4GlobalsCss`**

Create `packages/cli/src/utils/css-validator.ts`:

```typescript
const REQUIRED_THEME_TOKENS = [
  '--color-transparent',
  '--color-black',
  '--color-white',
  '--color-sidebar-background',
  '--color-sidebar-foreground',
  '--color-sidebar-primary',
  '--color-sidebar-primary-foreground',
  '--color-sidebar-accent',
  '--color-sidebar-accent-foreground',
  '--color-sidebar-border',
  '--color-sidebar-ring',
  '--color-sidebar-muted',
  '--color-sidebar-muted-foreground',
  '--color-chart-1',
  '--color-chart-2',
  '--color-chart-3',
  '--color-chart-4',
  '--color-chart-5',
  '--radius-xs',
]

const VAR_REFERENCE_RE = /var\(--([^)]+)\)/

export function validateV4GlobalsCss(css: string): string[] {
  const issues: string[] = []

  if (css.includes('@tailwind base') || css.includes('@tailwind components')) {
    issues.push('Stale v3 directive (@tailwind) found in v4 CSS — remove it')
  }

  const themeMatch = css.match(/@theme\s+inline\s*\{([^}]*(?:\{[^}]*\}[^}]*)*)\}/s)
  const themeBlock = themeMatch ? themeMatch[1] : ''

  for (const token of REQUIRED_THEME_TOKENS) {
    if (!themeBlock.includes(token)) {
      issues.push(`Missing @theme token: ${token}`)
    }
  }

  const themeLines = themeBlock.split('\n')
  for (const line of themeLines) {
    const varMatch = line.match(VAR_REFERENCE_RE)
    if (!varMatch) continue
    const referencedVar = `--${varMatch[1]}`
    const definedInRoot = css.includes(`${referencedVar}:`) || css.includes(`${referencedVar} :`)
    if (!definedInRoot) {
      issues.push(`@theme references var(${referencedVar}) but it is not defined in :root/.dark`)
    }
  }

  return issues
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/cli && npx vitest run src/utils/css-validator.test.ts`
Expected: PASS

- [ ] **Step 5: Wire into `preview.ts`**

In `packages/cli/src/commands/preview.ts`, add import at the top (alongside other imports):

```typescript
import { validateV4GlobalsCss } from '../utils/css-validator.js'
import { isTailwindV4 } from '../utils/tailwind-version.js'
```

After the `fixGlobalsCss` block (after line 537), add a validation step:

```typescript
    // Step 2.55: Validate globals.css completeness for v4 projects
    if (isTailwindV4(projectRoot)) {
      const globalsPath = resolve(projectRoot, 'app', 'globals.css')
      if (existsSync(globalsPath)) {
        const globalsContent = readFileSync(globalsPath, 'utf-8')
        const cssIssues = validateV4GlobalsCss(globalsContent)
        if (cssIssues.length > 0) {
          console.log(chalk.yellow('\n⚠️  globals.css validation warnings:'))
          for (const issue of cssIssues) {
            console.log(chalk.yellow(`   • ${issue}`))
          }
          console.log(chalk.dim('   Run "coherent chat" to regenerate globals.css\n'))
        }
      }
    }
```

- [ ] **Step 6: Commit**

```bash
git add packages/cli/src/utils/css-validator.ts packages/cli/src/utils/css-validator.test.ts packages/cli/src/commands/preview.ts
git commit -m "feat: add CSS validation for v4 globals.css completeness"
```

---

### Task 5: Quality validator — catch `-0` junk class

**Files:**
- Modify: `packages/cli/src/utils/quality-validator.ts` (inside `autoFixCode`, around line 1152)
- Test: `packages/cli/src/utils/quality-validator.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `packages/cli/src/utils/quality-validator.test.ts`, inside the existing `describe('autoFixCode', ...)`:

```typescript
  it('removes className="-0" junk class from AI output', async () => {
    const code = `<TabsList className="-0 border-0"><TabsTrigger value="a">A</TabsTrigger></TabsList>`
    const { code: fixed, fixes } = await autoFixCode(code)
    expect(fixed).not.toContain('"-0 ')
    expect(fixed).not.toContain(' -0"')
    expect(fixed).not.toContain(' -0 ')
    expect(fixes.some(f => f.includes('junk'))).toBe(true)
  })

  it('removes standalone -0 but keeps border-0', async () => {
    const code = `<div className="flex -0 border-0 p-4">Content</div>`
    const { code: fixed } = await autoFixCode(code)
    expect(fixed).toContain('border-0')
    expect(fixed).not.toMatch(/\s-0[\s"]/)
  })
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/cli && npx vitest run src/utils/quality-validator.test.ts -t "removes className"` 
Expected: FAIL — no junk class removal logic yet

- [ ] **Step 3: Implement — add `-0` cleanup to `autoFixCode`**

In `packages/cli/src/utils/quality-validator.ts`, add this block right before the "Clean up double spaces in className" section (before line 1155):

```typescript
  // Remove AI-generated junk classes like standalone "-0"
  const beforeJunkFix = fixed
  fixed = fixed.replace(/className="([^"]*)"/g, (_match, classes: string) => {
    const cleaned = classes.split(/\s+/).filter(c => c !== '-0').join(' ')
    if (cleaned !== classes.trim()) return `className="${cleaned}"`
    return _match
  })
  if (fixed !== beforeJunkFix) {
    fixes.push('removed junk classes (-0)')
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/cli && npx vitest run src/utils/quality-validator.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/utils/quality-validator.ts packages/cli/src/utils/quality-validator.test.ts
git commit -m "fix: autoFixCode removes -0 junk class from AI output"
```

---

### Task 6: Full build + test suite

**Files:** None (verification only)

- [ ] **Step 1: Run full test suite**

Run: `pnpm test`
Expected: All tests pass

- [ ] **Step 2: Run build**

Run: `pnpm build`
Expected: Clean build

- [ ] **Step 3: Run lint and typecheck**

Run: `pnpm lint && pnpm typecheck`
Expected: No errors

- [ ] **Step 4: Commit any remaining fixes if needed**

Only if build/lint/typecheck reveals issues from the previous tasks.
