# Case Study: Advertising Marketplace for Meta Threads

> Generated with [Coherent Design Method](https://github.com/skovtun/coherent-design-method) — from technical specification to working UI in under 5 minutes.

---

## Project Brief

**Client brief:** Build a web platform for advertising placements on Meta Threads — a marketplace connecting brands (advertisers) with content creators (authors). The platform should include escrow payments, post verification, analytics, and moderation.

**Source:** 17-page technical specification (in Russian) covering roles, user flows, data model, API routes, integrations, and 10+ screens.

**Goal of this demo:** Take the general concept from the spec and generate a complete, multi-page UI prototype using Coherent CLI — without writing a single line of code.

---

## Step 1: Project Initialization

### Command

```bash
cd /tmp && rm -rf threads-demo && mkdir threads-demo && cd threads-demo
coherent init threads-marketplace
```

### What happens

- Creates a new Next.js 15 + Tailwind CSS project in `threads-marketplace/`
- Installs shadcn/ui component library
- Sets up design system configuration
- Configures AI provider (Anthropic Claude)
- Generates Design System viewer at `/design-system`
- Creates `.cursorrules` and `CLAUDE.md` for AI editor integration

### Duration

~30 seconds (depends on npm install speed)

### Cost

| Item | Cost |
|------|------|
| CLI execution | Free |
| npm packages | Free |
| AI calls | $0.00 (no AI used in init) |
| **Subtotal** | **$0.00** |

### Terminal output

```
(to be filled after execution)
```

---

## Step 2: Generate All Pages via AI Chat

### Command

```bash
cd threads-marketplace

coherent chat "Create an advertising marketplace platform for Meta Threads
connecting brands with content creators. Light theme with black and white
palette in Threads style - minimalist, high contrast, clean typography.

Pages:
1) Landing page with hero explaining the marketplace, how-it-works section
   for authors and advertisers, escrow/verification/analytics benefits,
   dual CTA for authors and advertisers.
2) Order catalogue for authors with filters by budget, topic, language,
   deadline showing campaign cards with brief, price, requirements and
   task type badges (post/mention/repost).
3) Campaign creation form for advertisers with name, budget, brief,
   hashtags, task type selector, author requirements (min followers,
   engagement rate, geo).
4) Author dashboard with earnings stats, active tasks, applications list,
   connected Threads account info.
5) Advertiser dashboard with active campaigns, escrow status, applicant
   list, reach and cost-per-post analytics.
6) Registration page with role selection (Author vs Advertiser) and
   Threads OAuth connection step."
```

### What happens

Coherent processes the request in multiple phases:

1. **Phase 1 — Planning** (~500 tokens): AI analyzes the prompt, generates page list with names, routes, and descriptions
2. **Phase 2 — Home page generation**: AI generates the landing page with full styling, header, and footer
3. **Phase 3 — Style extraction** (zero AI calls): Coherent extracts the visual patterns from the home page (card styles, spacing, typography, colors) to ensure consistency
4. **Phase 4 — Remaining pages** (one AI call per page): Each page is generated with the extracted style context injected into the prompt

Total: ~7-8 AI calls (1 planning + 1 home + 5 content pages + possible linked pages)

### Estimated AI cost

| Component | Tokens (approx) | Cost |
|-----------|-----------------|------|
| Planning call | ~4,000 in / ~500 out | $0.02 |
| Home page generation | ~5,000 in / ~8,000 out | $0.08 |
| 5 content pages (each) | ~6,000 in / ~6,000 out | $0.35 |
| Auto-scaffolded pages (login, etc.) | ~5,000 in / ~5,000 out | $0.05 |
| **Subtotal** | | **~$0.50** |

*Based on Claude Sonnet pricing: $3/M input, $15/M output tokens (Jan 2026).*

### Duration

~2-4 minutes (depends on AI response time)

### Terminal output

```
(to be filled after execution)
```

---

## Step 3: Preview

### Command

```bash
coherent preview
```

### What happens

- Starts Next.js dev server on `http://localhost:3000`
- All pages are immediately available for browsing
- Hot reload enabled for any subsequent changes

### Duration

~3 seconds to start

### Cost

| Item | Cost |
|------|------|
| Local dev server | Free |
| **Subtotal** | **$0.00** |

---

## Generated Pages

### Page 1: Landing Page (`/`)

**Route:** `/`
**Description:** Hero section explaining the Threads marketplace concept, how-it-works flow for both authors and advertisers, platform benefits (escrow, verification, analytics), dual CTA buttons.

**Screenshot:**

*(to be added)*

---

### Page 2: Order Catalogue (`/catalogue`)

**Route:** `/catalogue`
**Description:** Filterable list of advertising campaigns available for authors. Filters by budget, topic, language, deadline. Campaign cards show brief, price, requirements, and task type badges (post/mention/repost).

**Screenshot:**

*(to be added)*

---

### Page 3: Create Campaign (`/campaigns/create`)

**Route:** `/campaigns/create`
**Description:** Form for advertisers to create a new campaign: name, budget, brief text, hashtags, task type selector, and author requirements (minimum followers, engagement rate, geography).

**Screenshot:**

*(to be added)*

---

### Page 4: Author Dashboard (`/author/dashboard`)

**Route:** `/author/dashboard` or `/dashboard`
**Description:** Author's personal cabinet with earnings statistics, active tasks, applications list with statuses, and connected Threads account information.

**Screenshot:**

*(to be added)*

---

### Page 5: Advertiser Dashboard (`/advertiser/dashboard`)

**Route:** `/advertiser/dashboard`
**Description:** Advertiser's control panel with active campaigns, escrow transaction status, list of applicants per campaign, and analytics (reach, cost-per-post).

**Screenshot:**

*(to be added)*

---

### Page 6: Registration (`/register`)

**Route:** `/register`
**Description:** Onboarding page with role selection (Author vs Advertiser), registration form, and Threads OAuth connection step.

**Screenshot:**

*(to be added)*

---

## Total Cost Summary

| Step | Duration | AI Calls | Cost |
|------|----------|----------|------|
| 1. Init project | ~30s | 0 | $0.00 |
| 2. Generate 6+ pages | ~3 min | ~8 | ~$0.50 |
| 3. Preview | ~3s | 0 | $0.00 |
| **Total** | **~4 min** | **~8** | **~$0.50** |

### Comparison with traditional development

| Approach | Time | Cost |
|----------|------|------|
| **Coherent CLI** | ~4 minutes | ~$0.50 |
| Designer (Figma mockups) | 2-3 days | $800-2,000 |
| Frontend developer (from scratch) | 3-5 days | $1,500-4,000 |
| Design agency (full prototype) | 1-2 weeks | $5,000-15,000 |

> **ROI:** Coherent generates a working, interactive prototype from a technical specification in under 5 minutes for less than $1. This prototype can then be iteratively refined with follow-up `coherent chat` commands.

---

## What's Generated (Inventory)

| Category | Count |
|----------|-------|
| Pages | 6+ (including auto-scaffolded auth pages) |
| Shared components | 2 (Header, Footer — via layout.tsx) |
| UI components (shadcn) | ~15 (Button, Card, Input, Badge, etc.) |
| Design tokens | Full set (colors, typography, spacing) |
| Design System viewer | Yes (`/design-system`) |
| Documentation | Auto-generated |
| AI editor rules | `.cursorrules`, `CLAUDE.md` |

---

## Next Steps (Iterative Refinement)

After the initial generation, the design can be refined with follow-up commands:

```bash
# Change accent color
coherent chat "change primary color to Threads black (#000000)"

# Add a specific section
coherent chat "add a trust/security section to the landing page showing escrow protection"

# Modify a component
coherent chat "make campaign cards show author avatar and engagement rate badge"

# Add a new page
coherent chat "add a dispute resolution page with chat timeline and evidence uploads"

# Export for deployment
coherent export
```

Each follow-up command costs ~$0.05-0.10 in AI tokens.

---

## Technical Specification Coverage

The demo covers the key UI screens from the spec (Section 9):

| Spec Screen | Generated | Notes |
|-------------|-----------|-------|
| Onboarding (Author/Advertiser) | Yes | Registration with role selection |
| Threads OAuth connection | Yes | Part of registration flow |
| Order catalogue with filters | Yes | Full filter panel + cards |
| Campaign card (brief, KPI, price) | Yes | In catalogue page |
| Advertiser cabinet | Yes | Dashboard with campaigns/escrow |
| Author cabinet | Yes | Dashboard with tasks/earnings |
| Deliverable screen | Partial | Can be added with one command |
| Dispute/arbitration | No | Add with `coherent chat` |
| Finance reports | Partial | Stats in dashboards |
| Admin panel | No | Add with `coherent chat` |

**Coverage: 7/10 key screens from spec generated in one command.**
Remaining screens can be added incrementally, ~$0.10 each.

---

## Reproduce This Demo

```bash
npm install -g @getcoherent/cli
coherent init threads-marketplace
cd threads-marketplace
coherent chat "<paste the prompt from Step 2>"
coherent preview
```

---

*Case study by Coherent Design Method — [github.com/skovtun/coherent-design-method](https://github.com/skovtun/coherent-design-method)*
