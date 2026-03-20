# TaskFlow Demo — Test Checklist

Run through this checklist to validate the scenario and capture screenshots.
Mark each step pass/fail and note any issues.

## Prerequisites
- [ ] Node.js 18+ installed
- [ ] Anthropic API key set (`ANTHROPIC_API_KEY`)
- [ ] Latest `@getcoherent/cli` installed (`npm install -g @getcoherent/cli@latest`)
- [ ] Clean working directory (no existing `taskflow` folder)

## Execution

### Step 1: Init
- [ ] Run: `coherent init taskflow`
- [ ] Select: Yes for auth scaffolding
- [ ] Verify: `taskflow/` folder created with `design-system.config.ts`, `globals.css`, auth pages
- [ ] Capture: Terminal output, folder structure
- [ ] Issues: ___

### Step 2: Preview default
- [ ] Run: `cd taskflow && coherent preview`
- [ ] Verify: Browser opens at localhost:3000, default landing page visible
- [ ] Verify: `/design-system` shows Design System Viewer
- [ ] Verify: Theme toggle works (light/dark)
- [ ] Capture: Default landing (light), default landing (dark), DS Viewer
- [ ] Issues: ___

### Step 3: Generate full app
- [ ] Run: `coherent chat "Create a SaaS project management app called TaskFlow with: landing page with hero, features, pricing sections; dashboard with sidebar navigation showing project stats, recent tasks, team activity; projects page with project cards showing progress; tasks page with task list and filters; team page with member cards and roles; settings page with profile, notifications and integrations tabs"`
- [ ] Verify: Terminal shows 4 phases (Plan, Generate Home, Extract, Generate Rest)
- [ ] Verify: All pages created (/, /dashboard, /projects, /tasks, /team, /settings)
- [ ] Verify: Sidebar navigation type detected and applied
- [ ] Capture: Terminal generation output
- [ ] Issues: ___

### Step 4: Review + Status
- [ ] Run: `coherent status`
- [ ] Verify: Shows page count (7+), component count, token info
- [ ] Run: `coherent preview`
- [ ] Verify: All pages render without errors
- [ ] Verify: Sidebar navigation works
- [ ] Verify: Auth pages render centered
- [ ] Verify: Dark mode toggle works on all pages
- [ ] Capture: status output, Landing, Dashboard, Projects, Tasks, Team, Settings, Login, Register, Dashboard dark mode
- [ ] Issues: ___

### Step 5: Change color scheme
- [ ] Run: `coherent chat "Change the color scheme to indigo primary, make the landing page hero more impactful with gradient background"`
- [ ] Verify: Primary color changed to indigo across all pages
- [ ] Verify: Landing hero has gradient background
- [ ] Capture: Landing hero before/after, DS Viewer tokens
- [ ] Issues: ___

### Step 6: Edit Pricing page
- [ ] Run: `coherent chat --page "Pricing" "Redesign the pricing section: 3 tiers (Starter, Pro, Enterprise) as cards with a highlighted recommended plan, monthly/yearly toggle, feature comparison list below"`
- [ ] Verify: Pricing section updated, other pages unchanged
- [ ] Capture: Pricing before/after
- [ ] Issues: ___

### Step 7: Components list
- [ ] Run: `coherent components list`
- [ ] Verify: Shows Header, Footer, Sidebar (and any others)
- [ ] Capture: Terminal output
- [ ] Issues: ___

### Step 8: Create StatsPanel
- [ ] Run: `coherent chat --component "StatsPanel" "Create a shared StatsPanel component — a horizontal row of 4 stat cards. Each card has: an icon in a rounded colored background, a large metric number, a label below, and a trend indicator (up/down arrow with percentage in green or red). Use Card from shadcn, semantic tokens for colors"`
- [ ] Verify: StatsPanel component created in `components/shared/`
- [ ] Verify: Component registered in `coherent.components.json`
- [ ] Capture: Terminal output
- [ ] Issues: ___

### Step 9: Add StatsPanel to 3 pages
- [ ] Run: `coherent chat "Update the dashboard page to use StatsPanel at the top showing: Total Projects, Active Tasks, Team Members, Completed This Week. Also add StatsPanel to the projects page showing: Total Projects, In Progress, Completed, Overdue. And to settings page showing: Storage Used, API Calls, Team Size, Active Integrations"`
- [ ] Verify: StatsPanel visible on Dashboard, Projects, Settings
- [ ] Verify: Different data/icons on each page
- [ ] Capture: Dashboard, Projects, Settings with StatsPanel
- [ ] Issues: ___

### Step 10: Modify StatsPanel
- [ ] Run: `coherent chat --component "StatsPanel" "Redesign StatsPanel: add a sparkline mini chart to each card, make the trend percentage bolder, add a subtle hover effect with shadow elevation"`
- [ ] Verify: StatsPanel updated on all 3 pages
- [ ] Capture: Updated Dashboard StatsPanel
- [ ] Issues: ___

### Step 11: Undo + redo
- [ ] Run: `coherent undo`
- [ ] Verify: StatsPanel reverted to pre-Step-10 state on all pages
- [ ] Run: `coherent chat --component "StatsPanel" "Make the StatsPanel cards more compact with smaller icons, add a thin colored left border matching the icon color, keep the trend indicator but remove the percentage — just show the arrow"`
- [ ] Verify: New StatsPanel design applied on all 3 pages
- [ ] Capture: StatsPanel after undo (original), StatsPanel new design
- [ ] Issues: ___

### Step 12: Edit Header
- [ ] Run: `coherent chat --component "Header" "Add a notification bell icon with a red dot badge and user avatar dropdown to the header"`
- [ ] Verify: Header updated on all pages
- [ ] Capture: Header before/after
- [ ] Issues: ___

### Step 13: Quality check
- [ ] Run: `coherent check`
- [ ] Verify: Output shows check results (issues or clean)
- [ ] Capture: Terminal output
- [ ] Issues: ___

### Step 14: Auto-fix
- [ ] Run: `coherent fix`
- [ ] Verify: Issues resolved
- [ ] Run: `coherent check` (re-verify)
- [ ] Capture: fix output, clean check output
- [ ] Issues: ___

### Step 15: Export
- [ ] Run: `coherent export --output ./taskflow-export`
- [ ] Verify: `taskflow-export/` created without Coherent artifacts
- [ ] Verify: No `design-system.config.ts`, no DS Viewer, no `.cursorrules`
- [ ] Verify: Build succeeds (`cd taskflow-export && npm run build`)
- [ ] Capture: Export output, folder structure
- [ ] Issues: ___

## Summary
- Total steps: 15
- Total screenshots: ~35
- Estimated time: 30-45 minutes
- Pass: ___ / 15
- Issues found: ___
