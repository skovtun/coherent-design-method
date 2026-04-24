# @getcoherent/cli

CLI for **Coherent Design Method** — generate and maintain Next.js apps with a single design-system config.

## Install

```bash
npm install -g @getcoherent/cli
```

## Quick Start

```bash
# In an empty directory (or new repo)
coherent init
npm install
coherent preview
```

Init auto-detects Claude Code and provisions a `.claude/skills/coherent-generate/` skill so you can generate pages **without an API key**. Open the project in Claude Code and run `/coherent-generate "<request>"` — your session drives the phase rail while Coherent enforces constraints. Prefer unattended CLI runs? Pass `coherent init --api-mode` and supply an Anthropic key.

- **App:** http://localhost:3000  
- **Design System:** http://localhost:3000/design-system  
- **Docs:** http://localhost:3000/design-system/docs  

## Commands

| Command | Description |
|---------|-------------|
| `coherent init` | Create project: config, app, design-system viewer, docs. Non-interactive (optional provider flag). |
| `coherent chat "<request>"` | Generate or modify pages using natural language. Includes generation-time TypeScript validation. |
| `coherent preview` | Start Next.js dev server. |
| `coherent fix` | Auto-fix everything: TypeScript errors (deterministic + AI), missing components, CSS, raw colors, layouts. |
| `coherent check` | Show all problems: page quality, component integrity, broken links. |
| `coherent sync` | Sync Design System with code after manual edits. |
| `coherent export` | Production build; optional Vercel/Netlify config. |
| `coherent undo` | Restore project to state before the last `coherent chat`. |
| `coherent update` | Apply platform updates to an existing project. |
| `coherent status` | Print config summary (pages, components). |
| `coherent components` | List registered components. |

## Two Workflows

After `coherent init` you can:

1. **Work in Cursor/IDE** — Edit `design-system.config.ts`, `app/`, `components/`; hot reload. Best for fine-grained control.
2. **Generate via Claude Code skill (no API key)** — in Claude Code, `/coherent-generate "add pricing page"` drives the full phase rail. Best for key-less AI generation.
3. **Use `coherent chat` (API key)** — e.g. `coherent chat "add pricing page"` for the same pipeline as a standalone command. Best for CI/scripts.

**Tip:** Use a generative path (2 or 3) for structure, then the IDE for details. Commit before each generate run and `git diff` after.

## Examples

```bash
# Skill mode (run from Claude Code chat)
/coherent-generate "add dashboard page with stats cards"
/coherent-generate "add contact page with form"

# API-key mode (any shell)
coherent chat "add Button, Card, Input from shadcn"
coherent chat "change primary color to #6366f1"
```

## API Key (only for `coherent chat`)

Skill mode (`/coherent-generate`) needs no key — it uses your Claude Code subscription.

For the standalone `coherent chat` path, set one of:

- **Anthropic (default):** `ANTHROPIC_API_KEY`
- **OpenAI:** `OPENAI_API_KEY`

Put in `.env` in the project root or export in the shell. In Cursor, keys are often auto-detected.

## Docs

- Root repo: [README](../../README.md) and [QUICK_REFERENCE.md](../../QUICK_REFERENCE.md)
- Project context and workflows: [CONTEXT.md](../../CONTEXT.md) §7

## License

MIT
