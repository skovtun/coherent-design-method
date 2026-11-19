---
name: coherent
description: Governs UI edits in a Next.js app. Use when building or changing pages, components or design tokens and the change must be proven to land only where intended (scope, build, real-browser renders, pixel diff, rollback), or when a project's design system must stay consistent. Also use to set Coherent up in a Next.js project.
---

# Coherent: governed UI edits

You design and write the UI yourself. Coherent does not generate design: it tells you what a change touches, holds the change in a transaction, verifies it in a real browser and rolls back what fails.

## Set up (once per project)

Check whether the project already has Coherent: `.claude/agents/coherent.md` exists, or `@getcoherent/cli` is in `devDependencies`. If not, ask the user, then run in the project root:

```bash
npx @getcoherent/cli@latest init        # existing Next.js app: adds the agent only, app code untouched
npx @getcoherent/cli@latest init my-app # empty folder: new Next.js + shadcn app
```

It writes the `coherent` MCP server (`.mcp.json`), a write guard, a managed section in `AGENTS.md` and `CLAUDE.md`, and `scripts/design-check.mjs`. Tell the user to restart the session so the MCP tools load. In Codex, add the server with the command `init` prints (`codex mcp add coherent -- ...`).

## The loop, for every change to project files

1. `coherent_inventory`: tokens, shared components with IDs (`CID-007`) and which routes render them, pages, any open edit.
2. `coherent_begin_edit` BEFORE writing, with the request, the narrowest scope and every file you will touch:
   - `tokens`: the overall look (colour, radius, type, shadow). Change tokens, not components.
   - `component`: change a shared component everywhere it appears.
   - `variant`: "only on X". Add an opt-in prop whose default renders as today; every other consumer must stay pixel-identical.
   - `page`: one page's own markup.
   - `new-component`: first look for an existing component with the same purpose and reuse it.
   Pass `target` when the user names a component or token. Pass `refactor: true` when nothing may look different.
3. Write only the declared files. Need another one: `coherent_begin_edit` with `amend`. Never route around the guard with shell writes; verification diffs the whole project.
4. `coherent_verify_edit` level `fast`: undeclared changes, new type errors, classes of tokens that do not exist, real names or emails in the UI. Fix until clean.
5. `coherent_verify_edit` level `final`: production build, renders of affected and control routes, pixel diff, browser errors. A pass commits. A failure stays open: fix, or `coherent_rollback_edit`.
6. Report the verdict exactly as returned. Only `verified` is fully verified; name what `partially_verified` left out.

If a change to a shared component or token would spread to pages the user did not name, ask first: a new variant or component, or change it everywhere.

## Design-system rules that hold without Coherent

- Tokens live in the Tailwind 4 stylesheet (`app/globals.css` or the file with `@import "tailwindcss"`). Use token classes (`bg-primary`, `text-muted-foreground`), not hex values or palette colours.
- Reuse components under `components/` before writing new markup; a block used twice is a component.
- Renaming a token means updating every class that uses it: Tailwind 4 drops unknown classes silently, so the build passes and the colour just disappears.
- Before finishing, run `node scripts/design-check.mjs` when it exists: it fails on classes that compile to no CSS and lists hardcoded values the change added.

Docs: https://getcoherent.design · Source: https://github.com/skovtun/coherent-design-method
