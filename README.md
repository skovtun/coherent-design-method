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

This creates a Next.js 15 project with Tailwind CSS, a component library, design tokens, and a Design System viewer — all pre-configured. During init, you'll be asked for an [Anthropic API key](#ai-provider-setup) (needed for AI generation).

### 3. Generate pages

```bash
coherent chat "create a SaaS landing page with pricing, about us, and contact pages"
```

Coherent plans all pages, generates the home page first (establishing the visual style), then generates remaining pages with the same components, spacing, and color palette.

### 4. Preview

```bash
coherent preview
```

Opens your app at `http://localhost:3000`. The Design System viewer is at `http://localhost:3000/design-system`.

### 5. Iterate

```bash
coherent chat "change primary color to indigo and make buttons more rounded"
coherent chat "add a dashboard page with stats and recent activity"
coherent chat "update the pricing page: add a fourth enterprise tier"
```

Every change respects the existing design system. New pages inherit shared components. Token changes cascade everywhere.

## How It Works

When you request multiple pages, Coherent uses a 4-phase architecture to ensure visual consistency:

```
Phase 1: Plan         →  AI plans all pages (names, routes, descriptions)
Phase 2: Generate Home →  AI generates the home page with header, footer, full styling
Phase 3: Extract       →  Local processing: extracts header/footer as shared components,
                           captures style patterns (cards, spacing, colors, typography)
Phase 4: Generate Rest →  AI generates remaining pages with extracted style context
                           injected into each prompt — ensuring visual consistency
```

Phase 3 extracts style patterns from the home page and injects them as concrete CSS classes into subsequent page prompts — ensuring every page uses the same card styles, spacing, typography, and color patterns.

## CLI Commands

| Command | Description |
|---------|-------------|
| `coherent init` | Create a new Coherent project with Next.js, Tailwind, and design system |
| `coherent chat "<message>"` | Generate or modify pages using natural language |
| `coherent preview` | Start the dev server with auto-fix and file watching |
| `coherent check` | Show all problems: page quality, component integrity, broken links |
| `coherent fix` | Auto-fix everything: cache, dependencies, components, syntax, quality |
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

# Target a specific page
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

# 2. Polish in your editor
#    - Customize ProductCard component
#    - Add business logic
#    - Fine-tune responsive styles

# 3. Sync and commit
coherent sync
git commit -m "Product catalog complete"

# 4. Continue building
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

Coherent uses Claude (by Anthropic) for AI-powered code generation. You need an API key for the `coherent chat` command.

### Step 1: Get an API key

1. Go to [console.anthropic.com](https://console.anthropic.com)
2. Sign up or log in
3. Navigate to **API Keys** in your account settings
4. Click **Create Key** and copy it

### Step 2: Configure the key

During `coherent init`, you'll be prompted to enter your key. It's saved to `.env` in your project directory (already in `.gitignore`).

To set it manually:

```bash
# In your project directory
echo "ANTHROPIC_API_KEY=sk-ant-..." > .env
```

Or export it in your shell:

```bash
export ANTHROPIC_API_KEY=sk-ant-...
```

### Model configuration

Coherent uses the latest Claude Sonnet model by default. To override:

```bash
export CLAUDE_MODEL=claude-sonnet-4-20250514   # or any Claude model
```

### Security

- Your API key is stored locally in `.env` (never committed to git)
- Coherent sends your design instructions to the Claude API and receives generated code
- No data is stored on Coherent's servers — there are no Coherent servers
- Each user needs their own API key

If you accidentally expose a key, revoke it immediately at [console.anthropic.com/settings/keys](https://console.anthropic.com/settings/keys) and create a new one.

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

Coherent validates generated code against 97 design rules covering typography, spacing, accessibility, and color usage.

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

Automatically fixes:
- Raw colors → semantic tokens
- `text-base` → `text-sm` (design system base)
- Heavy shadows → `shadow-sm`
- Missing component imports
- Stale component manifest entries
- Build cache issues

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

You need an Anthropic API key for `coherent chat`. See [AI Provider Setup](#ai-provider-setup).

### Build errors after generation

Run the auto-fixer:

```bash
coherent fix
```

This resolves most issues (missing imports, syntax problems, component conflicts). If issues persist, check the [full troubleshooting guide](./TROUBLESHOOTING.md).

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
