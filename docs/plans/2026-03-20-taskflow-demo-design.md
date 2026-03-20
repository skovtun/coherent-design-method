# TaskFlow Demo & Tutorial Design

> A complete test plan that doubles as a step-by-step tutorial article.

## Goal

Create a demo SaaS application (TaskFlow — project management) that:
1. Covers every user-facing platform capability
2. Produces a polished demo app for showcasing
3. Generates a tutorial article with prompts, steps, and screenshot placeholders

## Audience

Designers and product managers — focus on visual results, not code internals.

## Application: TaskFlow

**Type:** SaaS project management platform

**Pages:**
- `/` — Landing page (hero, features, pricing, CTA)
- `/dashboard` — Dashboard with metrics, recent tasks, team activity
- `/projects` — Project cards with progress bars
- `/tasks` — Task list with filters
- `/team` — Team members, roles, avatars
- `/settings` — Profile, notifications, integrations tabs
- `/login` — Auth pages (+ register, forgot-password via auto-scaffold)

**Navigation:** Sidebar for the app, header on the landing page.

## Scenario: 15 Steps

### Step 1: Init
```
coherent init taskflow
```
Creates the project, auto-scaffolds auth pages (login, register, forgot-password).

**Screenshots:** Terminal output, project folder structure.

---

### Step 2: Preview default
```
coherent preview
```
Opens the default landing page and Design System Viewer at `/design-system`.

**Screenshots:** Default landing page, Design System Viewer overview.

---

### Step 3: Generate the full app
```
coherent chat "Create a SaaS project management app called TaskFlow with: landing page with hero, features, pricing sections; dashboard with sidebar navigation showing project stats, recent tasks, team activity; projects page with project cards showing progress; tasks page with task list and filters; team page with member cards and roles; settings page with profile, notifications and integrations tabs"
```
Single prompt generates all pages — demonstrates the 4-phase generation (plan → home → extract style → generate rest).

**Screenshots:** Terminal output showing generation phases.

---

### Step 4: Preview + Status
```
coherent status
coherent preview
```
Review the generated app. Walk through every page.

**Screenshots:** `coherent status` output, Landing page (light), Dashboard, Projects, Tasks, Team, Settings, Login/Register pages. Show dark mode toggle (light + dark screenshots for landing or dashboard).

---

### Step 5: Change color scheme
```
coherent chat "Change the color scheme to indigo primary, make the landing page hero more impactful with gradient background"
```
Iterative design refinement — demonstrates token-level changes cascading across all pages.

**Screenshots:** Before/after of landing hero, updated Design System Viewer tokens.

---

### Step 6: Edit Pricing page
```
coherent chat --page "Pricing" "Redesign the pricing section: 3 tiers (Starter, Pro, Enterprise) as cards with a highlighted recommended plan, monthly/yearly toggle, feature comparison list below"
```
Targeted page editing with `--page` flag — precision control over a single page.

**Screenshots:** Pricing section before and after.

---

### Step 7: List components
```
coherent components list
```
See what shared components the platform created (Header, Footer, Sidebar, etc.).

**Screenshots:** Terminal output showing component list.

---

### Step 8: Create StatsPanel component
```
coherent chat --component "StatsPanel" "Create a shared StatsPanel component — a horizontal row of 4 stat cards. Each card has: an icon in a rounded colored background, a large metric number, a label below, and a trend indicator (up/down arrow with percentage in green or red). Use Card from shadcn, semantic tokens for colors"
```
Creating a reusable shared component from scratch.

**Screenshots:** StatsPanel component in isolation (if visible), component registry update.

---

### Step 9: Add StatsPanel to 3 pages
```
coherent chat "Update the dashboard page to use StatsPanel at the top showing: Total Projects, Active Tasks, Team Members, Completed This Week. Also add StatsPanel to the projects page showing: Total Projects, In Progress, Completed, Overdue. And to settings page showing: Storage Used, API Calls, Team Size, Active Integrations"
```
One prompt places the component on multiple pages with different data.

**Screenshots:** Dashboard with StatsPanel, Projects with StatsPanel, Settings with StatsPanel.

---

### Step 10: Modify StatsPanel
```
coherent chat --component "StatsPanel" "Redesign StatsPanel: add a sparkline mini chart to each card, make the trend percentage bolder, add a subtle hover effect with shadow elevation"
```
Single component change propagates to all 3 pages automatically.

**Screenshots:** Updated StatsPanel on Dashboard (showing sparklines and hover effect).

---

### Step 11: Undo + Redo differently
```
coherent undo
```
Don't like the sparklines? Undo the last change. Then try a different approach:
```
coherent chat --component "StatsPanel" "Make the StatsPanel cards more compact with smaller icons, add a thin colored left border matching the icon color, keep the trend indicator but remove the percentage — just show the arrow"
```
Demonstrates the undo → iterate cycle — a natural design workflow.

**Screenshots:** StatsPanel after undo (original), StatsPanel after the new edit.

---

### Step 12: Edit Header
```
coherent chat --component "Header" "Add a notification bell icon with a red dot badge and user avatar dropdown to the header"
```
Editing a layout-level shared component.

**Screenshots:** Header before and after (notification bell, avatar dropdown).

---

### Step 13: Quality check
```
coherent check
```
Run platform quality validation — raw colors, accessibility, heading hierarchy, broken links.

**Screenshots:** Terminal output showing check results.

---

### Step 14: Autofix
```
coherent fix
```
Automatically fix detected issues.

**Screenshots:** Terminal output showing fixes applied.

---

### Step 15: Export
```
coherent export --output ./taskflow-export
```
Export a clean, deployable Next.js app (stripped of Coherent artifacts).

**Screenshots:** Terminal output, exported folder structure.

---

## Capability Coverage

| Capability | Step |
|---|---|
| `coherent init` | 1 |
| `coherent preview` | 2, 4 |
| `coherent chat` (full generation) | 3 |
| `coherent chat` (iteration) | 5, 9 |
| `coherent chat --page` | 6 |
| `coherent chat --component` (create) | 8 |
| `coherent chat --component` (modify) | 10, 11, 12 |
| `coherent status` | 4 |
| `coherent components list` | 7 |
| `coherent undo` | 11 |
| `coherent check` | 13 |
| `coherent fix` | 14 |
| `coherent export` | 15 |
| Auth auto-scaffold | 1 |
| Sidebar navigation | 3 |
| Design System Viewer | 2 |
| Dark/light theme toggle | 4 |
| Shared component workflow | 8-11 |
| Design token cascade | 5 |
| 4-phase generation | 3 |

## Article Structure

The article follows the same 15 steps with:
- Brief intro (what is Coherent, what we're building)
- Each step: command, explanation (1-2 sentences), screenshot placeholder
- Narrative thread: natural development flow from idea to deployable app
- Conclusion: recap of what was built, time taken, link to demo

## Screenshot Placeholders

Format: `[Screenshot: description]` — replaced manually after running the scenario.

Total estimated screenshots: ~30-35 across all steps.
