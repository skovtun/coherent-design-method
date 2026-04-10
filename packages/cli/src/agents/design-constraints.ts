/**
 * Design Constraints — Tiered System
 *
 * Single source of truth for all UI generation rules.
 * Used by modifier.ts and split-generator.ts at runtime.
 *
 * Architecture:
 *   CORE_CONSTRAINTS  — always injected (~2000 tokens)
 *   RULES_*           — injected only when relevant to user request (~300-600 tokens each)
 *   INTERACTION_PATTERNS — always injected (UX behaviour, not styling)
 *
 * selectContextualRules(message) picks the relevant tiers based on keyword matching.
 * Fallback = core only (no "include all" — core is sufficient for generic requests).
 *
 * When updating rules:
 * 1. Edit THIS file
 * 2. Rebuild: pnpm build
 */

// ---------------------------------------------------------------------------
// TIER 0 — DESIGN THINKING (always sent first, ~250 tokens)
// Sets the creative mindset BEFORE any rules. Without this, AI plays it safe.
// ---------------------------------------------------------------------------

export const DESIGN_THINKING = `
## DESIGN THINKING (answer internally BEFORE writing code)

1. PURPOSE — What is this page's job? (inform / convert / navigate / manage / onboard)
2. AUDIENCE — Who uses it? (developer / executive / consumer / admin)
3. MOOD — What should the user FEEL? (confident, excited, calm, focused, impressed)
4. FOCAL POINT — What ONE element draws the eye first on this page?
5. RHYTHM — Where should the page breathe (spacious) vs feel dense (packed with data)?

Then commit to:
- One DOMINANT visual element per page (hero image, large metric, gradient header, feature grid)
- One ACCENT technique per page (gradient text, colored icon containers, glass card, background pattern)
- One moment of CONTRAST (large vs small, dense vs spacious, dark vs light section)

DO NOT make every section look the same. Vary density, background treatment, and visual weight.
Every page should have a clear visual hierarchy — if you squint, the structure should still be obvious.

ANTI-SLOP CHECKLIST (avoid generic AI aesthetics):
- Never repeat the same card layout more than twice — vary grid columns, card sizes, or presentation
- Never center everything — use left-aligned or asymmetric layouts for app pages
- Never use identical icon+heading+text cards in 3-column grids — vary the visual treatment
- Tint your neutrals — never use pure gray. Add a warm or cool tint to bg-muted and borders
- Vary border-radius: tighter on inner elements (rounded-md), softer on containers (rounded-xl)
- Content must feel real: no "John Doe", "Jane Smith", "Acme Corp". Use distinctive, diverse names
- No cliché copy: avoid "Seamless", "Elevate", "Unleash", "Next-Gen", "Game-changer"
- Numbers must feel real: not 100%, 50%, 99.99%. Use 87%, 1,247, 34.2%
- Max-width for readable text: max-w-prose or max-w-2xl (45-75 characters)
- Touch targets: minimum 44x44px for all interactive elements (use padding if visual size is smaller)
- Cognitive load: at decision points (filters, tabs, CTAs), show ≤4 visible options. Group the rest under "More" or dropdowns

ATMOSPHERE LANGUAGE (define the vibe before generating):
Before writing code, describe the page feel in evocative terms — not technical:
- NOT "blue" → "ocean-deep cerulean with warm midtone lift"
- NOT "minimal" → "editorial breathing room with intentional density pockets"
- NOT "dark" → "obsidian surface with luminous content hierarchy"
This shapes decisions throughout generation without explicit rules.

AI SLOP TEST (mentally run before finalizing any page):
"If someone saw this and you said 'AI made it' — would they immediately believe you?"
Red flags → redesign that section:
- Hero metric template (big KPI + gradient accent bg) on marketing pages
- Inter font + purple-to-blue gradient
- Glassmorphism as default card treatment
- Neon accents on dark backgrounds
- Large rounded icon container above every section heading

MOTION DECISION FRAMEWORK (before adding ANY animation):
1. How often does the user trigger this? (100s/day → no animation)
2. Is it keyboard-initiated? (yes → never animate)
3. Purpose must be: state change, feedback, preventing jarring change, or spatial orientation
4. If purpose is "looks cool" and user sees it often → don't animate
`

// ---------------------------------------------------------------------------
// TIER 1 — CORE (always sent, ~2000 tokens)
// Foundational rules that affect EVERY page. Violation = broken UI.
// ---------------------------------------------------------------------------

export const CORE_CONSTRAINTS = `
SHADCN/UI DESIGN CONSTRAINTS (MANDATORY — these rules produce professional UI):

TYPOGRAPHY (most impactful rules):
- Base text: text-sm (14px). NEVER use text-base (16px) as body text.
- Card/section titles: text-sm font-medium. NEVER text-lg or text-xl on card titles.
- Page title: text-2xl font-bold tracking-tight (only place for large text).
- Metric/KPI values: text-2xl font-bold (the ONLY other place for large text).
- Muted/secondary: text-sm text-muted-foreground (or text-xs text-muted-foreground).
- Create hierarchy through font WEIGHT (medium → semibold → bold), NOT font SIZE.
- Letter-spacing by size: large headings (>40px) → tracking-tighter; body (14-16px) → tracking-normal; small labels (<12px) → tracking-wide. Never tight tracking on small text.

COLORS — ONLY SEMANTIC TOKENS (zero raw colors):
- Allowed: bg-background, bg-muted, bg-muted/50, bg-card, bg-primary, bg-secondary, bg-destructive, bg-success, bg-warning. text-foreground, text-muted-foreground, text-primary-foreground, text-destructive, text-success. border (bare), border-border. Opacity modifiers OK (bg-primary/50). ring-*, shadow-*, fill-*, stroke-* with same token names.
- BANNED: ANY raw Tailwind color (bg-gray-*, text-blue-*, etc.), inline style colors, hex values, bg-white, bg-black. The validator REJECTS all of these.
- BANNED: "AI color palette" — cyan-on-dark, purple-to-blue gradients, neon accents on dark backgrounds. Statistical fingerprints of AI-generated UI.
- BANNED: gradient text on metrics/KPI values/primary headings — decorative, not meaningful, loses contrast.
- BANNED: emojis anywhere in code or markup — use lucide-react icons instead.

SPACING (restricted palette — only multiples of 4px):
- Page content padding: p-4 lg:p-6. Gap between major sections: gap-6 md:gap-8.
- Gap inside a section: gap-4 md:gap-6. Card internal gap: gap-2. Max padding: p-6.
- Prefer gap-* over space-x-* / space-y-* at page/section level.

LAYOUT PATTERNS:
- Stats/KPI grid: grid gap-4 md:grid-cols-2 lg:grid-cols-4
- Card grid (3 col): grid gap-4 md:grid-cols-3
- Full-height page: min-h-[100dvh] (dvh = dynamic viewport height, fixes iOS Safari layout jump)
- NEVER complex flexbox math (w-[calc(33.33%-1rem)]) → use CSS Grid
- Anti-center: NEVER center all content on app pages — left-aligned asymmetric layouts read as designed, not generated
- Centered form (login/signup): auth layout handles centering — just output div w-full max-w-md with Card inside
- Page content wrapper: flex flex-1 flex-col gap-4 p-4 lg:p-6
- Responsive: primary md: and lg:. Use sm:/xl: only when genuinely needed. Avoid 2xl:. NEVER arbitrary like min-[800px].

COMPONENT IMPORTS (mandatory — NEVER native HTML):
- NEVER use native <button>. Always: import { Button } from "@/components/ui/button".
- NEVER use native <input type="checkbox"> for toggles. Always: import { Checkbox } or { Switch }.
- NEVER use native <select>. Always: import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem }.
- NEVER use native <input> alone. Always pair with Label.
- NEVER use native <table>. Always: import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell }.
SHADCN COMPONENTS ONLY (CRITICAL):
- ALWAYS import and use shadcn components: Button, Input, Label, Textarea, Badge, Checkbox, Switch, Select, Table, etc.
- Form field pattern: <div className="space-y-2"><Label htmlFor="x">Name</Label><Input id="x" /></div>
- Card with form: Card > CardHeader(title+description) > CardContent(form fields) > CardFooter(Button)
- Button variants: default, secondary, outline, ghost, destructive.

LINKS & INTERACTIVE STATES (consistency is critical):
- Text links (inline): text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground transition-colors
- ALL links on the SAME page MUST use the SAME style. Never mix underlined and non-underlined text links.
- ALL Button variants MUST have: hover: state, focus-visible:ring-2 focus-visible:ring-ring, active: state, disabled:opacity-50.
- ALL interactive elements MUST have visible hover and focus-visible states.
- CRITICAL: Every <Link> MUST have an href prop. Missing href causes runtime errors. Never use <Link className="..."> or <Button asChild><Link> without href.
- When shared components exist (@/components/shared/*), ALWAYS import and use them instead of re-implementing similar patterns inline.

ICONS:
- Size: ALWAYS size-4 (16px). Color: ALWAYS text-muted-foreground. Import: ALWAYS from lucide-react.
- ALWAYS add shrink-0 to icon className to prevent flex containers from squishing them.

ACCESSIBILITY (mandatory):
- Icon-only buttons: ALWAYS add <span className="sr-only">Label</span> inside, or aria-label prop.
- Images: ALWAYS add alt text. Decorative images: alt="".
- Expandable elements (accordion, dropdown): aria-expanded={isOpen}.
- Live regions (toast, loading indicators): aria-live="polite" or role="status".
- Form errors: link error message to input via aria-describedby.
- Semantic HTML: use <nav>, <main>, <aside>, <section> with aria-label when multiple of same type.
- Color alone: never use color as the ONLY indicator — add icon or text alongside.
- WCAG AA minimum: text contrast 4.5:1, large text 3:1, UI elements 3:1. Verify text-muted-foreground on bg-muted passes.
- Skip link: add <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:p-4">Skip to content</a> as first element in root layout.
- Focus trap: modal/dialog MUST trap focus within (shadcn Dialog does this automatically).
- Tab order: logical sequence, never tabIndex > 0. Use tabIndex={-1} for programmatic focus only.

ANTI-PATTERNS (NEVER DO):
- text-base as body text → use text-sm
- text-lg/xl on card titles → use text-sm font-medium
- Raw colors (bg-gray-100, text-blue-600) → use semantic tokens
- shadow-md or heavier → use shadow-sm or none
- padding > p-6 → max is p-6
- Raw <button> or <input> → always use Button, Input from @/components/ui/
- Mixing link styles on the same page → pick ONE style
- Interactive elements without hover/focus states
- Monospace as "developer aesthetic" → proper type scale; mono only for actual code
- Large rounded icon container above every heading → only when icon adds meaning
- Glassmorphism as default → ONLY landing hero, never app pages
- Sparklines as decoration → only with real, readable data
- shadow-md on cards → shadow-sm with tinted color, or no shadow
- Inline mock data arrays in components → extract to src/data/
- Conditional renders without transitions → motion gaps are UX bugs
- Same animation duration everywhere → frequency and context determine duration
- transition: all → always specify: transition-colors, transition-transform, etc.
- Custom status pills/chips instead of Badge → always use shadcn Badge with variant
- Badge overlapping title text → Badge AFTER title in flex row with gap-2
- Extra border/shadow on TabsList → TabsList has built-in styling, don't add more
- Colored dots/circles without text for priority → use Badge with text label

COMPONENT VARIANT RULES (CRITICAL):
- NEVER use <Button> with custom bg-*/text-* classes for navigation or tabs without variant="ghost".
  The default Button variant sets bg-primary, so custom text-muted-foreground or bg-accent classes will conflict.
  BAD:  <Button className="text-muted-foreground hover:bg-accent">Tab</Button>
  GOOD: <Button variant="ghost" className="text-muted-foreground">Tab</Button>
  BEST: Use shadcn <Tabs> / <TabsList> / <TabsTrigger> for tab-style navigation.
- For sidebar navigation buttons, ALWAYS use variant="ghost" with active-state classes:
  <Button variant="ghost" className={cn("w-full justify-start", isActive && "bg-accent font-medium")}>
- For filter toggle buttons, use variant={isActive ? 'default' : 'outline'} — NOT className toggling.

CONTENT (zero placeholders, zero generic):
- NEVER: "Lorem ipsum", "Card content", "Description here"
- ALWAYS: Real, contextual content. Realistic metric names, values, dates.
- BANNED names: "John Doe", "Jane Smith", "Jane Doe", "John Smith", "Sarah Chan". Use diverse, distinctive names (e.g., "Priya Sharma", "Marcus Rivera", "Aisha Okafor").
- BANNED company names: "Acme", "Nexus", "SmartFlow", "TechCorp". Use realistic names (e.g., "Meridian Labs", "Canopy Health", "Brickwell Partners").
- BANNED metric values: 100%, 50%, 99.99%, round thousands. Use realistic numbers (87%, 1,247, 34.2%, $18,750).
- BANNED copy: "Seamless", "Elevate", "Unleash", "Next-Gen", "Game-changer", "Delve", "Cutting-edge". Write specific, concrete descriptions.

MOCK/SAMPLE DATA (for demo arrays, fake users, fake tasks, etc.):
- Dates: ALWAYS ISO 8601 strings in data ("2024-06-15T10:30:00Z").
  Display with date formatting: new Date(item.date).toLocaleDateString() or
  Intl.RelativeTimeFormat, or date-fns if already imported.
  BAD:  { createdAt: "2 hours ago" }
  GOOD: { createdAt: "2024-06-15T10:30:00Z" }
- Images: use https://i.pravatar.cc/150?u=unique-id for avatars. "/placeholder.svg?height=40&width=40" for non-avatar images. Never broken paths.
- IDs: sequential numbers (1, 2, 3) or short slugs ("proj-1"). Never random UUIDs.
`

// ---------------------------------------------------------------------------
// DESIGN QUALITY (always sent — visual polish layer)
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// DESIGN QUALITY — COMMON (applies to ALL page types)
// ---------------------------------------------------------------------------

export const DESIGN_QUALITY_COMMON = `
## DESIGN QUALITY — COMMON

### Typography Hierarchy
- Page headline (h1): text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight leading-[1.1]
- Section titles (h2): text-2xl md:text-3xl font-bold
- Card titles (h3): text-sm font-semibold (never text-base or text-lg)
- Body text: text-sm text-muted-foreground leading-relaxed
- The SIZE DIFFERENCE between levels must be dramatic, not subtle

### Visual Depth & Layers
- Cards: bg-card border border-border/15 rounded-xl (not rounded-md)
- Cards on dark pages: bg-card border-border/10 backdrop-blur-sm
- Cards MUST have hover state: hover:border-border/30 transition-colors
- Sections alternate between bg-background and bg-muted/5 for rhythm
- Section dividers: border-t border-border/10 (subtle, not heavy)

### Buttons with Icons
- Buttons containing text + icon: ALWAYS use inline-flex items-center gap-2 whitespace-nowrap
- Icon inside button: h-4 w-4 (never larger), placed AFTER text for arrows, BEFORE text for action icons
- NEVER let button content wrap to multiple lines — use whitespace-nowrap on the Button component
- CTA buttons: use the Button component, NEVER raw <button> or <a> styled as button

### Accent Color Discipline
- ONE accent color per page (primary)
- Use for: CTAs, check icons, feature icon backgrounds, active states
- NEVER mix multiple accent colors on same page
- Badge: outline style (border-border/30 bg-transparent) not filled color
- Status icons: text-success for positive, text-destructive for negative

### Dark Theme Implementation
- html element: className="dark"
- Background: use CSS variables from globals.css dark section
- Text: text-foreground for primary, text-muted-foreground for secondary
- NEVER hardcode dark colors (bg-gray-900) — always use semantic tokens
- Cards and elevated elements: slightly lighter than background (bg-card)
- Dark mode uses lighter surfaces for depth (no drop shadows — they disappear on dark)

### Interactive States (all 8 required for interactive elements)
- Default, hover, focus-visible, active, disabled, loading, error, success
- focus-visible: ring-2 ring-ring ring-offset-2 (show only for keyboard, not mouse)
- active: scale-[0.97] or translate-y-px for tactile feedback
- disabled: opacity-50 pointer-events-none cursor-not-allowed

### Readability
- Body text max-width: max-w-prose (65ch) or max-w-2xl for long-form text
- Line height: leading-relaxed (1.625) for body, leading-tight (1.25) for headings
- Paragraph spacing: space-y-4 between paragraphs

### Motion Foundations (apply to every page)
- Easing curves (use exponential for natural deceleration):
  ease-out-quart: cubic-bezier(0.25, 1, 0.5, 1) — most UI entrances
  ease-out-expo: cubic-bezier(0.16, 1, 0.3, 1) — dramatic entrances/modals
  ease-out-circ: cubic-bezier(0, 0.55, 0.45, 1) — quick micro-interactions
  iOS sheet: cubic-bezier(0.32, 0.72, 0, 1) — bottom sheets/drawers
- Default duration: 150ms hover, 200ms state changes. UI ≤300ms. Exit faster than entrance.
- Button press: active:scale-[0.97] transition-transform duration-100.
- Only animate transform and opacity (GPU). NEVER animate height directly — use grid-template-rows: 0fr → 1fr.
- Specify properties: transition-colors, transition-transform. Never transition-all.
- Hover: instant ON (0ms on :hover), ease OFF (150ms on base state). @media (hover: hover) to avoid touch false triggers.
- Blur masking: filter: blur(2px) during content/state transitions to mask jumps. Remove after transition.
- animation-fill-mode: backwards when using animation-delay (prevents flash-before-animate).
- Stagger: animation-delay: calc(var(--i) * 60ms); animation: fadeIn 0.3s ease-out both;
- Motion gaps: every conditional render ({isOpen && <Modal />}) is a potential motion gap — wrap in transitions.

### Typography Polish
- Headings: text-wrap: balance to prevent orphaned single words on last line.
- Body text: text-wrap: pretty for better line breaking (where supported).

### Modern CSS (progressive enhancement)
- Container queries: prefer @container over @media for component-level responsive behavior.
  Parent: container-type: inline-size. Child: @container (min-width: 400px) { ... }
- CSS has(): .card:has(img) { layout with image } — conditional layouts without JS state.
- Scroll anchoring: [id] { scroll-margin-top: 4rem; } — prevents sticky header from hiding anchor targets.
- @property for animated CSS variables: @property --progress { syntax: '<percentage>'; initial-value: 0%; inherits: false; }
  Enables smooth animation of CSS custom properties (normally not animatable).
- View Transitions: if (document.startViewTransition) { document.startViewTransition(() => router.push(href)) }
  Progressive enhancement — zero config, dramatic perceived performance improvement on page navigation.
`

// ---------------------------------------------------------------------------
// DESIGN QUALITY — MARKETING (landing, features, pricing pages)
// ---------------------------------------------------------------------------

const DESIGN_QUALITY_MARKETING = `
## DESIGN QUALITY — MARKETING PAGES

### Spacing Rhythm (3 distinct levels)
- Between sections: py-20 md:py-28 (generous)
- Within sections (title to content): mb-12 md:mb-16
- Within cards: p-6 (compact)
- Between cards in grid: gap-5 (tight)
- NEVER uniform spacing everywhere — contrast creates rhythm

### Hero headline
- Landing/marketing hero headline: text-5xl md:text-6xl lg:text-7xl font-bold tracking-tight leading-[1.05]

### Icons in Feature Cards
- Wrap in colored container: bg-primary/10 rounded-lg p-2.5
- Icon color: text-primary
- Icon size: h-5 w-5 inside the container
- NEVER bare icons floating in a card without container

### Terminal / Code Blocks
- Background: bg-zinc-950 (near-black, not gray)
- Border: border-border/10 rounded-xl
- Text: font-mono text-sm text-emerald-400 (EXCEPTION: terminal blocks use raw green for aesthetics)
- Prompt: text-emerald-500 "$ " prefix (EXCEPTION: terminal prompt uses raw green)
- Title bar (optional): flex with 3 dots (bg-zinc-700 rounded-full w-2.5 h-2.5) + title text-zinc-500 text-[11px]
- Copy button: text-zinc-500 hover:text-zinc-300

### Hero Section — VARY the layout (don't always center everything)
Choose ONE hero style per project. Don't default to centered:
- Split hero: text left (60%) + visual right (40%). Asymmetric, editorial feel.
- Centered hero: only for bold statement pages. min-h-[80vh], max-w-3xl centered.
- Offset hero: text with large py-20, image/visual breaking into next section with negative margin.
Gradient text: use ONLY on one key phrase, not entire headline. Never on metrics.
Badge above headline: optional, not required. When used: outline variant, text-xs.
CTA row: flex items-center gap-4. Primary + secondary (outline).

### Comparison Sections (before/after, with/without)
- Two cards side by side: grid md:grid-cols-2 gap-6
- Negative card: neutral border, items with X icon text-destructive
- Positive card: accent border (border-primary/20), items with Check icon text-success
- Header of each card: text-sm font-semibold uppercase tracking-wider

### Step/Process Sections
- Numbered steps: circle with border, number inside (w-10 h-10 rounded-full border border-border/30 text-sm)
- Label above: text-xs font-semibold tracking-widest uppercase text-muted-foreground

### Footer
- Minimal: border-t border-border/10, py-10
- Content: text-sm text-muted-foreground
- Links: hover:text-foreground transition-colors
- Layout: flex justify-between on desktop, stack on mobile

NEVER include app-style elements (sidebar widgets, data tables, filters) on marketing pages.
`

// ---------------------------------------------------------------------------
// DESIGN QUALITY — APP (dashboard, settings, team, projects)
// ---------------------------------------------------------------------------

const DESIGN_QUALITY_APP = `
## DESIGN QUALITY — APP PAGES

### Design Principles for App Pages (NOT templates — principles)

Do NOT copy these literally. Use them as DIRECTION, then vary the implementation.

PAGE HEADER: flex items-center justify-between. Title left (text-2xl font-bold tracking-tight + description), primary action right.

FILTER AREA: search Input with Search icon (pl-9), Select dropdowns for filters, primary action button. Use shadcn Select (SelectTrigger + SelectValue + SelectContent + SelectItem), NEVER native <option>.

STAT METRICS: vary presentation — not always 4 identical cards. Options:
- Horizontal row with border-r dividers (no cards): metric inline with label
- 2 large + 2 small cards (hierarchy, not uniform)
- Metric embedded in page header (no separate row)
- Single hero metric + supporting stats as text
NEVER: 4 identical cards with same layout as the default.

DATA DISPLAY: match format to data type:
- Structured data → Table with TableHeader/TableBody, hover:bg-muted/50, actions via DropdownMenu
- Visual items (projects, products) → Card grid, vary card sizes, include progress/avatars/badges
- Activity/timeline → Vertical list with left border, avatars, timestamps
- Tasks → Compact list rows with inline Badge for status, assignee avatar right-aligned
NEVER: identical card grid for everything.

EMPTY STATES: icon (size-10 text-muted-foreground) + heading + description + CTA button. Must feel inviting, not blank.

LAYOUT FILES (layout.tsx): NEVER import data components (tables, lists, feeds) into layout files.
Layout files only contain: navigation, theme providers, wrappers. Data components go in page.tsx files.

SHARED COMPONENT PROPS: when using a shared component, pass ALL required props matching its interface.
If the component expects user: string, pass a string — not an object with name/avatar fields.
Read the component's interface before using it.

CARD HEADER WITH STATUS: title and badge on same line in flex row with gap-2:
  <div className="flex items-center gap-2"><CardTitle>Name</CardTitle><Badge variant="secondary">Status</Badge></div>
NEVER position badge before title. NEVER overlap badge on title text.

### Layout Variety (CRITICAL — avoid identical dashboards)
Choose ONE layout per page. Do NOT default to "stats + cards + table" every time:
- Layout A (Overview): stats row → two-column split (primary content 2/3 + sidebar 1/3) → full-width section
- Layout B (Feed): header with actions → filterable list/table → pagination
- Layout C (Detail): breadcrumb → hero card with key metrics → tabbed content below
- Layout D (Kanban): header → horizontal scrolling columns (using overflow-x-auto flex gap-4)
- Layout E (Split): left panel (list/nav, w-80) + right panel (detail view, flex-1)
Vary the layout across pages. Dashboard ≠ Projects ≠ Tasks ≠ Team.

### Dashboard Density Hardening
- High-density pages: avoid wrapping every metric in Card — use border-t, divide-y, or negative space grouping instead. Cards signal "separate item", not "data in a section".
- Shadow tinting: tint shadow toward background hue, never generic gray.
- CSS Subgrid for card alignment: when cards have variable content, use subgrid to align CTAs across all cards regardless of content length.

### Spacing
- gap-4 md:gap-6 between sections
- p-4 lg:p-6 content padding
- Page wrapper: flex flex-1 flex-col gap-4 p-4 lg:p-6

NEVER include marketing sections (hero, pricing, testimonials) on app pages.
`

// ---------------------------------------------------------------------------
// DESIGN QUALITY — AUTH (login, register, reset-password)
// ---------------------------------------------------------------------------

const DESIGN_QUALITY_AUTH = `
## DESIGN QUALITY — AUTH PAGES

### Reference Pattern (COPY this exact pattern)

AUTH CARD:
\`\`\`
<div className="w-full max-w-md">
  <Card>
    <CardHeader className="space-y-1">
      <CardTitle className="font-bold text-center">Welcome back</CardTitle>
      <p className="text-sm text-muted-foreground text-center">Enter your credentials</p>
    </CardHeader>
    <CardContent>
      <form className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input id="email" type="email" placeholder="Enter your email" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">Password</Label>
          <Input id="password" type="password" placeholder="Enter your password" />
        </div>
        <Button type="submit" className="w-full">Sign in</Button>
      </form>
    </CardContent>
    <CardFooter className="text-center">
      <p className="text-sm text-muted-foreground">
        Don't have an account?{' '}
        <Link href="/register" className="text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground transition-colors">Sign up</Link>
      </p>
    </CardFooter>
  </Card>
</div>
\`\`\`

### Rules
- The auth layout ALREADY provides centering (flex items-center justify-center min-h-svh). Do NOT add your own centering wrapper.
- Card width: w-full max-w-md
- Form fields inside CardContent: space-y-4 between field groups
- Each field group (Label + Input): space-y-2
- No navigation bars, sidebars, or multi-section layouts on auth pages.
`

const DESIGN_QUALITY_CRITICAL = `
## CRITICAL CODE RULES (violations will be auto-corrected)
- Every lucide-react icon MUST have className="... shrink-0" to prevent flex squishing
- Button with asChild wrapping Link: the inner element MUST have className="inline-flex items-center gap-2"
- NEVER use raw Tailwind colors (bg-blue-500, text-gray-600). ONLY semantic tokens: bg-primary, text-muted-foreground, etc.
- <Link> and <a> MUST always have an href attribute. Never omit href.
- CardTitle: NEVER add text-xl, text-2xl, text-lg. CardTitle is text-sm font-medium by default.
`

/**
 * Returns the page-type-specific DESIGN_QUALITY block.
 * Combine with DESIGN_QUALITY_COMMON for the full constraint set.
 */
export function getDesignQualityForType(type: 'marketing' | 'app' | 'auth'): string {
  switch (type) {
    case 'marketing':
      return DESIGN_QUALITY_MARKETING + DESIGN_QUALITY_CRITICAL
    case 'app':
      return DESIGN_QUALITY_APP + DESIGN_QUALITY_CRITICAL
    case 'auth':
      return DESIGN_QUALITY_AUTH + DESIGN_QUALITY_CRITICAL
  }
}

/**
 * Infer page type from route when no plan is available.
 * Falls back to 'app' for unknown routes.
 */
export function inferPageTypeFromRoute(route: string): 'marketing' | 'app' | 'auth' {
  const slug = route.replace(/^\//, '').split('/')[0] || ''
  const authSlugs = new Set([
    'login',
    'register',
    'sign-up',
    'signup',
    'sign-in',
    'signin',
    'forgot-password',
    'reset-password',
  ])
  const marketingSlugs = new Set([
    'pricing',
    'features',
    'about',
    'blog',
    'contact',
    'terms',
    'privacy',
    'landing',
    'home',
  ])

  if (authSlugs.has(slug)) return 'auth'
  if (marketingSlugs.has(slug) || slug === '') return 'marketing'
  return 'app'
}

// DESIGN_QUALITY composite removed — use getDesignQualityForType() instead

// ---------------------------------------------------------------------------
// VISUAL DEPTH (always sent — the "permission to be beautiful" layer)
// Without this, AI generates flat, safe UI. This unlocks visual richness.
// ---------------------------------------------------------------------------

export const VISUAL_DEPTH = `
## VISUAL DEPTH TECHNIQUES (pick 1-3 per page based on context)

### Gradient Techniques
- Key phrase emphasis: bg-gradient-to-r from-foreground to-foreground/60 bg-clip-text text-transparent
- Section background: bg-gradient-to-b from-background to-muted/30 (subtle, adds depth)
- Accent glow: bg-gradient-to-r from-primary/10 via-transparent to-primary/5

### Depth & Layering
- Glass cards (landing/hero only): bg-card/80 backdrop-blur-sm border-border/40. Never on app pages.
- Floating accent blobs: absolute bg-primary/5 blur-3xl rounded-full -z-10 (behind content)
- Elevated cards on hover: hover:-translate-y-0.5 hover:shadow-sm transition-all duration-200
- Section rhythm: alternate bg-background and bg-muted/5 between sections
- Tinted shadows: tint shadow color to match background hue instead of pure black
- Negative margins for overlap: create depth with overlapping elements (-mt-8, -ml-4)

### Micro-interactions (hover/focus only)
- Card hover lift: hover:-translate-y-0.5 transition-transform duration-200
- Icon container glow: group-hover:bg-primary/15 transition-colors
- Button shimmer: relative overflow-hidden + animated pseudo-element on hover
- Link underline reveal: underline-offset-4 decoration-transparent hover:decoration-foreground transition-all

### Context Budget (how many techniques to use)
- Dashboard / Settings / Admin: 0-1 techniques. Clean, functional, fast to scan.
- Landing / Marketing / Hero: 2-3 techniques. Impressive, memorable, worth scrolling.
- Product pages (pricing, features, about): 1-2 techniques. Professional with selective wow.
- Auth pages (login, signup): 0-1 techniques. Trustworthy, focused, minimal.

### What Makes a Page Memorable
Ask: "If someone sees this page for 3 seconds, what will they remember?"
- A landing page → the hero gradient and headline
- A dashboard → the bold stat numbers and clean data density
- A pricing page → the highlighted tier standing out from the rest
- A settings page → nothing flashy — that IS the correct answer

### Optimistic UI
Update state immediately, sync after. NEVER make user wait for network before showing feedback.
Toggle/switch: visual change on click, revert ONLY on confirmed error.

### Progressive Disclosure
Start simple, reveal complexity through interaction:
- Primary options visible → advanced behind "More options" / expandable
- Hover states reveal secondary actions (delete, share, duplicate)
- Empty states TEACH the interface — not just "nothing here yet":
  GOOD: "Create your first project. Track progress, assign tasks, set deadlines."
`

// ---------------------------------------------------------------------------
// TIER 2 — CONTEXTUAL RULES (injected based on request keywords)
// ---------------------------------------------------------------------------

export const RULES_FORMS = `
FORM RULES:
- Label above Input (never beside on mobile; beside OK on desktop only for short fields).
- space-y-2 within field group (Label + Input + optional description).
- space-y-6 between field groups.
- CardFooter for form actions (Save, Cancel).
- Switch for boolean toggles; do NOT use Checkbox for on/off settings.
- Select for 3+ options; RadioGroup for 2–3 options.
- Two columns on desktop for related fields: md:grid-cols-2. Single column on mobile always.

RADIOGROUP:
- Use for 2-3 mutually exclusive options. For 4+, use Select.
- Pattern: <RadioGroup defaultValue="option1"><div className="flex items-center space-x-2"><RadioGroupItem value="option1" id="r1" /><Label htmlFor="r1">Option 1</Label></div></RadioGroup>
- Vertical layout by default (space-y-2). Horizontal only for 2 options.
- Label always to the right of the radio, using htmlFor.

FORM VALIDATION (inline errors):
- Error text: text-sm text-destructive, directly below the input (inside the space-y-2 group).
- Pattern: <div className="space-y-2"><Label htmlFor="email">Email</Label><Input id="email" className="border-destructive" /><p className="text-sm text-destructive">Please enter a valid email address.</p></div>
- Show errors after blur or on submit, not on every keystroke.
- Highlight the field: add border-destructive to the Input.
- Error summary (form level): <Alert variant="destructive"> at top of form listing all errors.
- NEVER use toast for form validation. NEVER use alert() or browser dialogs.

MULTI-STEP FORMS / STEPPER:
- Step indicator: <div className="flex items-center gap-2"> with numbered circles.
- Active step: bg-primary text-primary-foreground size-8 rounded-full flex items-center justify-center text-sm font-medium.
- Completed step: same as active but with CheckCircle icon instead of number.
- Upcoming step: bg-muted text-muted-foreground.
- Connector between steps: <div className="h-px flex-1 bg-border" /> (horizontal) or <div className="w-px h-8 bg-border mx-auto" /> (vertical).
- Navigation: "Back" (variant="outline") and "Next"/"Complete" (variant="default") buttons at bottom.
- Validate current step before allowing Next.

FILE UPLOAD / DROPZONE:
- Pattern: dashed border area with icon + text. <div className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-muted-foreground/25 p-8 text-center hover:border-muted-foreground/50 transition-colors">
- Icon: <Upload className="size-8 text-muted-foreground mb-2" />
- Text: <p className="text-sm text-muted-foreground">Drag and drop or <span className="text-foreground underline cursor-pointer">browse</span></p>
- Accepted formats hint: <p className="text-xs text-muted-foreground mt-1">PNG, JPG up to 10MB</p>
- Active drag state: border-primary bg-primary/5.

MULTI-SELECT / TAG INPUT:
- Tags inside input area: <div className="flex flex-wrap gap-1 rounded-md border p-2">
- Each tag: <Badge variant="secondary" className="gap-1">{name}<X className="size-3 cursor-pointer" /></Badge>
- Input at the end: <Input className="flex-1 border-0 p-0 focus-visible:ring-0" placeholder="Add..." />
- Max display: show 5 tags, then "+N more" badge.
`

export const RULES_DATA_DISPLAY = `
DATA DISPLAY RULES:

STAT / METRIC CARDS: See the Stats Grid reference pattern in DESIGN QUALITY — APP PAGES. Follow that exact pattern.
- Trend up: text-success.
- Trend down: text-destructive.
- Trend icon: ArrowUp / ArrowDown className="size-3 inline mr-1".
- No actions on stat cards. Click entire card to drill down (if applicable).

TABLE ROW PATTERNS:
- Row hover: <TableRow className="hover:bg-muted/50"> on every data row.
- Action column: last column, right-aligned. Use DropdownMenu with MoreHorizontal icon trigger, NOT inline buttons.
- Action column header: <TableHead className="w-[50px]"></TableHead> (no label text).
- Sortable columns: <TableHead className="cursor-pointer select-none"> with ChevronDown/ChevronUp icon, size-4 ml-1.
- Selected row: bg-muted (single) or checkbox column for multi-select.
- Responsive: ALWAYS wrap Table in <div className="overflow-x-auto">.
- Empty table: <TableRow><TableCell colSpan={columns} className="h-24 text-center text-sm text-muted-foreground">No results.</TableCell></TableRow>

PAGINATION:
- Use shadcn Pagination component. Never build custom.
- Pattern: Previous + page numbers + Next. Show max 5 page numbers with ellipsis.
- Placement: below the list/table, centered. <div className="flex justify-center mt-4">
- For short lists (<20 items): no pagination. For feeds: "Load more" button (variant="outline" className="w-full").

EMPTY STATES: See the Empty State reference pattern in DESIGN QUALITY — APP PAGES. Follow that exact pattern.
- Search empty: "No results for 'query'. Try different keywords." + clear search button.
- Filtered empty: "No items match your filters." + reset filters button.

DATA FORMATTING:
- Dates in rendered output: use relative for recent ("2 hours ago"), absolute for older ("Jan 26, 2026"). Never show raw ISO in the UI.
- Dates in source data (mock arrays, state): ALWAYS store as ISO 8601 strings. Compute display format at render time.
- Numbers: use Intl.NumberFormat or toLocaleString(). 1,234 not 1234. Always include separator for 1000+.
- Currency: $1,234.56 format. Symbol before number. Two decimal places for amounts.
- Percentages: one decimal max. "+12.5%" with sign for changes.

MOCK DATA IN COMPONENTS:
- All date/time values in sample data arrays MUST be valid ISO 8601 strings.
- Render with: new Date(item.date).toLocaleDateString(), Intl.RelativeTimeFormat, or date-fns if imported.
- NEVER store display strings ("2 hours ago", "Yesterday") in data — always compute from ISO date.

STATUS INDICATORS (dot + text):
- Pattern: <div className="flex items-center gap-2"><div className="size-2 rounded-full bg-success" /><span className="text-sm">Active</span></div>
- Colors: bg-success (active/online), bg-destructive (error/offline), bg-warning (warning), bg-muted-foreground (inactive).
- Alternative: use Badge variants for status in tables/lists (preferred over dots).

TREND INDICATORS:
- Up (positive): <span className="text-sm text-success flex items-center"><ArrowUp className="size-3 mr-1" />12.5%</span>
- Down (negative): <span className="text-sm text-destructive flex items-center"><ArrowDown className="size-3 mr-1" />3.2%</span>
- Neutral: <span className="text-sm text-muted-foreground">0%</span>
- Always include arrow icon + sign (+ or -) + percentage.

TIMELINE / ACTIVITY LOG:
- Vertical layout: <div className="space-y-4"> with left border.
- Each entry: <div className="flex gap-4"><div className="flex flex-col items-center"><div className="size-2 rounded-full bg-primary" /><div className="flex-1 w-px bg-border" /></div><div className="flex-1 pb-4"><p className="text-sm font-medium">Event title</p><p className="text-xs text-muted-foreground">2 hours ago</p></div></div>
- Last item: no connector line (remove w-px div).

AVATAR GROUP (stacked):
- Pattern: <div className="flex -space-x-2"><Avatar className="ring-2 ring-background">...</Avatar>...</div>
- Max visible: 4 avatars, then <div className="flex size-8 items-center justify-center rounded-full bg-muted text-xs font-medium ring-2 ring-background">+3</div>
- Size: size-8 for all items in the stack. ring-2 ring-background to create visual separation.

TRUNCATION:
- Single line: className="truncate" (overflow-hidden text-ellipsis whitespace-nowrap).
- Multi-line: className="line-clamp-2" (or line-clamp-3). Needs Tailwind plugin or native CSS.
- When to truncate: card descriptions (2 lines), table cells (single line), list item subtitles (1-2 lines).
- Always set title={fullText} for accessibility on truncated text.

SEARCH INPUT: See the Filter Toolbar reference pattern in DESIGN QUALITY — APP PAGES. Use the search input + Select layout shown there.
- Clear button: X icon on right when value is not empty.
- Debounce: 300ms on keystroke. No search button.
`

export const RULES_NAVIGATION = `
NAVIGATION RULES:

NAVIGATION ACTIVE STATE (one pattern only):
- Sidebar nav: active item gets bg-accent text-accent-foreground font-medium. Inactive: text-muted-foreground hover:text-foreground hover:bg-accent.
- Top nav: active item gets text-foreground font-medium. Inactive: text-muted-foreground hover:text-foreground. No underline, no bg.
- Tab nav: use shadcn Tabs — default active styling.
- NEVER mix approaches. bg-accent for sidebar, font-weight for top nav.

BREADCRUMB:
- Use on any page 2+ levels deep in navigation hierarchy.
- Component: shadcn Breadcrumb. Never build custom.
- Pattern: <Breadcrumb><BreadcrumbList><BreadcrumbItem><BreadcrumbLink href="/">Home</BreadcrumbLink></BreadcrumbItem><BreadcrumbSeparator /><BreadcrumbItem><BreadcrumbPage>Current</BreadcrumbPage></BreadcrumbItem></BreadcrumbList></Breadcrumb>
- Current page: text-foreground (no link). Parent pages: text-muted-foreground with hover.
- Placement: top of page content, before page title.
- Max items: show first, last, up to 2 middle. Use BreadcrumbEllipsis for deeper paths.

IN-PAGE NAVIGATION (e.g. Settings tabs, Profile sections):
- For in-page navigation with <= 5 items, use shadcn Tabs (vertical orientation via orientation="vertical").
- Do NOT use the full Sidebar component for in-page navigation.
- Tabs variant for settings: left-side vertical tabs with TabsList + TabsContent.
- Pattern: <Tabs defaultValue="general" orientation="vertical" className="flex gap-6"><TabsList className="flex-col h-auto"><TabsTrigger value="general">General</TabsTrigger></TabsList><TabsContent value="general">...</TabsContent></Tabs>

SIDEBAR LAYOUT:
- Use shadcn Sidebar component (SidebarProvider, Sidebar, SidebarContent, SidebarMenu, etc.).
- Desktop: collapsible sidebar + main content. Mobile: Sheet from left triggered by SidebarTrigger.
- Sidebar structure: SidebarHeader (logo/brand) → SidebarContent (SidebarGroup with SidebarMenu) → SidebarFooter (user/settings).
- Each nav item: <SidebarMenuItem><SidebarMenuButton asChild isActive={active}><Link href="...">Label</Link></SidebarMenuButton></SidebarMenuItem>
- Active: add bg-accent text-accent-foreground font-medium.
- Sidebar collapse: hidden on mobile (md:flex), Sheet trigger visible (md:hidden).

RESPONSIVE SIDEBAR:
- Desktop (md+): sidebar visible, main content offset.
- Mobile (<md): sidebar hidden, hamburger menu in top bar. Opens Sheet from left with full nav.
- Trigger: <Button variant="ghost" size="icon" className="md:hidden"><Menu className="size-5" /></Button>
- Sheet closes on nav item click (route change).

NAVIGATION MENU (top nav with dropdowns):
- Use shadcn NavigationMenu for top nav with submenus.
- Max top-level items: 5-7. For more, group under dropdowns.
- Keep consistent with top nav active state (text-foreground font-medium for active).
`

export const RULES_OVERLAYS = `
OVERLAY / MODAL RULES:

DIALOG / MODAL:
- Small dialogs (confirm, delete): max-w-sm. One action + one cancel button.
- Standard dialogs (forms, details): max-w-md (default). Title + content + footer.
- Large dialogs (complex forms, previews): max-w-lg. Use sparingly.
- Internal layout: DialogHeader (DialogTitle + DialogDescription) → content with space-y-4 → DialogFooter (buttons right-aligned).
- Footer buttons: cancel on left (variant="outline"), primary action on right.
- NEVER use Dialog for success messages — use toast instead.
- Destructive: primary button is variant="destructive".

CONFIRMATION DIALOG (delete/destructive):
- Title: action-specific ("Delete project?" not "Are you sure?").
- Description: explain consequences. "This will permanently delete 'Project Alpha' and all its data. This action cannot be undone."
- Buttons: <Button variant="outline">Cancel</Button> <Button variant="destructive">Delete project</Button>
- NEVER auto-close. Wait for explicit user action.
- Pattern: DialogHeader(DialogTitle + DialogDescription) → DialogFooter(Cancel + Destructive).

DROPDOWN MENU:
- Item text: text-sm. Icon before text: size-4 mr-2.
- Group related items with DropdownMenuSeparator.
- Destructive item: className="text-destructive" at bottom, separated.
- NON-DESTRUCTIVE items: NEVER apply text color classes. Use default text-foreground. No text-amber, text-orange, text-yellow on menu items.
- Keyboard shortcut hint: <DropdownMenuShortcut>⌘K</DropdownMenuShortcut>.
- Max items without scroll: 8. For more, use Command palette.
- Trigger: Button variant="ghost" size="icon" for icon-only, variant="outline" for labeled.

SHEET (SIDE PANEL):
- Use Sheet for: filters, mobile navigation, detail preview, secondary forms.
- Use Dialog for: confirmations, focused tasks, blocking actions.
- Default side: right. Left only for navigation drawers on mobile.
- Width: default (max-w-sm). Wider: className="w-[400px] sm:w-[540px]". Never full-width.
- Internal layout: SheetHeader → ScrollArea for content → SheetFooter for actions.
- Mobile nav: Sheet from left, close on route change.

POPOVER vs DROPDOWN vs DIALOG:
- Popover: small forms (1-3 fields), color pickers, date pickers, filters.
- DropdownMenu: action lists (Edit, Delete, Share).
- Dialog: focused tasks that need full attention.
- RULE: list of clickable items → DropdownMenu. Interactive controls → Popover. Complex/blocking → Dialog.
- Popover width: min-w-[200px] to max-w-[320px]. Never wider.

TOOLTIP:
- Use for icon-only buttons and truncated text. NEVER for critical information.
- Content: text-xs, max one line.
- Wrap the page or layout in a single <TooltipProvider>.

COMMAND PALETTE:
- Use shadcn Command (cmdk) for global search + actions. Trigger: ⌘K.
- Groups: <CommandGroup heading="Actions">, <CommandGroup heading="Pages">.
- Items: <CommandItem><Icon className="mr-2 size-4" />Label<CommandShortcut>⌘N</CommandShortcut></CommandItem>
- Empty: <CommandEmpty>No results found.</CommandEmpty>
- Use when dropdown menu has 8+ items or app has 5+ pages to navigate.

DRAWER (mobile bottom sheet):
- Use Drawer (Vaul) as mobile alternative to Dialog. Pulls up from bottom.
- Use for mobile-only interactions: filters, confirmations, pickers.
- On desktop: fall back to Dialog or Popover.
- Handle: visible grab handle at top center.
`

export const RULES_FEEDBACK = `
FEEDBACK & STATUS RULES:

TOAST / NOTIFICATIONS:
- Use shadcn toast or Sonner. NEVER use browser alert()/confirm().
- Position: bottom-right (default). Never top-center.
- Duration: 3-5 seconds for success, persistent (manual dismiss) for errors.
- Success: toast({ description: "Changes saved" }) — no title, brief text.
- Error: toast({ variant: "destructive", title: "Error", description: "Could not save. Try again." }) — always title + description.
- Use toast for background actions (save, delete, copy). Inline text for form validation.
- NEVER use toast for critical info — use Alert or Dialog instead.
- Max one toast visible at a time.

ALERT / BANNER:
- Use shadcn Alert: <Alert><AlertTitle /><AlertDescription /></Alert>.
- Info: <Alert> (no variant). Error: <Alert variant="destructive">.
- Icon: AlertCircle for destructive, Info for default.
- Placement: top of the relevant section, full width.
- NEVER use Alert for success — use toast. NOT for form validation (those go inline).

SKELETON / LOADING:
- Text skeleton: h-4 rounded-md bg-muted animate-pulse. Vary widths: w-full, w-3/4, w-1/2.
- Card skeleton: <Card><CardHeader><div className="h-4 w-1/2 animate-pulse rounded-md bg-muted" /></CardHeader></Card>
- Avatar skeleton: <div className="size-8 animate-pulse rounded-full bg-muted" />
- ALWAYS skeleton matching content shape. NEVER centered spinner for page loads.
- Spinner (Loader2): only for inline actions. <Loader2 className="size-4 animate-spin" />
- Button loading: <Button disabled><Loader2 className="mr-2 size-4 animate-spin" />Saving...</Button>

PROGRESS BAR:
- Use shadcn Progress. Pattern: <Progress value={66} className="h-2" />
- Label: text-sm above or beside progress bar. Show percentage or "Step 2 of 3".
- Colors: default (bg-primary) for normal. For status: wrap in div and apply text color context.
- Use for: file uploads, multi-step processes, quotas. NEVER for page loads (use skeleton).

ERROR PAGES (404, 500):
- Centered layout: flex min-h-[50vh] flex-col items-center justify-center text-center.
- 404: <h1 className="text-4xl font-bold">404</h1><p className="text-muted-foreground mt-2">Page not found</p><Button className="mt-4" asChild><Link href="/">Go home</Link></Button>
- 500: same layout but "Something went wrong" + "Try again" button.
- NEVER leave error page without a CTA. Always provide a way back.

NOTIFICATION INDICATORS:
- Unread dot on nav icon: <div className="relative"><Bell className="size-4" /><div className="absolute -top-1 -right-1 size-2 rounded-full bg-destructive" /></div>
- Unread count badge: <div className="absolute -top-1.5 -right-1.5 flex size-4 items-center justify-center rounded-full bg-destructive text-[10px] font-medium text-destructive-foreground">3</div>
- Max display: "9+" for counts above 9.
- Position: always top-right of the icon. Use relative + absolute positioning.

COPY TO CLIPBOARD:
- Button: <Button variant="ghost" size="sm" className="h-7 px-2 text-xs">Copy</Button>
- Feedback: swap icon from Copy to Check for 2 seconds, then revert.
- Pattern: onClick → navigator.clipboard.writeText(text) → setIcon("check") → setTimeout 2000 → setIcon("copy").
- Toast optional: only for non-obvious copies (e.g. API key). Not needed for code blocks.
`

export const RULES_CONTENT = `
CONTENT PAGE RULES:

PRICING CARDS:
- Grid: grid gap-6 md:grid-cols-3. Highlighted tier: ring-2 ring-primary.
- Card structure: CardHeader(tier name + price) → CardContent(feature list) → CardFooter(CTA).
- Price: <div className="text-3xl font-bold">$29<span className="text-sm font-normal text-muted-foreground">/month</span></div>
- Features: <ul className="space-y-2 text-sm"><li className="flex items-center gap-2"><Check className="size-4 text-primary" />Feature</li></ul>
- Popular badge: <Badge className="absolute -top-3 left-1/2 -translate-x-1/2">Popular</Badge> on the Card (relative positioning).
- CTA: primary variant on highlighted tier, outline on others.

PRICE DISPLAY (with discount):
- Old price: <span className="text-sm text-muted-foreground line-through">$49</span>
- New price: <span className="text-2xl font-bold">$29</span>
- Discount badge: <Badge variant="secondary">Save 40%</Badge> beside price.
- Always show both prices when discount is active.

HERO SECTION:
- Full width, centered text: <section className="flex flex-col items-center text-center py-16 md:py-24 gap-4">
- Headline: <h1 className="text-3xl md:text-5xl font-bold tracking-tight max-w-3xl">
- Subheadline: <p className="text-lg text-muted-foreground max-w-2xl">
- CTAs: <div className="flex gap-3"><Button size="lg">Primary</Button><Button variant="outline" size="lg">Secondary</Button></div>
- NEVER use text-6xl or larger. Max headline size: text-5xl on desktop.

FEATURE GRID:
- Grid: grid gap-6 md:grid-cols-3. Each feature: Card or plain div.
- Structure: Icon (size-8 text-primary mb-2) → title (text-sm font-semibold) → description (text-sm text-muted-foreground).
- Icon: in a muted circle: <div className="flex size-10 items-center justify-center rounded-lg bg-muted"><Icon className="size-5 text-primary" /></div>

TESTIMONIAL CARDS:
- Card with: quote (text-sm italic), author name (text-sm font-medium), role (text-xs text-muted-foreground), avatar (size-8).
- Author section: <div className="flex items-center gap-3 mt-4"><Avatar>...</Avatar><div><p className="text-sm font-medium">Name</p><p className="text-xs text-muted-foreground">Title, Company</p></div></div>
- Quote marks: optional, use text-muted-foreground opacity-50.

LANDING PAGE SECTIONS:
- Section spacing: py-16 md:py-24. Between sections: no extra gap (padding handles it).
- Section container: max-w-6xl mx-auto px-4.
- Section title: text-2xl md:text-3xl font-bold tracking-tight text-center mb-4.
- Section subtitle: text-muted-foreground text-center max-w-2xl mx-auto mb-8.
- Alternating layout: consider alternate background (bg-muted/50) every other section.

CHANGELOG / RELEASE NOTES:
- Each version: <div className="space-y-2"><div className="flex items-center gap-2"><Badge variant="outline">v2.1.0</Badge><span className="text-xs text-muted-foreground">Jan 26, 2026</span></div><ul className="space-y-1 text-sm pl-4">...</ul></div>
- Categories: use Badge variant to differentiate (default=New, secondary=Improved, destructive=Fixed).
`

export const RULES_CARDS_LAYOUT = `
CARD & LAYOUT RULES:

COMPONENT PATTERNS:
- Card shadow: NONE or shadow-sm. NEVER shadow-md/lg/xl.
- CardHeader for stat card: className="flex flex-row items-center justify-between space-y-0 pb-2"
- NO nested cards (card inside card). Max 2 levels: Card > content.

BADGE PLACEMENT (critical — prevents overlap):
- Badge in CardHeader: ALWAYS after the title, never before. Use flex row with gap:
  <div className="flex items-center gap-2"><CardTitle>Title</CardTitle><Badge variant="secondary">Status</Badge></div>
- NEVER position Badge with absolute/relative — always inline in flow.
- NEVER create custom status pills (rounded-full bg-primary p-2). ALWAYS use shadcn <Badge>.
- Badge size: text-xs by default. NEVER make badges larger than the title text.

BADGE VARIANT MAPPING (consistent status colors):
- Success/active: <Badge variant="default">Active</Badge> (also: Paid, Verified, Online, Published)
- Neutral/info: <Badge variant="secondary">Pending</Badge> (also: Draft, In Progress, Scheduled)
- Attention/warning: <Badge variant="outline">Review</Badge> (also: Expiring, Low Stock)
- Error/destructive: <Badge variant="destructive">Failed</Badge> (also: Overdue, Declined, Cancelled)
- RULE: same semantic status = same Badge variant across ALL pages.
- NEVER create custom colored pills/chips for status — ALWAYS use Badge component with variants above.
- Priority indicators: use Badge with text label ("High", "Medium", "Low"), NEVER colored dots or pills without text.
- In task/data lists: status and priority MUST be readable text in Badge, not abstract colored shapes.

AVATAR STYLING:
- Default size: size-8. Profile headers: size-10. Never larger. Shape: always rounded-full.
- Fallback: text-xs font-medium, bg-muted text-muted-foreground.
- Always use shadcn Avatar: <Avatar><AvatarImage /><AvatarFallback>JD</AvatarFallback></Avatar>

SECTION HEADERS:
- Standard: <div className="flex items-center justify-between"><h2 className="text-lg font-semibold tracking-tight">Title</h2><Button variant="outline" size="sm">Action</Button></div>
- With description: add <p className="text-sm text-muted-foreground"> below h2, wrap in <div className="space-y-1">.
- NEVER use h3/h4 for top-level sections. h2 for sections, h3 for sub-sections.

BUTTON GROUPING & PLACEMENT:
- Multiple buttons: <div className="flex items-center gap-2">
- Order: secondary (outline/ghost) FIRST, primary LAST. Destructive always last.
- Page-level: <div className="flex items-center justify-between"> (title left, actions right).
- Card footer: <CardFooter className="flex justify-end gap-2">
- Dialog footer: <DialogFooter> — cancel then primary.
- Icon + text: <Button><Plus className="mr-2 size-4" />Add Item</Button>
- Icon-only: <Button variant="ghost" size="icon"> — always with Tooltip.

CARD ACTION PLACEMENT:
- Content cards: DropdownMenu with MoreHorizontal in top-right of CardHeader.
- Form cards: actions in CardFooter (Save, Cancel).
- Feature/marketing cards: single CTA button at bottom.
- Card with link: wrap in <Link> or onClick. Add hover:bg-accent/50 transition-colors.
- NEVER actions in BOTH CardHeader AND CardFooter.

SEPARATOR / DIVIDER:
- Between page sections: <Separator className="my-6" />.
- Between items in list: border-b on each item (className="border-b last:border-0 py-3"). NOT Separator.
- Between groups in DropdownMenu: <DropdownMenuSeparator />.
- NEVER use native <hr>. NEVER use divide-y.

TABS STYLING:
- Use shadcn Tabs. Never build custom tab UI.
- TabsContent: pt-4. Standalone: TabsList w-full md:w-auto. Max tabs visible: 5.
- NEVER add extra border, shadow, or ring to TabsList — it has built-in bg-muted styling.
- NEVER wrap TabsList in a Card or bordered container. It stands alone.

MAX-WIDTH CONTAINER:
- App pages with sidebar: no container needed (sidebar + main handles width).
- App pages without sidebar: main content max-w-4xl mx-auto.
- Landing/marketing pages: max-w-6xl mx-auto px-4.
- NEVER use container class inside app layouts — only for standalone pages.

SETTINGS PAGE LAYOUT:
- Two-column on desktop: left nav (w-48) + right content area. Single column on mobile.
- Left nav: list of text links, vertical. Active: font-medium text-foreground. Inactive: text-muted-foreground.
- Content area: Card for each settings section with CardHeader + CardContent + CardFooter.
- Danger zone: separate Card at bottom with destructive styling.

DASHBOARD GRID:
- Top row: stats (grid gap-4 md:grid-cols-2 lg:grid-cols-4).
- Middle: primary content (table, chart area). Full width or 2/3 + 1/3 split.
- Bottom: secondary content (recent activity, quick actions).
- Pattern: <main className="flex flex-1 flex-col gap-4 p-4 lg:p-6">
`

export const RULES_SHADCN_APIS = `
SHADCN COMPONENT API REFERENCE (use these exact patterns):

SIDEBAR:
- Wrap in <SidebarProvider>. Components: Sidebar, SidebarContent, SidebarHeader, SidebarFooter, SidebarGroup, SidebarGroupLabel, SidebarGroupContent, SidebarMenu, SidebarMenuItem, SidebarMenuButton, SidebarTrigger.
- Nav items: <SidebarMenuItem><SidebarMenuButton asChild isActive={active}><Link href="...">Label</Link></SidebarMenuButton></SidebarMenuItem>
- NEVER use Button for sidebar nav → use SidebarMenuButton.

SELECT (Radix compound component):
- Pattern: <Select><SelectTrigger><SelectValue placeholder="..." /></SelectTrigger><SelectContent><SelectItem value="x">X</SelectItem></SelectContent></Select>
- NEVER use native <select>. Always use shadcn Select.

DROPDOWN MENU:
- Pattern: <DropdownMenu><DropdownMenuTrigger asChild><Button>Open</Button></DropdownMenuTrigger><DropdownMenuContent><DropdownMenuItem>Action</DropdownMenuItem></DropdownMenuContent></DropdownMenu>
- Destructive items: className="text-destructive focus:text-destructive"
- NEVER nest <button> inside trigger → use asChild.

SHEET (mobile panels, sidebars):
- Pattern: <Sheet><SheetTrigger asChild><Button>Open</Button></SheetTrigger><SheetContent side="right">...</SheetContent></Sheet>
- side: "top" | "right" | "bottom" | "left". Default "right".

DIALOG:
- Pattern: <Dialog><DialogTrigger asChild><Button>Open</Button></DialogTrigger><DialogContent><DialogHeader><DialogTitle>Title</DialogTitle><DialogDescription>Desc</DialogDescription></DialogHeader>...</DialogContent></Dialog>
- ALWAYS include DialogTitle for accessibility.

COMMAND (command palette / search):
- Pattern: <Command><CommandInput placeholder="Search..." /><CommandList><CommandEmpty>No results</CommandEmpty><CommandGroup heading="Suggestions"><CommandItem>Item</CommandItem></CommandGroup></CommandList></Command>

ANTI-PATTERNS (NEVER DO):
- NEVER use <button> for sidebar navigation → SidebarMenuButton
- NEVER use native <select> → shadcn Select
- NEVER nest <button> inside a trigger → use asChild prop
- NEVER use custom dropdown → shadcn DropdownMenu
- NEVER build custom modal → shadcn Dialog
- NEVER use custom toast → shadcn Sonner (toast())
`

export const RULES_COMPONENTS_MISC = `
MISCELLANEOUS COMPONENT RULES:

ACCORDION:
- Use shadcn Accordion. Never build custom collapsible.
- Type: "single" for FAQ (one open at a time). "multiple" for settings/filters.
- Trigger text: text-sm font-medium. Content: text-sm text-muted-foreground.
- In Card: no border on AccordionItem (Card provides border). Standalone: built-in border-b.

SCROLLAREA:
- Use shadcn ScrollArea when content height is known and fixed (sidebar, dropdown, modal body).
- Use native overflow-y-auto for dynamic page content.
- Sidebar: <ScrollArea className="h-[calc(100vh-4rem)]">
- Dialog: <ScrollArea className="max-h-[60vh]"> for tall content.

CODE BLOCK / MONOSPACE:
- Inline: <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-sm">code</code>
- Block: <div className="rounded-md bg-muted px-4 py-3 font-mono text-sm">command</div>
- Copy button: <Button variant="ghost" size="sm" className="h-7 px-2 text-xs">Copy</Button> — always same style.

IMAGE / MEDIA CONTAINERS:
- Aspect ratio: aspect-video (16:9) for hero. aspect-square for avatars/thumbnails.
- Rounded: rounded-xl for hero. rounded-md for inline. rounded-full for avatars.
- Fallback: bg-muted with centered icon.
- Object fit: object-cover for photos. object-contain for logos.

CALENDAR / DATE PICKER:
- Use shadcn Calendar for date selection. Pair with Popover for date picker trigger.
- Display format: "Jan 26, 2026" in the trigger. Never raw ISO.
- Placeholder: "Pick a date".

TOGGLE / TOGGLEGROUP:
- Use for view switchers (grid/list, map/satellite). Not for boolean settings (use Switch).
- Pattern: <ToggleGroup type="single" value={view} onValueChange={setView}><ToggleGroupItem value="grid"><Grid className="size-4" /></ToggleGroupItem><ToggleGroupItem value="list"><List className="size-4" /></ToggleGroupItem></ToggleGroup>
- Size: default. Variant: outline.

DARK MODE TOGGLE:
- Pattern: <Button variant="ghost" size="icon" onClick={toggleTheme}><Sun className="size-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" /><Moon className="absolute size-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" /></Button>
- Placement: top-right of navbar, or inside settings.

RATING / STARS:
- Pattern: 5 star icons. Filled: <Star className="size-4 fill-primary text-primary" />. Empty: <Star className="size-4 text-muted-foreground" />.
- Display only (non-interactive): no hover states needed.
- Interactive: add hover:text-primary cursor-pointer on each star.

Z-INDEX HIERARCHY:
- Content: z-0 (default). Sticky headers: z-10. Dropdowns/Popovers: z-50. Sheet/Dialog overlay: z-50 (shadcn default). Toast: z-[100].
- NEVER use arbitrary z-index values above z-50 except for toast (z-[100]).

ADVANCED ANIMATION (beyond the basics in DESIGN QUALITY COMMON):
- Frequency rule: the more often an element is used, the LESS animation it needs. Navigation = zero animation. Rare actions = can have delight.
- Hover timing: instant ON (0ms), ease OFF (150ms). Use transition-duration on the base state, override to 0ms on :hover.
- Timing by element: tooltips 125-200ms, dropdowns 150-250ms, modals 200-400ms, page transitions 300-500ms.
- Enter animations: start from scale(0.95) + opacity-0, never scale(0). Nothing disappears completely.
- Transform-origin for popups: open FROM the trigger element, not from center. Use data-side attribute.
- Stagger delays: 30-80ms between items for list/grid reveals. Cap total stagger at 500ms.
- Reduced motion: always provide @media (prefers-reduced-motion: reduce) alternative (fade instead of slide).
- Allowed: hover effects, accordion open/close, dialog enter/exit, dropdown appear, toast slide in, staggered list reveals.
- Clip-path reveals: clip-path: inset(0 0 100% 0) → inset(0) for text/section reveals. Use cubic-bezier(0.77, 0, 0.175, 1). GPU-accelerated, interruptible.
- BANNED: bounce easing, elastic/overshoot, parallax, auto-playing carousels, decorative animations, linear easing on UI, keyframes for interruptible elements (use transitions).

HEIGHT ANIMATION (canonical pattern):
- NEVER animate height/max-height directly → layout thrashing, not interruptible.
- Use grid-template-rows: open ? '1fr' : '0fr' with inner overflow: hidden.
- Transition: grid-template-rows 300ms cubic-bezier(0.25, 1, 0.5, 1).
- Use for: accordions, expandable sections, mobile nav, collapsible cards.

CONTEXT-DEPENDENT ANIMATION INTENSITY:
- Dashboard/Settings/Admin: minimal, fast, purposeful only
- SaaS app pages: subtle entrance/exit, spring transitions
- Landing/Marketing: full creative expression, stagger reveals, clip-path
- Banking/Finance/Medical: near-zero animation, functional only

TOOLTIP GROUP PATTERN:
- First tooltip in hover group: normal delay + animation.
- Subsequent tooltips (user moving between icons): instant, no animation.
  Use Radix Tooltip with delayDuration={0} after first open.

DRAG/RESIZE PERFORMANCE:
- For frequent pointer-move updates, NEVER use CSS variables:
  BAD: element.style.setProperty('--x', value) — recalculates ALL children
  GOOD: element.style.transform = \`translateX(\${value}px)\` — only this element
`

export const RULES_TAILWIND_V4 = `
TAILWIND CSS v4 RULES (this project uses Tailwind v4):

CONFIGURATION:
- No tailwind.config.js/ts — configuration is CSS-first via @theme in globals.css.
- Tokens defined via @theme inline { --color-primary: var(--primary); } — not in JS config.
- @import "tailwindcss" replaces @tailwind base/components/utilities directives.
- Custom utilities: @utility container { ... } instead of extending theme.container in config.

CSS VARIABLES:
- All design tokens are CSS custom properties in :root and .dark selectors.
- Reference via var(--primary), not theme() function.
- @theme inline maps CSS vars to Tailwind utilities: --color-primary → bg-primary, text-primary.

WHAT CHANGED FROM v3:
- No @apply in most cases — use regular CSS with @layer.
- No tailwind.config.js — all config in CSS.
- Container is opt-in: must define @utility container explicitly.
- Color opacity: bg-primary/50 works (unchanged).
- Arbitrary values still work: bg-[#hex] (but BANNED by our semantic token rules).
`

export const RULES_NEXTJS = `
NEXT.JS APP ROUTER RULES:

DIRECTIVES:
- "use client" at top of file when using: useState, useEffect, usePathname, onClick, onChange, any browser API.
- Server Components (no "use client"): for static pages, metadata export, data fetching with async/await.
- NEVER mix: "use client" + export const metadata. Choose one.

PERFORMANCE:
- Images: use next/image <Image> with width/height or fill prop. Never raw <img> for content images.
- Links: use next/link <Link>. Never raw <a> for internal navigation.
- Fonts: import from next/font/google. Use variable fonts when available.
- Dynamic imports: use next/dynamic for heavy components (charts, editors, maps) not needed on initial load.

SEO (marketing pages only):
- Export metadata object: title, description, openGraph (title, description, url, images).
- Structured heading hierarchy: one h1 per page, h2 for sections, h3 for subsections.
- Canonical URL in metadata.

PATTERNS:
- Loading UI: create loading.tsx in route folder for automatic Suspense boundaries.
- Error boundary: create error.tsx with "use client" for graceful error handling.
- Not found: create not-found.tsx for custom 404 pages.

MOCK DATA ARCHITECTURE:
- NEVER inline mock arrays in components. Extract to src/data/mockData.ts with typed exports.
- Shared TypeScript interfaces: src/types/index.ts. Import: import { Project } from '@/types'
- This makes replacing mock data with real API calls trivial.

CSS ARCHITECTURE (add to globals.css):
- accent-color: hsl(var(--primary)); — native form elements match brand automatically.
- color-scheme: light dark; — tells browser which color scheme is preferred.
`

// ---------------------------------------------------------------------------
// INTERACTION PATTERNS (always sent — UX behaviour, not styling)
// ---------------------------------------------------------------------------

export const INTERACTION_PATTERNS = `
## INTERACTION PATTERNS (mandatory)

### Loading & Latency
- NEVER show empty screen while loading. Always: skeleton OR spinner OR progress bar
- For operations >1s: show what's happening ("Saving changes...", "Loading dashboard...")
- For operations >3s: show progress or steps ("Step 2 of 3: Generating layout...")
- After completion: confirm success with brief feedback ("Changes saved" or toast/banner)
- Skeleton > spinner for page loads. Spinner > skeleton for inline actions (button submit)

### Feedback & Confirmation
- Every user action gets visible feedback:
  - Button click → disabled state + loading indicator during processing
  - Form submit → "Saving..." → "Saved ✓" (or error message)
  - Destructive action → confirmation dialog BEFORE execution, never after
  - Toggle/switch → immediate visual change (optimistic UI)
- Success feedback: subtle (toast, inline text). Don't use modals for success.
- Error feedback: prominent, inline near the cause, with suggested fix

### Error Recovery
- Error messages: what happened + why + what to do next
  ✗ "Something went wrong"
  ✓ "Could not save changes — connection lost. Your changes are preserved. Try again."
- Always provide an action: "Try again", "Go back", "Contact support"
- For form errors: highlight specific fields, don't clear the form
- For page-level errors: show error boundary with retry button
- Never dead-end the user — every error state has a way out

### Empty States
- Every list, table, grid, feed MUST handle zero items:
  - Friendly message (not "No data" — instead "No projects yet")
  - Primary action ("Create your first project")
  - Optional illustration or icon
- Search with no results: "No results for 'X'. Try different keywords." + clear search button
- Filtered with no results: "No items match your filters." + reset filters button

### Navigation & Transitions
- Current page clearly indicated in nav (active state)
- Page transitions: no jarring jumps. Content should appear smoothly
- Back navigation: always available on detail/child pages
- Breadcrumbs on pages 2+ levels deep
- After destructive action (delete): redirect to parent list, not empty detail page

### Handoff Patterns
- Data entered in one context must persist when moving to another
- "Unsaved changes" warning when navigating away from dirty form
- Copy/export actions: confirm what was copied/exported ("Copied to clipboard ✓")
- External links: open in new tab, never navigate away without warning
`

// ---------------------------------------------------------------------------
// TIER 2 SELECTOR — picks relevant contextual rules based on user request
// ---------------------------------------------------------------------------

interface ContextualCategory {
  keywords: RegExp
  rules: string
}

const CONTEXTUAL_CATEGORIES: ContextualCategory[] = [
  {
    keywords:
      /form|input|login|signup|sign.?up|register|settings|profile|password|email|field|validation|upload|stepper|step|wizard|radio|tag.?input|multi.?select/i,
    rules: RULES_FORMS,
  },
  {
    keywords:
      /dashboard|table|list|stats|chart|data|analytics|metric|activity|timeline|report|pagination|paginate|search|filter|sort|empty.?state/i,
    rules: RULES_DATA_DISPLAY,
  },
  {
    keywords: /nav|sidebar|menu|breadcrumb|header|footer|navigation|mobile.?menu|hamburger/i,
    rules: RULES_NAVIGATION,
  },
  {
    keywords:
      /modal|dialog|dropdown|sheet|popover|confirm|delete|toast|notification|alert|error|loading|skeleton|progress|overlay|command.?palette|drawer/i,
    rules: RULES_OVERLAYS,
  },
  {
    keywords:
      /modal|dialog|dropdown|sheet|popover|confirm|toast|notification|alert|error|loading|skeleton|progress|copy|clipboard/i,
    rules: RULES_FEEDBACK,
  },
  {
    keywords:
      /landing|pricing|about|blog|testimonial|hero|feature|changelog|marketing|homepage|home.?page|price|plan|tier/i,
    rules: RULES_CONTENT,
  },
  {
    keywords: /card|grid|layout|dashboard|badge|avatar|tab|section|separator|button|setting|stat|page/i,
    rules: RULES_CARDS_LAYOUT,
  },
  {
    keywords: /accordion|scroll|code|image|calendar|date|toggle|dark.?mode|theme|rating|star|animation|z.?index/i,
    rules: RULES_COMPONENTS_MISC,
  },
  {
    keywords: /sidebar|select|dropdown|sheet|dialog|modal|command|trigger|asChild|menu/i,
    rules: RULES_SHADCN_APIS,
  },
  {
    keywords: /image|seo|metadata|font|performance|loading\.tsx|error\.tsx|dynamic|suspense|next.?image/i,
    rules: RULES_NEXTJS,
  },
  {
    keywords: /tailwind.?v4|@theme|@import.*tailwindcss|css.?first|TAILWIND_V4/i,
    rules: RULES_TAILWIND_V4,
  },
]

/**
 * Select contextual rules relevant to the user's request.
 * Returns only matching tiers. Fallback = empty string (core is always added separately).
 *
 * Context Engineering: when pageSections are provided (from the architecture plan),
 * match against those instead of the full message. This avoids injecting ALL rules
 * when the message mentions many page types (e.g. "dashboard, pricing, settings").
 * Limits to max 3 rule blocks to keep context focused.
 */
export function selectContextualRules(message: string, pageSections?: string[]): string {
  const matched = new Set<string>()
  const matchTarget = pageSections && pageSections.length > 0 ? pageSections.join(' ') : message

  for (const category of CONTEXTUAL_CATEGORIES) {
    if (category.keywords.test(matchTarget)) {
      matched.add(category.rules)
    }
  }

  if (matched.size === 0) {
    return ''
  }

  // Cap at 4 rule blocks to keep prompt focused but cover complex pages
  return [...matched].slice(0, 4).join('\n')
}

// Legacy DESIGN_CONSTRAINTS composite removed — was never imported.
// Use the tiered system: CORE_CONSTRAINTS + getDesignQualityForType() + selectContextualRules()
