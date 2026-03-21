# Chat & Preview Bugfixes — Design Spec

> 5 bugs identified from end-to-end testing of `coherent chat` + `coherent preview` flow.
> Each fix includes root cause, design, affected files, and testing approach.

---

## Bug 1b: Init Welcome Page Survives First Chat

### Root Cause

`readAnchorPageCodeFromDisk()` checks only code length (>120 chars). The init welcome page (~8000 chars) passes, so split-generator reuses it as the anchor instead of regenerating. The welcome page stays on disk permanently.

### Design

Add `homePagePlaceholder: z.boolean().default(false)` to `DesignSystemConfigSchema.settings`.

**Init side:**
- `createMinimalConfig()` sets `homePagePlaceholder: true`

**Chat side (split-generator.ts):**
- Before calling `readAnchorPageCodeFromDisk()`, check `config.settings.homePagePlaceholder`
- If `true` → skip anchor reuse, let Phase 2 generate the home page from scratch via AI
- After home page is successfully generated → set `homePagePlaceholder: false` and persist config

**Relationship to `initialized` flag:**
- `initialized` controls layout regeneration mode (full vs incremental)
- `homePagePlaceholder` controls anchor page reuse
- They are orthogonal: `initialized` flips after first chat regardless; `homePagePlaceholder` flips only when a home page is actually generated
- Edge case: if first chat is a single-page request (not split), `homePagePlaceholder` stays `true` until a split generation runs — correct behavior

**Backward compatibility:** `default(false)` means existing projects without the field are treated as "home page is real content" — correct.

### Files

- `packages/core/src/types/design-system.ts` — add field to schema
- `packages/cli/src/utils/minimal-config.ts` — set `homePagePlaceholder: true`
- `packages/cli/src/commands/chat/split-generator.ts` — check flag before anchor reuse
- `packages/cli/src/commands/chat.ts` — set flag to `false` after home page generation

### Tests

- Config schema accepts/rejects `homePagePlaceholder`
- `readAnchorPageCodeFromDisk` returns code when flag is `false`
- Split-generator skips reuse when flag is `true`
- Flag flips to `false` after successful home page generation
- Backward compat: config without field defaults to `false`

---

## Bug 1a: Sheet Not Found on Preview

### Root Cause

Pre-flight in `chat.ts` scans `components/shared/header.tsx` for `@/components/ui/*` imports **before** `regenerateLayout` overwrites the Header with a new version that imports Sheet. The new Header uses Sheet, but Sheet was never installed.

Timeline gap:
1. Pre-flight scans existing Header (no Sheet) → installs nothing for Sheet
2. `applyModification` writes pages
3. `regenerateLayout` overwrites Header with Sheet-based version
4. Preview fails: "Can't resolve '@/components/ui/sheet'"

### Design — Three-Layer Defense

**Layer 1: Post-regenerateLayout scan (code-generator.ts)**

After `regenerateLayout` writes Header/Footer/Sidebar files, scan each written file for `@/components/ui/*` imports and install missing components via `provider.installComponent()`.

```
regenerateLayout() writes header.tsx, footer.tsx, sidebar.tsx
  → for each written file:
    → scan for @/components/ui/* imports
    → installComponent() for any missing
```

**Layer 2: Final dependency scan (chat.ts)**

After ALL operations complete (applyModification + regenerateFiles), do one final scan of:
- `app/**/*.tsx` (all page files)
- `components/shared/*.tsx` (all shared component files)

Collect all `@/components/ui/*` imports, diff against installed components in `components/ui/`, install any missing.

This is the ultimate safety net — catches any dependency missed by earlier layers regardless of source.

**Layer 3: Extend preview scan (preview.ts)**

In `fixMissingComponentExports()`, add `components/shared/` to the scan scope alongside `app/`. This catches issues even if chat didn't run (e.g., manual file edits).

### Files

- `packages/cli/src/commands/chat/code-generator.ts` — post-regenerateLayout scan
- `packages/cli/src/commands/chat.ts` — final dependency scan
- `packages/cli/src/commands/preview.ts` — extend `fixMissingComponentExports` scope

### Tests

- Post-regenerateLayout scan installs Sheet when Header imports it
- Final scan catches components missed by all earlier layers
- Preview scan includes `components/shared/` files

---

## Bug 2: Empty Pages (Dashboard, Team, Settings...)

### Root Cause

Three interacting causes:
1. **Retry gate** (`emptyPages.length <= 5`): with 6 empty pages, retries are skipped entirely
2. **Response truncation**: `max_tokens: 16384` can be insufficient when the system prompt is large (~5k-10k tokens), leaving little room for pageCode
3. **No template fallback** for page types like `team`, `tasks/[id]`, `reset-password`

### Design

**Fix 1: Remove retry gate limit**

```typescript
// Before:
if (emptyPages.length > 0 && emptyPages.length <= 5) {

// After:
if (emptyPages.length > 0) {
```

Always retry empty pages regardless of count.

**Fix 2: Lightweight retry prompt**

When retrying empty pages, use a minimal prompt without the full design-constraints block. Strip down to:
- "Generate complete pageCode for page X at route Y"
- Style context (extracted from anchor)
- Shared components list (if available)
- Core layout rules only

This gives the model more output space within the existing `max_tokens` limit. No need to increase `max_tokens` (which may exceed model limits).

**Fix 3: Reduce retry concurrency to 1**

During retries, process pages sequentially (`concurrency: 1`) to avoid rate-limit cascading failures.

**Fix 4: Expand template fallbacks**

Add templates for common page types not currently covered:

| Page type | Route patterns | Template content |
|-----------|---------------|-----------------|
| `team` | `/team`, `/members` | Member cards grid with avatar, name, role, email |
| `tasks` | `/tasks`, `/task-list` | Task list with status badges, filters, search |
| `task-detail` | `/tasks/[id]` | Task detail view with status, assignee, description |
| `reset-password` | `/reset-password` | Password reset form (mirror forgot-password) |
| `profile` | `/profile`, `/account` | Profile card with avatar, info fields |

These are used only when AI fails to generate code AND retry also fails — last-resort fallback.

### Files

- `packages/cli/src/commands/chat/split-generator.ts` — retry gate, retry concurrency, lightweight prompt
- `packages/cli/src/agents/modifier.ts` — export lightweight prompt builder
- `packages/cli/src/commands/chat/modification-handler.ts` — template fallbacks
- `packages/cli/src/agents/page-templates.ts` — new template definitions

### Tests

- Retry runs when 6+ pages are empty
- Retry uses lightweight prompt (verify prompt content)
- Retry concurrency is 1
- Template fallbacks produce valid code for team, tasks, task-detail, reset-password, profile
- `inferPageType` matches new route patterns

---

## Bug 3: Link Without href → Runtime Error

### Root Cause

No validation or autofix for `<Link>` or `<a>` without `href` prop. The quality validator's `BROKEN_INTERNAL_LINK` rule only examines lines that already contain `href=`, so links without href are invisible to validation.

### Design — Three-Layer Defense

**Layer 1: AI prompt constraint (design-constraints.ts)**

Add to CORE_CONSTRAINTS:
```
CRITICAL: Every <Link> MUST have an href prop. Missing href causes runtime errors.
Never use <Link className="..."> or <Button asChild><Link> without href.
```

**Layer 2: Validation rule (quality-validator.ts)**

New rule `LINK_MISSING_HREF`:
```typescript
const LINK_WITHOUT_HREF_RE = /<(?:Link|a)\b(?![^>]*\bhref\s*=)[^>]*>/g
```

Matches `<Link` or `<a>` tags that lack any `href` attribute (including dynamic `href={...}`). Severity: error.

Self-closing tags (`<Link />`, `<a />`) should also be caught but are rare in practice.

**Layer 3: AutoFix (quality-validator.ts)**

For `<Link` without `href`: insert `href="/"` as safe default.

```typescript
// <Link className="inline-flex...">
// → <Link href="/" className="inline-flex...">
```

The validation warning remains so users know to fix the URL.

### Files

- `packages/cli/src/agents/design-constraints.ts` — prompt rule
- `packages/cli/src/utils/quality-validator.ts` — validation rule + autofix

### Tests

- Regex matches `<Link className="...">` without href
- Regex does NOT match `<Link href="/foo">` or `<Link href={url}>`
- AutoFix inserts `href="/"` correctly
- Rule reports as error severity

---

## Bug 4: Login Page Renders as Narrow Box

### Root Cause

`normalizePageWrapper()` runs on auth pages and replaces the outer centering wrapper (`flex min-h-svh items-center justify-center`) with `space-y-6`. The inner `max-w-sm` stays → narrow card without centering.

The `(auth)` route group layout already provides centering (`min-h-svh bg-muted flex items-center justify-center p-4`), so auth pages don't need their own centering. But `normalizePageWrapper` breaks whatever structure the AI generates.

### Design

**Fix 1: Skip normalizePageWrapper for auth routes**

In `modification-handler.ts`:
```typescript
// Before:
if (!isMarketingRoute(route)) {

// After:
if (!isMarketingRoute(route) && !isAuthRoute(route)) {
```

`isAuthRoute` is already available via import from `page-templates.js`.

**Fix 2: Add register template**

In `page-templates.ts`, add `register`/`signup` pattern to `detectPageType()` and a template mirroring login (centered card, `max-w-sm`, fields for name/email/password/confirm).

**Fix 3: Auth-specific prompt note in Phase 4**

When generating auth pages in split-generator.ts, add to the prompt:
```
For auth pages (login, register, forgot-password, reset-password):
Use centered card layout. Do NOT use section containers or full-width wrappers.
The auth layout already provides centering — just output the card content.
```

This prevents `alignmentNote` from conflicting with auth page structure.

### Files

- `packages/cli/src/commands/chat/modification-handler.ts` — skip normalization for auth
- `packages/cli/src/agents/page-templates.ts` — register template + detectPageType
- `packages/cli/src/commands/chat/split-generator.ts` — auth-specific prompt note

### Tests

- `normalizePageWrapper` is not called for `/login`, `/register`, `/forgot-password`
- `normalizePageWrapper` still runs for `/dashboard`, `/projects`
- `detectPageType('register')` returns `'register'`
- Register template produces valid centered card layout
- Auth prompt note appears only for auth routes

---

## Bug 5: AI Ignores Extracted Shared Components

### Root Cause

Phase 4 user message never mentions shared components. The shared section in modifier.ts is buried deep in a large system prompt. Instructions say "when the page type matches" without mapping section types to components. No few-shot examples.

**Critical dependency on Bug 1b:** Currently Phase 3.5 extracts components from the init welcome page (StepCard, FeatureCard, InfoCallout, FaqAccordion). These are irrelevant for app pages like Dashboard or Projects. After Bug 1b is fixed, Phase 3.5 extracts from the real app landing page, producing relevant shared components.

**Implementation order: Bug 1b must be done before Bug 5.**

### Design — Prompt Reinforcement on 3 Levels

**Level 1: Phase 4 user message (split-generator.ts)**

When `sharedComponentsSummary` exists, add a dedicated block to the Phase 4 prompt:

```
SHARED COMPONENTS — MANDATORY REUSE:
Before implementing any section, check this list. Import and use matching components.
Do NOT re-implement these patterns inline.

{sharedComponentsSummary with section-type mapping}
```

Separate from `sharedLayoutNote` (Header/Footer "don't duplicate").

**Level 2: Move shared section higher in modifier.ts**

Move the `SHARED COMPONENTS (MANDATORY REUSE)` block from its current buried position to right after the initial instruction block — before design-quality rules. Add section-type → component mapping generated from descriptions:

```
Available shared components and when to use them:
- StepCard (section): Use for process steps, numbered lists, how-it-works sections
  Import: @/components/shared/step-card
  Props: { step: number; title: string; description: string }
```

**Level 3: Core design constraint (design-constraints.ts)**

Add to CORE_CONSTRAINTS:
```
When shared components exist (@/components/shared/*), ALWAYS import and use them
instead of re-implementing similar patterns inline.
```

### Files

- `packages/cli/src/commands/chat/split-generator.ts` — Phase 4 prompt block + separate layout/component notes
- `packages/cli/src/agents/modifier.ts` — move shared section higher, add mapping
- `packages/cli/src/agents/design-constraints.ts` — core constraint rule

### Tests

- Phase 4 prompt includes shared components block when summary exists
- Phase 4 prompt excludes shared components block when summary is empty
- `sharedLayoutNote` and `sharedComponentsNote` are separate
- Shared section appears before design-quality rules in modifier prompt

---

## Implementation Order

The bugs have dependencies that dictate implementation order:

```
Bug 1b (homePagePlaceholder) ──→ Bug 5 (shared components prompt)
  │                                 ↑
  │                          depends on real anchor page
  │
Bug 1a (Sheet scan) ── independent
Bug 2 (empty pages) ── independent
Bug 3 (Link href) ── independent
Bug 4 (auth layout) ── independent
```

Recommended sequence:
1. **Bug 1b** — homePagePlaceholder flag (unblocks Bug 5)
2. **Bug 3** — Link missing href (quick, high-impact safety)
3. **Bug 4** — Auth layout fix (quick, isolated)
4. **Bug 1a** — Post-regenerateLayout scan + final scan
5. **Bug 2** — Empty pages retry + templates
6. **Bug 5** — Shared components prompt (depends on Bug 1b)

---

## Testing Strategy

Each bug fix follows TDD:
1. Write failing test for the specific scenario
2. Implement minimal fix
3. Verify all tests pass
4. Run full CI pipeline (`pnpm test && pnpm lint && pnpm typecheck`)

Integration testing: after all fixes, run `coherent init` → `coherent chat` → `coherent preview` end-to-end and verify:
- No Sheet/component errors on preview
- Landing page is app-specific (not welcome placeholder)
- All pages have content (no empty pages)
- No Link without href errors
- Login/Register have consistent centered card layouts
- Shared components are used in generated pages (no inline duplicate warnings)
