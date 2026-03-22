# Post-Generation Quality Fixes — Design Spec

**Date**: 2026-03-22
**Scope**: 6 fixes to improve `coherent chat` pipeline output quality
**Prerequisite**: `generateJSON` fix (already committed, needs npm publish)

---

## Context

After analyzing a full `coherent chat` run generating 14 pages for a SaaS app, six systematic issues were identified beyond the plan generation failure (already fixed via `generateJSON`).

---

## Fix A: Auth Synonym Deduplication

**Problem**: Both "Sign Up" (`/signup`) and "Register" (`/register`) are generated. The user gets two identical auth registration pages. Root causes:
1. `AUTH_FLOW_PATTERNS['/login']` infers `/register`
2. AI plan or message parsing can produce `/signup`
3. `deduplicatePages()` normalizes by removing trailing `/`, `s`, `ue` — but `/signup` and `/register` never collide

**Solution**: Add auth synonym groups to `deduplicatePages` and normalize `AUTH_FLOW_PATTERNS`.

**Changes**:

### File: `packages/cli/src/commands/chat/utils.ts`

Add a canonical synonym map before `deduplicatePages`:

```typescript
const AUTH_SYNONYMS: Record<string, string> = {
  '/register': '/signup',
  '/registration': '/signup',
  '/sign-up': '/signup',
  '/signin': '/login',
  '/sign-in': '/login',
}
```

Update `deduplicatePages` to apply synonym normalization BEFORE the existing normalize:

```typescript
export function deduplicatePages(
  pages: Array<{ name: string; id: string; route: string }>,
): Array<{ name: string; id: string; route: string }> {
  const canonicalize = (route: string) => AUTH_SYNONYMS[route] || route
  const normalize = (route: string) =>
    canonicalize(route).replace(/\/$/, '').replace(/s$/, '').replace(/ue$/, '')
  const seen = new Map<string, number>()
  return pages.filter((page, idx) => {
    const norm = normalize(page.route)
    if (seen.has(norm)) return false
    seen.set(norm, idx)
    return true
  })
}
```

### File: `packages/cli/src/commands/chat/request-parser.ts`

Normalize `AUTH_FLOW_PATTERNS` to use canonical routes:

```typescript
export const AUTH_FLOW_PATTERNS: Record<string, string[]> = {
  '/login': ['/signup', '/forgot-password'],
  '/signin': ['/signup', '/forgot-password'],
  '/signup': ['/login'],
  '/register': ['/login'],
  '/forgot-password': ['/login', '/reset-password'],
  '/reset-password': ['/login'],
}
```

Key change: `/login` now infers `/signup` instead of `/register`.

Also normalize `extractPageNamesFromMessage` to map `registration` → `/signup`:

```typescript
registration: '/signup',
```

(Currently maps to `/registration` which is yet another synonym.)

### Tests

- `deduplicatePages` keeps first synonym, drops second (`/signup` + `/register` → only `/signup`)
- `deduplicatePages` handles `/sign-up`, `/registration` as synonyms
- `AUTH_FLOW_PATTERNS['/login']` infers `/signup` not `/register`
- `extractPageNamesFromMessage('registration page')` returns route `/signup`
- Backward compat: non-auth routes unaffected

---

## Fix B: Sections Count in Report

**Problem**: Summary shows "Sections: 0" for every page. The sections data exists in `config.pages[].pageAnalysis.sections` (populated by `analyzePageCode()` after file write), but `showPreview` reads `request.changes.sections` which is always `[]`.

**Solution**: Look up the page in `config` and use `pageAnalysis.sections`.

### File: `packages/cli/src/commands/chat/reporting.ts`

Replace the sections display line (line ~197):

```typescript
// Before:
console.log(chalk.gray(`      Sections: ${page.sections?.length ?? 0}`))

// After:
const configPage = config.pages?.find(
  (p: any) => p.id === page.id || p.route === (page.route || '/')
)
const sectionCount =
  (configPage as any)?.pageAnalysis?.sections?.length ?? page.sections?.length ?? 0
console.log(chalk.gray(`      Sections: ${sectionCount}`))
```

### Tests

- `showPreview` displays correct section count when `config.pages` has `pageAnalysis.sections`
- Falls back to `page.sections.length` when `pageAnalysis` is missing
- Falls back to 0 when both are missing

---

## Fix C: Smart href Fallback

**Problem**: `autoFixCode` adds `href="/"` to every `<Link>` and `<a>` missing href. This is semantically wrong — "Back to Dashboard" should link to `/dashboard`, not `/`.

**Solution**: Extend `autoFixCode` with an optional context parameter for plan-aware + heuristic href resolution.

### File: `packages/cli/src/utils/quality-validator.ts`

#### Signature change

```typescript
export interface AutoFixContext {
  currentRoute?: string
  knownRoutes?: string[]
  linkMap?: Record<string, string>  // from plan pageNotes.links
}

export async function autoFixCode(
  code: string,
  context?: AutoFixContext,
): Promise<{ code: string; fixes: string[] }>
```

All existing call sites pass no context — behavior unchanged (fallback to `href="/"`).

#### New helper: `resolveHref`

```typescript
function resolveHref(
  linkText: string,
  context?: AutoFixContext
): string {
  if (!context) return '/'
  const text = linkText.trim().toLowerCase()

  // 1. Exact match in plan's link map
  if (context.linkMap) {
    for (const [label, route] of Object.entries(context.linkMap)) {
      if (label.toLowerCase() === text) return route
    }
  }

  // 2. Heuristic: link text matches a known page name
  if (context.knownRoutes) {
    // "Dashboard" → /dashboard, "Back to Projects" → /projects
    const cleaned = text
      .replace(/^(back\s+to|go\s+to|view\s+all|see\s+all|return\s+to)\s+/i, '')
      .trim()
    for (const route of context.knownRoutes) {
      const slug = route.split('/').filter(Boolean).pop() || ''
      const routeName = slug.replace(/[-_]/g, ' ')
      if (routeName && cleaned === routeName) return route
    }
  }

  // 3. Fallback
  return '/'
}
```

#### Updated href fix logic

Replace the current regex-only approach with a function that extracts link text:

```typescript
const beforeLinkHrefFix = fixed
fixed = fixed.replace(
  /<(Link|a)\b(?![^>]*\bhref\s*=)([^>]*)>([\s\S]*?)<\/\1>/g,
  (match, tag, attrs, children) => {
    const textContent = children.replace(/<[^>]*>/g, '').trim()
    const href = resolveHref(textContent, context)
    return `<${tag} href="${href}"${attrs}>${children}</${tag}>`
  }
)
// Handle self-closing or empty Link/a (no text to match)
fixed = fixed.replace(
  /<(Link|a)\b(?![^>]*\bhref\s*=)([^>]*)\/?>/g,
  '<$1 href="/"$2>'
)
if (fixed !== beforeLinkHrefFix) {
  fixes.push('added href to <Link>/<a> missing href')
}
```

### File: `packages/cli/src/commands/chat/modification-handler.ts`

At the 4 call sites for `autoFixCode`, pass context when available:

```typescript
const currentPlan = loadPlan(projectRoot)
const autoFixCtx: AutoFixContext = {
  currentRoute: route,
  knownRoutes: dsm.getConfig().pages.map((p: any) => p.route).filter(Boolean),
  linkMap: currentPlan?.pageNotes[routeToKey(route)]?.links,
}
const { code: autoFixed, fixes: autoFixes } = await autoFixCode(codeToWrite, autoFixCtx)
```

### Tests

- `resolveHref("Sign in", { linkMap: { "Sign in": "/login" } })` → `/login`
- `resolveHref("Dashboard", { knownRoutes: ["/dashboard", "/tasks"] })` → `/dashboard`
- `resolveHref("Back to Projects", { knownRoutes: ["/projects"] })` → `/projects`
- `resolveHref("Click here", {})` → `/` (fallback)
- `resolveHref("anything", undefined)` → `/` (no context)
- `autoFixCode` with context: correctly resolves href from link text
- `autoFixCode` without context: falls back to `href="/"`

---

## Fix D: Prompt Reinforcement for Recurring Auto-Fixes

**Problem**: The same auto-fixes apply on 8-11 of 14 pages:
- `added shrink-0 to icons` (11/14)
- `added inline-flex to Button asChild children` (8/14)
- `raw colors → semantic tokens` (4/14)

These rules already exist in `DESIGN_QUALITY_COMMON` but the AI doesn't follow them consistently.

**Solution**: Add a concise "CRITICAL RULES" section at the END of the design constraints (recency bias — AI pays more attention to rules near the end of the prompt).

### File: `packages/cli/src/agents/design-constraints.ts`

Add a `DESIGN_QUALITY_CRITICAL` constant appended by `getDesignQualityForType`:

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

### Tests

- `getDesignQualityForType('marketing')` includes "CRITICAL CODE RULES"
- `getDesignQualityForType('app')` includes "shrink-0"
- `getDesignQualityForType('auth')` includes "NEVER use raw Tailwind colors"

---

## Fix E: NO_H1 Exempt for Auth Pages

**Problem**: Auth pages (Login, Sign Up, Forgot Password, Reset Password) all get `[NO_H1] Page has no <h1>` warning. Auth pages use `CardTitle` instead of `h1`, and an `h1` heading would be inappropriate for a centered card login form.

**Solution**: Add optional `pageType` parameter to `validatePageQuality` and skip NO_H1 check for auth pages.

### File: `packages/cli/src/utils/quality-validator.ts`

#### Signature change

```typescript
export function validatePageQuality(
  code: string,
  validRoutes?: string[],
  pageType?: 'marketing' | 'app' | 'auth',
): QualityIssue[]
```

#### Guard the NO_H1 check

```typescript
// NO_H1: page should have exactly one h1 (skip for auth pages — they use CardTitle)
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
    // ... existing multiple h1 check
  }
}
```

### File: `packages/cli/src/commands/chat/modification-handler.ts`

At `validatePageQuality` call sites, pass `pageType`:

```typescript
const pageType = currentPlan ? getPageType(route, currentPlan) : inferPageTypeFromRoute(route)
const issues = validatePageQuality(codeToWrite, validRoutes, pageType)
```

### Tests

- `validatePageQuality(authCode, [], 'auth')` does NOT produce NO_H1 warning
- `validatePageQuality(appCode, [], 'app')` still produces NO_H1 when missing
- `validatePageQuality(code, [])` (no pageType) still produces NO_H1 when missing (backward compat)

---

## Fix F: inferRelatedPages Misses Reset Password

**Problem**: Phase 1 includes Forgot Password (`/forgot-password`) but Reset Password (`/reset-password`) doesn't appear until auto-scaffold at the end. `AUTH_FLOW_PATTERNS['/forgot-password']` includes `/reset-password`, but inference fails because of execution ordering.

**Root cause investigation needed**: The `inferRelatedPages` function checks `plannedRoutes` which should include `/forgot-password` at inference time. Two possible causes:

1. `/forgot-password` is added by the AI plan AFTER `inferRelatedPages` runs (AI plan step returns a list, then inference runs on a different list)
2. There's a race condition in how pages are accumulated

**Solution**: Investigate and fix the ordering. The fix depends on what the investigation reveals, but the expected outcome is:

### File: `packages/cli/src/commands/chat/split-generator.ts`

Ensure `inferRelatedPages` runs AFTER all sources of pages are merged:

```typescript
// Phase 1: Merge all page sources
const aiPages = await parseModification(...)  // AI plan
const messagePages = extractPageNamesFromMessage(message)
const merged = deduplicatePages([...aiPages, ...messagePages])

// Phase 1b: Infer related AFTER merge
const inferred = inferRelatedPages(merged).filter(p => !existingRoutes.has(p.route))
if (inferred.length > 0) {
  merged.push(...inferred)
}
const pageNames = deduplicatePages(merged)
```

If the ordering is already correct, the bug may be that `AUTH_FLOW_PATTERNS` uses the raw route `/forgot-password` but the planned page uses a different variant. Debug with logging.

### Tests

- When pages include `/forgot-password`, inference produces `/reset-password`
- When pages include `/login`, inference produces `/signup` and `/forgot-password`
- Transitive inference: `/login` → `/forgot-password` → `/reset-password` (may need two passes)
- No duplicates after inference + deduplication

---

## Implementation Order

1. **Fix A** (deduplication) — no dependencies, foundational
2. **Fix F** (inference ordering) — depends on A for synonym awareness
3. **Fix D** (prompt reinforcement) — standalone, simple
4. **Fix E** (NO_H1 exempt) — standalone, simple
5. **Fix B** (sections display) — standalone, simple
6. **Fix C** (smart href) — most complex, depends on plan data flow

## Summary of File Changes

| File | Fixes |
|------|-------|
| `packages/cli/src/commands/chat/utils.ts` | A (dedup synonyms) |
| `packages/cli/src/commands/chat/request-parser.ts` | A (AUTH_FLOW_PATTERNS), F (ordering investigation) |
| `packages/cli/src/commands/chat/reporting.ts` | B (sections from config) |
| `packages/cli/src/utils/quality-validator.ts` | C (smart href), E (NO_H1 pageType) |
| `packages/cli/src/agents/design-constraints.ts` | D (CRITICAL rules) |
| `packages/cli/src/commands/chat/modification-handler.ts` | C (pass context), E (pass pageType) |
| `packages/cli/src/commands/chat/split-generator.ts` | F (inference ordering) |
