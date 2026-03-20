# Post-Generation Quality v2 — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix 10 quality issues found in v0.5.4 end-to-end testing: stale quality display, missing autofix patterns, DOM nesting, auth layout, navType detection, landing page logic, and prompt improvements.

**Architecture:** All fixes are in the CLI package. Deterministic fixes (Tasks 1–6) get TDD. Prompt/planner changes (Tasks 7–9) get parsing tests where applicable, then manual verification via `pnpm build && pnpm typecheck`.

**Tech Stack:** TypeScript, vitest, Zod, Next.js App Router (generated output)

---

### Task 1: Auth layout centering

**Files:**
- Modify: `packages/cli/src/utils/auth-route-group.ts:10-21`
- Test: `packages/cli/src/utils/auth-route-group.test.ts` (create)

**Step 1: Write the failing test**

```typescript
// packages/cli/src/utils/auth-route-group.test.ts
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'

describe('AUTH_LAYOUT template', () => {
  it('centers children with flex', () => {
    const src = readFileSync(
      resolve(__dirname, 'auth-route-group.ts'),
      'utf-8',
    )
    expect(src).toContain('flex items-center justify-center')
  })

  it('has padding for mobile', () => {
    const src = readFileSync(
      resolve(__dirname, 'auth-route-group.ts'),
      'utf-8',
    )
    expect(src).toContain('p-4')
  })
})
```

**Step 2: Run test to verify it fails**

Run: `pnpm vitest run packages/cli/src/utils/auth-route-group.test.ts`
Expected: FAIL — current AUTH_LAYOUT has no flex centering

**Step 3: Write minimal implementation**

In `packages/cli/src/utils/auth-route-group.ts`, change line 16 from:
```typescript
    <div className="min-h-svh bg-muted">
```
to:
```typescript
    <div className="min-h-svh bg-muted flex items-center justify-center p-4">
```

**Step 4: Run test to verify it passes**

Run: `pnpm vitest run packages/cli/src/utils/auth-route-group.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/cli/src/utils/auth-route-group.ts packages/cli/src/utils/auth-route-group.test.ts
git commit -m "fix: center auth layout content (login/register pages)"
```

---

### Task 2: Quality check shows stale issues after AI fix

**Files:**
- Modify: `packages/cli/src/commands/chat/modification-handler.ts:620-652`

The `issues` variable (line 620) is computed before the AI auto-fix, but `formatIssues(issues)` (line 648) uses it after. When AI fix succeeds and `recheck` contains fewer errors, `issues` must be reassigned.

This is not easily unit-testable (requires AI provider mock). Verify via `pnpm build && pnpm typecheck`.

**Step 1: Implement the fix**

In `packages/cli/src/commands/chat/modification-handler.ts`, the variable `issues` on line 620 must be declared with `let` instead of `const`. Then after the AI fix succeeds (line 639), reassign it:

Change line 620 from:
```typescript
          const issues = validatePageQuality(codeToWrite)
```
to:
```typescript
          let issues = validatePageQuality(codeToWrite)
```

After line 639 (`console.log(chalk.green(...))`), add:
```typescript
                    issues = recheck
```

**Step 2: Build and typecheck**

Run: `pnpm build && pnpm typecheck`
Expected: PASS (no type errors)

**Step 3: Run full test suite**

Run: `pnpm test`
Expected: All tests pass (no regressions)

**Step 4: Commit**

```bash
git add packages/cli/src/commands/chat/modification-handler.ts
git commit -m "fix: show post-fix quality issues instead of stale pre-fix state"
```

---

### Task 3: Second autoFixCode pass after AI fix

**Files:**
- Modify: `packages/cli/src/commands/chat/modification-handler.ts:636-640`

After AI fix writes `fixedCode`, run `autoFixCode` again to catch residual issues (raw colors, native elements) in AI-generated fix code.

**Step 1: Implement the fix**

In `packages/cli/src/commands/chat/modification-handler.ts`, after line 637 (`codeToWrite = fixedCode`), before `await writeFile(filePath, codeToWrite)` (line 638), insert:

```typescript
                    const { code: reFixed, fixes: reFixes } = await autoFixCode(codeToWrite)
                    if (reFixes.length > 0) {
                      codeToWrite = reFixed
                      postFixes.push(...reFixes)
                    }
```

Also re-run `validatePageQuality` after the second autofix to update `issues`:
```typescript
                    issues = validatePageQuality(codeToWrite)
```

**Step 2: Build and typecheck**

Run: `pnpm build && pnpm typecheck`
Expected: PASS

**Step 3: Run full test suite**

Run: `pnpm test`
Expected: All tests pass

**Step 4: Commit**

```bash
git add packages/cli/src/commands/chat/modification-handler.ts
git commit -m "feat: run autoFixCode second pass after AI quality fix"
```

---

### Task 4: SKIPPED_HEADING — downgrade for Card contexts

**Files:**
- Modify: `packages/cli/src/utils/quality-validator.ts:305-317`
- Test: `packages/cli/src/utils/quality-validator.test.ts`

**Step 1: Write the failing test**

Add to `packages/cli/src/utils/quality-validator.test.ts`:

```typescript
describe('SKIPPED_HEADING in Card context', () => {
  it('downgrades to info when h3 is inside Card components', () => {
    const code = `
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
export default function Dashboard() {
  return (
    <div className="space-y-6">
      <h1>Dashboard</h1>
      <Card>
        <CardHeader><CardTitle>Active Projects</CardTitle></CardHeader>
        <CardContent><h3>Project Alpha</h3></CardContent>
      </Card>
    </div>
  )
}`
    const issues = validatePageQuality(code)
    const skipped = issues.filter(i => i.type === 'SKIPPED_HEADING')
    expect(skipped.length).toBe(1)
    expect(skipped[0].severity).toBe('info')
  })

  it('keeps warning severity when h3 is NOT inside Card', () => {
    const code = `
export default function Page() {
  return (
    <div className="space-y-6">
      <h1>Title</h1>
      <h3>Subtitle without h2</h3>
    </div>
  )
}`
    const issues = validatePageQuality(code)
    const skipped = issues.filter(i => i.type === 'SKIPPED_HEADING')
    expect(skipped.length).toBe(1)
    expect(skipped[0].severity).toBe('warning')
  })
})
```

**Step 2: Run test to verify it fails**

Run: `pnpm vitest run packages/cli/src/utils/quality-validator.test.ts -t "SKIPPED_HEADING in Card context"`
Expected: FAIL — first test expects 'info' but gets 'warning'

**Step 3: Write minimal implementation**

In `packages/cli/src/utils/quality-validator.ts`, replace lines 305–317:

```typescript
  const headingLevels = [...code.matchAll(/<h([1-6])[\s>]/g)].map(m => parseInt(m[1]))
  const hasCardContext = /\bCard\b|\bCardTitle\b|\bCardHeader\b/.test(code)
  for (let i = 1; i < headingLevels.length; i++) {
    if (headingLevels[i] > headingLevels[i - 1] + 1) {
      issues.push({
        line: 0,
        type: 'SKIPPED_HEADING',
        message: `Heading level skipped: h${headingLevels[i - 1]} → h${headingLevels[i]} — don't skip levels`,
        severity: hasCardContext ? 'info' : 'warning',
      })
      break
    }
  }
```

**Step 4: Run test to verify it passes**

Run: `pnpm vitest run packages/cli/src/utils/quality-validator.test.ts -t "SKIPPED_HEADING in Card context"`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/cli/src/utils/quality-validator.ts packages/cli/src/utils/quality-validator.test.ts
git commit -m "fix: downgrade SKIPPED_HEADING to info when Card components present"
```

---

### Task 5: DOM nesting validation and autofix

**Files:**
- Modify: `packages/cli/src/utils/quality-validator.ts` (validatePageQuality + autoFixCode)
- Test: `packages/cli/src/utils/quality-validator.test.ts`

**Step 1: Write the failing tests**

Add to `packages/cli/src/utils/quality-validator.test.ts`:

```typescript
describe('DOM nesting validation', () => {
  it('detects Button inside Link without asChild', () => {
    const code = `
import Link from 'next/link'
import { Button } from '@/components/ui/button'
export default function Page() {
  return <Link href="/foo"><Button>Click</Button></Link>
}`
    const issues = validatePageQuality(code)
    const nesting = issues.filter(i => i.type === 'NESTED_INTERACTIVE')
    expect(nesting.length).toBeGreaterThanOrEqual(1)
    expect(nesting[0].severity).toBe('error')
  })

  it('allows Button with asChild inside Link', () => {
    const code = `
import Link from 'next/link'
import { Button } from '@/components/ui/button'
export default function Page() {
  return <Button asChild><Link href="/foo">Click</Link></Button>
}`
    const issues = validatePageQuality(code)
    const nesting = issues.filter(i => i.type === 'NESTED_INTERACTIVE')
    expect(nesting.length).toBe(0)
  })

  it('detects nested anchor tags', () => {
    const code = `
export default function Page() {
  return <a href="/outer"><div><a href="/inner">Nested</a></div></a>
}`
    const issues = validatePageQuality(code)
    const nesting = issues.filter(i => i.type === 'NESTED_INTERACTIVE')
    expect(nesting.length).toBeGreaterThanOrEqual(1)
  })
})

describe('autoFixCode — DOM nesting fix', () => {
  it('adds asChild when Button is inside Link', async () => {
    const code = `import Link from 'next/link'
import { Button } from '@/components/ui/button'
export default function Page() {
  return <Link href="/foo"><Button>Click</Button></Link>
}`
    const { code: fixed } = await autoFixCode(code)
    expect(fixed).toContain('asChild')
  })
})
```

**Step 2: Run test to verify it fails**

Run: `pnpm vitest run packages/cli/src/utils/quality-validator.test.ts -t "DOM nesting"`
Expected: FAIL — no NESTED_INTERACTIVE check exists

**Step 3: Write minimal implementation**

In `packages/cli/src/utils/quality-validator.ts`, add validation before `return issues` (around line 465):

```typescript
  // NESTED_INTERACTIVE: Button/button inside Link/a (without asChild)
  const linkBlockRe = /<(?:Link|a)\b[^>]*>[\s\S]*?<\/(?:Link|a)>/g
  let linkMatch
  while ((linkMatch = linkBlockRe.exec(code)) !== null) {
    const block = linkMatch[0]
    if (/<(?:Button|button)\b/.test(block) && !/asChild/.test(block)) {
      issues.push({
        line: 0,
        type: 'NESTED_INTERACTIVE',
        message: 'Button inside Link without asChild — causes DOM nesting error. Use <Button asChild><Link>...</Link></Button> instead',
        severity: 'error',
      })
      break
    }
  }

  // Nested <a> inside <a>
  const nestedAnchorRe = /<a\b[^>]*>[\s\S]*?<a\b/
  if (nestedAnchorRe.test(code)) {
    issues.push({
      line: 0,
      type: 'NESTED_INTERACTIVE',
      message: 'Nested <a> tags — causes DOM nesting error. Remove inner anchor or restructure',
      severity: 'error',
    })
  }
```

In `autoFixCode`, add before the cleanup section (around line 910):

```typescript
  // Fix Button inside Link → Button asChild wrapping Link
  const linkWithButtonRe = /(<(?:Link)\b[^>]*>)\s*(<Button\b(?![^>]*asChild)[^>]*>)([\s\S]*?)<\/Button>\s*<\/Link>/g
  const beforeLinkFix = fixed
  fixed = fixed.replace(linkWithButtonRe, (_match, linkOpen: string, buttonOpen: string, inner: string) => {
    const hrefMatch = linkOpen.match(/href="([^"]*)"/)
    const href = hrefMatch ? hrefMatch[1] : '/'
    const buttonWithAsChild = buttonOpen.replace('<Button', '<Button asChild')
    return `${buttonWithAsChild}<Link href="${href}">${inner.trim()}</Link></Button>`
  })
  if (fixed !== beforeLinkFix) {
    fixes.push('Link>Button → Button asChild>Link (DOM nesting fix)')
  }
```

**Step 4: Run test to verify it passes**

Run: `pnpm vitest run packages/cli/src/utils/quality-validator.test.ts -t "DOM nesting"`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/cli/src/utils/quality-validator.ts packages/cli/src/utils/quality-validator.test.ts
git commit -m "feat: add DOM nesting validation and autofix for Button inside Link"
```

---

### Task 6: autoFixCode RAW_COLOR in cn()/clsx()/cva()

**Files:**
- Modify: `packages/cli/src/utils/quality-validator.ts` (autoFixCode function, after line 749)
- Test: `packages/cli/src/utils/quality-validator.test.ts`

**Step 1: Write the failing tests**

Add to `packages/cli/src/utils/quality-validator.test.ts`:

```typescript
describe('autoFixCode — RAW_COLOR in cn()/clsx()', () => {
  it('replaces raw colors inside cn() calls', async () => {
    const code = `import { cn } from '@/lib/utils'
export default function Page() {
  return <div className={cn("bg-emerald-500 p-4", active && "text-zinc-400")}>Test</div>
}`
    const { code: fixed, fixes } = await autoFixCode(code)
    expect(fixed).not.toContain('bg-emerald-500')
    expect(fixed).toContain('bg-primary')
    expect(fixed).not.toContain('text-zinc-400')
    expect(fixed).toContain('text-muted-foreground')
    expect(fixes).toContain('raw colors → semantic tokens')
  })

  it('replaces raw colors inside clsx() calls', async () => {
    const code = `import clsx from 'clsx'
export default function Page() {
  return <div className={clsx("text-amber-500")}>Test</div>
}`
    const { code: fixed } = await autoFixCode(code)
    expect(fixed).not.toContain('text-amber-500')
  })

  it('replaces raw colors in single-quoted className', async () => {
    const code = `export default function Page() {
  return <div className='bg-red-500 text-white'>Test</div>
}`
    const { code: fixed } = await autoFixCode(code)
    expect(fixed).not.toContain('bg-red-500')
    expect(fixed).toContain('bg-destructive')
  })

  it('replaces raw colors in template literal className', async () => {
    const code = 'export default function Page() {\n  return <div className={`bg-blue-600 ${active ? "p-4" : ""}`}>Test</div>\n}'
    const { code: fixed } = await autoFixCode(code)
    expect(fixed).not.toContain('bg-blue-600')
    expect(fixed).toContain('bg-primary')
  })
})
```

**Step 2: Run test to verify it fails**

Run: `pnpm vitest run packages/cli/src/utils/quality-validator.test.ts -t "RAW_COLOR in cn"`
Expected: FAIL — autoFixCode only handles `className="..."`

**Step 3: Write minimal implementation**

In `packages/cli/src/utils/quality-validator.ts`, after the existing `className="..."` color replacement block (after line 749, before the `<select>` fix), add:

```typescript
  // Raw colors in cn()/clsx()/cva() string arguments
  const cnCallRe = /(?:cn|clsx|cva)\(([^)]+)\)/g
  let hadCnColorFix = false
  fixed = fixed.replace(cnCallRe, (fullMatch, args: string) => {
    let result = args
    result = result.replace(accentColorRe, (m, prefix: string, color: string, shade: string) => {
      if (colorMap[m]) { hadCnColorFix = true; return colorMap[m] }
      const n = parseInt(shade)
      const isDestructive = color === 'red'
      if (prefix === 'bg') {
        if (n >= 500 && n <= 700) { hadCnColorFix = true; return isDestructive ? 'bg-destructive' : 'bg-primary' }
        if (n >= 100 && n <= 200) { hadCnColorFix = true; return isDestructive ? 'bg-destructive/10' : 'bg-primary/10' }
        if (n >= 300 && n <= 400) { hadCnColorFix = true; return isDestructive ? 'bg-destructive/20' : 'bg-primary/20' }
        if (n >= 800) { hadCnColorFix = true; return 'bg-muted' }
      }
      if (prefix === 'text') {
        if (n >= 400 && n <= 600) { hadCnColorFix = true; return isDestructive ? 'text-destructive' : 'text-primary' }
        if (n >= 100 && n <= 300) { hadCnColorFix = true; return 'text-foreground' }
        if (n >= 700) { hadCnColorFix = true; return 'text-foreground' }
      }
      if (prefix === 'border') { hadCnColorFix = true; return isDestructive ? 'border-destructive' : 'border-primary' }
      return m
    })
    result = result.replace(neutralColorRe, (m, prefix: string, _color: string, shade: string) => {
      if (colorMap[m]) { hadCnColorFix = true; return colorMap[m] }
      const n = parseInt(shade)
      if (prefix === 'bg') {
        if (n >= 800) { hadCnColorFix = true; return 'bg-background' }
        if (n >= 100 && n <= 300) { hadCnColorFix = true; return 'bg-muted' }
      }
      if (prefix === 'text') {
        if (n >= 100 && n <= 300) { hadCnColorFix = true; return 'text-foreground' }
        if (n >= 400 && n <= 600) { hadCnColorFix = true; return 'text-muted-foreground' }
      }
      if (prefix === 'border') { hadCnColorFix = true; return 'border-border' }
      return m
    })
    if (result !== args) return fullMatch.replace(args, result)
    return fullMatch
  })
  if (hadCnColorFix && !hadColorFix) fixes.push('raw colors → semantic tokens')

  // Single-quoted className
  fixed = fixed.replace(/className='([^']*)'/g, (fullMatch, classes: string, offset: number) => {
    if (isCodeContext(classes)) return fullMatch
    if (isInsideTerminalBlock(offset)) return fullMatch
    let result = classes
    result = result.replace(accentColorRe, (m, prefix: string, color: string, shade: string) => {
      if (colorMap[m]) { hadColorFix = true; return colorMap[m] }
      const n = parseInt(shade)
      const isDestructive = color === 'red'
      if (prefix === 'bg') {
        if (n >= 500 && n <= 700) { hadColorFix = true; return isDestructive ? 'bg-destructive' : 'bg-primary' }
        if (n >= 100 && n <= 200) { hadColorFix = true; return isDestructive ? 'bg-destructive/10' : 'bg-primary/10' }
        if (n >= 300 && n <= 400) { hadColorFix = true; return isDestructive ? 'bg-destructive/20' : 'bg-primary/20' }
        if (n >= 800) { hadColorFix = true; return 'bg-muted' }
      }
      if (prefix === 'text') {
        if (n >= 400 && n <= 600) { hadColorFix = true; return isDestructive ? 'text-destructive' : 'text-primary' }
        if (n >= 100 && n <= 300) { hadColorFix = true; return 'text-foreground' }
        if (n >= 700) { hadColorFix = true; return 'text-foreground' }
      }
      if (prefix === 'border') { hadColorFix = true; return isDestructive ? 'border-destructive' : 'border-primary' }
      return m
    })
    result = result.replace(neutralColorRe, (m, prefix: string, _color: string, shade: string) => {
      if (colorMap[m]) { hadColorFix = true; return colorMap[m] }
      const n = parseInt(shade)
      if (prefix === 'bg') {
        if (n >= 800) { hadColorFix = true; return 'bg-background' }
        if (n >= 100 && n <= 300) { hadColorFix = true; return 'bg-muted' }
      }
      if (prefix === 'text') {
        if (n >= 100 && n <= 300) { hadColorFix = true; return 'text-foreground' }
        if (n >= 400 && n <= 600) { hadColorFix = true; return 'text-muted-foreground' }
      }
      if (prefix === 'border') { hadColorFix = true; return 'border-border' }
      return m
    })
    if (result !== classes) return `className='${result}'`
    return fullMatch
  })

  // Template literal className — replace raw colors in backtick strings after className=
  const templateClassRe = /className=\{`([^`]*)`\}/g
  fixed = fixed.replace(templateClassRe, (fullMatch, inner: string) => {
    let result = inner
    result = result.replace(accentColorRe, (m, prefix: string, color: string, shade: string) => {
      if (colorMap[m]) { hadColorFix = true; return colorMap[m] }
      const n = parseInt(shade)
      const isDestructive = color === 'red'
      if (prefix === 'bg') {
        if (n >= 500 && n <= 700) { hadColorFix = true; return isDestructive ? 'bg-destructive' : 'bg-primary' }
        if (n >= 100 && n <= 200) { hadColorFix = true; return isDestructive ? 'bg-destructive/10' : 'bg-primary/10' }
        if (n >= 300 && n <= 400) { hadColorFix = true; return isDestructive ? 'bg-destructive/20' : 'bg-primary/20' }
        if (n >= 800) { hadColorFix = true; return 'bg-muted' }
      }
      if (prefix === 'text') {
        if (n >= 400 && n <= 600) { hadColorFix = true; return isDestructive ? 'text-destructive' : 'text-primary' }
        if (n >= 100 && n <= 300) { hadColorFix = true; return 'text-foreground' }
        if (n >= 700) { hadColorFix = true; return 'text-foreground' }
      }
      if (prefix === 'border') { hadColorFix = true; return isDestructive ? 'border-destructive' : 'border-primary' }
      return m
    })
    result = result.replace(neutralColorRe, (m, prefix: string, _color: string, shade: string) => {
      if (colorMap[m]) { hadColorFix = true; return colorMap[m] }
      const n = parseInt(shade)
      if (prefix === 'bg') {
        if (n >= 800) { hadColorFix = true; return 'bg-background' }
        if (n >= 100 && n <= 300) { hadColorFix = true; return 'bg-muted' }
      }
      if (prefix === 'text') {
        if (n >= 100 && n <= 300) { hadColorFix = true; return 'text-foreground' }
        if (n >= 400 && n <= 600) { hadColorFix = true; return 'text-muted-foreground' }
      }
      if (prefix === 'border') { hadColorFix = true; return 'border-border' }
      return m
    })
    if (result !== inner) return `className={\`${result}\`}`
    return fullMatch
  })
```

**Important:** The `accentColorRe` and `neutralColorRe` variables are defined inside the `className="..."` replacement block and need to be extracted to a shared scope or the patterns need to be reused. Refactor the color replacement logic into a helper function `replaceRawColors(classes: string): { result: string; changed: boolean }` to avoid code duplication.

**Step 4: Run test to verify it passes**

Run: `pnpm vitest run packages/cli/src/utils/quality-validator.test.ts -t "RAW_COLOR in cn"`
Expected: PASS

**Step 5: Run full test suite and commit**

Run: `pnpm test`
Expected: All tests pass

```bash
git add packages/cli/src/utils/quality-validator.ts packages/cli/src/utils/quality-validator.test.ts
git commit -m "feat: autofix RAW_COLOR in cn()/clsx()/single-quote/template literal className"
```

---

### Task 7: Phase 1 planner — detect navType from prompt

**Files:**
- Modify: `packages/cli/src/agents/modifier.ts:123-148` (buildPlanOnlyPrompt)
- Modify: `packages/cli/src/commands/chat/split-generator.ts:100-110` (parse navType)
- Test: `packages/cli/src/commands/chat/split-generator.test.ts` (create or extend)

**Step 1: Write the failing test**

```typescript
// packages/cli/src/commands/chat/split-generator.test.ts (or add to existing)
import { describe, it, expect } from 'vitest'

describe('parseNavTypeFromPlan', () => {
  it('extracts sidebar navType from plan response', () => {
    const { parseNavTypeFromPlan } = require('./split-generator')
    const planResult = {
      requests: [
        { type: 'add-page', changes: { id: 'dashboard', name: 'Dashboard', route: '/dashboard' } },
      ],
      navigation: { type: 'sidebar' },
    }
    expect(parseNavTypeFromPlan(planResult)).toBe('sidebar')
  })

  it('defaults to header when no navigation field', () => {
    const { parseNavTypeFromPlan } = require('./split-generator')
    const planResult = {
      requests: [
        { type: 'add-page', changes: { id: 'home', name: 'Home', route: '/' } },
      ],
    }
    expect(parseNavTypeFromPlan(planResult)).toBe('header')
  })

  it('defaults to header for invalid navType', () => {
    const { parseNavTypeFromPlan } = require('./split-generator')
    const planResult = {
      requests: [],
      navigation: { type: 'invalid-type' },
    }
    expect(parseNavTypeFromPlan(planResult)).toBe('header')
  })
})
```

**Step 2: Run test to verify it fails**

Run: `pnpm vitest run packages/cli/src/commands/chat/split-generator.test.ts -t "parseNavTypeFromPlan"`
Expected: FAIL — function does not exist

**Step 3: Write minimal implementation**

In `packages/cli/src/commands/chat/split-generator.ts`, add and export:

```typescript
const VALID_NAV_TYPES = new Set(['header', 'sidebar', 'both'])

export function parseNavTypeFromPlan(planResult: Record<string, unknown>): 'header' | 'sidebar' | 'both' {
  const nav = planResult.navigation as Record<string, unknown> | undefined
  if (nav && typeof nav.type === 'string' && VALID_NAV_TYPES.has(nav.type)) {
    return nav.type as 'header' | 'sidebar' | 'both'
  }
  return 'header'
}
```

In `splitGeneratePages`, after line 110 (`return { name, id, route }`), add logic to extract and apply navType:

```typescript
    const detectedNavType = parseNavTypeFromPlan(planResult as Record<string, unknown>)
    if (detectedNavType !== 'header' && modCtx.config.navigation) {
      modCtx.config.navigation.type = detectedNavType
    }
```

In `packages/cli/src/agents/modifier.ts`, extend `buildPlanOnlyPrompt` (lines 130–148). Add to the JSON schema:

```
Return ONLY a JSON object with this structure:
{
  "requests": [
    { "type": "add-page", "target": "new", "changes": { "id": "page-id", "name": "Page Name", "route": "/page-route" } }
  ],
  "navigation": {
    "type": "header"
  }
}
```

Add to Rules:
```
- Navigation type detection:
  * If user mentions "sidebar", "side menu", "left panel", "admin panel", or app has 6+ main sections → "sidebar"
  * If user mentions "header nav", "top navigation", or app is simple (< 6 sections) → "header"
  * If complex multi-level (header + sidebar needed) → "both"
  * Default: "header"
```

**Step 4: Run test to verify it passes**

Run: `pnpm vitest run packages/cli/src/commands/chat/split-generator.test.ts -t "parseNavTypeFromPlan"`
Expected: PASS

**Step 5: Build, typecheck, full test, commit**

Run: `pnpm build && pnpm typecheck && pnpm test`
Expected: All pass

```bash
git add packages/cli/src/agents/modifier.ts packages/cli/src/commands/chat/split-generator.ts packages/cli/src/commands/chat/split-generator.test.ts
git commit -m "feat: Phase 1 planner detects navType (sidebar/header/both) from prompt"
```

---

### Task 8: Landing page detection — no redirect when /dashboard exists

**Files:**
- Modify: `packages/cli/src/commands/chat/split-generator.ts:148-177` (Phase 2 logic)
- Modify: `packages/cli/src/agents/modifier.ts:312` (prompt rule)

**Step 1: Implement the fix**

In `packages/cli/src/commands/chat/split-generator.ts`, the Phase 2 prompt (line 157) currently tells AI to generate a home page that "sets the design direction for the entire site" with `<header>` and `<footer>`. This already generates a landing page when AI cooperates.

The problem is that `detectAndFixSpaHomePage` (called in modification-handler.ts) converts the home page to a redirect. We need to prevent this when a `/dashboard` page exists.

In `packages/cli/src/commands/chat/modification-handler.ts`, find where `detectAndFixSpaHomePage` is called for `add-page` case. Add a guard: if the full page set includes `/dashboard`, skip SPA detection for the home page.

The detection info is available from the pages list. Add a parameter or check:

```typescript
            const hasDashboardPage = dsm.getConfig().pages.some((p: any) => p.route === '/dashboard')
            if (!hasDashboardPage) {
              const { code: spaFixed, fixed: spaWasFixed } = detectAndFixSpaHomePage(codeToWrite, route)
              if (spaWasFixed) {
                codeToWrite = spaFixed
                autoFixes.push('replaced SPA-style home page with redirect to /dashboard')
              }
            }
```

In `packages/cli/src/agents/modifier.ts`, update line 312:
```
- The home page (route "/") should be a simple redirect using next/navigation redirect('/dashboard') — OR a standalone landing page. NEVER a multi-view SPA.
```
to:
```
- The home page (route "/"): When BOTH "/" and "/dashboard" exist, "/" MUST be a full landing page with hero section, features, pricing, and CTA buttons linking to /login and /register — NOT a redirect. When "/" is the ONLY page, it can be a redirect to /dashboard. NEVER a multi-view SPA.
```

**Step 2: Build, typecheck, full test**

Run: `pnpm build && pnpm typecheck && pnpm test`
Expected: All pass

**Step 3: Commit**

```bash
git add packages/cli/src/commands/chat/modification-handler.ts packages/cli/src/agents/modifier.ts
git commit -m "feat: generate landing page instead of redirect when /dashboard exists"
```

---

### Task 9: Prompt improvements — dropdown colors, inline nav, DOM nesting

**Files:**
- Modify: `packages/cli/src/agents/design-constraints.ts:426-432` (DROPDOWN MENU rules)
- Modify: `packages/cli/src/agents/modifier.ts:295-296` (layout contract)

**Step 1: Implement prompt additions**

In `packages/cli/src/agents/design-constraints.ts`, after line 429 (`Destructive item: className="text-destructive" at bottom, separated.`), add:

```
- NON-DESTRUCTIVE items: NEVER apply text color classes. Use default text-foreground. No text-amber, text-orange, text-yellow on menu items.
```

In `packages/cli/src/agents/modifier.ts`, after line 295 (the `<header>, <nav>, or <footer>` rule), strengthen:

```
- NEVER generate a sidebar panel, navigation column, or left-side navigation inside pageCode. Sidebar navigation is handled by the layout system via shared Sidebar component. If the user mentions "sidebar", it will be rendered by app/(app)/layout.tsx — do NOT recreate it inside the page.
```

In `packages/cli/src/agents/modifier.ts`, after line 323 (the asChild rule), add:

```
- DOM NESTING: NEVER nest interactive elements. No <Button> inside <Link>, no <a> inside <a>, no <button> inside <button>. For clickable cards with internal buttons, use onClick on the card wrapper — NOT <Link> wrapping the entire card.
```

**Step 2: Build and typecheck**

Run: `pnpm build && pnpm typecheck`
Expected: PASS

**Step 3: Commit**

```bash
git add packages/cli/src/agents/design-constraints.ts packages/cli/src/agents/modifier.ts
git commit -m "fix: prompt rules for dropdown colors, inline nav prohibition, DOM nesting"
```

---

## Verification

After all 9 tasks, run the full CI pipeline:

```bash
pnpm build && pnpm format:check && pnpm lint && pnpm typecheck && pnpm test
```

All must pass. Fix any formatting issues with `npx prettier --write <file>`.

## Summary

| Task | Type | Risk | Estimated Effort |
|------|------|------|-----------------|
| 1. Auth layout centering | Bug fix | Low | 5 min |
| 2. Stale quality display | Bug fix | Low | 5 min |
| 3. Second autoFixCode pass | Enhancement | Low | 5 min |
| 4. SKIPPED_HEADING card context | Refinement | Low | 10 min |
| 5. DOM nesting validation | New feature | Medium | 15 min |
| 6. RAW_COLOR in cn()/clsx() | Bug fix | Medium | 20 min |
| 7. Phase 1 navType detection | New feature | Medium | 15 min |
| 8. Landing page detection | Enhancement | Low | 10 min |
| 9. Prompt improvements | Enhancement | Low | 5 min |
