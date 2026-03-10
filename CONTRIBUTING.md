# Contributing to Coherent Design Method

Thank you for your interest in contributing! This guide will help you get set up and make your first contribution.

## Prerequisites

- **Node.js** 20 or later ([download](https://nodejs.org/))
- **pnpm** 8 or later (`npm install -g pnpm`)
- **Git**

## Development Setup

### 1. Fork and clone

```bash
git clone https://github.com/<your-username>/coherent-design-method.git
cd coherent-design-method
```

### 2. Install dependencies

```bash
pnpm install
```

This installs dependencies for all packages in the monorepo (core, cli, templates).

### 3. Build

```bash
pnpm build
```

Builds `@coherent/core` first, then `@coherent/cli`. Both must be built before the CLI can run.

### 4. Link CLI globally

```bash
cd packages/cli
pnpm link --global
```

Now you can use the `coherent` command from any directory. Verify with:

```bash
coherent --version
```

### 5. Test your setup

```bash
mkdir /tmp/test-coherent && cd /tmp/test-coherent
coherent init
coherent preview
```

You should see a Next.js app running at `http://localhost:3000` with a Design System viewer at `/design-system`.

## Project Structure

```
coherent-design-method/
├── packages/
│   ├── core/                   # @coherent/core
│   │   └── src/
│   │       ├── generators/     # Code generators (pages, components, tailwind config)
│   │       ├── managers/       # Design system, component, page managers
│   │       ├── types/          # TypeScript types and Zod schemas
│   │       └── audit/          # Component consistency auditor
│   │
│   ├── cli/                    # @coherent/cli
│   │   └── src/
│   │       ├── commands/       # CLI command implementations
│   │       ├── providers/      # AI providers (Anthropic, OpenAI)
│   │       └── utils/          # Shared utilities (quality validator, file watcher, etc.)
│   │
│   └── templates/              # Project templates
│
├── docs/                       # Documentation
├── README.md
├── CONTRIBUTING.md             # This file
├── TROUBLESHOOTING.md
└── package.json                # Monorepo root
```

### Package responsibilities

**`@coherent/core`** — The engine. Handles design system configuration, component registration, page generation templates, Tailwind config generation, shared component management, and the Design System viewer file generation. This package has no AI dependencies — it's pure logic.

**`@coherent/cli`** — The interface. Implements all `coherent` commands, AI provider integrations (Claude, OpenAI), quality validation, auto-fix routines, file watching, and the sync/check/fix pipeline. This is the package users interact with.

## Making Changes

### Workflow

1. Create a branch from `main`:
   ```bash
   git checkout -b feat/my-feature
   ```

2. Make your changes in `packages/core/` or `packages/cli/`

3. Rebuild:
   ```bash
   pnpm build
   ```

4. Test locally by creating a test project:
   ```bash
   mkdir /tmp/test && cd /tmp/test
   coherent init
   coherent chat "add a dashboard page"
   coherent preview
   ```

5. Commit with a descriptive message:
   ```bash
   git commit -m "feat: add support for custom component variants"
   ```

### Where to make changes

| Change | Package | Key files |
|--------|---------|-----------|
| New CLI command | `cli` | `src/commands/`, `src/index.ts` |
| Modify AI prompts | `cli` | `src/commands/chat.ts`, `src/utils/design-constraints.ts` |
| Quality rules | `cli` | `src/utils/quality-validator.ts` |
| Component templates | `core` | `src/generators/ComponentGenerator.ts` |
| Page templates | `core` | `src/generators/templates/pages/` |
| Design system schema | `core` | `src/types/design-system.ts` |
| Shared component logic | `core` | `src/managers/SharedComponentsRegistry.ts` |
| DS viewer templates | `core` | `src/generators/ProjectScaffolder.ts` |

### Rebuild after changes

If you change **core**, you must rebuild both packages (CLI depends on core):

```bash
pnpm build           # from monorepo root
```

If you change only **CLI**:

```bash
cd packages/cli
pnpm build
```

For faster iteration, use watch mode:

```bash
# Terminal 1: watch core
cd packages/core && pnpm dev

# Terminal 2: watch CLI
cd packages/cli && pnpm dev
```

## Commit Messages

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: add pricing page template
fix: prevent raw color replacement in terminal blocks
docs: update troubleshooting guide
refactor: extract component integrity into shared module
```

Types: `feat`, `fix`, `docs`, `refactor`, `test`, `chore`

## Pull Requests

1. Ensure your changes build without errors: `pnpm build`
2. Test with a real project (create one with `coherent init` + `coherent chat`)
3. Write a clear PR description explaining what changed and why
4. Reference any related issues

## Code Style

- TypeScript strict mode
- No `any` types (use proper interfaces)
- Prefer `const` over `let`
- Use descriptive variable names
- No unnecessary comments (code should be self-explanatory)

## Questions?

Open an [issue](https://github.com/skovtun/coherent-design-method/issues) — we're happy to help.
