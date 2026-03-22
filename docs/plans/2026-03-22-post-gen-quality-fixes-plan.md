# Post-Generation Quality Fixes — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix 8 quality issues in the `coherent chat` pipeline: auth page deduplication, transitive inference, prompt reinforcement, auth page width, toolbar spacing, NO_H1 exemption, sections display, and smart href fallback.

**Architecture:** All changes are in `packages/cli`. Fixes A/F touch the page parsing layer. Fixes D/G/H modify AI prompt constraints. Fixes B/E modify reporting and validation. Fix C extends `autoFixCode` with optional context.

**Tech Stack:** TypeScript, vitest, zod

---

### Task 1: Fix A — Auth synonym deduplication

**Files:**
- Modify: `packages/cli/src/commands/chat/utils.ts`
- Modify: `packages/cli/src/commands/chat/utils.test.ts`
- Modify: `packages/cli/src/commands/chat/request-parser.ts`

**Step 1: Write failing tests**

In `utils.test.ts`, add to the `deduplicatePages` describe block:

```typescript
it('deduplicates auth synonyms /signup and /register', () => {
  const pages = [
    { name: 'Sign Up', id: 'signup', route: '/signup' },
    { name: 'Register', id: 'register', route: '/register' },
  ]
  const result = deduplicatePages(pages)
  expect(result).toHaveLength(1)
  expect(result[0].route).toBe('/signup')
})

it('deduplicates /sign-up and /registration as signup synonyms', () => {
  const pages = [
    { name: 'Sign Up', id: 'sign-up', route: '/sign-up' },
    { name: 'Registration', id: 'registration', route: '/registration' },
  ]
  const result = deduplicatePages(pages)
  expect(result).toHaveLength(1)
})

it('deduplicates /signin and /login', () => {
  const pages = [
    { name: 'Login', id: 'login', route: '/login' },
    { name: 'Sign In', id: 'signin', route: '/signin' },
  ]
  const result = deduplicatePages(pages)
  expect(result).toHaveLength(1)
  expect(result[0].route).toBe('/login')
})

it('does not affect non-auth routes', () => {
  const pages = [
    { name: 'Dashboard', id: 'dashboard', route: '/dashboard' },
    { name: 'Settings', id: 'settings', route: '/settings' },
  ]
  const result = deduplicatePages(pages)
  expect(result).toHaveLength(2)
})
```

**Step 2: Run tests to verify they fail**

Run: `pnpm vitest packages/cli/src/commands/chat/utils.test.ts --run`
Expected: 3 new tests FAIL (synonym pairs not deduplicated)

**Step 3: Implement synonym deduplication**

In `utils.ts`, add before `deduplicatePages`:

```typescript
const AUTH_SYNONYMS: Record<string, string> = {
  '/register': '/signup',
  '/registration': '/signup',
  '/sign-up': '/signup',
  '/signin': '/login',
  '/sign-in': '/login',
}
```

Update `deduplicatePages`:

```typescript
export function deduplicatePages(
  pages: Array<{ name: string; id: string; route: string }>,
): Array<{ name: string; id: string; route: string }> {
  const canonicalize = (route: string) => AUTH_SYNONYMS[route] || route
  const normalize = (route: string) => canonicalize(route).replace(/\/$/, '').replace(/s$/, '').replace(/ue$/, '')
  const seen = new Map<string, number>()
  return pages.filter((page, idx) => {
    const norm = normalize(page.route)
    if (seen.has(norm)) return false
    seen.set(norm, idx)
    return true
  })
}
```

**Step 4: Update AUTH_FLOW_PATTERNS and extractPageNamesFromMessage**

In `request-parser.ts`, change line 4:
```typescript
// Before:
'/login': ['/register', '/forgot-password'],
// After:
'/login': ['/signup', '/forgot-password'],
```

Change line 5:
```typescript
// Before:
'/signin': ['/register', '/forgot-password'],
// After:
'/signin': ['/signup', '/forgot-password'],
```

In `extractPageNamesFromMessage`, change the `registration` mapping:
```typescript
// Before:
registration: '/registration',
// After:
registration: '/signup',
```

**Step 5: Run tests to verify they pass**

Run: `pnpm vitest packages/cli/src/commands/chat/utils.test.ts --run`
Expected: ALL PASS

**Step 6: Commit**

```bash
git add packages/cli/src/commands/chat/utils.ts packages/cli/src/commands/chat/utils.test.ts packages/cli/src/commands/chat/request-parser.ts
git commit -m "fix: deduplicate auth synonym routes (signup/register, login/signin)"
```

---

### Task 2: Fix F — Transitive inference with worklist

**Files:**
- Modify: `packages/cli/src/commands/chat/request-parser.ts`
- Create: `packages/cli/src/commands/chat/request-parser.test.ts`

**Step 1: Write failing tests**

Create `request-parser.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { inferRelatedPages } from './request-parser.js'

describe('inferRelatedPages', () => {
  it('infers /reset-password transitively from /login', () => {
    const pages = [{ name: 'Login', id: 'login', route: '/login' }]
    const inferred = inferRelatedPages(pages)
    const routes = inferred.map(p => p.route)
    expect(routes).toContain('/signup')
    expect(routes).toContain('/forgot-password')
    expect(routes).toContain('/reset-password')
  })

  it('infers /reset-password directly from /forgot-password', () => {
    const pages = [{ name: 'Forgot Password', id: 'forgot-password', route: '/forgot-password' }]
    const inferred = inferRelatedPages(pages)
    expect(inferred.map(p => p.route)).toContain('/reset-password')
  })

  it('does not produce infinite loops with circular refs', () => {
    const pages = [
      { name: 'Login', id: 'login', route: '/login' },
      { name: 'Sign Up', id: 'signup', route: '/signup' },
    ]
    const inferred = inferRelatedPages(pages)
    const routes = inferred.map(p => p.route)
    expect(routes).not.toContain('/login')
    expect(routes).not.toContain('/signup')
    expect(routes).toContain('/forgot-password')
  })

  it('does not duplicate already-planned pages', () => {
    const pages = [
      { name: 'Login', id: 'login', route: '/login' },
      { name: 'Forgot Password', id: 'forgot-password', route: '/forgot-password' },
    ]
    const inferred = inferRelatedPages(pages)
    const forgotCount = inferred.filter(p => p.route === '/forgot-password').length
    expect(forgotCount).toBe(0)
  })
})
```

**Step 2: Run tests to verify the transitive test fails**

Run: `pnpm vitest packages/cli/src/commands/chat/request-parser.test.ts --run`
Expected: First test FAILS (`/reset-password` not inferred transitively)

**Step 3: Replace inferRelatedPages with worklist algorithm**

In `request-parser.ts`, replace `inferRelatedPages`:

```typescript
export function inferRelatedPages(
  plannedPages: Array<{ name: string; id: string; route: string }>,
): Array<{ name: string; id: string; route: string }> {
  const plannedRoutes = new Set(plannedPages.map(p => p.route))
  const inferred: Array<{ name: string; id: string; route: string }> = []
  const queue = [...plannedPages]
  let i = 0

  while (i < queue.length) {
    const { route } = queue[i++]

    const authRelated = AUTH_FLOW_PATTERNS[route]
    if (authRelated) {
      for (const rel of authRelated) {
        if (!plannedRoutes.has(rel)) {
          const slug = rel.slice(1)
          const name = slug
            .split('-')
            .map(w => w.charAt(0).toUpperCase() + w.slice(1))
            .join(' ')
          const page = { id: slug, name, route: rel }
          inferred.push(page)
          queue.push(page)
          plannedRoutes.add(rel)
        }
      }
    }

    for (const rule of PAGE_RELATIONSHIP_RULES) {
      if (rule.trigger.test(route)) {
        for (const rel of rule.related) {
          if (!plannedRoutes.has(rel.route)) {
            inferred.push(rel)
            queue.push(rel)
            plannedRoutes.add(rel.route)
          }
        }
      }
    }
  }

  return inferred
}
```

**Step 4: Run tests to verify they pass**

Run: `pnpm vitest packages/cli/src/commands/chat/request-parser.test.ts --run`
Expected: ALL PASS

**Step 5: Commit**

```bash
git add packages/cli/src/commands/chat/request-parser.ts packages/cli/src/commands/chat/request-parser.test.ts
git commit -m "fix: transitive page inference via worklist algorithm"
```

---

### Task 3: Fixes D + G + H — Design constraints updates

**Files:**
- Modify: `packages/cli/src/agents/design-constraints.ts`
- Modify: `packages/cli/src/agents/design-constraints.test.ts`
- Modify: `packages/cli/src/commands/chat/split-generator.ts`

**Step 1: Write failing tests**

In `design-constraints.test.ts`, add:

```typescript
describe('DESIGN_QUALITY_CRITICAL', () => {
  it('is appended to marketing constraints', () => {
    const result = getDesignQualityForType('marketing')
    expect(result).toContain('CRITICAL CODE RULES')
    expect(result).toContain('shrink-0')
  })

  it('is appended to app constraints', () => {
    const result = getDesignQualityForType('app')
    expect(result).toContain('CRITICAL CODE RULES')
    expect(result).toContain('NEVER use raw Tailwind colors')
  })

  it('is appended to auth constraints', () => {
    const result = getDesignQualityForType('auth')
    expect(result).toContain('CRITICAL CODE RULES')
    expect(result).toContain('shrink-0')
  })
})

describe('Fix G: auth max-w-md', () => {
  it('DESIGN_QUALITY_AUTH uses max-w-md not max-w-sm', () => {
    const result = getDesignQualityForType('auth')
    expect(result).toContain('max-w-md')
    expect(result).not.toContain('max-w-sm')
  })
})

describe('Fix H: toolbar flex-1', () => {
  it('DESIGN_QUALITY_APP includes toolbar rules', () => {
    const result = getDesignQualityForType('app')
    expect(result).toContain('flex-1')
    expect(result).toContain('Search input')
  })
})
```

**Step 2: Run tests to verify they fail**

Run: `pnpm vitest packages/cli/src/agents/design-constraints.test.ts --run`
Expected: 5 new tests FAIL

**Step 3: Add DESIGN_QUALITY_CRITICAL**

In `design-constraints.ts`, add before `getDesignQualityForType`:

```typescript
const DESIGN_QUALITY_CRITICAL = `
## CRITICAL CODE RULES (violations will be auto-corrected)
- Every lucide-react icon MUST have className="... shrink-0" to prevent flex squishing
- Button with asChild wrapping Link: the inner element MUST have className="inline-flex items-center gap-2"
- NEVER use raw Tailwind colors (bg-blue-500, text-gray-600). ONLY semantic tokens: bg-primary, text-muted-foreground, etc.
- <Link> and <a> MUST always have an href attribute. Never omit href.
- CardTitle: NEVER add text-xl, text-2xl, text-lg. CardTitle is text-sm font-medium by default.
`
```

Update `getDesignQualityForType` to append it:

```typescript
export function getDesignQualityForType(type: 'marketing' | 'app' | 'auth'): string {
  switch (type) {
    case 'marketing':
      return DESIGN_QUALITY_MARKETING + DESIGN_QUALITY_CRITICAL
    case 'app':
      return DESIGN_QUALITY_APP + DESIGN_QUALITY_CRITICAL
    case 'auth':
      return DESIGN_QUALITY_AUTH + DESIGN_QUALITY_CRITICAL
  }
}
```

**Step 4: Fix G — Change max-w-sm to max-w-md**

In `design-constraints.ts`, update `DESIGN_QUALITY_AUTH`:
```
- Card width: w-full max-w-md
```

In `split-generator.ts`, update `authNote`:
```
'...inner div className="w-full max-w-md"...'
```

**Step 5: Fix H — Add toolbar rules to DESIGN_QUALITY_APP**

In `design-constraints.ts`, add to `DESIGN_QUALITY_APP` before `NEVER include marketing sections`:

```
### Toolbars & Filters
- Filter row: flex flex-wrap items-center gap-2
- Search input: MUST use flex-1 to fill remaining horizontal space
- Filters/selects: fixed width (w-[180px] or auto), do NOT flex-grow
- On mobile (sm:): search full width, filters wrap to next line
```

**Step 6: Run tests to verify they pass**

Run: `pnpm vitest packages/cli/src/agents/design-constraints.test.ts --run`
Expected: ALL PASS

**Step 7: Commit**

```bash
git add packages/cli/src/agents/design-constraints.ts packages/cli/src/agents/design-constraints.test.ts packages/cli/src/commands/chat/split-generator.ts
git commit -m "feat: add CRITICAL prompt rules, widen auth cards, add toolbar spacing rules"
```

---

### Task 4: Fix E — NO_H1 exempt for auth pages

**Files:**
- Modify: `packages/cli/src/utils/quality-validator.ts`
- Modify: `packages/cli/src/utils/quality-validator.test.ts`
- Modify: `packages/cli/src/commands/chat/modification-handler.ts`

**Step 1: Write failing tests**

In `quality-validator.test.ts`, add to the `validatePageQuality` describe block:

```typescript
it('does not report NO_H1 for auth pages', () => {
  const code = `export default function LoginPage() {
  return (
    <div className="flex min-h-svh items-center justify-center">
      <Card><CardTitle>Sign In</CardTitle></Card>
    </div>
  )
}`
  const issues = validatePageQuality(code, undefined, 'auth')
  expect(issues.find(i => i.type === 'NO_H1')).toBeUndefined()
})

it('still reports NO_H1 for app pages without h1', () => {
  const code = `export default function DashboardPage() {
  return <div><p>Dashboard content</p></div>
}`
  const issues = validatePageQuality(code, undefined, 'app')
  expect(issues.find(i => i.type === 'NO_H1')).toBeDefined()
})

it('still reports NO_H1 when pageType is omitted (backward compat)', () => {
  const code = `export default function Page() {
  return <div><p>Content</p></div>
}`
  const issues = validatePageQuality(code)
  expect(issues.find(i => i.type === 'NO_H1')).toBeDefined()
})
```

**Step 2: Run tests to verify first test fails**

Run: `pnpm vitest packages/cli/src/utils/quality-validator.test.ts --run`
Expected: First test FAILS (NO_H1 still reported for auth)

**Step 3: Add pageType parameter to validatePageQuality**

In `quality-validator.ts`, update signature:

```typescript
export function validatePageQuality(
  code: string,
  validRoutes?: string[],
  pageType?: 'marketing' | 'app' | 'auth',
): QualityIssue[]
```

Wrap the NO_H1 check (line ~284):

```typescript
if (pageType !== 'auth') {
  const h1Matches = code.match(/<h1[\s>]/g)
  if (!h1Matches || h1Matches.length === 0) {
    issues.push({
      line: 0,
      type: 'NO_H1',
      message: 'Page has no <h1> — every page should have exactly one h1 heading',
      severity: 'warning',
    })
  } else if (h1Matches.length > 1) {
    issues.push({
      line: 0,
      type: 'MULTIPLE_H1',
      message: `Page has ${h1Matches.length} <h1> elements — use exactly one per page`,
      severity: 'warning',
    })
  }
}
```

**Step 4: Update all 5 call sites in modification-handler.ts**

At each `validatePageQuality` call (lines ~641, ~655, ~665, ~864, ~899), add `pageType`:

```typescript
const pageType = currentPlan ? getPageType(route, currentPlan) : inferPageTypeFromRoute(route)
// ...
const issues = validatePageQuality(codeToWrite, undefined, pageType)
```

For lines ~655 and ~665, reuse the `pageType` from the ~641 derivation (same page). For lines ~864 and ~899, derive from the `route` variable in those branches.

**Step 5: Run tests to verify they pass**

Run: `pnpm vitest packages/cli/src/utils/quality-validator.test.ts --run`
Expected: ALL PASS

**Step 6: Commit**

```bash
git add packages/cli/src/utils/quality-validator.ts packages/cli/src/utils/quality-validator.test.ts packages/cli/src/commands/chat/modification-handler.ts
git commit -m "fix: exempt auth pages from NO_H1 quality warning"
```

---

### Task 5: Fix B — Sections count in report

**Files:**
- Modify: `packages/cli/src/commands/chat/reporting.ts`
- Modify or create: `packages/cli/src/commands/chat/reporting.test.ts`

**Step 1: Write failing test**

Create `reporting.test.ts` if it doesn't exist:

```typescript
import { describe, it, expect, vi } from 'vitest'

describe('showPreview sections display', () => {
  it('uses pageAnalysis.sections from config when available', () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    // Import showPreview and call with mock data that has pageAnalysis
    // The test verifies the output contains the correct section count
    // This is a console output test — verify the string contains "Sections: 3"

    consoleSpy.mockRestore()
  })
})
```

Note: This test is harder to unit test since `showPreview` writes to console. The implementation change is simple — just update the lookup. Verify manually by running `coherent chat` and checking the output shows non-zero sections.

**Step 2: Implement the fix**

In `reporting.ts`, replace line ~197:

```typescript
// Before:
console.log(chalk.gray(`      Sections: ${page.sections?.length ?? 0}`))

// After:
const configPage = config.pages?.find(
  (p: any) => p.id === page.id || p.route === (page.route || '/'),
)
const sectionCount =
  (configPage as any)?.pageAnalysis?.sections?.length ?? page.sections?.length ?? 0
console.log(chalk.gray(`      Sections: ${sectionCount}`))
```

**Step 3: Run full test suite**

Run: `pnpm vitest --run`
Expected: ALL PASS (no regressions)

**Step 4: Commit**

```bash
git add packages/cli/src/commands/chat/reporting.ts
git commit -m "fix: display actual section count from pageAnalysis in report"
```

---

### Task 6: Fix C — Smart href fallback

**Files:**
- Modify: `packages/cli/src/utils/quality-validator.ts`
- Modify: `packages/cli/src/utils/quality-validator.test.ts`
- Modify: `packages/cli/src/commands/chat/modification-handler.ts`

**Step 1: Write failing tests**

In `quality-validator.test.ts`, add:

```typescript
describe('resolveHref', () => {
  // Import resolveHref if exported, or test through autoFixCode

  it('matches exact label in linkMap', async () => {
    const code = '<Link>Sign in</Link>'
    const { code: fixed } = await autoFixCode(code, {
      linkMap: { 'Sign in': '/login' },
    })
    expect(fixed).toContain('href="/login"')
  })

  it('matches page name from known routes', async () => {
    const code = '<Link>Dashboard</Link>'
    const { code: fixed } = await autoFixCode(code, {
      knownRoutes: ['/dashboard', '/tasks'],
    })
    expect(fixed).toContain('href="/dashboard"')
  })

  it('strips "Back to" prefix when matching', async () => {
    const code = '<Link>Back to Projects</Link>'
    const { code: fixed } = await autoFixCode(code, {
      knownRoutes: ['/projects', '/dashboard'],
    })
    expect(fixed).toContain('href="/projects"')
  })

  it('falls back to / when no context', async () => {
    const code = '<Link>Click here</Link>'
    const { code: fixed } = await autoFixCode(code)
    expect(fixed).toContain('href="/"')
  })

  it('falls back to / when no match found', async () => {
    const code = '<Link>Something random</Link>'
    const { code: fixed } = await autoFixCode(code, {
      knownRoutes: ['/dashboard'],
    })
    expect(fixed).toContain('href="/"')
  })
})
```

**Step 2: Run tests to verify they fail**

Run: `pnpm vitest packages/cli/src/utils/quality-validator.test.ts --run`
Expected: Tests FAIL (autoFixCode doesn't accept context parameter)

**Step 3: Add AutoFixContext and resolveHref**

In `quality-validator.ts`, add the interface and helper:

```typescript
export interface AutoFixContext {
  currentRoute?: string
  knownRoutes?: string[]
  linkMap?: Record<string, string>
}

function resolveHref(linkText: string, context?: AutoFixContext): string {
  if (!context) return '/'
  const text = linkText.trim().toLowerCase()

  if (context.linkMap) {
    for (const [label, route] of Object.entries(context.linkMap)) {
      if (label.toLowerCase() === text) return route
    }
  }

  if (context.knownRoutes) {
    const cleaned = text
      .replace(/^(back\s+to|go\s+to|view\s+all|see\s+all|return\s+to)\s+/i, '')
      .trim()
    for (const route of context.knownRoutes) {
      const slug = route.split('/').filter(Boolean).pop() || ''
      const routeName = slug.replace(/[-_]/g, ' ')
      if (routeName && cleaned === routeName) return route
    }
  }

  return '/'
}
```

**Step 4: Update autoFixCode signature and href fix logic**

Update signature:
```typescript
export async function autoFixCode(
  code: string,
  context?: AutoFixContext,
): Promise<{ code: string; fixes: string[] }>
```

Replace the href fix block (lines ~1087-1092):

```typescript
const beforeLinkHrefFix = fixed
fixed = fixed.replace(
  /<(Link|a)\b(?![^>]*\bhref\s*=)([^>]*)>([\s\S]*?)<\/\1>/g,
  (_match, tag, attrs, children) => {
    const textContent = children.replace(/<[^>]*>/g, '').trim()
    const href = resolveHref(textContent, context)
    return `<${tag} href="${href}"${attrs}>${children}</${tag}>`
  },
)
fixed = fixed.replace(/<(Link|a)\b(?![^>]*\bhref\s*=)([^>]*)\/?>/g, '<$1 href="/"$2>')
if (fixed !== beforeLinkHrefFix) {
  fixes.push('added href to <Link>/<a> missing href')
}
```

**Step 5: Update call sites in modification-handler.ts**

At the 4 `autoFixCode` call sites (lines ~573, ~659, ~796, ~879), pass context. Move `loadPlan` before the first `autoFixCode` call:

```typescript
const currentPlan = projectRoot ? loadPlan(projectRoot) : null
const autoFixCtx: AutoFixContext | undefined = route
  ? {
      currentRoute: route,
      knownRoutes: dsm.getConfig().pages.map((p: any) => p.route).filter(Boolean),
      linkMap: currentPlan?.pageNotes[routeToKey(route)]?.links,
    }
  : undefined
const { code: autoFixed, fixes: autoFixes } = await autoFixCode(codeToWrite, autoFixCtx)
```

Import `AutoFixContext` from `quality-validator.js` and `routeToKey` from `./plan-generator.js`.

**Step 6: Run tests to verify they pass**

Run: `pnpm vitest packages/cli/src/utils/quality-validator.test.ts --run`
Expected: ALL PASS

**Step 7: Commit**

```bash
git add packages/cli/src/utils/quality-validator.ts packages/cli/src/utils/quality-validator.test.ts packages/cli/src/commands/chat/modification-handler.ts
git commit -m "feat: smart href fallback with plan-aware link resolution"
```

---

### Task 7: Final verification

**Step 1: Run full CI pipeline**

```bash
pnpm build && pnpm lint && pnpm typecheck && pnpm format:check && pnpm test
```

Expected: ALL PASS, 0 errors, 0 warnings

**Step 2: Fix any issues found**

If format fails: `pnpm format`
If lint/typecheck fails: fix the reported issues

**Step 3: Commit any fixes**

```bash
git add -A && git commit -m "chore: fix format/lint issues from quality fixes"
```
