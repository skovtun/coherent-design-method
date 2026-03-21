# Chat & Preview Bugfixes — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix 5 bugs discovered during end-to-end testing of `coherent chat` + `coherent preview` flow.

**Architecture:** Each bug is an independent task (except Bug 5 depends on Bug 1b). Fixes touch CLI commands, quality validators, AI prompt builders, and core schema. All follow TDD.

**Tech Stack:** TypeScript, Zod, vitest, pnpm monorepo (packages/core + packages/cli)

**Design spec:** `docs/plans/2026-03-21-chat-preview-bugfixes-design.md`

---

### Task 1: Bug 1b — Add homePagePlaceholder flag

**Files:**
- Modify: `packages/core/src/types/design-system.ts`
- Modify: `packages/cli/src/utils/minimal-config.ts`
- Modify: `packages/cli/src/commands/chat/split-generator.ts`
- Modify: `packages/cli/src/commands/chat.ts`
- Test: `packages/core/src/types/design-system.test.ts`
- Test: `packages/cli/src/commands/chat/split-generator.test.ts`

**Step 1: Write failing tests**

In `packages/core/src/types/design-system.test.ts`, add:

```typescript
it('settings accepts homePagePlaceholder boolean', () => {
  const config = DesignSystemConfigSchema.parse({
    ...minimalValid,
    settings: { ...minimalValid.settings, homePagePlaceholder: true },
  })
  expect(config.settings.homePagePlaceholder).toBe(true)
})

it('settings defaults homePagePlaceholder to false', () => {
  const config = DesignSystemConfigSchema.parse(minimalValid)
  expect(config.settings.homePagePlaceholder).toBe(false)
})
```

In `packages/cli/src/commands/chat/split-generator.test.ts`, add test:

```typescript
it('skips anchor reuse when homePagePlaceholder is true', async () => {
  // Mock config with homePagePlaceholder: true
  // Verify readAnchorPageCodeFromDisk is NOT called
  // Verify home page goes to AI generation
})
```

**Step 2: Run tests to verify they fail**

Run: `cd packages/core && npx vitest run src/types/design-system.test.ts`
Expected: FAIL — `homePagePlaceholder` not in schema

Run: `cd packages/cli && npx vitest run src/commands/chat/split-generator.test.ts`
Expected: FAIL — no homePagePlaceholder handling

**Step 3: Implement**

1. In `packages/core/src/types/design-system.ts`, add to settings schema:
   ```typescript
   homePagePlaceholder: z.boolean().default(false),
   ```

2. In `packages/cli/src/utils/minimal-config.ts`, set in `createMinimalConfig()`:
   ```typescript
   homePagePlaceholder: true,
   ```

3. In `packages/cli/src/commands/chat/split-generator.ts`, in `splitGeneratePages()` before the anchor reuse block (~line 211):
   ```typescript
   const isPlaceholder = config?.settings?.homePagePlaceholder === true
   if (projectRoot && remainingPages.length > 0 && !isPlaceholder) {
     const existingCode = readAnchorPageCodeFromDisk(projectRoot, homePage.route)
     // ... existing reuse logic
   }
   ```
   Note: `config` must be passed to `splitGeneratePages` or accessed via context. Check current function signature.

4. In `packages/cli/src/commands/chat.ts`, after the modification loop where pages are applied, add:
   ```typescript
   // Flip homePagePlaceholder after home page is generated
   for (const req of normalizedRequests) {
     const changes = req.changes as Record<string, unknown>
     if ((req.type === 'add-page' || req.type === 'update-page') &&
         changes?.route === '/' && changes?.pageCode) {
       if (updatedConfig.settings.homePagePlaceholder) {
         updatedConfig.settings.homePagePlaceholder = false
       }
     }
   }
   ```

**Step 4: Run tests to verify they pass**

Run: `pnpm test`
Expected: All pass

**Step 5: Commit**

```bash
git add -A && git commit -m "fix: skip anchor reuse for init welcome page (homePagePlaceholder flag)"
```

---

### Task 2: Bug 3 — Link missing href validation + autofix

**Files:**
- Modify: `packages/cli/src/utils/quality-validator.ts`
- Modify: `packages/cli/src/agents/design-constraints.ts`
- Test: `packages/cli/src/utils/quality-validator.test.ts`

**Step 1: Write failing tests**

In `packages/cli/src/utils/quality-validator.test.ts`, add:

```typescript
describe('LINK_MISSING_HREF', () => {
  it('detects <Link> without href', () => {
    const code = '<Link className="inline-flex items-center gap-2"><Plus /> New</Link>'
    const result = validatePageQuality(code, '/projects')
    expect(result.errors.some(e => e.code === 'LINK_MISSING_HREF')).toBe(true)
  })

  it('detects <a> without href', () => {
    const code = '<a className="underline">Click</a>'
    const result = validatePageQuality(code, '/projects')
    expect(result.errors.some(e => e.code === 'LINK_MISSING_HREF')).toBe(true)
  })

  it('does not flag <Link href="/foo">', () => {
    const code = '<Link href="/foo">Go</Link>'
    const result = validatePageQuality(code, '/projects')
    expect(result.errors.some(e => e.code === 'LINK_MISSING_HREF')).toBe(false)
  })

  it('does not flag <Link href={url}>', () => {
    const code = '<Link href={url}>Go</Link>'
    const result = validatePageQuality(code, '/projects')
    expect(result.errors.some(e => e.code === 'LINK_MISSING_HREF')).toBe(false)
  })
})

describe('autoFixCode Link href', () => {
  it('adds href="/" to <Link> without href', () => {
    const code = '<Link className="inline-flex"><Plus /> New</Link>'
    const fixed = autoFixCode(code)
    expect(fixed).toContain('<Link href="/" className="inline-flex">')
  })

  it('adds href="/" to <a> without href', () => {
    const code = '<a className="underline">Click</a>'
    const fixed = autoFixCode(code)
    expect(fixed).toContain('<a href="/" className="underline">')
  })

  it('does not modify <Link href="/foo">', () => {
    const code = '<Link href="/foo" className="text-blue-500">Go</Link>'
    const fixed = autoFixCode(code)
    expect(fixed).toBe(code)
  })
})
```

**Step 2: Run tests to verify they fail**

Run: `cd packages/cli && npx vitest run src/utils/quality-validator.test.ts`
Expected: FAIL — no LINK_MISSING_HREF rule, no autofix

**Step 3: Implement**

1. In `quality-validator.ts`, add validation rule in `validatePageQuality()`:
   ```typescript
   const linkWithoutHrefRe = /<(?:Link|a)\b(?![^>]*\bhref\s*=)[^>]*>/g
   let linkMatch: RegExpExecArray | null
   while ((linkMatch = linkWithoutHrefRe.exec(code)) !== null) {
     errors.push({
       code: 'LINK_MISSING_HREF',
       message: '<Link> or <a> without href prop — causes runtime errors',
       severity: 'error',
       line: 0,
     })
   }
   ```

2. In `autoFixCode()`, add fix before return:
   ```typescript
   // Fix <Link> and <a> without href — add href="/" as safe default
   code = code.replace(/<(Link|a)\b(?![^>]*\bhref\s*=)([^>]*)>/g, '<$1 href="/"$2>')
   ```

3. In `design-constraints.ts`, add to CORE_CONSTRAINTS:
   ```
   - CRITICAL: Every <Link> MUST have an href prop. Missing href causes runtime errors. Never use <Link className="..."> or <Button asChild><Link> without href.
   ```

**Step 4: Run tests to verify they pass**

Run: `pnpm test`
Expected: All pass

**Step 5: Commit**

```bash
git add -A && git commit -m "fix: detect and autofix <Link> without href prop"
```

---

### Task 3: Bug 4 — Auth layout normalization fix

**Files:**
- Modify: `packages/cli/src/commands/chat/modification-handler.ts` (2 locations)
- Modify: `packages/cli/src/agents/page-templates.ts`
- Modify: `packages/cli/src/commands/chat/split-generator.ts`
- Test: `packages/cli/src/commands/chat/split-generator.test.ts`

**Step 1: Write failing tests**

In split-generator.test.ts or a new test file, add:

```typescript
describe('auth page handling', () => {
  it('detectPageType returns register for register/signup', () => {
    expect(detectPageType('register')).toBe('register')
    expect(detectPageType('Register')).toBe('register')
    expect(detectPageType('signup')).toBe('register')
    expect(detectPageType('Sign Up')).toBe('register')
  })
})
```

For normalizePageWrapper skip, test that auth pages are not normalized (needs mock testing of the modification-handler flow or direct function test).

**Step 2: Run tests to verify they fail**

Run: `cd packages/cli && npx vitest run`
Expected: FAIL — detectPageType doesn't handle register

**Step 3: Implement**

1. In `modification-handler.ts`, find BOTH locations where `normalizePageWrapper` is called:
   - In `add-page` handler (~line 584): change `if (!isMarketingRoute(route))` to `if (!isMarketingRoute(route) && !isAuthRoute(route))`
   - In `update-page` handler (~line 791): same change
   Import `isAuthRoute` from `page-templates.js` if not already imported.

2. In `page-templates.ts`, add to `detectPageType()`:
   ```typescript
   if (/register|signup|sign.?up/.test(normalized)) return 'register'
   ```
   Add `PAGE_TEMPLATES.register` entry mirroring login.

3. In `split-generator.ts`, add auth-specific note to Phase 4 prompt when generating auth pages:
   ```typescript
   const isAuth = isAuthRoute(route)
   const authNote = isAuth
     ? 'For this auth page: use centered card layout. Do NOT use section containers or full-width wrappers. The auth layout already provides centering — just output the card content.'
     : undefined
   ```
   Add `authNote` to the prompt array.

**Step 4: Run tests to verify they pass**

Run: `pnpm test`
Expected: All pass

**Step 5: Commit**

```bash
git add -A && git commit -m "fix: skip normalizePageWrapper for auth routes, add register template"
```

---

### Task 4: Bug 1a — Post-regenerateLayout dependency scan

**Files:**
- Modify: `packages/cli/src/commands/chat/code-generator.ts`
- Modify: `packages/cli/src/commands/chat.ts`
- Modify: `packages/cli/src/commands/preview.ts`
- Test: `packages/cli/src/commands/chat/code-generator.test.ts`

**Step 1: Write failing tests**

In `code-generator.test.ts`, add:

```typescript
describe('scanAndInstallSharedDeps', () => {
  it('detects @/components/ui/sheet in header and installs it', async () => {
    // Create temp dir with header.tsx importing sheet
    // Call scanAndInstallSharedDeps
    // Verify installComponent('sheet') was called
  })

  it('skips already-installed components', async () => {
    // Create temp dir with header.tsx importing button
    // button.tsx already exists in components/ui/
    // Verify installComponent is NOT called
  })
})
```

**Step 2: Run tests to verify they fail**

Run: `cd packages/cli && npx vitest run src/commands/chat/code-generator.test.ts`
Expected: FAIL — scanAndInstallSharedDeps doesn't exist

**Step 3: Implement**

1. In `code-generator.ts`, add helper function:
   ```typescript
   export async function scanAndInstallSharedDeps(projectRoot: string): Promise<string[]> {
     const sharedDir = resolve(projectRoot, 'components', 'shared')
     if (!existsSync(sharedDir)) return []
     const installed: string[] = []
     const provider = getComponentProvider()
     const files = readdirSync(sharedDir).filter(f => f.endsWith('.tsx'))
     for (const file of files) {
       const code = readFileSync(resolve(sharedDir, file), 'utf-8')
       const imports = [...code.matchAll(/@\/components\/ui\/([a-z0-9-]+)/g)]
       for (const [, id] of imports) {
         const uiPath = resolve(projectRoot, 'components', 'ui', `${id}.tsx`)
         if (!existsSync(uiPath) && provider.has(id)) {
           await provider.installComponent(id, projectRoot)
           installed.push(id)
         }
       }
     }
     return installed
   }
   ```

2. Call it after `regenerateLayout` in `regenerateFiles()`.

3. In `chat.ts`, add a final dependency scan after all operations:
   ```typescript
   const finalInstalled = await scanAndInstallSharedDeps(projectRoot)
   if (finalInstalled.length > 0) {
     console.log(chalk.dim(`  Auto-installed shared deps: ${finalInstalled.join(', ')}`))
   }
   ```

4. In `preview.ts`, extend `fixMissingComponentExports` to scan `components/shared/` alongside `app/`.

**Step 4: Run tests to verify they pass**

Run: `pnpm test`
Expected: All pass

**Step 5: Commit**

```bash
git add -A && git commit -m "fix: scan and install shared component deps after layout regeneration"
```

---

### Task 5: Bug 2 — Empty pages retry gate + lightweight prompt

**Files:**
- Modify: `packages/cli/src/commands/chat/split-generator.ts`
- Modify: `packages/cli/src/agents/modifier.ts`
- Test: `packages/cli/src/commands/chat/split-generator.test.ts`

**Step 1: Write failing tests**

In `split-generator.test.ts`, add:

```typescript
it('retries when more than 5 pages are empty', async () => {
  // Mock parseModification to return empty pageCode for 6 pages
  // Verify retry logic runs (not skipped)
})
```

**Step 2: Run tests to verify they fail**

Run: `cd packages/cli && npx vitest run src/commands/chat/split-generator.test.ts`
Expected: FAIL — retry gate blocks 6+ empty pages

**Step 3: Implement**

1. In `split-generator.ts`, change retry gate:
   ```typescript
   // Before:
   if (emptyPages.length > 0 && emptyPages.length <= 5) {
   // After:
   if (emptyPages.length > 0) {
   ```

2. In `modifier.ts`, export a lightweight prompt builder:
   ```typescript
   export function buildLightweightPagePrompt(
     pageName: string,
     route: string,
     styleContext: string,
     sharedComponentsSummary?: string,
   ): string {
     return [
       `Generate complete pageCode for a page called "${pageName}" at route "${route}".`,
       `Output valid TSX with a default export React component.`,
       styleContext ? `Follow this style: ${styleContext}` : '',
       sharedComponentsSummary ? `Available shared components:\n${sharedComponentsSummary}` : '',
     ].filter(Boolean).join('\n\n')
   }
   ```

3. In the retry loop of `split-generator.ts`, use `buildLightweightPagePrompt` instead of the full `parseModification` prompt.

**Step 4: Run tests to verify they pass**

Run: `pnpm test`
Expected: All pass

**Step 5: Commit**

```bash
git add -A && git commit -m "fix: remove retry gate limit, use lightweight prompt for retries"
```

---

### Task 6: Bug 2 (continued) — Template fallbacks for team, tasks, etc.

**Files:**
- Create: `packages/core/src/generators/templates/pages/team.ts`
- Create: `packages/core/src/generators/templates/pages/tasks.ts`
- Create: `packages/core/src/generators/templates/pages/task-detail.ts`
- Create: `packages/core/src/generators/templates/pages/reset-password.ts`
- Modify: `packages/core/src/generators/templates/pages/index.ts`
- Modify: `packages/core/src/generators/templates/pages/types.ts`
- Modify: `packages/cli/src/commands/chat/modification-handler.ts`
- Modify: `packages/cli/src/agents/page-templates.ts`
- Test: `packages/core/src/generators/PageGenerator.test.ts`

**Step 1: Write failing tests**

In `PageGenerator.test.ts`, add tests for each new template:

```typescript
it('generates team page from template', () => {
  const fn = getTemplateForPageType('team')
  expect(fn).not.toBeNull()
  const code = fn!(defaultContent, defaultOpts)
  expect(code).toContain('export default')
})
```

Repeat for `tasks`, `task-detail`, `reset-password`.

**Step 2: Run tests to verify they fail**

Expected: FAIL — templates don't exist

**Step 3: Implement**

1. Create template files in `packages/core/src/generators/templates/pages/`:
   - `team.ts` — member cards grid
   - `tasks.ts` — task list with filters
   - `task-detail.ts` — task detail view
   - `reset-password.ts` — password reset form

2. Register in `index.ts` TEMPLATE_REGISTRY.

3. Add content types in `types.ts`.

4. In `modification-handler.ts`, add `profile` to `inferPageType`:
   ```typescript
   if (/profile|account/.test(normalized)) return 'profile'
   ```
   Also add: `team`, `tasks`, `task-detail`, `reset-password`.

5. In `page-templates.ts`, add prompt expansion entries for `team`, `tasks`, `task-detail`, `reset-password` in `PAGE_TEMPLATES` and corresponding patterns in `detectPageType()`.

**Step 4: Run tests to verify they pass**

Run: `pnpm test`
Expected: All pass

**Step 5: Commit**

```bash
git add -A && git commit -m "feat: add template fallbacks for team, tasks, task-detail, reset-password"
```

---

### Task 7: Bug 5 — Shared components prompt reinforcement

**Files:**
- Modify: `packages/cli/src/commands/chat/split-generator.ts`
- Modify: `packages/cli/src/agents/modifier.ts`
- Modify: `packages/cli/src/agents/design-constraints.ts`
- Test: `packages/cli/src/commands/chat/split-generator.test.ts`

**Step 1: Write failing tests**

In `split-generator.test.ts`, add:

```typescript
describe('shared components in Phase 4 prompt', () => {
  it('includes sharedComponentsNote when summary exists', () => {
    // Build Phase 4 prompt with sharedComponentsSummary set
    // Verify prompt contains "SHARED COMPONENTS — MANDATORY REUSE"
  })

  it('excludes sharedComponentsNote when summary is empty', () => {
    // Build Phase 4 prompt without sharedComponentsSummary
    // Verify prompt does NOT contain "SHARED COMPONENTS"
  })

  it('sharedLayoutNote and sharedComponentsNote are separate', () => {
    // Verify sharedLayoutNote mentions Header/Footer
    // Verify sharedComponentsNote mentions section/widget components
    // Both present but distinct
  })
})
```

**Step 2: Run tests to verify they fail**

Expected: FAIL — no separate sharedComponentsNote

**Step 3: Implement**

1. In `split-generator.ts`, split `sharedNote` into two:
   ```typescript
   const sharedLayoutNote =
     'Header and Footer are shared layout components rendered by the root layout. Do NOT include any site-wide <header>, <nav>, or <footer> in this page.'

   const sharedComponentsNote = parseOpts.sharedComponentsSummary
     ? `SHARED COMPONENTS — MANDATORY REUSE:\nBefore implementing any section, check this list. Import and use matching components from @/components/shared/. Do NOT re-implement these patterns inline.\n\n${parseOpts.sharedComponentsSummary}`
     : undefined
   ```
   Add both to the Phase 4 prompt array.

2. In `modifier.ts`, move `sharedSection` block higher — right after the initial instruction paragraph, before DESIGN_QUALITY rules.

3. In `design-constraints.ts`, add to CORE_CONSTRAINTS:
   ```
   - When shared components exist (@/components/shared/*), ALWAYS import and use them instead of re-implementing similar patterns inline.
   ```

**Step 4: Run tests to verify they pass**

Run: `pnpm test`
Expected: All pass

**Step 5: Commit**

```bash
git add -A && git commit -m "fix: reinforce shared component usage in AI prompts"
```

---

### Task 8: Final verification and cleanup

**Step 1: Run full CI pipeline**

```bash
pnpm build && pnpm format:check && pnpm lint && pnpm --filter '@getcoherent/*' typecheck && pnpm test
```

All must pass with exit code 0.

**Step 2: Fix any issues found**

**Step 3: Final commit and push**

```bash
git push origin main
```

---

## Task Summary

| Task | Bug | Description | Depends on |
|------|-----|-------------|------------|
| 1 | 1b | homePagePlaceholder flag | — |
| 2 | 3 | Link missing href validation + autofix | — |
| 3 | 4 | Auth layout normalization fix | — |
| 4 | 1a | Post-regenerateLayout dependency scan | — |
| 5 | 2 | Empty pages retry gate + lightweight prompt | — |
| 6 | 2 | Template fallbacks (team, tasks, etc.) | — |
| 7 | 5 | Shared components prompt reinforcement | Task 1 |
| 8 | — | Final verification | All |
