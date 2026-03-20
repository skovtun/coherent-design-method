# From Idea to Production: Building a SaaS App with Coherent Design Method

> A step-by-step guide to creating a complete project management app — without writing a single line of code.

In this tutorial, we'll build **TaskFlow** — a full-featured SaaS project management application — using only natural language prompts. You'll see how to generate pages, create reusable components, iterate on design, check quality, and export a production-ready app.

**What you'll need:**
- Node.js 18+
- An Anthropic API key (Claude)
- ~30 minutes

**What you'll build:**
- Landing page with hero, features, and pricing
- Dashboard with sidebar navigation
- Projects, Tasks, Team, and Settings pages
- Auth pages (login, register, forgot password)
- Reusable StatsPanel component across 3 pages
- Polished design with indigo color scheme

Let's get started.

---

## Step 1: Create the project

Every Coherent project starts with `init`. This sets up a Next.js 15 app with Tailwind CSS, shadcn/ui components, design tokens, and a Design System Viewer — all pre-configured and ready for AI-driven design.

~~~
coherent init taskflow
~~~

When prompted, select **Yes** for auth scaffolding — this automatically creates Login, Register, and Forgot Password pages with a centered layout.

**What just happened:**
- Next.js 15 project with Tailwind CSS and shadcn/ui
- Design System Viewer at `/design-system`
- Auth pages: `/login`, `/register`, `/forgot-password`
- Design tokens in `globals.css`
- AI context files (`.cursorrules`, `CLAUDE.md`)

[Screenshot: Terminal output of coherent init]

[Screenshot: Project folder structure in file explorer]

---

## Step 2: Preview the starting point

Before making any changes, let's see what we have out of the box.

~~~
coherent preview
~~~

This starts the Next.js dev server and opens the app in your browser. You'll see a default landing page and can navigate to `/design-system` to explore the Design System Viewer.

**Things to notice:**
- The default landing page with placeholder content
- Theme toggle (sun/moon icon) — try switching between light and dark mode
- Design System Viewer at `/design-system` — this will update as we build

[Screenshot: Default landing page (light mode)]

[Screenshot: Default landing page (dark mode)]

[Screenshot: Design System Viewer overview]
