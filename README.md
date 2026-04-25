<h1 align="center">
  <strong>Coherent Design Method</strong>
</h1>

<p align="center">
  AI-powered design system generator.<br>
  Describe what you need — get interconnected pages with shared components, design tokens, and auto-generated documentation.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@getcoherent/cli"><img src="https://img.shields.io/npm/v/@getcoherent/cli.svg" alt="npm version"></a>
  <a href="https://github.com/skovtun/coherent-design-method/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="MIT License"></a>
  <img src="https://img.shields.io/badge/node-%3E%3D20-brightgreen" alt="Node 20+">
  <img src="https://img.shields.io/badge/next.js-15-black" alt="Next.js 15">
</p>

---

<p align="center">
  <a href="https://youtu.be/A-rCpn6O3SI">
    <img src="https://img.youtube.com/vi/A-rCpn6O3SI/maxresdefault.jpg" alt="Coherent Design Method — AI-powered design system generator" width="100%">
  </a>
</p>

<p align="center">
  <a href="https://youtu.be/A-rCpn6O3SI">▶ Watch on YouTube</a> ·
  <a href="https://github.com/skovtun/coherent-design-method/releases/download/v0.7.15/Coherent.Design.Method.DEMO.mp4">Download MP4</a>
</p>

---

## What is Coherent?

Most AI tools generate pages. Coherent generates **systems**.

When you ask for five pages, every page shares the same header, footer, color palette, spacing, and component library. Change the primary color once — all pages update. Add a component once — reuse it everywhere by ID. The design system documentation writes itself.

Coherent is a CLI that creates production-ready Next.js projects with a built-in design system. You describe what you want in plain English, and Coherent generates real code — not wireframes, not mockups, but working pages with real components, real data patterns, and a live Design System viewer at `/design-system`.

## Quick Start

**Prerequisites:** [Node.js](https://nodejs.org/) 20 or later.

### 1. Install

```bash
npm install -g @getcoherent/cli
```

<details>
<summary>Or install from source</summary>

```bash
git clone https://github.com/skovtun/coherent-design-method.git
cd coherent-design-method
pnpm install && pnpm build
cd packages/cli && pnpm link --global
```

</details>

### 2. Create a project

```bash
coherent init my-app
cd my-app
```

This creates a Next.js 15 project with Tailwind CSS, a component library, design tokens, and a Design System viewer — all pre-configured. Init detects your setup and wires the right generation path automatically:

- Claude Code installed, no API key → skill mode (no key required).
- API key present → API-key mode.
- Both → both available.

Init prints the exact next command for your setup. No flags needed; pass `--skill-mode` or `--api-mode` only if you want to force one.

### 3. Generate pages

Follow the command init printed for you. It's one of:

```
# If init detected Claude Code (skill mode — runs inside Claude Code, no API key)
/coherent-generate "create a SaaS landing page with pricing, about us, and contact pages"
```

```bash
# If init set up an API key (standalone, from any shell)
coherent chat "create a SaaS landing page with pricing, about us, and contact pages"
```

Either way, Coherent plans all pages, generates the home page first (establishing the visual style), then generates remaining pages with the same components, spacing, and color palette.

### 4. Preview

```bash
coherent preview
```

Opens your app at `http://localhost:3000`. The Design System viewer is at `http://localhost:3000/design-system`.

### 5. Iterate

Keep using whichever invocation init pointed you at:

```
# Skill mode
/coherent-generate "change primary color to indigo and make buttons more rounded"
/coherent-generate "add a dashboard page with stats and recent activity"
```

```bash
# API-key mode
coherent chat "update the pricing page: add a fourth enterprise tier"
```

Every change respects the existing design system. New pages inherit shared components. Token changes cascade everywhere.

## How It Works

When you request multiple pages, Coherent uses a 6-phase pipeline to ensure visual consistency:

```
Phase 1: Plan Pages         →  AI plans pages, routes, layout groups (sidebar/header/auth)
Phase 2: Architecture Plan  →  AI creates component architecture + extracts atmosphere
                               ("premium, Notion meets Linear" → dark-zinc, tight spacing, mono labels)
Phase 3: Generate Home      →  AI generates the landing/home page (sets visual direction)
Phase 4: Extract Patterns   →  Captures style patterns (cards, spacing, colors, typography)
Phase 5: Shared Components  →  Generates reusable components (StatCard, DataTable, etc.)
Phase 6: Generate Pages     →  AI generates remaining pages in parallel with shared context
```

Phase 2 extracts **atmosphere** from your prompt — mood phrases like "premium and focused" get mapped to concrete CSS choices (backgrounds, spacing, accents). Phase 4 captures the visual patterns from the home page and injects them into every subsequent page prompt.

## CLI Commands

| Command | Description |
|---------|-------------|
| `coherent init` | Create a new Coherent project with Next.js, Tailwind, and design system |
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

Coherent validates generated code against 100+ design rules covering typography, spacing, accessibility, color usage, touch targets, and interaction states.

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
