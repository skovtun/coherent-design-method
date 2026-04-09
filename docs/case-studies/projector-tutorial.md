# No Figma. No design system. No CSS. Just prompts — and a production-ready UI in 30 minutes.

A typical SaaS UI takes days: wireframes in Figma, a design system to set up, a developer to implement it, and a designer to review it. I built the same result in 31 minutes using only natural language. Here's exactly how — every command, every prompt, every result.

**What you'll need:**
- A Mac or PC (Windows/macOS/Linux)
- Node.js 18+ — [download here](https://nodejs.org) if you don't have it
- An API key — Claude (Anthropic) or ChatGPT (OpenAI) — see below
- ~30 minutes

**What you'll build:**
- Landing page with hero, features, and pricing
- Dashboard with sidebar navigation
- Projects, Tasks, Team, and Settings pages
- Auth pages (Login, Register, Forgot Password, Reset Password)
- Auto-generated Design System with 10 shared components — more on why this matters below
- Consistent design tokens across light and dark mode

---

## Before you start: Get your API key

Coherent uses Claude (by Anthropic) or ChatGPT (by OpenAI) to generate your UI. You'll need an API key — think of it as a password that lets Coherent talk to the AI on your behalf.

**Option A — Claude (recommended):**

1. Go to [console.anthropic.com](https://console.anthropic.com) and create a free account
2. Click **API Keys** in the left sidebar → **Create Key**
3. Copy the key — it looks like `sk-ant-...`

**macOS / Linux:**
```bash
export ANTHROPIC_API_KEY=sk-ant-your-key-here
```

**Windows (Command Prompt):**
```bash
set ANTHROPIC_API_KEY=sk-ant-your-key-here
```

**Option B — ChatGPT:**

1. Go to [platform.openai.com](https://platform.openai.com) and create an account
2. Click **API Keys** → **Create new secret key**
3. Copy the key — it looks like `sk-...`

**macOS / Linux:**
```bash
export OPENAI_API_KEY=sk-your-key-here
```

**Windows (Command Prompt):**
```bash
set OPENAI_API_KEY=sk-your-key-here
```

> **How much will this cost?** Generating a full app like Projector uses roughly $0.50–$2 in API credits. New accounts on both platforms get free credits to start.

---

## How to open a terminal

- **macOS** — press `Cmd + Space`, type "Terminal", press Enter
- **Windows** — press `Win + R`, type "cmd", press Enter
- **VS Code** — press `` Ctrl + ` `` to open the built-in terminal

---

## Install Coherent

```bash
npm install -g @getcoherent/cli
```

One command. You only need to do this once.

---

## Step 1: Create the project

```bash
coherent init projector
```

This scaffolds a complete Next.js 15 app with Tailwind CSS, shadcn/ui, design tokens, and a Design System Viewer — zero configuration required.

**Cost:** $0 — no AI calls yet
**Time:** ~30 seconds

---

## Step 2: See what you're starting with

```bash
cd projector
coherent preview
```

Your browser opens automatically. You'll see a default landing page and can explore the Design System Viewer at `/design-system` — it updates in real time as you build.

![Coherent Design Method - Start Page](screenshots/00-start.png)

Try the theme toggle (sun/moon) to switch between light and dark mode. Both work out of the box.

---

## Step 3: Generate the entire app in one prompt

This is the part that feels like cheating.

```bash
coherent chat "Create a SaaS project management app called Projector. Use sidebar navigation for the app pages. Pages: landing page with hero section, features grid, pricing cards, and testimonials; dashboard showing project stats, recent activity feed, and task overview cards; projects page with project cards showing progress bars and team avatars; tasks page with task table, filters, and status badges; team page with member cards and roles; settings page with profile, notifications and integrations tabs"
```

**A few things worth knowing:**
- **Name your app** — "called Projector" makes it appear in headers, footers, and meta titles
- **State the navigation type** — "Use sidebar navigation" is explicit. Without it, Coherent defaults to header navigation
- **Don't scaffold auth or detail pages** — Coherent auto-generates `/login`, `/register`, `/forgot-password`, `/reset-password`, and detail routes like `/projects/[id]` based on your page descriptions

Coherent runs a 6-phase pipeline behind the scenes: it plans pages, architects shared components, generates the landing page first to establish visual style, extracts design patterns, then generates all remaining pages using that style. Every page that comes out shares the same tokens, spacing, and component language.

This step takes 2–5 minutes. You'll see progress in the terminal as each page is generated.

![Projector Landing Page](screenshots/01-landing.png)

![Projector Dashboard](screenshots/02-dashboard.png)

---

## Step 4: Check what was built

```bash
coherent status
```

Walk through every page. The app organizes into three layouts automatically:
- **Public** (`/`) — header navigation, marketing layout
- **App** (`/dashboard`, `/projects`, `/tasks`, `/team`, `/settings`) — sidebar navigation
- **Auth** (`/login`, `/register`, etc.) — centered card, no navigation

![Projects Page](screenshots/03-projects.png)

![Tasks Page](screenshots/04-tasks.png)

![Team Page](screenshots/05-team.png)

![Settings Page](screenshots/06-settings.png)

![Login Page](screenshots/07-login.png)

---

## Step 5: Change the entire color scheme in one line

Design tokens cascade. Change the primary color once — every button, link, accent, and highlight updates across all pages, in both light and dark mode.

```bash
coherent chat "Change the color scheme to indigo primary, make the landing page hero more impactful with gradient background"
```

---

## Step 6: Edit a specific page

The `--page` flag scopes changes to exactly one page — nothing else moves.

```bash
coherent chat --page "Landing" "Redesign the pricing section: 3 tiers (Starter, Pro, Enterprise) as cards with a highlighted recommended plan, monthly/yearly toggle, feature comparison list below"
```

Without `--page`, Coherent might apply changes to multiple pages if the prompt is ambiguous. The flag gives you surgical precision.

---

## The killer feature: shared components

When Coherent generated the app, it didn't just write pages of code. It identified which UI patterns appear across multiple pages, extracted them into shared components, and registered each one with a component ID.

```bash
coherent components list
```

| ID | Component | Used on |
|----|-----------|---------|
| CID-001 | Header | All public pages |
| CID-002 | Footer | All public pages |
| CID-003 | StatCard | Dashboard, Project Detail |
| CID-004 | ProjectCard | Projects, Dashboard |
| CID-005 | TaskItem | Tasks, Dashboard |
| CID-006 | MemberCard | Team |
| CID-007 | FilterBar | Projects, Tasks, Team |
| CID-008 | ActivityFeed | Dashboard |
| CID-009 | AppSidebar | All app pages |
| CID-010 | ThemeToggle | App layout |

Edit a component once — it updates everywhere it's used. No hunting for duplicates. No inconsistencies between pages.

---

## Step 7: Quality check and auto-fix

```bash
coherent check
```

97 design rules. Every page scanned. Internal links verified. Shared components validated.

```bash
coherent fix
```

TypeScript errors, missing components, raw color values, layout inconsistencies — fixed automatically.

---

## Step 8: Export and deploy

```bash
coherent export --output ./projector-export
```

The export strips all Coherent dev tooling and produces a standard Next.js project. Deploy anywhere:

```bash
cd projector-export
npx vercel
```

---

## What just happened

31 minutes. One prompt to generate. A handful of prompts to iterate.

The result: 14 pages, 10 shared components, consistent light and dark mode, a working auth flow, detail pages, a deployable Next.js codebase.

No CSS written. No Figma opened. No design system manually configured. No handoff meeting.

The workflow is simple enough to fit on one line:

**Describe → Preview → Iterate → Export.**

---

*Built with [Coherent Design Method](https://getcoherent.design). Install with `npm install -g @getcoherent/cli`.*
