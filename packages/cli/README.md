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

- **App:** http://localhost:3000  
- **Design System:** http://localhost:3000/design-system  
- **Docs:** http://localhost:3000/design-system/docs  

## Commands

| Command | Description |
|---------|-------------|
| `coherent init` | Create project: config, app, design-system viewer, docs. Non-interactive (optional provider flag). |
| `coherent chat "<request>"` | Parse NL, update config, regenerate pages/components/nav (e.g. add page, change tokens). |
| `coherent preview` | Start Next.js dev server. |
| `coherent export` | Production build; optional Vercel/Netlify config. |
| `coherent status` | Print config summary (pages, components). |
| `coherent components` | List registered components. |

## Two Workflows

After `coherent init` you can:

1. **Work in Cursor/IDE** — Edit `design-system.config.ts`, `app/`, `components/`; hot reload. Best for fine-grained control.
2. **Use `coherent chat`** — e.g. `coherent chat "add pricing page"` to scaffold pages/components and sync config/nav. Best for fast generation.

**Tip:** Use chat for structure, then Cursor for details. Commit before each `coherent chat` and run `git diff` after.

## Examples (chat)

```bash
coherent chat "add dashboard page with stats cards"
coherent chat "add Button, Card, Input from shadcn"
coherent chat "add contact page with form"
coherent chat "change primary color to #6366f1"
```

## API Key

For `coherent init` (discovery) and `coherent chat` you need an AI provider key:

- **Anthropic (default):** `ANTHROPIC_API_KEY`
- **OpenAI:** `OPENAI_API_KEY`

Put in `.env` in the project root or export in the shell. In Cursor, keys are often auto-detected.

## Docs

- Root repo: [README](../../README.md) and [QUICK_REFERENCE.md](../../QUICK_REFERENCE.md)
- Project context and workflows: [CONTEXT.md](../../CONTEXT.md) §7

## License

MIT
