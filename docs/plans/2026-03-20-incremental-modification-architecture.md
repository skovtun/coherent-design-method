# Incremental Modification Architecture

> Design document for transitioning the Coherent Design Method platform from
> destructive regeneration to incremental, surgical modifications.

## Problem

Every `coherent chat` command regenerates `layout.tsx`, Header, Footer, and
other shared components unconditionally — even when the user only asked to
change text on one page. This overwrites manual edits, resets customizations,
and contradicts the platform's core promise: **build, add to, and refine** a
design incrementally.

## Core Principle

The platform helps users build UI the way a designer works with a component
system: create once, iterate on specific parts, keep everything else stable.
Changes happen only where explicitly requested or logically required.

---

## Part 1: `initialized` Flag

Add `initialized: boolean` to `settings` in `design-system.config.ts`.

| State | Meaning |
|-------|---------|
| `false` | Project was scaffolded by `coherent init` but no user app has been created yet. Coherent branding is still in place. |
| `true` | First `coherent chat` has been completed. App branding, pages, and shared components exist. |

**Lifecycle:**

- `coherent init` → sets `initialized: false`
- First `coherent chat` → full generation (pages, header, footer, navigation), then sets `initialized: true`
- All subsequent `coherent chat` → incremental mode

**Backward compatibility:** Zod schema defaults `initialized` to `true` so
existing projects (created before this feature) enter incremental mode
automatically. Only `coherent init` explicitly sets `false`.

## Part 2: Incremental Mode

When `initialized === true`, the platform switches to surgical modifications.

### layout.tsx

Not rewritten. Targeted edits only when the user explicitly requests changes
to font, theme, or metadata. The file structure is preserved.

### Header / Footer / Sidebar

Not regenerated unless one of two conditions is met:

1. **User explicitly asks** to change header, footer, or navigation.
2. **Navigation structure changed** — pages were added or removed.

Navigation change detection compares a snapshot of `config.navigation.items`
before and after the chat:

```typescript
const navBefore = config.navigation?.items?.map(i => `${i.label}:${i.href}`)
// ... chat processing ...
const navAfter = updatedConfig.navigation?.items?.map(i => `${i.label}:${i.href}`)
const navChanged = JSON.stringify(navBefore) !== JSON.stringify(navAfter)
```

When navigation changes, both Header and Footer are updated (footer mirrors
navigation links for SEO — improves internal linking and crawlability).

### Pages

AI receives the full current page code plus the user's instruction. The system
prompt enforces: "Return the complete page code. Modify ONLY what was
requested. Do not change imports, state, styles, or content of other sections."

The platform writes the result as-is (Approach A — full code, surgical edit).

## Part 3: Promote to Shared Component

User says: *"Make this project card a shared component and use it on Projects
and Dashboard."*

The platform:

1. Extracts the JSX block from the source page.
2. Creates `components/shared/project-card.tsx`.
3. Registers it in `shared-components-manifest.json`.
4. Replaces inline code with `<ProjectCard />` import on all specified pages.
5. Component appears in the Design System.

The `promote-and-link` request type already exists in `modification-handler.ts`.
Work needed: improve AI prompt recognition of promote requests and ensure
the extraction logic handles real-world JSX patterns reliably.

## Part 4: Global Component Changes

User says: *"Make all cards more rounded"* or *"Change all buttons to outline
style."*

**Shared component** (already in `components/shared/`):
Edit the component file. All pages importing it receive the change
automatically via React imports.

**Inline pattern** (repeated across pages but not extracted):
Auto-promote the pattern to a shared component first, then edit the shared
component. Result: single source of truth, changes propagate everywhere.

## Part 5: Page Sections as Addressable Units

User says: *"Replace the hero section on the landing page"* or *"Remove the
pricing block."*

Sections are not separate entities in the config (YAGNI). Instead, the AI is
instructed via the system prompt to:

- Identify the requested section by name, content, or position.
- Modify only that section.
- Return the full page code with the changed section.
- Preserve imports, state, and all other sections.

## Part 6: File Changes Summary

| File | Change |
|------|--------|
| `packages/core/src/types/design-system.ts` | Add `initialized: z.boolean().default(true)` to settings schema |
| `packages/core/src/generators/ProjectScaffolder.ts` | Set `initialized: false` during init |
| `packages/cli/src/commands/chat.ts` | Snapshot navigation before chat; compare after; set `initialized: true` after first chat |
| `packages/cli/src/commands/chat/code-generator.ts` | Split `regenerateLayout` into full / incremental modes; remove unconditional `layout.tsx` overwrite; gate shared component regeneration on `navChanged` |
| `packages/cli/src/commands/chat/modification-handler.ts` | Improve `promote-and-link` handling; add auto-promote for inline patterns during global changes |
| `packages/cli/src/agents/modifier.ts` | Extend prompts: surgical edit rules, section addressing, promote request recognition, global component change instructions |

## Part 7: Manual Edit Protection

After each `coherent chat`, store SHA-256 hashes of all generated/modified
files in `.coherent/file-hashes.json`:

```json
{
  "components/shared/header.tsx": "a1b2c3...",
  "app/(app)/dashboard/page.tsx": "d4e5f6..."
}
```

Before overwriting any file in the next `coherent chat`:

1. Compute the current file's hash.
2. Compare with the stored hash.
3. If they differ (file was edited manually):
   - **Do not overwrite.** Show warning: *"⚠ header.tsx was modified manually.
     Skipping overwrite. Run `coherent sync` to update the Design System."*
   - Exception: if the user explicitly asked to change this file, overwrite
     is permitted.
4. After successful write, update the hash.

## Part 8: Backward Compatibility

Existing projects created with v0.4.x / v0.5.x have no `initialized` field.

Resolution: Zod schema uses `.default(true)`. When the config is loaded and
the field is absent, it defaults to `true` — the project enters incremental
mode. Only `coherent init` sets `false` explicitly.

No migration script needed. No user action required.

## Part 9: Design System Consistency Validation

Extend `quality-validator` to check generated code against the design system:

- **Token compliance:** colors use CSS variables (`var(--primary)`), not
  hardcoded hex values.
- **Spacing consistency:** spacing values come from the token system, not
  arbitrary pixel values.
- **Typography adherence:** font families and sizes match defined tokens.
- **Component reuse:** warn when inline code duplicates an existing shared
  component.

This runs after AI generation, before writing to disk. Violations produce
warnings (not hard failures) so the user is informed but not blocked.

## Part 10: AI Output Verification

Before writing any AI-modified file to disk:

1. **Syntax check:** parse the code as TSX. If it fails, reject and show error.
2. **Import integrity:** compare imports before and after. If the AI removed
   an import that is still referenced in unchanged code, restore it.
3. **Directive check:** if the code uses React hooks (`useState`, `useEffect`,
   etc.), ensure `"use client"` is present.
4. **Structural check:** verify the default export function still exists.

If verification fails, the file is not written. The user sees an error with
guidance to retry or adjust their request.

Existing functions `autoFixCode()` and `validateAndFixGeneratedCode()` cover
parts of this. The work is to ensure they run in the right order and handle
the incremental edit scenario (where most of the code should be unchanged).

---

## Testing Strategy

Each part needs regression tests verifying both the positive case (changes
apply when they should) and the negative case (files remain untouched when
they should not be modified):

- `initialized` flag transitions
- Navigation snapshot comparison
- File hash detection of manual edits
- AI output verification catches broken code
- Shared component promotion and propagation
- Design system consistency warnings

## Out of Scope (Future Iterations)

- Changelog / change summary after each chat
- Impact analysis before global component changes
- Component usage map in the Design System UI
- Visual diff / preview before applying changes
- Full designer-first workflow (define tokens → build components → assemble pages)
