---
id: ADR-0013
type: adr
status: accepted
date: 2026-10-19
confidence: verified
shipped_in: []
---

# ADR 0013 — Design system from code: addressable components and tokens in agent mode

**Status:** Accepted, slice 1 implemented (`feat/design-system-ids`)
**Date:** 2026-10-19

## Context

ADR-0011 moved design authorship to the coding agent; ADR-0012 put governance in the agent's loop. A Codex code review (2026-10-19) confirmed that v0.27 agent mode had no design system: no component IDs, no token model, reuse and token use enforced only by prompt, and page protection only for a correctly declared `variant` edit.

The owner's product promise is different: Coherent builds a strong multi-page design **and in parallel a design system**. The first delivery shows the UI and a design-system page with every style and every component, each addressable by ID. "CID-007: rounder corners" changes that component only, and every page using it follows. New components can be created and placed by name or ID.

Owner decisions (2026-10-19): host is Claude Code (app and `/design-system` run locally); every major page block is a component even if used once; shadcn primitives belong to the design system and are editable by ID; a change requested "only here" to something shared (component or token) means asking the user: new component/token, or update everywhere; tokens are consistent everywhere.

## Decision

Keep ADR-0011: the agent designs, no design rules in prompts. Add a design-system layer **derived from code**, addressing by exact ID, and only objective checks. A first draft bundled a registry, structure linter, token compiler, screenshot catalog, confirmation protocol and duplicate detector into one step; Codex rejected it (findings below), so it ships in slices.

### Slice 1 (implemented)

- **Identity in the source.** An exported component carries a leading `/** @coherent-id CID-NNN */` comment (`governance/design-system.ts`). Renames, moves and edits keep the ID; there is no stored registry to merge across branches. Everything else (kind, props, routes, tokens) is recomputed from the code.
- **One entry per primitive.** A `components/ui/` file is one entry named after the file (`select.tsx` → Select, CID on it); its other exports are parts (`SelectItem`) and resolve to the primitive's ID. On a real 13-page app this gave 41 IDs instead of 118.
- **Kinds by reach**, no directory moves: `ui` (components/ui), `shared` (rendered by 2+ routes), `block` (0-1).
- **Tokens** from the global stylesheets: `:root` values, `.dark` values, `@theme` values that are not aliases of them; ID = the custom property (`--primary`).
- **`coherent_ds_sync` / `coherent ds sync`**: one normal edit in which Coherent declares and writes the ID comments and the generated `/design-system` page; verification requires every page to render pixel-identically (comments only).
- **Generated page** `app/design-system/page.tsx` (marker comment; a user's own page there is never overwritten): tokens with swatches, every component with ID, file, props, parts and the pages that use it. Theme utilities only. Excluded from targets and controls.
- **Page stays current inside every edit**: an edit touching components or stylesheets gets the page added to its write set; `verifyEdit` regenerates it before diffing and building, so it is verified and undone with the edit.
- **Exact addressing**: `coherent_begin_edit` takes `target` (`CID-007`, `@KpiCard`/`KpiCard`, `--radius`), resolves the file and checks the scope. No fuzzy matching for mutations.
- **Scope/file-kind rules (objective)**: `page` may not modify components, primitives or stylesheets; `tokens` only stylesheets; an addressed `component` edit only that file; an addressed `variant` that file plus opting-in pages/layouts.
- **IDs for new components**: once a project has a design system, a touched component without an ID (or with a duplicate ID) fails verification with the ID to use; `begin_edit` returns the next free IDs when components are created.
- **Asking**: the agent template tells the agent to ask before changing something shared that the user scoped to some pages (new component/token vs everywhere). Not enforced by the server: it cannot prove the user was asked (Codex), so it is not claimed as "user confirmed".

Verified live on a copy of the A/B app: sync assigned 41 IDs and kept 11 rendered routes pixel-identical; `CID-008` edit modified only `kpi-card.tsx`, both consumers changed (4.8%), controls 0.00%; a `page`-scoped edit of `CID-008` was refused; `/design-system` rendered with no console errors.

Agent end-to-end (2026-10-19, headless Claude Code with the updated template on the same app, $2.31 total): "show the design system" → inventory, `coherent_ds_sync`, `verify final`, link, honest `partially_verified` (106s). "CID-008: bigger number" → `begin_edit` with `target: "CID-008"`, only `kpi-card.tsx`, controls 0.00% (45s). "Only on Earnings, green border on the KPI cards" → no edit opened; the agent listed the 3 pages and asked new component vs everywhere (10s). Answer "option 1" → new `HighlightKpiCard` wrapping KpiCard (no markup copy), `/** @coherent-id CID-042 */`, border from `--primary`, only Earnings changed, `/design-system` updated in the same edit, `verified` (46s).

### Slice 1b: the full viewer (implemented)

The one-page list was too thin next to the classic viewer (owner, 2026-10-19). `/design-system` is now a multi-page section generated by `governance/design-system-site.ts`: sidebar; overview (counts, addressing examples, recent edits); Colors (light/dark), Typography (font tokens, type scale, weights), Spacing/radius/shadow; Components (Shared, Blocks, Primitives by category) and a page per component (live preview, cva variants rendered live with their classes, props, parts, pages that use it); Rules (what Coherent enforces, IDs/duplicates/previews health). All files carry the marker; the graph ignores the managed directory so the viewer never counts as a page that renders components.

Live previews: primitives get generated renders (recipes emitted only when every needed part is exported, so they typecheck; variants from `cva`); shared components and blocks show `<name>.preview.tsx` the agent writes (new agent scope `design-system`, which may only write preview files). Each preview has its own error boundary. Live: on the A/B app the viewer built and verified; the agent wrote 17 previews in one edit (`verified`, 182s, $1.36), rendered with no console errors.

### Deferred (slices 2-3)

- Raw-value checks (colors first, then arbitrary sizes/radius/shadow), baseline-relative, starting as warnings. The Tailwind theme scale (`p-4`, `rounded-lg`, `text-sm`) counts as tokens; `p-[13px]`, `text-[15px]` are raw.
- Token → component reach (needs a CSS/Tailwind dependency graph); until then a token edit is global.
- Live component previews: element crops from real pages are best-effort (hidden/conditional components, multiple instances, fragments); optional authored previews.
- Explicit impact acknowledgement (bound to target + hash + routes) for shared edits.
- Exact-copy detection of an existing component's markup.

## Rejected (Codex, 2026-10-19)

- **A JSX-shape gate for "every block is a component"**: false failures (small pages, layouts, shadcn `<Table>`), file-splitting busywork; it would make the agent optimize for the validator, the ADR-0011 failure. Component-first stays an instruction.
- **Rename-stable IDs from export name + content hash**: breaks on rename+edit, multi-export files, split/merge, branches. Source annotation instead.
- **Committed `.coherent/design-system.json`**: `.coherent` is outside transactions; volatile fields cause merge churn. The index is recomputed.
- **Generating files after `verify final`**: they would be undeclared and unverified. The page is regenerated before the build, inside the edit.
- **Adapting the classic `DesignSystemGenerator`**: tied to the classic config and its own arbitrary values. A small new page instead.
- **"User confirmed" enforcement for only-here edits**: the server cannot know.
