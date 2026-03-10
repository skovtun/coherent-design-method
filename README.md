# Coherent Design Method

> AI-powered design system generator with stateful component management  
> by [Sergei Kovtun](https://www.linkedin.com/in/sergeikovtun/)

## Overview

**Coherent** is an open-source CLI that creates production-ready Next.js frontends with a single design-system config. Components are registered and reused; tokens cascade; you work either in **Cursor/IDE** (edit code + config) or via **`coherent chat`** (NL commands). Design System viewer at `/design-system`; documentation (components, tokens, recommendations) at `/design-system/docs`.

## Key Features

- ✅ **Single source of truth** — `design-system.config.ts` (pages, components, tokens)
- ✅ **Two workflows** — Cursor (edit code + config) or `coherent chat` (NL generation)
- ✅ **Design System viewer** — `/design-system` (components, tokens, variants)
- ✅ **Docs & recommendations** — `/docs` (autogen + UX recommendations)
- ✅ **Next.js 15** — App Router, Tailwind, built-in component library
- ✅ **Production-ready** — `coherent export` for Vercel/Netlify

## Status

✅ **Phase 1 — MVP** (done): init, chat, preview, export, DS viewer, docs autogen.  
**Next:** Phase 2 — A2UI export, SPA, advanced features.

## Project Structure

```
coherent-design-method/
├── packages/
│   ├── cli/          # CLI (@coherent/cli)
│   ├── core/         # Core engine (@coherent/core)
│   └── templates/    # Project templates
├── packages/docs/    # PROJECT.md, PROJECT_TASKS.md, DOCS_AUTOGEN_DESIGN.md
├── docs/             # User-facing docs (getting-started, architecture)
└── examples/         # Example projects
```

## Quick Start

```bash
# Install globally
npm install -g @coherent/cli

# Create new project (non-interactive)
coherent init

# Install dependencies
npm install

# Start dev server
coherent preview
# → App: http://localhost:3000
# → Design System: http://localhost:3000/design-system
# → Docs: http://localhost:3000/design-system/docs
```

Then either **edit in Cursor** (config + components + pages) with hot reload, or use **`coherent chat`** for quick generation:

```bash
coherent chat "add pricing page with 3 tiers"
coherent chat "add Button and Card components"
coherent chat "change primary color to #667EEA"
coherent export   # production build
```

## Two Ways to Work

After `coherent init` you can use either workflow (or both).

| Workflow | When to use | How |
|----------|-------------|-----|
| **Cursor / IDE** | Fine-grained control, custom components, styling | Edit `design-system.config.ts`, `app/*`, `components/`; hot reload. |
| **`coherent chat`** | Fast scaffolding, new pages, token changes | Run `coherent chat "add dashboard page"`; config and files update automatically. |

**Best practice:** Use chat for structure, then Cursor for details. Commit before each `coherent chat` so you can `git diff` and revert if needed.  
→ See [QUICK_REFERENCE.md](./QUICK_REFERENCE.md) and [CONTEXT.md](./CONTEXT.md) §7 for full workflow details.

### Examples (chat)

```bash
coherent chat "add e-commerce pages: products, cart, checkout"
coherent chat "add Button, Input, Card from shadcn"
coherent chat "add contact page with form"
coherent chat "change primary color to #6366f1"
coherent status   # show config summary
coherent components   # list components
coherent regenerate-docs   # fix docs nav duplication in existing projects
```

## Getting Started

### Prerequisites

- Node.js 20+
- pnpm 8+ (for development from source)
- **AI API key** (for `coherent init` discovery and `coherent chat`):
  - **Anthropic Claude** (default): `ANTHROPIC_API_KEY`
  - **OpenAI**: `OPENAI_API_KEY` (optional)
  - In Cursor, API keys are often auto-detected; otherwise set in `.env`

#### Getting Your Anthropic API Key

1. Sign up at [console.anthropic.com](https://console.anthropic.com)
2. Create an API key in your account settings
3. Set it in your environment:

```bash
# Option 1: Export in your shell
export ANTHROPIC_API_KEY=your_key_here

# Option 2: Create .env file in your project directory
echo "ANTHROPIC_API_KEY=your_key_here" > .env
```

**Note:** Each user needs their own API key. The key is used for AI-powered code generation and is not shared or stored by Coherent.

## 🔒 Security Best Practices

**Never share your API keys!**

### ✅ Do:
- ✅ Use `.env` file (already in `.gitignore`)
- ✅ Use environment variables
- ✅ Rotate keys regularly
- ✅ Use different keys for dev/prod environments

### ❌ Don't:
- ❌ Commit keys to Git
- ❌ Share screenshots with keys visible
- ❌ Hardcode keys in source code
- ❌ Log keys in console output
- ❌ Send keys in chat messages

### 🚨 If You Accidentally Exposed a Key:

1. **Immediately revoke the exposed key:**
   - Anthropic: https://console.anthropic.com/settings/keys
   - OpenAI: https://platform.openai.com/api-keys

2. **Generate a new key** and update your environment

3. **Review access logs** to check for unauthorized usage

### Model Configuration

You can customize the Claude model via environment variable:

```bash
# Use latest Sonnet 4 (default)
export CLAUDE_MODEL=claude-sonnet-4-20250514

# Or use Sonnet 3.5
export CLAUDE_MODEL=claude-sonnet-3-5-20241022
```

Default model: `claude-sonnet-4-20250514` (latest stable)

### Installation

**From npm (recommended):**
```bash
npm install -g @coherent/cli
```

**From source:**
```bash
# Clone repository
git clone https://github.com/coherent-design/coherent.git
cd coherent

# Install dependencies
pnpm install

# Build packages
pnpm build

# Link CLI globally
cd packages/cli
pnpm link --global
```

### Development

```bash
# Start CLI in dev mode
cd packages/cli
pnpm dev

# Start core in watch mode
cd packages/core
pnpm dev
```

## Documentation

- [QUICK_REFERENCE.md](./QUICK_REFERENCE.md) — Workflows, commands, safety tips
- [CONTEXT.md](./CONTEXT.md) — Project context, file layout, workflows (§7), next steps
- [Getting Started](./docs/getting-started.md) — Methodology and manual application
- [Project Setup](./docs/project-setup.md) — Technical setup
- [Architecture](./docs/architecture-doc.md) — System architecture
- [PROJECT.md](./packages/docs/PROJECT.md) — Vision, product state, decisions
- [PROJECT_TASKS.md](./packages/docs/PROJECT_TASKS.md) — Task list and roadmap

## Contributing

See [CONTRIBUTING.md](./docs/CONTRIBUTING.md) for guidelines.

## License

MIT

---

**Version:** 0.1.0  
**License:** MIT  
**Author:** [Sergei Kovtun](https://www.linkedin.com/in/sergeikovtun/)

