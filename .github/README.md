<p align="center">
  <h1 align="center">Coherent Design Method</h1>
  <p align="center">
    One command. Consistent UI everywhere.
    <br />
    <a href="https://getcoherent.design">Website</a> · <a href="#quick-start">Quick Start</a> · <a href="#how-it-works">How It Works</a> · <a href="CONTRIBUTING.md">Contributing</a>
  </p>
</p>

<p align="center">
  <a href="https://github.com/skovtun/coherent-design-method/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="License" /></a>
  <a href="https://github.com/skovtun/coherent-design-method"><img src="https://img.shields.io/github/stars/skovtun/coherent-design-method?style=social" alt="Stars" /></a>
</p>

---

Coherent is an open-source CLI that generates multi-page UI prototypes where every page shares the same components, design tokens, and documentation. Describe what you need — get interconnected pages that stay consistent automatically.

**The problem:** AI tools generate beautiful single pages. Add a second page, and consistency breaks — different headers, different buttons, different spacing. Every page is an island.

**The solution:** Coherent maintains a component registry and design system across all pages. Change a color token — every page updates. Edit a header component — it updates everywhere. Your design system builds itself as you work.

## Quick Start

```bash
npm install -g @getcoherent/cli
coherent init my-app
cd my-app
coherent chat "create a SaaS app with dashboard, settings, and pricing pages"
coherent preview
```

Five commands. A complete multi-page prototype with shared components and a live design system.

## How It Works

**1. Describe what you need**

```bash
coherent chat "add a dashboard with revenue stats, user growth chart, and recent activity"
```

Coherent generates a complete page using your design system's components and tokens. Not a wireframe — real Next.js code with real components.

**2. Every page stays in sync**

```bash
coherent chat "add a settings page with profile form and notifications"
coherent chat "add a pricing page with three tiers"
```

Each new page automatically reuses the same Header, Footer, and design tokens. No copy-paste. No drift.

**3. Change once, update everywhere**

```bash
coherent chat "make the primary color green"
```

One command. All pages update. The design system viewer at `/design-system` shows every component, token, and recommendation.

**4. Export and ship**

```bash
coherent export --output ./my-app
```

Clean Next.js project. No platform code. No lock-in. Deploy to Vercel in one click.

## Two Ways to Build

**CLI** — Each command goes through the full pipeline: AI generation → component reuse → validation → auto-fix.

```bash
coherent chat "add a blog with article list and comments"
```

**Any AI Editor** — Coherent provides context to Cursor, Claude Code, and other editors via `.cursorrules` and `CLAUDE.md`. Your AI knows about shared components, design tokens, and quality rules.

## Features

- **Shared components with IDs** — `CID-001` is your Header. Edit it once, every page updates.
- **Design system viewer** — Auto-generated component library, token reference, and UX recommendations at `/design-system`.
- **97 design constraints** — Typography, spacing, accessibility, color tokens — enforced automatically during generation.
- **12 page templates** — Dashboard, settings, blog, gallery, FAQ, changelog, and more.
- **Figma import** — `coherent import figma <url>` converts your designs to a working prototype.
- **Self-healing** — `coherent fix` auto-repairs cache, dependencies, syntax, and style issues.
- **Component integrity** — `coherent check` detects orphaned, unused, and duplicate components across your project.
- **Style sync** — `coherent sync` extracts actual design patterns from your code and updates the design system to match.

## CLI Reference

| Command | Description |
|---------|-------------|
| `coherent init` | Create a new project with design system |
| `coherent chat "..."` | Generate or modify pages with AI |
| `coherent preview` | Launch dev server with hot reload |
| `coherent check` | Show all quality and consistency issues |
| `coherent fix` | Auto-fix everything possible |
| `coherent sync` | Sync design system with actual code |
| `coherent export` | Export clean production-ready Next.js |
| `coherent update` | Update platform files in existing project |
| `coherent rules` | Regenerate .cursorrules + CLAUDE.md |

## Tech Stack

- **Next.js** — React framework with App Router
- **Tailwind CSS** — Utility-first styling
- **shadcn/ui** — Base component library
- **Claude / GPT-4** — AI generation (bring your own API key)

## Project Structure

```
coherent-design-method/
├── packages/
│   ├── core/           # Design system engine — no AI dependencies
│   └── cli/            # CLI commands, AI providers, validation
├── docs/               # Documentation
├── CONTRIBUTING.md     # How to contribute
└── TROUBLESHOOTING.md  # Common issues and fixes
```

## Contributing

We welcome contributions. See [CONTRIBUTING.md](CONTRIBUTING.md) for setup instructions and guidelines.

## License

MIT — see [LICENSE](LICENSE) for details.

## Author

**Sergei Kovtun** — [LinkedIn](https://www.linkedin.com/in/sergeikovtun/) · [GitHub](https://github.com/skovtun)

---

<p align="center">
  <a href="https://getcoherent.design">getcoherent.design</a>
</p>
