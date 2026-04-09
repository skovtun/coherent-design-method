# CLAUDE.md — Coherent Design Method

## What is this project?

AI-powered design system generator CLI. Users describe their app in natural language → Coherent generates a complete Next.js 15 + Tailwind CSS + shadcn/ui application with consistent design tokens, shared components, and a Design System Viewer.

## Repository structure

```
packages/
  cli/    — CLI tool (@getcoherent/cli on npm)
  core/   — Core engine (@getcoherent/core on npm)
docs/     — Documentation, case studies, research
```

## Key files

- `packages/cli/src/agents/design-constraints.ts` — Single source of truth for all UI generation rules (1343 lines, tiered system)
- `packages/cli/src/agents/modifier.ts` — AI prompt assembly, parses natural language → modification requests
- `packages/cli/src/commands/chat/split-generator.ts` — 6-phase generation pipeline
- `packages/cli/src/commands/chat/modification-handler.ts` — Applies generated changes to files
- `packages/cli/src/utils/quality-validator.ts` — Post-generation quality checks + auto-fix
- `packages/cli/src/commands/check.ts` — `coherent check` command (quality scoring)
- `packages/cli/src/commands/fix.ts` — `coherent fix` command (auto-fix)

## Development workflow

```bash
pnpm install          # Install dependencies
pnpm build            # Build all packages
npx vitest run        # Run all tests (679 tests)
npx tsc --noEmit -p packages/cli/tsconfig.json   # TypeScript check
npx prettier --check 'packages/*/src/**/*.{ts,tsx}'  # Format check
```

## Before committing

1. All tests pass (`npx vitest run`)
2. TypeScript clean (`npx tsc --noEmit`)
3. Prettier clean (`npx prettier --check`)
4. Build succeeds (`npm run build`)
5. Update `docs/CHANGELOG.md` if version bump
6. Update `QUICK_REFERENCE.md` if new commands/flags added

## Publishing

```bash
# Both packages published together, same version
cd packages/core && npm publish
cd packages/cli && npm publish
```

## Architecture: Design Constraints Tiered System

```
DESIGN_THINKING     — always sent (~250 tokens) — creative mindset + anti-slop
CORE_CONSTRAINTS    — always sent (~2500 tokens) — typography, colors, spacing, a11y
DESIGN_QUALITY_COMMON — always sent (~500 tokens) — visual depth, motion, modern CSS
DESIGN_QUALITY_*    — per page type (marketing/app/auth)
VISUAL_DEPTH        — always sent (~300 tokens) — permission to be beautiful
INTERACTION_PATTERNS — always sent (~400 tokens) — loading, feedback, errors
RULES_*             — contextual (~300-600 each) — injected by selectContextualRules()
```

`selectContextualRules(message, pageSections?)` matches keywords → injects relevant rule blocks. Cap at 4 blocks.

## Code conventions

- Semantic color tokens only — never raw Tailwind colors (bg-gray-*, text-blue-*)
- `quality-validator.ts` auto-fixes: raw colors → semantic tokens, missing shrink-0, escaped quotes
- All dates in mock data: ISO 8601 strings, format at render time
- Icons: always lucide-react, always size-4 shrink-0
- Forms: always shadcn components (Input, Label, Select), never native HTML

## What NOT to do

- Don't add features without tests
- Don't hardcode Tailwind colors in generated code
- Don't skip prettier/typecheck before push
- Don't create duplicate documentation files
- Don't leave stale/unused files in the repo
