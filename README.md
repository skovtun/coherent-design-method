<h1 align="center">
  <strong>Coherent Design Method</strong>
</h1>

<p align="center">
  The model designs. Coherent governs.<br>
  An open-source platform that governs AI-built frontends: your coding agent designs and builds the UI;<br>
  Coherent scopes every edit, verifies it in a real browser and rolls back what fails.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@getcoherent/cli"><img src="https://img.shields.io/npm/v/@getcoherent/cli.svg" alt="npm version"></a>
  <a href="https://github.com/skovtun/coherent-design-method/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="MIT License"></a>
  <img src="https://img.shields.io/badge/node-%3E%3D20-brightgreen" alt="Node 20+">
  <img src="https://img.shields.io/badge/next.js-app%20router-black" alt="Next.js App Router">
</p>

---

## What is Coherent?

Frontier coding agents already write good UI. What they don't do is prove an edit stayed inside its lane: that "make the KPI cards on Earnings more prominent" changed Earnings and left the two other pages using the same card pixel-identical, that the build still passes, that no hydration error appeared, that your `git config` name didn't end up in a mock profile.

Coherent is that layer. Since v0.27.0 it no longer generates design itself ([ADR-0011](docs/wiki/ADR/0011-governance-not-authorship.md): in a head-to-head on the same spec, plain Claude Code beat Coherent's own generation pipeline on every screen). Instead, every edit the agent makes goes through a governed session:

1. **Inventory.** A graph of your app built from the code itself (TypeScript AST): pages, layouts, shared components, who imports what. Nothing stored that can drift.
2. **Begin edit.** The agent declares a scope (`tokens`, `component`, `variant`, `page`, `new-component`) and the files it will write. Coherent answers with the impact: which routes must change, which must not.
3. **Verify.** Type errors (against a baseline, so pre-existing ones don't block you), a production build, before/after screenshots on desktop and mobile, an exact pixel diff on control routes, new browser and hydration errors, identity leaks.
4. **Verdict.** `verified`, `partially_verified`, `verified_without_visual`, `blocked_by_preexisting_failure` or `failed`. A failed edit is rolled back; rollback touches only that edit's own files, so your concurrent hand edits survive.

## Quick Start

**Prerequisites:** [Node.js](https://nodejs.org/) 20 or later, and [Claude Code](https://claude.com/claude-code) (CLI or desktop app) or Codex.

### New app

```bash
npx @getcoherent/cli init my-app
```

In an empty folder this runs the official `create-next-app` and `shadcn init`, adds a welcome page, and installs the Coherent agent. Open `my-app` in Claude Code and describe what you want; the Coherent agent is the project's default agent, so there is nothing to select.

### Existing Next.js app

```bash
cd my-next-app
npx @getcoherent/cli init
```

Adds only the agent; your code is not touched. Run it again later to update the agent files.

### What init writes

| File | Purpose |
|------|---------|
| `.claude/agents/coherent.md` | The Coherent agent (prompt + the `coherent` MCP server) |
| `.mcp.json` | `coherent mcp --profile agent`: four governance tools |
| `.claude/settings.json` | Makes `coherent` the default agent and adds the write guard hook (merged with your settings) |
| `AGENTS.md` | A managed section for agents without hooks (Codex) |
| `.gitignore` | Local state under `.coherent/` |
| `package.json` | `@getcoherent/cli` and `playwright` as dev dependencies, installed with your project's package manager |

Dynamic routes (`/orders/[id]`) need an example URL to be screenshotted; init lists them and tells you where to add one (`.coherent/preview-params.json`).

## How It Works

```
agent ──► coherent_inventory      code graph, open edit, files changed outside Coherent
      ──► coherent_begin_edit     scope + write set → impact, baseline renders, transaction
      ──► (agent writes files)    PreToolUse hook denies writes outside the write set
      ──► coherent_verify_edit    fast: write set, new type errors, identity leaks
                                  final: + production build, renders, pixel diff → verdict
      ──► coherent_rollback_edit  restore only this edit's files
```

The hook is fast feedback, not the boundary: Bash, subagents and IDE writes bypass it. The boundary is verification, which diffs the whole tree after the edit. Agents without hooks are covered by `changedOutsideCoherent` in the inventory.

The verification browser runs in a far time zone and another locale (`Pacific/Kiritimati`, `de-DE`) so server/client mismatches show up as errors instead of passing silently on your machine.

### Without an agent

The same governed session is available from the CLI, with Coherent's own model routing the request:

```bash
coherent edit "make the primary color emerald"            # plan → impact → apply → verify
coherent edit "tighten the pricing cards" --dry-run       # scope and affected routes only
coherent edit --undo                                      # byte-exact rollback of the last edit
```

## Classic generator (deprecated)

Everything below describes the old generation pipeline (`coherent chat`, `/coherent-generate`, the Design System viewer). It still works in projects created with `coherent init --classic`, but it is no longer developed and will be removed in a future release. See [MIGRATION-v0.27](docs/MIGRATION-v0.27.md).

## CLI Commands

| Command | Description |
|---------|-------------|
| `coherent init [dir]` | Agent mode setup: new Next.js app in an empty folder, agent only in an existing app |
| `coherent edit "<request>"` | Governed edit from the CLI: scope, impact, apply, verify, undo |
| `coherent mcp --profile agent` | MCP server with the four governance tools |
| `coherent init --classic` | Deprecated: old generator project with design system viewer |
| `coherent chat "<message>"` | Generate or modify pages using natural language |
| `coherent preview` | Start the dev server with auto-fix and file watching |
| `coherent check` | Show all problems: page quality, component integrity, broken links |
| `coherent fix` | Auto-fix everything: cache, dependencies, components, syntax, quality |
| `coherent fix --journal` | Capture fix session to `.coherent/fix-sessions/` for later review |
| `coherent journal list` / `aggregate` / `prune` | Review captured fix sessions, rank recurring issues, prune old entries |
| `coherent sync` | Sync Design System with code after manual edits in your editor |
| `coherent export` | Export a clean, deployable Next.js project (strips DS overlay) |
| `coherent undo` | Restore project to state before the last `coherent chat` |
| `coherent rules` | Regenerate `.cursorrules` and `CLAUDE.md` (AI editor context) |
| `coherent update` | Apply platform updates to an existing project |
| `coherent status` | Show current project status |
| `coherent components list` | List all shared and UI components |
| `coherent chat -i` | Interactive chat mode (REPL) |

### Examples

```bash
# Generate a complete multi-page app
coherent chat "create an e-commerce site with product catalog, cart, checkout, and account pages"

# Modify design tokens
coherent chat "change primary color to #6366f1 and use Inter font"

# Target a specific component
coherent chat --component "Header" "add a search button"

# Target a specific page — surgical edit (single LLM call, minimal diff)
coherent chat --page "pricing" "add a fourth enterprise tier"

# Target a design token
coherent chat --token "primary" "change to indigo"

# Interactive mode
coherent chat -i

# After editing code manually in Cursor/VS Code
coherent sync

# Export for deployment
coherent export
```

## Two Workflows

Coherent supports two ways of working. Use whichever fits your task — or combine them.

### CLI (fast scaffolding)

Run commands in your terminal. Each command goes through the full pipeline: AI generation, component reuse, validation, and auto-fix.

```bash
coherent chat "add a dashboard with revenue stats and user growth chart"
coherent chat "add a settings page with profile form and notification preferences"
coherent preview
```

**Best for:** creating pages, changing tokens, batch operations, quick prototyping.

### Editor (fine-grained control)

Edit code directly in Cursor, VS Code, or any editor. Coherent provides AI context via `.cursorrules` and `CLAUDE.md` — your editor's AI knows about your shared components, design tokens, and quality rules.

After manual edits, run `coherent sync` to update the Design System:

```bash
# Edit files in your editor...
coherent sync      # updates Design System to match your code
coherent check     # verify everything is consistent
```

**Best for:** custom components, complex logic, pixel-perfect styling, detailed work.

### Recommended workflow

```bash
# 1. Scaffold with CLI
coherent chat "add e-commerce: products, cart, checkout"

# 2. Fix any generation issues
coherent fix

# 3. Preview
coherent preview

# 4. Polish in your editor
#    - Customize ProductCard component
#    - Add business logic
#    - Fine-tune responsive styles

# 5. Sync and commit
coherent sync
git commit -m "Product catalog complete"

# 6. Continue building
coherent chat "add admin panel with order management"
```

## What Coherent Creates

When you run `coherent init` followed by `coherent chat`, your project gets this structure:

```
my-app/
├── app/
│   ├── layout.tsx                  # Root layout with shared header/footer
│   ├── page.tsx                    # Home page
│   ├── about/page.tsx              # Generated pages...
│   ├── pricing/page.tsx
│   ├── AppNav.tsx                  # Platform navigation + Design System button
│   ├── ShowWhenNotAuthRoute.tsx     # Route-based component visibility
│   └── design-system/             # Design System viewer (auto-generated)
│       ├── page.tsx                #   Overview
│       ├── components/page.tsx     #   Component library
│       ├── shared/page.tsx         #   Shared components (CID-xxx)
│       ├── tokens/page.tsx         #   Design tokens
│       ├── sitemap/page.tsx        #   Page architecture
│       └── docs/                   #   Documentation & recommendations
├── components/
│   ├── ui/                        # shadcn/ui components (Button, Card, Input...)
│   └── *.tsx                      # Custom components (auto-detected by sync)
├── design-system.config.ts         # Single source of truth for the design system
├── coherent.components.json        # Shared component manifest (CID registry)
├── .cursorrules                    # AI context for Cursor
├── CLAUDE.md                      # AI context for Claude Code
└── globals.css                    # Tailwind CSS with design tokens
```

### Key files

**`design-system.config.ts`** — The single source of truth. Contains all pages, components, design tokens (colors, typography, spacing), and page metadata. Every Coherent command reads from and writes to this file.

**`coherent.components.json`** — The shared component registry. Each component gets a unique ID (CID-001, CID-002...) and tracks where it's used. This enables component reuse across pages and powers the Design System viewer.

**`.cursorrules` / `CLAUDE.md`** — AI context files that tell your editor's AI about your design system. Automatically regenerated when you run `coherent sync` or `coherent rules`.

## AI Provider Setup

Coherent uses Claude (by Anthropic) for code generation. `coherent init` auto-detects which path fits your environment — you don't normally pick. The two paths are:

| Mode | Auto-picked when | API key required? | Command |
|------|------------------|-------------------|---------|
| **Claude Code skill** | `.claude/` is reachable (Claude Code installed), no API key present. | ❌ No | `/coherent-generate` (in Claude Code) |
| **Standalone CLI** | An API key is set in the environment, or Claude Code isn't detected. | ✅ Yes | `coherent chat "..."` |

If both signals are present, init configures both paths and surfaces both commands in its "Get Started" output. Override with `coherent init --skill-mode` / `--api-mode` / `--both` only if you want to force one.

In skill mode, your Claude Code session does the generation using your subscription. Coherent contributes the constraint bundle and the quality validator — no tokens spent on our side, no API key needed, fully within Anthropic's Terms of Service.

### Claude Code skill path (no API key)

1. Run `coherent init`. With Claude Code detected, it auto-writes `.claude/skills/coherent-generate/SKILL.md` plus supporting `.claude/commands/` entries and skips the API-key prompt.
2. Open the project in Claude Code.
3. Run `/coherent-generate "build a CRM dashboard"` — your session orchestrates the phase rail (plan → anchor → extract-style → components → page × N → log-run) while Coherent's deterministic validator (`coherent check` + `coherent fix`) enforces the constraints on each ingest.

Already have a project on an older Coherent version? Run `coherent update` to refresh the `.claude/` skills and commands.

### Standalone CLI path (API key)

1. Go to [console.anthropic.com](https://console.anthropic.com), create a key.
2. During `coherent init`, enter the key when prompted — it's saved to `.env` in your project (already in `.gitignore`). Force this path with `coherent init --api-mode` if Claude Code is also present. Or set manually:

```bash
echo "ANTHROPIC_API_KEY=sk-ant-..." > .env
# or
export ANTHROPIC_API_KEY=sk-ant-...
```

3. Model override (optional): `export CLAUDE_MODEL=claude-sonnet-4-20250514`.

### Security

- Your API key (if any) is stored locally in `.env`, never committed to git.
- Coherent has no servers — all AI calls go directly from your machine to Anthropic.
- Skill mode sends nothing to Anthropic on Coherent's behalf — your Claude Code session does, as usual.

### Why can't Coherent CLI just use my Claude Code subscription?

Anthropic's Terms of Service explicitly prohibit external tools from using OAuth tokens issued to Claude Free / Pro / Max accounts. Coherent CLI piggybacking on your subscription would violate that and could risk your account. The skill mode (Mode B) is the legally sanctioned path: your own Claude Code session does the work, Coherent provides constraints and validation. See [Anthropic authentication docs](https://code.claude.com/docs/en/authentication) and [discussion in claude-code#6536](https://github.com/anthropics/claude-code/issues/6536).

If you accidentally expose an API key, revoke it immediately at [console.anthropic.com/settings/keys](https://console.anthropic.com/settings/keys) and create a new one.

## Design System Viewer

Every Coherent project includes a live Design System viewer at `/design-system`. It shows:

- **Overview** — Project summary, page count, component count
- **Components** — All UI components with variants, sizes, and code examples
- **Shared Components** — Reusable layout/section components with CID tracking
- **Tokens** — Color palette, typography scale, spacing, border radius
- **Sitemap** — Visual map of all pages and their connections
- **Documentation** — Auto-generated docs and UX recommendations

The viewer updates automatically when you add pages or run `coherent sync`.

## Quality System

Coherent validates generated code against 38+ validators covering typography, spacing, accessibility, color usage, touch targets, interaction states, and CVA-inheritance traps (Button-as-container patterns).

### `coherent check` (read-only diagnostics)

```bash
coherent check
```

Reports:
- Raw Tailwind colors (should use semantic tokens like `bg-primary`)
- Missing accessibility labels
- Heading hierarchy issues
- Native HTML elements (should use design system components)
- Broken internal links
- Orphaned or unused shared components

### `coherent fix` (auto-repair)

```bash
coherent fix
```

A unified self-healing command that fixes most issues in one run:

- **TypeScript errors** — two-pass auto-fix: deterministic fixers handle field name mismatches, union type casing, and missing event handlers; AI fallback fixes remaining errors when an API key is configured
- **Missing components** — auto-installs shadcn/ui components referenced in code
- **Raw colors** → semantic tokens (`bg-blue-500` → `bg-primary`)
- **CSS variables** — syncs `globals.css` with design tokens
- **Route group layouts** — verifies public/app/auth layout structure
- **Build cache** — clears stale `.next` artifacts
- **Component manifest** — removes stale entries, adds missing ones

Run `coherent fix` after `coherent chat` to catch and repair any generation issues. Most TypeScript and quality problems are fixed automatically — no manual intervention needed.

### `coherent sync` (reverse sync)

After editing code manually in your editor, run `coherent sync` to update the Design System:

```bash
coherent sync              # full sync
coherent sync --tokens     # only CSS variables
coherent sync --components # only component detection
coherent sync --patterns   # only style patterns
coherent sync --dry-run    # preview changes without writing
```

This extracts CSS variables, detects new custom components, captures style patterns, updates page metadata, and regenerates the Design System viewer.

## Development from Source

### Prerequisites

- Node.js 20+
- pnpm 8+

### Setup

```bash
git clone https://github.com/skovtun/coherent-design-method.git
cd coherent-design-method

# Install all dependencies
pnpm install

# Build packages (core first, then CLI)
pnpm build

# Link CLI globally so you can use `coherent` command
cd packages/cli
pnpm link --global

# Verify installation
coherent --version
```

### Project structure

```
coherent-design-method/
├── packages/
│   ├── core/       # @getcoherent/core — design system engine, generators, managers
│   ├── cli/        # @getcoherent/cli  — CLI commands, AI providers, quality tools
│   └── templates/  # Project templates
├── docs/           # Documentation
└── package.json    # Monorepo root (pnpm workspaces)
```

### Development workflow

```bash
# Watch mode for core package
cd packages/core && pnpm dev

# Watch mode for CLI package (in another terminal)
cd packages/cli && pnpm dev

# After changes, rebuild
pnpm build   # from monorepo root
```

## Troubleshooting

### "Not a Coherent project"

You're running a command outside a Coherent project directory. Make sure you're in a directory with `design-system.config.ts`:

```bash
cd my-app          # your project directory
coherent preview   # now it works
```

### "No API key found"

`coherent chat` is the API-key path. If you want key-less generation, use the **skill mode** instead: open the project in Claude Code and run `/coherent-generate "<request>"` — same pipeline, driven by your Claude Code subscription. See [AI Provider Setup](#ai-provider-setup).

### Build errors after generation

Run the auto-fixer:

```bash
coherent fix
```

This resolves most issues — TypeScript type errors, missing imports, component conflicts, and CSS problems. `coherent fix` uses deterministic fixers for common patterns and AI fallback for the rest. If issues persist, check the [full troubleshooting guide](./TROUBLESHOOTING.md).

### Pages look inconsistent

If pages were generated one-by-one (not in a batch), they may not share styles. Fix this:

```bash
coherent sync    # extracts style patterns from existing pages
```

Then generate new pages — they'll match the extracted patterns.

### "Module not found" for components

Coherent auto-installs missing shadcn components. If one is missing:

```bash
coherent fix     # auto-installs missing components
```

For the full list of known issues and solutions, see [TROUBLESHOOTING.md](./TROUBLESHOOTING.md).

## FAQ

Common user-facing questions with answers in [docs/FAQ.md](./docs/FAQ.md):

- Why does Coherent CLI need an API key even though I have Claude Code?
- How is Coherent different from v0 / bolt / lovable / tasteui?
- Where does Coherent store design decisions about my project?
- Can I use Coherent without Next.js?

## Contributing

We welcome contributions! See [CONTRIBUTING.md](./CONTRIBUTING.md) for:

- Development setup instructions
- How to make changes to core vs CLI
- Testing your changes locally
- Commit message conventions
- Pull request process

## License

[MIT](./LICENSE) — Sergei Kovtun

---

<p align="center">
  <a href="https://www.linkedin.com/in/sergeikovtun/">LinkedIn</a> · 
  <a href="https://github.com/skovtun/coherent-design-method">GitHub</a> · 
  <a href="https://getcoherent.design">Website</a>
</p>
