# Case Study: Building a DevTools SaaS from Scratch with Coherent

> From zero to a complete multi-page application in minutes, not days.

**Date:** 2026-03-16
**Coherent Version:** 0.2.0
**AI Provider:** Claude (Anthropic)

---

## What We're Building

A developer tools SaaS platform — think a deployment/monitoring dashboard similar to Vercel or Railway. The app includes:

- Landing page with hero, features, and pricing
- Authentication (login, signup)
- Dashboard with metrics and activity
- Settings page
- Project detail page

This case study documents every step, command, cost, and result.

---

## Steps

### Step 1: Initialize the Project

**Goal:** Create a new Next.js project with Coherent design system

**Command:**
```bash
mkdir -p ~/test-devtools && cd ~/test-devtools && npx @getcoherent/cli@latest init
```

**Time:** ~30 sec (15s npm install + 15s coherent setup)
**Cost:** $0.00 (no AI calls — template-based)
**Result:**
- Next.js 15 + Tailwind CSS project created
- Design system config (`design-system.config.ts`) generated
- Home page, Design System viewer, docs pages scaffolded
- AI context files (`.cursorrules`, `CLAUDE.md`) ready
- Anthropic API key configured

---

### Step 2: Create the Landing Page

**Goal:** Generate a landing page for a developer deployment platform

**Command:**
```bash
cd ~/test-devtools && npx coherent chat "Create a landing page for DevLaunch — a modern deployment platform for developers. Hero section with a bold gradient headline 'Ship faster. Scale smarter.' and subline 'Deploy any app in seconds with zero-config builds, instant rollbacks, and real-time monitoring.' Two CTAs: Start Free and View Docs. Features grid with 6 features: Zero-Config Deploys, Instant Rollbacks, Edge Network, Real-Time Logs, Team Collaboration, GitHub Integration. Each feature has an icon and short description. Pricing section with 3 tiers: Hobby (free), Pro ($29/mo), Enterprise (custom). Footer with links."
```

**Time:** ~15 sec
**Cost:** ~$0.12 (2 AI calls: parse request + generate page code)
**Result:**
- Home page rewritten with full landing: hero, features grid, pricing, footer
- 11 lucide-react icons auto-selected
- Badge component auto-installed from shadcn/ui
- Quality validator flagged 2 minor warnings (empty state, error message patterns)
- UX Recommendations generated: gradient text, icon containers, hover effects
- Backup auto-saved to `.coherent/backups/`

---

### Step 3: Add Dashboard with Deployment Stats

**Goal:** Create a data-rich dashboard for authenticated users

**Command:**
```bash
npx coherent chat "Add a dashboard page at /dashboard. Show 4 stat cards at the top: Total Deployments (1,284), Active Projects (12), Uptime (99.97%), Avg Build Time (34s). Below stats: a table of Recent Deployments with columns: Project, Branch, Status (success/failed/building), Duration, Time. 5 realistic rows. Sidebar navigation on the left with: Dashboard, Projects, Deployments, Logs, Settings links. The dashboard should feel clean and data-dense."
```

**Time:** ~4 min (4-phase split generation with parallel page builds)
**Cost:** ~$0.70 (plan + home generation + 7 parallel page generations)
**Result:**
- Asked for 1 dashboard → AI inferred 8 pages total:
  - Dashboard (`/dashboard`) — stat cards + deployments table
  - Projects (`/projects`) — project listing with actions
  - Project Detail (`/projects/[id]`) — individual project view
  - Deployments (`/deployments`) — deployment log (inferred)
  - Deployment Detail (`/deployments/[id]`) — build details (inferred)
  - Logs (`/logs`) — real-time log viewer (inferred)
  - Settings (`/settings`) — profile, API keys, billing
  - Home page regenerated with consistent navigation
- 6 shadcn/ui components auto-installed (Table, DropdownMenu, ScrollArea, Input, Label, Select)
- Header & Footer extracted as shared layout components
- Post-generation auto-fixes applied: raw colors → semantic tokens, oversized CardTitle text removed, invalid lucide icons replaced
- Quality validator: 4 raw color errors on 2 pages, minor warnings flagged

**What the 4-phase split generator did:**
1. Phase 1 — AI planned all 8 pages from the request (plan-only, no code)
2. Phase 2 — Generated Home page first (visual anchor)
3. Phase 3 — Extracted 7 style patterns from Home (local, no AI cost)
4. Phase 4 — Generated remaining 7 pages in parallel (concurrency=3), using Home's style as reference

---

### Step 4: Add Authentication Pages

**Goal:** Add login and signup pages with proper form patterns

**Command:**
```bash
npx coherent chat "Add a login page at /login with email and password fields, a 'Sign In' button, a 'Forgot password?' link, and a 'Don't have an account? Sign Up' link. Also add a signup page at /signup with name, email, password, and confirm password fields, a 'Create Account' button, and a 'Already have an account? Sign In' link. Both pages should be centered with a clean, minimal layout. Show the DevLaunch logo at the top."
```

**Time:** ~2 min
**Cost:** ~$0.40 (plan + 5 page generations)
**Result:**
- Asked for 2 pages (login + signup) → AI created 5:
  - Login (`/login`) — email, password, sign in, links
  - Sign Up (`/signup`) — name, email, password, confirm
  - Forgot Password (`/forgot-password`) — auto-inferred
  - Reset Password (`/reset-password`) — auto-inferred
  - Register (`/register`) — auto-inferred
- All auth pages placed in `(auth)` route group (Next.js convention)
- Shared layout with Header component (CID-001) applied
- Post-generation fixes: oversized CardTitle text auto-corrected
- Sign Up page: cleanest quality score (0 warnings, 1 info)

---

### Step 5: Modify the Landing Page — Add Visual Polish

**Goal:** Test modification of existing page + visual depth improvements

**Command:**
```bash
npx coherent chat "Update the home page: make the hero section more impactful. Add a terminal code block below the CTAs showing '$ devlaunch deploy --prod' with a green command output 'Deployed to production in 4.2s'. Use gradient text on the main headline. Add subtle hover effects on feature cards. Make the Pro pricing tier visually highlighted as the recommended option."
```

**Time:** ~3 min
**Cost:** ~$0.30 (plan + 3 page generations)
**Result:**
- Home page updated with terminal code block, gradient headline, hover effects
- AI inferred 2 additional pages: Pricing (`/pricing`), Checkout (`/checkout`)
- 9 style patterns extracted from Home (up from 7 — Visual Depth techniques picked up)
- Post-generation auto-fixes: heavy shadow → shadow-sm, raw colors → semantic tokens
- RAW_COLOR warnings on terminal code block (green text) — expected trade-off for visual depth
- Shared layout (Header + Footer) applied to all new pages

---

### Step 6: Auto-Fix Quality Issues

**Goal:** Clean up remaining quality warnings across all pages

**Command:**
```bash
npx coherent fix
```

**Time:** ~5 sec (local analysis, no AI calls)
**Cost:** $0.00 (runs entirely locally)
**Result:**
- Build cache cleared
- Full quality audit across 16 pages:
  - 12 errors — all RAW_COLOR from intentional visual depth (terminal green, gradient text)
  - 18 warnings — structural: empty states, destructive without confirm, heading hierarchy
  - 8 infos — form feedback patterns, nav active states
- Auth pages (login, signup, forgot/reset password): cleanest — only FORM_NO_FEEDBACK info
- Dashboard and data pages: most warnings (missing empty states, native tables)
- **Insight:** RAW_COLOR errors are a design tension — the Visual Depth techniques (terminal code blocks, gradient text) intentionally use non-semantic colors. This is a valid trade-off documented in VISUAL_DEPTH rules.

---

## Summary

### What was built

A complete DevTools SaaS platform with **16 pages** generated from **4 natural language commands**:

| Route | Page | Source |
|-------|------|--------|
| `/` | Landing (hero, features, pricing, footer) | Step 2 + 5 |
| `/dashboard` | Dashboard (stats, deployments table) | Step 3 |
| `/projects` | Projects listing | Step 3 (inferred) |
| `/projects/[id]` | Project detail | Step 3 (inferred) |
| `/deployments` | Deployments listing | Step 3 (inferred) |
| `/deployments/[id]` | Deployment detail | Step 3 (inferred) |
| `/logs` | Real-time logs | Step 3 (inferred) |
| `/settings` | Settings (profile, API keys, billing) | Step 3 (inferred) |
| `/login` | Login | Step 4 |
| `/signup` | Sign Up | Step 4 |
| `/forgot-password` | Forgot Password | Step 4 (inferred) |
| `/reset-password` | Reset Password | Step 4 (inferred) |
| `/register` | Register | Step 4 (inferred) |
| `/pricing` | Pricing (3 tiers) | Step 5 (inferred) |
| `/checkout` | Checkout | Step 5 (inferred) |
| `/design-system` | Design System viewer | Step 1 (built-in) |

### Cost Breakdown

| Step | Command | AI Calls | Cost | Time |
|------|---------|----------|------|------|
| 1 | `coherent init` | 0 | $0.00 | 30s |
| 2 | Landing page | 2 | ~$0.12 | 15s |
| 3 | Dashboard (→ 8 pages) | 9 | ~$0.70 | 4 min |
| 4 | Auth (→ 5 pages) | 6 | ~$0.40 | 2 min |
| 5 | Modify landing + pricing | 4 | ~$0.30 | 3 min |
| 6 | `coherent fix` | 0 | $0.00 | 5s |
| **Total** | **4 prompts** | **21** | **~$1.52** | **~10 min** |

### What Coherent Did Automatically

- **Page inference:** Asked for 5 pages explicitly → got 16 (AI inferred related pages)
- **Component auto-install:** 7 shadcn/ui components installed on demand (Table, DropdownMenu, ScrollArea, Input, Label, Select, Badge)
- **Shared layout extraction:** Header and Footer extracted as shared components, applied via layout.tsx
- **Style coherence:** 4-phase split generator ensured all pages share the same visual language
- **Post-generation fixes:** Raw colors → semantic tokens, oversized CardTitle → corrected, invalid icons → replaced, heavy shadows → shadow-sm
- **Quality validation:** Every page audited for accessibility, UX patterns, and design consistency
- **Auth route grouping:** Login/Signup pages automatically placed in `(auth)` Next.js route group
- **Backups:** Every change auto-backed up to `.coherent/backups/`

### The Design Quality Difference (v0.2.0)

This case study was the first real-world test of the **Design Thinking** and **Visual Depth** improvements added in v0.2.0:

- AI was asked to "make the hero more impactful" — it added gradient text, terminal code blocks, and hover effects (Visual Depth techniques)
- The 4-phase generator extracted 9 style patterns from the hero page and propagated them across all subsequent pages
- UX Recommendations proactively suggested visual improvements (gradient text, icon containers, hover effects)
- The tension between Visual Depth (allows emerald/gradient) and the validator (flags RAW_COLOR) surfaced as a design trade-off — intentional creative choices sometimes override strict rules

### Key Takeaway

> **16 production-ready pages from 4 natural language prompts. Total cost: $1.52. Total time: 10 minutes.**
>
> The same scope would take a frontend developer 3-5 days. Coherent Design Method doesn't replace the developer — it replaces the first 80% of repetitive work, letting designers and developers focus on the remaining 20% that requires human judgment.

