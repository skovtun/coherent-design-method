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
- Detail pages (Project Detail, Task Detail, Team Member) — auto-inferred
- Auth pages (Login, Register, Forgot Password, Reset Password)
- 8 auto-generated shared components (StatCard, ProjectCard, TaskList, etc.)
- Polished design with indigo color scheme

Let's get started.

---

## Step 1: Create the project

Every Coherent project starts with `init`. This sets up a Next.js 15 app with Tailwind CSS, shadcn/ui components, design tokens, and a Design System Viewer — all pre-configured and ready for AI-driven design.

~~~
coherent init taskflow
~~~

**What just happened:**
- Next.js 15 project with Tailwind CSS and shadcn/ui
- Design System Viewer at `/design-system`
- Default landing page with placeholder content
- Design tokens in `globals.css`
- AI context files (`.cursorrules`, `CLAUDE.md`)

Auth pages will be auto-generated during `coherent chat` — no need to scaffold them separately.

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

---

## Step 3: Generate the full app

This is where the magic happens. One prompt describes the entire application — pages, navigation, content structure — and Coherent generates everything.

~~~
coherent chat "Create a SaaS project management app called TaskFlow. Use sidebar navigation. Pages: landing page with hero, features, pricing sections; dashboard showing project stats, recent tasks, team activity; projects page with project cards showing progress; tasks page with task list and filters; team page with member cards and roles; settings page with profile, notifications and integrations tabs"
~~~

**Prompt tips:**
- **Name your app** — say "called TaskFlow" so Coherent uses it in headers, footers, and metadata. If you forget, you can rename later with `coherent chat "rename the app to TaskFlow"`.
- **State the navigation type** — say "Use SIDEBAR navigation" explicitly. Without this, Coherent defaults to header navigation.
- **Don't worry about auth pages** — Coherent auto-infers and generates `/login`, `/register`, `/forgot-password`, and `/reset-password` from cross-page links, placing them in a centered auth layout.
- **Don't worry about detail pages** — routes like `/projects/[id]` or `/tasks/[id]` are auto-inferred from list pages.

Behind the scenes, Coherent uses a 6-phase pipeline:

1. **Phase 1 — Plan Pages** — AI analyzes your prompt and determines which pages to create, including auto-inferred detail pages (e.g., `/projects/[id]`, `/tasks/[id]`) and auth pages (`/login`, `/register`, `/forgot-password`, `/reset-password`)
2. **Phase 2 — Architecture Plan** — AI creates a Component Architecture Plan: groups pages by navigation context (public/app/auth), identifies reusable UI components that appear on 2+ pages, and assigns page types (marketing, app, auth)
3. **Phase 3 — Generate Home** — Creates the landing page first, establishing visual style
4. **Phase 4 — Extract Style** — Pulls design patterns from the home page for consistency
5. **Phase 4.5 — Generate Shared Components** — Creates reusable components identified in the architecture plan (e.g., StatCard, ProjectCard, FilterBar)
6. **Phase 5 — Generate All Pages** — Creates remaining pages using the shared components and extracted style

Before applying changes, a **pre-flight check** auto-installs any missing shadcn/ui components (Badge, Tabs, Select, etc.). After each page is written, an **inline quality check** validates against design rules and auto-fixes errors when possible.

This ensures every page shares the same visual language — consistent colors, typography, spacing, and component style — with reusable components used across pages from the start.

[Screenshot: Terminal output showing generation phases]

> **Tip:** Occasionally a page may come back without content (especially with 14+ pages in one request). If you see a warning like _"Page X has no generated code"_, regenerate it individually:
>
> ~~~
> coherent chat "regenerate the Profile page with full content"
> ~~~

---

## Step 4: Review the result

Let's see what was generated. First, check the project status:

~~~
coherent status
~~~

This shows a summary: how many pages, shared components, and design tokens exist in the project.

[Screenshot: coherent status output]

Now preview the app:

~~~
coherent preview
~~~

Walk through every page to see the results. With the architecture plan, pages are organized into route groups:
- **Public** (`/`, `/landing`) — header navigation, marketing layout
- **App** (`/dashboard`, `/projects`, `/tasks`, `/team`, `/settings`) — sidebar navigation, data-dense layout
- **Auth** (`/login`, `/register`, `/forgot-password`, `/reset-password`) — centered card, no navigation

[Screenshot: Landing page — hero section]

[Screenshot: Landing page — features section]

[Screenshot: Landing page — pricing section]

[Screenshot: Dashboard with sidebar navigation]

[Screenshot: Projects page with project cards]

[Screenshot: Tasks page with task list]

[Screenshot: Team page with member cards]

[Screenshot: Settings page with tabs]

[Screenshot: Login page (centered card layout)]

[Screenshot: Register page]

**Try the dark mode toggle** — notice how all pages adapt automatically thanks to semantic design tokens. No hardcoded colors means perfect dark mode support out of the box.

[Screenshot: Dashboard in dark mode]

---

## Step 5: Refine the design

The generated app looks good, but we want to make it our own. Let's change the color scheme and improve the landing page hero.

~~~
coherent chat "Change the color scheme to indigo primary, make the landing page hero more impactful with gradient background"
~~~

Design tokens cascade across all pages automatically. When you change the primary color from the default to indigo, every button, link, accent, and highlighted element updates — across every page, in both light and dark mode.

[Screenshot: Landing page hero — before (default colors)]

[Screenshot: Landing page hero — after (indigo + gradient)]

[Screenshot: Design System Viewer — updated color tokens]

---

## Step 6: Edit a specific page

Sometimes you want to refine just one page without touching the rest. The `--page` flag gives you precision control.

Let's redesign the pricing section:

~~~
coherent chat --page "Pricing" "Redesign the pricing section: 3 tiers (Starter, Pro, Enterprise) as cards with a highlighted recommended plan, monthly/yearly toggle, feature comparison list below"
~~~

**Why `--page`?** Without the flag, Coherent might interpret your prompt as a request affecting multiple pages. The `--page` flag scopes the change to exactly the page you specify.

[Screenshot: Pricing section — before]

[Screenshot: Pricing section — after (3-tier cards with highlighted plan)]

---

## Step 7: See what you have

As your project grows, it's helpful to see what components exist. The `components list` command gives you an inventory:

~~~
coherent components list
~~~

You'll see shared components (Header, Footer, Sidebar) created during generation, plus all UI components from shadcn/ui. Each shared component has a unique ID (CID-001, CID-002, etc.) tracked in the component registry.

[Screenshot: coherent components list output]

---

## Step 8: Create a reusable component

Coherent already generated shared components during Phase 4.5 (StatCard, ProjectCard, TaskList, etc.), but you can also create new ones manually. Here's where design systems shine. Let's create a **StatsPanel** — a custom row of metric cards with trend indicators.

~~~
coherent chat --component "StatsPanel" "Create a shared StatsPanel component — a horizontal row of 4 stat cards. Each card has: an icon in a rounded colored background, a large metric number, a label below, and a trend indicator (up/down arrow with percentage in green or red). Use Card from shadcn, semantic tokens for colors"
~~~

This creates a new shared component and registers it in the component system. The component uses design tokens for colors, so it automatically adapts to light/dark mode and respects the color scheme.

[Screenshot: Terminal output showing component creation]

---

## Step 9: Use the component across pages

Now we'll place StatsPanel on three different pages, each with contextually relevant data:

~~~
coherent chat "Update the dashboard page to use StatsPanel at the top showing: Total Projects, Active Tasks, Team Members, Completed This Week. Also add StatsPanel to the projects page showing: Total Projects, In Progress, Completed, Overdue. And to settings page showing: Storage Used, API Calls, Team Size, Active Integrations"
~~~

One prompt, three pages updated. The StatsPanel component stays consistent — same layout, same visual treatment — but the data and icons are different on each page.

[Screenshot: Dashboard with StatsPanel]

[Screenshot: Projects page with StatsPanel]

[Screenshot: Settings page with StatsPanel]

---

## Step 10: Modify the component — updates everywhere

This is the real power of shared components. When you change StatsPanel, it updates on all three pages simultaneously.

~~~
coherent chat --component "StatsPanel" "Redesign StatsPanel: add a sparkline mini chart to each card, make the trend percentage bolder, add a subtle hover effect with shadow elevation"
~~~

One edit, three pages updated. No copy-pasting, no hunting for duplicates, no inconsistencies.

[Screenshot: Updated StatsPanel with sparklines on Dashboard]

---

## Step 11: Undo and try again

Design is iterative. Sometimes an idea doesn't work out — and that's fine. Coherent keeps a backup of your project before every change.

The sparklines looked too busy? Let's undo:

~~~
coherent undo
~~~

This restores the project to the state before the last `coherent chat` command. Now let's try a different design direction:

~~~
coherent chat --component "StatsPanel" "Make the StatsPanel cards more compact with smaller icons, add a thin colored left border matching the icon color, keep the trend indicator but remove the percentage — just show the arrow"
~~~

The undo → iterate cycle is how real design works. Try something, evaluate, revert if needed, try something different. No code to manage, no git conflicts — just creative exploration.

[Screenshot: StatsPanel after undo (original design)]

[Screenshot: StatsPanel with new design (compact, colored left border)]

---

## Step 12: Edit a layout component

Layout components like the Header appear on every page. Editing them is just as easy — and the change is reflected site-wide.

~~~
coherent chat --component "Header" "Add a notification bell icon with a red dot badge and user avatar dropdown to the header"
~~~

[Screenshot: Header before (simple)]

[Screenshot: Header after (with notification bell and avatar dropdown)]

---

## Step 13: Check quality

Coherent already runs inline quality checks during generation, auto-fixing common issues (HTML entities, missing `"use client"`, border cleanup, icon validation). But before exporting, let's run the full quality checker. It validates your entire project against 97 design rules covering:

- **Color consistency** — no hardcoded Tailwind colors (like `bg-blue-500`), only semantic tokens
- **Accessibility** — heading hierarchy, alt text, focus indicators
- **Typography** — consistent font sizes and weights
- **Layout** — proper spacing, no broken internal links

~~~
coherent check
~~~

[Screenshot: coherent check output showing results]

---

## Step 14: Auto-fix issues

Coherent can automatically fix many of the detected issues — replacing raw colors with semantic tokens, fixing missing imports, normalizing typography.

~~~
coherent fix
~~~

[Screenshot: coherent fix output showing fixes applied]

Run `coherent check` again to confirm everything is clean:

~~~
coherent check
~~~

[Screenshot: coherent check output — all clean]

---

## Step 15: Export for deployment

Your app is ready. Export it as a clean Next.js project — stripped of all Coherent development artifacts (Design System Viewer, config files, dev tools) — ready for deployment to Vercel, Netlify, or any Node.js host.

~~~
coherent export --output ./taskflow-export
~~~

The exported app is a standard Next.js project. Deploy it however you normally would:

~~~
cd taskflow-export
npx vercel
~~~

[Screenshot: coherent export output]

[Screenshot: Exported project folder structure]

---

## What we built

In ~30 minutes and 12 prompts, we created a complete SaaS application with:

- **14 pages** — Landing, Dashboard, Projects, Project Detail, Tasks, Task Detail, Team, Team Member, Settings, Login, Register, Forgot Password, Reset Password, and Home
- **Sidebar navigation** — set explicitly in the prompt ("Use SIDEBAR navigation")
- **Route groups** — public (header nav), app (sidebar), auth (no nav, centered card)
- **8+ shared components** — StatCard, ProjectCard, TaskList, MemberCard, FilterBar, ActivityFeed, plus custom StatsPanel
- **Design tokens** — indigo color scheme, consistent across light and dark mode
- **Auth flow** — Login, Register, Forgot Password, Reset Password with centered card layout
- **Inline quality checks** — errors auto-fixed during generation
- **Production export** — clean Next.js app, ready to deploy

### The workflow

1. **Describe** what you want in natural language
2. **Preview** the result instantly
3. **Iterate** — change colors, add pages, create components
4. **Reuse** — shared components update everywhere
5. **Undo** — try different approaches risk-free
6. **Check** — validate quality automatically
7. **Export** — deploy to production

No CSS written. No component libraries researched. No design-to-code handoff. Just ideas → working app.

---

*Built with [Coherent Design Method](https://github.com/skovtun/coherent-design-method). Install with `npm install -g @getcoherent/cli`.*
