# Project Setup Guide

## Project Name
**Coherent** (full name: Coherent Design Method)

## Overview
AI-powered design system generator with stateful component management. "BMAD for frontend" - creating production-ready UI through conversational interface with guaranteed consistency.

## Core Philosophy
- **Stateful, not stateless** - система помнит архитектурные решения
- **Incremental, not regenerative** - точечные изменения, не полная перегенерация
- **Production-ready, not prototype** - код готов к deploy, не demo
- **Design system as code** - config является source of truth

## Tech Stack

### Core
- **Runtime:** Node.js 20+
- **Language:** TypeScript 5.3+
- **Package Manager:** pnpm (для монорепо)

### CLI
- **Framework:** Commander.js 11.x
- **Prompts:** Inquirer.js 9.x (для интерактивных вопросов)
- **Styling:** Chalk 5.x (colored output)
- **Spinners:** Ora 7.x (loading indicators)

### Frontend Generation
- **Multi-page:** Next.js 15 (App Router)
- **SPA:** React 19 + React Router 6.x
- **Styling:** Tailwind CSS 3.4+
- **Components:** shadcn/ui (базовый набор)
- **Icons:** lucide-react
- **Forms:** react-hook-form + zod

### AI Integration
- **Model:** Claude Sonnet 4.5 via Anthropic API
- **SDK:** @anthropic-ai/sdk
- **Rate limiting:** bottleneck 2.x
- **Caching:** node-cache (для AI responses)

### Code Generation
- **Templates:** Handlebars.js
- **AST manipulation:** recast (для code modifications)
- **Formatting:** Prettier 3.x
- **Linting:** ESLint 8.x

### State Management
- **Config storage:** File-based (TypeScript/JSON)
- **Validation:** Zod 3.x
- **Version control:** Simple-git (для tracking changes)
- **App state:** Zustand 4.x (для generated apps)

### Development
- **Build:** tsup (fast TypeScript bundler)
- **Testing:** Vitest 1.x
- **Dev server:** Vite 5.x (для preview)

## Project Structure

```
coherent/
├── packages/
│   ├── cli/                          # CLI interface
│   │   ├── src/
│   │   │   ├── commands/
│   │   │   │   ├── init.ts          # Initialize new project
│   │   │   │   ├── chat.ts          # Conversational modifications
│   │   │   │   ├── preview.ts       # Launch dev server
│   │   │   │   └── export.ts        # Export to deployable code
│   │   │   ├── agents/
│   │   │   │   ├── discovery.ts     # AI discovery agent (asks questions)
│   │   │   │   ├── generator.ts     # Code generation agent
│   │   │   │   └── modifier.ts      # Incremental modification agent
│   │   │   ├── utils/
│   │   │   │   ├── claude.ts        # Claude API wrapper
│   │   │   │   ├── logger.ts        # Structured logging
│   │   │   │   └── files.ts         # File system operations
│   │   │   └── index.ts             # CLI entry point
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   ├── core/                         # Core design system engine
│   │   ├── src/
│   │   │   ├── types/
│   │   │   │   ├── design-system.ts # DesignSystemConfig types
│   │   │   │   ├── component.ts     # Component definitions
│   │   │   │   └── page.ts          # Page structure types
│   │   │   ├── managers/
│   │   │   │   ├── DesignSystemManager.ts  # Main orchestrator
│   │   │   │   ├── ComponentManager.ts     # Component CRUD
│   │   │   │   └── PageManager.ts          # Page composition
│   │   │   ├── generators/
│   │   │   │   ├── ConfigGenerator.ts      # Design system config
│   │   │   │   ├── ComponentGenerator.ts   # Component code
│   │   │   │   └── PageGenerator.ts        # Page scaffolding
│   │   │   ├── validators/
│   │   │   │   ├── schema.ts        # Zod schemas
│   │   │   │   └── accessibility.ts # A11y validation
│   │   │   └── index.ts
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   └── templates/                    # Project templates
│       ├── next-multipage/          # Next.js App Router template
│       │   ├── base/                # Base structure
│       │   └── templates/           # Page templates
│       ├── react-spa/               # React + React Router template
│       │   ├── base/                # Base structure
│       │   └── templates/           # Page templates
│       └── shared/                  # Shared configs
│           ├── tailwind.config.ts
│           └── tsconfig.json
│
├── docs/                            # Documentation (where artifacts go)
│   ├── 00_INTRODUCTION.md
│   ├── PROJECT_SETUP.md
│   ├── ARCHITECTURE.md
│   ├── PROJECT_TASKS.md
│   ├── BMAD_GUIDE.md
│   ├── types/
│   │   └── design-system-config.ts
│   └── sessions/
│       └── 2025-01-26-initial.md
│
├── examples/                        # Example projects
│   └── api-portal/                 # Dogfooding example
│
├── package.json                     # Root monorepo config
├── pnpm-workspace.yaml             # pnpm workspaces
├── tsconfig.base.json              # Shared TS config
└── README.md

```

## Installation & Setup

### Prerequisites
```bash
node --version  # Should be 20+
pnpm --version  # Should be 8+
```

### Initial Setup (for bmad)

```bash
# Create project
mkdir coherent
cd coherent

# Initialize pnpm workspace
pnpm init

# Create workspace config
cat > pnpm-workspace.yaml << EOF
packages:
  - 'packages/*'
EOF

# Create packages
mkdir -p packages/{cli,core,templates}
mkdir -p packages/templates/{next-multipage,react-spa,shared}
mkdir -p docs/{types,sessions}
mkdir -p examples/api-portal

# Setup package.json for each package
# (bmad will do this)

# Install shared dependencies
pnpm add -D typescript tsup vitest @types/node
pnpm add -D @typescript-eslint/parser @typescript-eslint/eslint-plugin
pnpm add -D prettier eslint

# Setup TypeScript
cat > tsconfig.base.json << EOF
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2022"],
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  }
}
EOF
```

### CLI Package Setup

```bash
cd packages/cli

# Package.json
cat > package.json << EOF
{
  "name": "@getcoherent/cli",
  "version": "0.1.0",
  "type": "module",
  "bin": {
    "coherent": "./dist/index.js"
  },
  "scripts": {
    "dev": "tsup --watch",
    "build": "tsup",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@getcoherent/core": "workspace:*",
    "@anthropic-ai/sdk": "^0.32.0",
    "commander": "^11.1.0",
    "inquirer": "^9.2.12",
    "chalk": "^5.3.0",
    "ora": "^7.0.1",
    "zod": "^3.22.4"
  }
}
EOF

# tsup config
cat > tsup.config.ts << EOF
import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: true,
  clean: true,
  shims: true
})
EOF
```

### Core Package Setup

```bash
cd packages/core

cat > package.json << EOF
{
  "name": "@getcoherent/core",
  "version": "0.1.0",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "import": "./dist/index.js",
      "types": "./dist/index.d.ts"
    }
  },
  "scripts": {
    "dev": "tsup --watch",
    "build": "tsup",
    "typecheck": "tsc --noEmit",
    "test": "vitest"
  },
  "dependencies": {
    "zod": "^3.22.4",
    "handlebars": "^4.7.8"
  }
}
EOF
```

## Environment Variables

Create `.env` file in root:

```bash
# Anthropic API
ANTHROPIC_API_KEY=your_key_here

# Development
NODE_ENV=development
LOG_LEVEL=debug

# Optional: Rate limiting
ANTHROPIC_MAX_REQUESTS_PER_MINUTE=50
```

## Development Workflow

### 1. Start Development

```bash
# Install dependencies
pnpm install

# Start CLI in dev mode
cd packages/cli
pnpm dev

# In another terminal - start core in watch mode
cd packages/core
pnpm dev
```

### 2. Test CLI Locally

```bash
# Link CLI globally
cd packages/cli
pnpm link --global

# Now you can run from anywhere
coherent init
coherent chat "make buttons blue"
```

### 3. Running Tests

```bash
# Run all tests
pnpm test

# Watch mode
pnpm test --watch

# Coverage
pnpm test --coverage
```

## Usage with Cursor + bmad

### Recommended Approach

1. **Reference docs in prompts:**
```
@docs/ARCHITECTURE.md
@docs/types/design-system-config.ts

Implement DesignSystemManager class following the architecture
```

2. **Incremental implementation:**
```
@docs/PROJECT_TASKS.md

Complete Task 1.1: CLI Boilerplate
Use Commander.js as specified in PROJECT_SETUP.md
```

3. **Keep context updated:**
After bmad implements something, update session notes:
```bash
docs/sessions/2025-01-26-cli-implementation.md
```

## Quality Standards

### Code Quality
- **TypeScript strict mode** - no `any` types
- **ESLint** - zero warnings in CI
- **Prettier** - consistent formatting
- **100% type coverage** - all exports typed

### Testing
- **Unit tests** - all managers and generators
- **Integration tests** - CLI commands end-to-end
- **Snapshot tests** - generated code consistency
- **Minimum 80% coverage** - for core package

### Performance
- **CLI startup** - < 500ms
- **Code generation** - < 3s for typical project
- **Incremental updates** - < 1s (no full regeneration)

## Git Workflow

```bash
# Feature branches
git checkout -b feature/component-generator

# Commit messages (Conventional Commits)
git commit -m "feat(core): add ComponentGenerator class"
git commit -m "fix(cli): handle missing config file"
git commit -m "docs: update ARCHITECTURE.md with state flow"

# Before pushing
pnpm typecheck
pnpm test
pnpm build
```

## Application Types

### Multi-page Applications (Next.js)
Generated with:
- Next.js 15 App Router
- Server-side routing
- SEO-optimized pages
- File-based routing

Use cases:
- API portals
- Marketing sites
- SaaS landing pages
- Documentation sites

### Single-page Applications (React)
Generated with:
- React 19
- React Router 6.x
- Client-side routing
- Code splitting

Use cases:
- Admin dashboards
- Internal tools
- Interactive web apps
- Real-time applications

### State Management

**For both MPA and SPA:**
- Zustand for global state
- React Query for server state (optional)
- Shared auth state across pages
- Navigation state persistence

## Next Steps

1. **Save this file:** `docs/PROJECT_SETUP.md`
2. **Review ARCHITECTURE.md** (next artifact)
3. **Check design-system-config.ts** (types artifact)
4. **Start with PROJECT_TASKS.md** (implementation guide)

## Questions for bmad

When scaffolding the project, bmad should:
- ✅ Use exact folder structure above
- ✅ Setup pnpm workspace correctly
- ✅ Install all dependencies listed
- ✅ Create tsconfig files extending base
- ✅ Setup tsup for both packages
- ✅ Create placeholder files for all modules
- ✅ Setup templates for both Next.js and React SPA

## Notes

- This is a **monorepo** - keep packages independent
- **CLI** depends on **core** - but core has no dependencies on CLI
- Templates are **static** - copied and customized, not generated from scratch
- All AI interaction happens in **CLI** - core is pure logic
- **Multi-page and SPA** share core logic, differ in templates only

---

**Status:** Ready for implementation  
**Next Artifact:** ARCHITECTURE.md  
**Owner:** Sergei Kovtun  
**Created:** 2025-01-26  
**Updated:** 2025-01-26 (added MPA/SPA support)