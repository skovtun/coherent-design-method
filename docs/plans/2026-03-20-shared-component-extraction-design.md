# Shared Component Extraction from Anchor Page

> Automatically extract reusable UI components from the first generated page and make them available as shared components for all subsequent pages.

## Problem

Today `coherent chat` generates only two shared components: Header and Footer (layout type, extracted by `layout-extractor.ts`). Content-level components like FeatureCard, PricingCard, TestimonialCard, and StatCard stay inline on the anchor page and are never offered to subsequent pages. This limits visual consistency across the project.

The user sees shared components as a key consistency feature. The current limit of two is a side effect of the extraction logic only targeting `<header>` and `<footer>` HTML tags, ignoring repeating content patterns.

## Approach

Insert a new **Phase 3.5** into `splitGeneratePages()` — between style extraction (Phase 3) and parallel page generation (Phase 4).

Phase 3.5 sends the anchor page code to the AI and asks it to identify repeating JSX patterns worth extracting as shared components. Each extracted component is saved to `components/shared/`, registered in `coherent.components.json`, and its summary (with props interface) is included in Phase 4 prompts so subsequent pages can import and reuse it.

### Why AI-based extraction (not AST)

AST-based duplicate detection (e.g., via Babel) finds structurally identical subtrees but misses **semantically similar** patterns where class names, text, or prop values differ. The AI understands that a "Feature Card" and a "Benefit Card" with similar structure are the same pattern. A single AI call is simpler, cheaper (~$0.01–0.05), and more accurate for this task.

## Design

### 1. New phase in `splitGeneratePages()`

User-facing spinner messages:

```
Phase 1/5 — Planning pages...
Phase 2/5 — Generating Home page (sets design direction)...
Phase 3/5 — Extracting design patterns...
Phase 3.5/5 — Extracting shared components...    ← NEW
Phase 4/5 — Generating 5 pages in parallel...
```

Phase total changes from 4 to 5. Phase 3.5 uses fractional numbering to keep the diff minimal; the "succeed" message reads: `Phase 3.5/5 — Extracted N shared components (FeatureCard, PricingCard, ...)`.

### 2. Skip condition

Skip Phase 3.5 when:
- `remainingPages.length < 2` (fewer than 3 total pages — not enough targets for reuse)
- `homePageCode` is empty (Phase 2 failed or was skipped)
- Anchor page was reused from disk AND `manifest.shared.some(e => e.type !== 'layout')` — non-layout shared components already exist

### 3. New function: `extractSharedComponents()`

A new exported async function in `split-generator.ts`:

```typescript
export async function extractSharedComponents(
  homePageCode: string,
  projectRoot: string,
  aiProvider: AIProvider,  // 'claude' | 'openai' | 'auto'
): Promise<{ components: GenerateSharedComponentResult[]; summary: string | undefined }>
```

This function encapsulates all Phase 3.5 logic: prompt construction, AI call, validation, filtering, processing, and summary rebuild. It is called from `splitGeneratePages()` and is independently testable.

### 4. AI call mechanism — new method on `AIProviderInterface`

`AIProviderInterface.parseModification()` cannot be reused: it has a hardcoded system prompt ("You are a design system modification parser") and returns `ParseModificationOutput` (`{ requests, uxRecommendations }`). Sending an extraction prompt through it would produce conflicting instructions and a type mismatch.

Instead, add a new **optional method** to `AIProviderInterface`, following the same pattern as `editSharedComponentCode?`, `editPageCode?`, `replaceInlineWithShared?`, and `extractBlockAsComponent?`:

```typescript
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

Where `SharedExtractionItem` is the Zod-inferred type from §6.

Each provider implements the method with its own system prompt optimized for extraction (not modification parsing). OpenAI uses `response_format: { type: 'json_object' }` with `{ "components": [...] }`. Claude uses its standard JSON extraction pattern.

Inside `extractSharedComponents()` (the function in `split-generator.ts`):

```typescript
const manifest = await loadManifest(projectRoot)
const ai = await createAIProvider(aiProvider)
if (!ai.extractSharedComponents) {
  return { components: [], summary: buildSharedComponentsSummary(manifest) }
}
const reservedNames = getComponentProvider().listNames()
const existingNames = manifest.shared.map(e => e.name)
const result = await ai.extractSharedComponents(homePageCode, reservedNames, existingNames)
const items = result.components ?? []
```

When the provider doesn't support extraction, the function returns an empty `components` array but still rebuilds the summary from the current manifest (preserving pre-existing Header/Footer summaries). If `result.components` is not an array after a successful call, treat as empty (graceful degradation). No special `max_tokens` — anchor page code is typically 2–4K tokens, prompt ~500 tokens, response ~3–10K tokens.

### 5. AI prompt for extraction (inside each provider)

The system prompt (set by each provider implementation):

```
You are a UI component extraction system. Analyze Next.js page code and identify
repeating UI patterns useful as shared components across a multi-page site.
Return valid JSON: { "components": [...] }
```

The user prompt (constructed from the method parameters):

```
Analyze this page and extract reusable components.

PAGE CODE:
{pageCode}

Rules:
- Extract 1-5 components maximum
- Each component must be ≥10 lines of meaningful JSX
- Output complete, self-contained TypeScript modules with:
  - "use client" directive (if hooks or event handlers are used)
  - All necessary imports (shadcn/ui from @/components/ui/*, lucide-react, next/link, etc.)
  - A typed props interface exported as a named type
  - A named export function (not default export)
- Do NOT extract: the entire page, trivial wrappers (<div className="...">),
  layout components (header, footer, nav — handled separately)
- Do NOT use these names (reserved for shadcn/ui): {reservedNames.join(', ')}
- Do NOT use these names (already shared): {existingSharedNames.join(', ')}
- Look for patterns like: cards with icon+title+description, pricing tiers,
  testimonial blocks, stat/metric displays, CTA sections, feature grids

Each component object:
  "name": "FeatureCard" (PascalCase),
  "type": "section" or "widget",
  "description": "...",
  "propsInterface": "{ icon: React.ReactNode; title: string; description: string }",
  "code": "full TSX module as a string"

If no repeating patterns found: { "components": [] }
```

The `usedIn` field starts empty (`[]`) for extracted components — it gets populated when Phase 4 pages actually import them (tracked by `warnInlineDuplicates` and the existing `applyModification` flow).

### 6. Zod validation schema

```typescript
const SharedExtractionItemSchema = z.object({
  name: z.string().min(2).max(50),
  type: z.enum(['section', 'widget']),
  description: z.string().max(200),
  propsInterface: z.string().default('{}'),
  code: z.string(),
})

const SharedExtractionResponseSchema = z.object({
  components: z.array(SharedExtractionItemSchema).max(5).default([]),
})
```

`propsInterface` defaults to `'{}'` when absent — prompt requests it, but if the AI omits it the schema provides a safe default rather than failing.

Post-Zod filtering (applied in order):
1. Reject items where `code.split('\n').length < 10` (too trivial)
2. Reject items where `name` collides with `getComponentProvider().listNames()` (shadcn names)
3. Reject items where `name` matches an existing manifest entry name (deduplication)
4. Reject items with duplicate `name` within the same AI response (keep first)
5. Items that pass Zod but fail post-filter are silently skipped (not errors)

Partial success: if the AI returns 4 items and 1 is invalid, the 3 valid items are processed normally.

### 7. Processing each extracted component

For each validated item, in sequence:

1. **`autoFixCode(item.code)`** — fix HTML entities (`&lt;` → `<`), validate lucide-react icon names, etc.
2. **Ensure shadcn dependencies** — regex-scan `code` for `from ["']@/components/ui/(.+?)["']`, extract component names, call `getComponentProvider().installComponent(name, projectRoot)` for each. Note: `getComponentProvider()` returns the `ShadcnProvider` singleton (from `packages/cli/src/providers/index.ts`), NOT the AI provider.
3. **`generateSharedComponent(projectRoot, { name, type, code, description, propsInterface, usedIn: [] })`** — creates file in `components/shared/` and updates manifest (including `propsInterface` in the entry).
4. If `writeFile` or `generateSharedComponent` throws for one item, log a warning and continue with the next item (don't abort the entire phase).

### 8. Manifest and generator updates for `propsInterface`

Three files need the `propsInterface` field threaded through:

**`packages/core/src/types/shared-components-manifest.ts`** — add to schema:
```typescript
export const SharedComponentEntrySchema = z.object({
  // ... existing fields ...
  propsInterface: z.string().optional(),  // e.g. "{ icon: React.ReactNode; title: string }"
})
```

**`packages/core/src/generators/SharedComponentGenerator.ts`** — add to input type:
```typescript
export interface GenerateSharedComponentInput {
  // ... existing fields ...
  propsInterface?: string
}
```
And pass it through to `createEntry()`.

**`packages/core/src/managers/SharedComponentsRegistry.ts`** — accept `propsInterface` in `createEntry()` input and include it in the created entry object.

### 9. Updated `sharedComponentsSummary`

Current format (in `chat.ts` lines 210–219):
```
  CID-001 Header (layout) — Main site header
    Import: @/components/shared/header
```

New format includes props when present:
```
  CID-003 FeatureCard (section) — Card with icon, title, description
    Import: @/components/shared/feature-card
    Props: { icon: React.ReactNode; title: string; description: string }
```

### 10. Summary refresh before Phase 4

`parseOpts.sharedComponentsSummary` is set in `chat.ts` before calling `splitGeneratePages()`, so it contains only pre-existing shared components. After Phase 3.5 creates new components, the summary must be rebuilt from the manifest.

Implementation: `extractSharedComponents()` calls `loadManifest(projectRoot)` after all components are written, then calls `buildSharedComponentsSummary(manifest)` to produce the full summary string (which includes both old and new shared components from the manifest). It returns this as the `summary` field. Inside `splitGeneratePages()`, after calling `extractSharedComponents()`:

```typescript
parseOpts.sharedComponentsSummary = result.summary
```

Unconditional assignment — even if `result.summary` is `undefined` (no shared components at all, including no pre-existing Header/Footer), Phase 4 proceeds without a shared component prompt section. The manifest is the single source of truth; the old `parseOpts.sharedComponentsSummary` from `chat.ts` is never used after Phase 3.5 runs.

The summary builder logic (manifest → formatted string) is extracted into a shared helper function `buildSharedComponentsSummary(manifest: SharedComponentsManifest): string | undefined` used by both `chat.ts` and `extractSharedComponents()`.

### 11. Graceful degradation

If the AI call fails (network error, malformed JSON, rate limit):
- Spinner warns: `"Phase 3.5/5 — Could not extract shared components (continuing without)"`
- Continue to Phase 4 with whatever shared components existed before (Header/Footer from layout-extractor)
- Do not retry — one extra AI call failure should not block the entire generation

If `splitGeneratePages` throws after Phase 3.5 partially wrote components, `chat.ts` falls back to single-page generation with the original `parseOpts`. Partially-written shared components persist on disk and in the manifest, which is acceptable — they don't cause errors, and the user can see/delete them.

### 12. Anchor page not modified

After extraction, the anchor page retains its inline code. We do NOT rewrite it to import from `components/shared/`. Reasons:
- Reduces complexity and risk of breaking a working page
- Both inline and shared versions are functionally identical
- User can manually refactor via `promote-and-link` if desired

### 13. Project type considerations

| Project type | Anchor page | Extracted components useful for remaining pages? |
|---|---|---|
| Marketing site (all pages similar) | Landing | High — similar card/section patterns |
| Dashboard app (no landing) | Dashboard | High — StatCard, PageHeader reuse |
| SaaS (landing + app pages) | Landing | Partial — useful if marketing pages added later; app pages use different patterns |

Phase 3.5 does not harm the SaaS case: app pages simply don't use landing-page shared components, and the AI won't force them. Future improvement: post-Phase-4 analysis for app-page shared components.

### 14. Phase 2 prompt unchanged

The Phase 2 prompt is not modified to "encourage repeating patterns." The AI generates naturally. If no patterns emerge, Phase 3.5 returns an empty array — no shared components created beyond Header/Footer.

## File changes

| File | Change |
|---|---|
| `packages/core/src/types/shared-components-manifest.ts` | Add `propsInterface?: string` to `SharedComponentEntrySchema` |
| `packages/core/src/generators/SharedComponentGenerator.ts` | Add `propsInterface?: string` to `GenerateSharedComponentInput`, pass through to `createEntry()` |
| `packages/core/src/managers/SharedComponentsRegistry.ts` | Accept `propsInterface` in `createEntry()` input, include in created entry |
| `packages/cli/src/utils/ai-provider.ts` | Add `extractSharedComponents?()` to `AIProviderInterface` |
| `packages/cli/src/utils/openai-provider.ts` | Implement `extractSharedComponents()` with extraction system prompt and `response_format: { type: 'json_object' }` |
| `packages/cli/src/utils/claude-provider.ts` | Implement `extractSharedComponents()` with extraction system prompt |
| `packages/cli/src/commands/chat/split-generator.ts` | Add `extractSharedComponents()` function, `SharedExtractionSchema`, Phase 3.5 integration, phase renumbering |
| `packages/cli/src/commands/chat.ts` | Extract `buildSharedComponentsSummary()` helper, add `propsInterface` to summary format |

## Testing

- Unit test: `extractSharedComponents()` with mock AI returning valid JSON — verify `generateSharedComponent()` called correctly, manifest updated, returned summary contains new components
- Unit test: AI returns empty array — no components created, no errors, returned summary rebuilt from manifest (may include pre-existing layout components)
- Unit test: AI returns invalid JSON — graceful degradation, warning logged, returns empty result
- Unit test: AI returns component with shadcn name collision (e.g., "Card") — filtered out
- Unit test: AI returns component matching existing manifest entry name — skipped (deduplication)
- Unit test: AI returns two items with the same name — only first kept
- Unit test: AI returns component with `< 10` lines — filtered out
- Unit test: partial success — 3 valid + 1 invalid item → 3 components created
- Unit test: skip condition — `remainingPages.length < 2` skips Phase 3.5 entirely
- Unit test: `buildSharedComponentsSummary()` includes `propsInterface` line when present, omits when absent
- Integration test: full `splitGeneratePages` flow with mock AI — verify Phase 4 `parseOpts.sharedComponentsSummary` contains new shared component entries

## Non-goals (future)

- Post-Phase-4 analysis to find shared patterns across app pages
- Phase 1 planning-based component prediction (before any code exists)
- Automatic anchor page refactoring to use extracted shared imports
- Cross-project shared component library
