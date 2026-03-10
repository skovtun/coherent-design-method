# Architecture: Epic 1 — Generation Quality Overhaul

**Version:** 1.0  
**Date:** 2026-01-26  
**Author:** Winston (Architect) — BMAD methodology  
**Status:** Draft  
**PRD:** [docs/prd.md](./prd.md)  
**Design Rules:** [docs/design-rules.md](./design-rules.md)

---

## 1. Overview

This document defines the technical architecture for Epic 1 (Generation Quality Overhaul). The goal is to transform generated UI from "minimalistic placeholder" to "shadcn/ui blocks" quality through three architectural changes:

1. **Page-type template system** — proven layouts that AI fills with content (Story 1.2)
2. **AI prompt overhaul** — strict design constraints from shadcn analysis (Story 1.3)
3. **Post-generation quality validator** — catches regressions before writing files (Story 1.6)

### Design Principle

> AI fills content slots in proven templates. Templates own layout. AI owns content. Validator catches mistakes.

---

## 2. Current Architecture (Before)

```
User prompt
  → modifier.ts (parseModification)
    → AI returns: { type: "add-page", changes: { pageCode: "..." } }
      → chat.ts (applyModification)
        → writes pageCode to app/{route}/page.tsx
```

**Problems:**
- AI generates BOTH layout AND content → inconsistent layouts
- Prompt has principles but no hard constraints → model "invents" with variable quality
- No validation → placeholders, raw colors, missing hover states ship
- `PageGenerator.ts` has hardcoded fallbacks ("Card content", minimal styling) for non-pageCode path
- `page-templates.ts` expands prompts but doesn't enforce template structure in output

---

## 3. Target Architecture (After)

```
User prompt
  → modifier.ts (parseModification) — OVERHAULED PROMPT with shadcn constraints
    → AI returns: {
        type: "add-page",
        changes: {
          pageType: "dashboard",          ← NEW: template classification
          structuredContent: { ... },     ← NEW: typed content for template
          pageCode: "...",                ← FALLBACK: for custom/unmatched types
          ...metadata
        }
      }
      → chat.ts (applyModification)
        → IF pageType matches a template AND structuredContent provided:
            → template function(structuredContent) → complete TSX
        → ELSE:
            → use pageCode (existing behavior)
        → quality-validator.ts → validate TSX
        → IF validation errors with severity "error":
            → log warnings, attempt auto-fix
        → write to app/{route}/page.tsx
```

---

## 4. Template System Architecture

### 4.1 Directory Structure

```
packages/core/src/generators/templates/
├── pages/                         ← NEW
│   ├── index.ts                   ← Template registry & getTemplateForPageType()
│   ├── types.ts                   ← Content type definitions (per page type)
│   ├── dashboard.ts               ← Dashboard template
│   ├── pricing.ts                 ← Pricing template
│   ├── listing.ts                 ← Listing/grid template
│   ├── contact.ts                 ← Contact/form template
│   ├── settings.ts                ← Settings template
│   ├── landing.ts                 ← Landing/hero template
│   ├── detail.ts                  ← Detail page template
│   └── _shared.ts                 ← Shared layout primitives
├── design-system/                 ← EXISTING (unchanged)
│   └── ...
└── api/                           ← EXISTING (unchanged)
    └── ...
```

### 4.2 Template Content Types (`types.ts`)

Each page type has a typed content interface. AI must return content matching this schema.

```typescript
// Base content shared by all page types
interface BasePageContent {
  title: string
  description: string
}

// Dashboard content
interface DashboardContent extends BasePageContent {
  stats: Array<{
    label: string
    value: string
    change?: string       // e.g. "+12.5% from last month"
    icon?: string         // lucide-react icon name
  }>
  recentActivity?: Array<{
    title: string
    description: string
    time: string
  }>
  charts?: Array<{
    title: string
    type: 'bar' | 'line' | 'pie'
  }>
}

// Pricing content
interface PricingContent extends BasePageContent {
  tiers: Array<{
    name: string
    price: string
    period?: string       // e.g. "/month"
    description: string
    features: string[]
    cta: string
    highlighted?: boolean
  }>
  faq?: Array<{
    question: string
    answer: string
  }>
}

// Listing content
interface ListingContent extends BasePageContent {
  items: Array<{
    title: string
    description: string
    badge?: string
    icon?: string
    link?: string
  }>
  filters?: string[]
  columns?: 2 | 3 | 4
}

// Contact content
interface ContactContent extends BasePageContent {
  fields: Array<{
    name: string
    label: string
    type: 'text' | 'email' | 'tel' | 'textarea'
    placeholder: string
    required?: boolean
  }>
  submitLabel: string
  contactInfo?: Array<{
    label: string
    value: string
    icon?: string
  }>
}

// Settings content
interface SettingsContent extends BasePageContent {
  sections: Array<{
    title: string
    description: string
    fields: Array<{
      name: string
      label: string
      type: 'text' | 'email' | 'toggle' | 'select'
      value?: string
      options?: string[]
    }>
  }>
}

// Landing content
interface LandingContent extends BasePageContent {
  hero: {
    headline: string
    subheadline: string
    primaryCta: string
    secondaryCta?: string
  }
  features: Array<{
    title: string
    description: string
    icon?: string
  }>
  testimonials?: Array<{
    quote: string
    author: string
    role: string
  }>
  finalCta?: {
    headline: string
    description: string
    buttonText: string
  }
}

// Detail page content
interface DetailContent extends BasePageContent {
  hero: {
    title: string
    subtitle: string
    badge?: string
  }
  sections: Array<{
    title: string
    content: string        // Markdown or plain text
  }>
  sidebar?: {
    items: Array<{
      label: string
      value: string
    }>
  }
  relatedItems?: Array<{
    title: string
    description: string
    link: string
  }>
}

// Union type for template dispatch
type PageContent =
  | { pageType: 'dashboard'; content: DashboardContent }
  | { pageType: 'pricing'; content: PricingContent }
  | { pageType: 'listing'; content: ListingContent }
  | { pageType: 'contact'; content: ContactContent }
  | { pageType: 'settings'; content: SettingsContent }
  | { pageType: 'landing'; content: LandingContent }
  | { pageType: 'detail'; content: DetailContent }
```

### 4.3 Template Function Signature

Every template exports a single function:

```typescript
// Example: packages/core/src/generators/templates/pages/dashboard.ts

import type { DashboardContent } from './types'

interface TemplateOptions {
  route: string          // for metadata/imports
  pageName: string       // PascalCase function name
}

export function dashboardTemplate(
  content: DashboardContent,
  options: TemplateOptions
): string {
  // Returns complete page.tsx content
  // Uses ONLY shadcn design rules from design-rules.md
}
```

### 4.4 Template Registry (`index.ts`)

```typescript
import { dashboardTemplate } from './dashboard'
import { pricingTemplate } from './pricing'
import { listingTemplate } from './listing'
import { contactTemplate } from './contact'
import { settingsTemplate } from './settings'
import { landingTemplate } from './landing'
import { detailTemplate } from './detail'

const TEMPLATE_REGISTRY: Record<string, (content: any, options: any) => string> = {
  dashboard: dashboardTemplate,
  pricing: pricingTemplate,
  listing: listingTemplate,
  contact: contactTemplate,
  settings: settingsTemplate,
  landing: landingTemplate,
  detail: detailTemplate,
}

export function getTemplateForPageType(
  pageType: string
): ((content: any, options: any) => string) | null {
  return TEMPLATE_REGISTRY[pageType] ?? null
}

export function getSupportedPageTypes(): string[] {
  return Object.keys(TEMPLATE_REGISTRY)
}
```

### 4.5 Design Rules Enforcement in Templates

Templates MUST follow these rules from `design-rules.md`. These are encoded as shared constants in `_shared.ts`:

```typescript
// packages/core/src/generators/templates/pages/_shared.ts

/** shadcn/ui design rule constants — DO NOT override */
export const DESIGN = {
  // Typography (Section 2.2 of design-rules.md)
  pageTitle: 'text-2xl font-bold tracking-tight',
  cardTitle: 'text-sm font-medium',
  cardDescription: 'text-sm text-muted-foreground',
  metricValue: 'text-2xl font-bold',
  metricSubtext: 'text-xs text-muted-foreground',
  body: 'text-sm',
  muted: 'text-sm text-muted-foreground',

  // Spacing (Section 2.1)
  pagePadding: 'p-4 lg:p-6',
  sectionGap: 'gap-4 md:gap-6',
  betweenSections: 'gap-6 md:gap-8',
  cardInternalGap: 'gap-2',

  // Layout (Section 2.3)
  pageWrapper: 'flex flex-1 flex-col',
  headerHeight: 'h-16',
  statsGrid: 'grid gap-4 md:grid-cols-2 lg:grid-cols-4',
  cardGrid3: 'grid gap-4 md:grid-cols-3',
  cardGrid2: 'grid gap-4 md:grid-cols-2',
  centeredForm: 'flex min-h-svh flex-col items-center justify-center p-6 md:p-10',
  formContainer: 'w-full max-w-sm',

  // Components (Sections 2.4, 2.5)
  iconSize: 'size-4',
  iconColor: 'text-muted-foreground',

  // Header (Section 2.6)
  header: 'flex h-16 shrink-0 items-center gap-2 border-b px-4',
} as const
```

### 4.6 Template Example: Dashboard

```typescript
// packages/core/src/generators/templates/pages/dashboard.ts

import type { DashboardContent } from './types'
import { DESIGN } from './_shared'

interface TemplateOptions {
  route: string
  pageName: string
}

export function dashboardTemplate(
  content: DashboardContent,
  options: TemplateOptions
): string {
  const { title, description, stats, recentActivity } = content
  const { pageName } = options

  const hasIcons = stats.some(s => s.icon)
  const iconImports = hasIcons
    ? `import { ${[...new Set(stats.filter(s => s.icon).map(s => s.icon))].join(', ')} } from 'lucide-react'`
    : ''

  const statsCards = stats.map(stat => `
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="${DESIGN.cardTitle}">${stat.label}</CardTitle>
              ${stat.icon ? `<${stat.icon} className="${DESIGN.iconSize} ${DESIGN.iconColor}" />` : ''}
            </CardHeader>
            <CardContent>
              <div className="${DESIGN.metricValue}">${stat.value}</div>
              ${stat.change ? `<p className="${DESIGN.metricSubtext}">${stat.change}</p>` : ''}
            </CardContent>
          </Card>`).join('\n')

  const activitySection = recentActivity && recentActivity.length > 0
    ? `
        <Card>
          <CardHeader>
            <CardTitle className="${DESIGN.cardTitle}">Recent Activity</CardTitle>
            <CardDescription className="${DESIGN.cardDescription}">Latest updates from your account</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              ${recentActivity.map(item => `
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <p className="${DESIGN.body} font-medium">${item.title}</p>
                  <p className="${DESIGN.muted}">${item.description}</p>
                </div>
                <span className="${DESIGN.muted}">${item.time}</span>
              </div>`).join('\n')}
            </div>
          </CardContent>
        </Card>`
    : ''

  return `import { Metadata } from 'next'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/card'
${iconImports}

export const metadata: Metadata = {
  title: '${title}',
  description: '${description}',
}

export default function ${pageName}Page() {
  return (
    <main className="${DESIGN.pageWrapper} ${DESIGN.pagePadding}">
      <div className="flex flex-col ${DESIGN.betweenSections}">
        <div>
          <h1 className="${DESIGN.pageTitle}">${title}</h1>
          <p className="${DESIGN.muted}">${description}</p>
        </div>

        <div className="${DESIGN.statsGrid}">
${statsCards}
        </div>
${activitySection}
      </div>
    </main>
  )
}
`
}
```

---

## 5. AI Prompt Overhaul Architecture

### 5.1 Prompt Structure Change

**Current prompt structure (modifier.ts):**
```
1. Role: "You are a design system modifier"
2. UI/UX principles (7 principles, ~200 tokens)
3. Design system context (pages, components)
4. Component registry
5. Available shadcn components
6. Component usage rules
7. Modification format specification
8. Component rules (RULE 0-3)
```

**New prompt structure:**
```
1. Role: "You are a design system modifier"
2. ── SHADCN DESIGN CONSTRAINTS ── (NEW — ~600 tokens)     ← from design-rules.md §4.1
3. UI/UX principles (trimmed to 5 lines)
4. Design system context
5. Component registry
6. Available shadcn components + exports
7. ── PAGE TYPE CLASSIFICATION ── (NEW — ~300 tokens)       ← template types + content schemas
8. Modification format specification (updated for pageType + structuredContent)
9. ── FEW-SHOT EXAMPLES ── (NEW — ~500 tokens)             ← 1-2 examples of correct output
10. Component rules
```

### 5.2 Shadcn Design Constraints Block (NEW)

This replaces the soft "principles" with hard constraints from `design-rules.md`:

```typescript
const SHADCN_DESIGN_CONSTRAINTS = `
SHADCN/UI DESIGN CONSTRAINTS (MANDATORY — violations will be rejected by validator):

TYPOGRAPHY:
- Base font size: text-sm (14px). NEVER use text-base as body text.
- Card titles: text-sm font-medium. NEVER text-lg/text-xl on card titles.
- Page title: text-2xl font-bold tracking-tight
- Metric values: text-2xl font-bold
- Muted/secondary text: text-muted-foreground (with text-sm or text-xs)
- Hierarchy through font WEIGHT (medium → semibold → bold), not font SIZE

COLORS — ONLY SEMANTIC TOKENS:
- Backgrounds: bg-background, bg-muted, bg-muted/50, bg-card, bg-primary, bg-secondary
- Text: text-foreground (default), text-muted-foreground, text-primary-foreground
- Borders: border (no color — uses CSS variable)
- BANNED: bg-gray-*, bg-blue-*, text-gray-*, text-slate-*, ANY raw Tailwind color

SPACING:
- Page padding: p-4 lg:p-6
- Section gap: gap-4 md:gap-6
- Between major sections: gap-6 md:gap-8
- Card internal gap: gap-2
- ONLY multiples of 4px. Max padding: p-6

LAYOUT:
- Stats grid: grid gap-4 md:grid-cols-2 lg:grid-cols-4
- Card grid: grid gap-4 md:grid-cols-3
- Full-height: min-h-svh (not min-h-screen)
- Responsive: ONLY md: and lg: breakpoints. NEVER sm: or xl:

COMPONENTS:
- Icons: size-4 text-muted-foreground (16px, muted)
- Card shadow: NONE or shadow-sm. NEVER shadow-md/lg/xl
- Borders: border (no color specified). border-b for headers.
- CardHeader pattern: flex flex-row items-center justify-between space-y-0 pb-2

ANTI-PATTERNS (NEVER DO):
- text-base as body text
- text-lg/xl on card titles
- Raw colors (bg-gray-100, text-blue-600)
- shadow-md or heavier
- sm: or xl: breakpoints
- Nested cards (card inside card)
- container mx-auto inside app layouts
- padding > p-6
`
```

### 5.3 Page Type Classification in Prompt

When the request is `add-page`, the prompt instructs AI to also return:

```typescript
const PAGE_TYPE_INSTRUCTIONS = `
PAGE TYPE CLASSIFICATION:
For add-page requests, also return:
  "pageType": one of [${getSupportedPageTypes().join(', ')}] — or "custom" if none match
  "structuredContent": content object matching the pageType schema (see below)

If pageType is "custom" or you're unsure, still return full pageCode as before.
If pageType matches a known type, return BOTH structuredContent AND pageCode (pageCode as fallback).

Content schemas per page type:
${generateContentSchemaDescriptions()}
`
```

### 5.4 Prompt Token Budget

| Section | Current | Target | Notes |
|---------|---------|--------|-------|
| Role + principles | ~250 | ~150 | Trim to essentials |
| Design constraints | 0 | ~600 | NEW from design-rules.md |
| DS context + registry | ~300 | ~300 | Unchanged |
| Shadcn list + exports | ~200 | ~200 | Unchanged |
| Page type classification | 0 | ~300 | NEW template schemas |
| Format spec + rules | ~800 | ~600 | Consolidate |
| Few-shot examples | 0 | ~500 | NEW 1-2 examples |
| Component rules | ~400 | ~350 | Trim duplicates |
| **Total** | **~1,950** | **~3,000** | Under 8K budget |

---

## 6. Chat Pipeline Integration

### 6.1 Modified `applyModification` for `add-page`

```typescript
// In packages/cli/src/commands/chat.ts, case 'add-page':

case 'add-page': {
  const page = request.changes as PageDefinition & {
    pageCode?: string
    pageType?: string                    // NEW
    structuredContent?: Record<string, any>  // NEW
  }
  
  let finalCode: string | undefined

  // 1. Try template-based generation first
  if (page.pageType && page.pageType !== 'custom' && page.structuredContent) {
    const templateFn = getTemplateForPageType(page.pageType)
    if (templateFn) {
      try {
        finalCode = templateFn(page.structuredContent, {
          route: page.route,
          pageName: toPascalCase(page.name),
        })
      } catch (err) {
        console.log(chalk.yellow(`⚠ Template "${page.pageType}" failed, using pageCode fallback`))
      }
    }
  }

  // 2. Fall back to AI-generated pageCode
  if (!finalCode && typeof page.pageCode === 'string' && page.pageCode.trim() !== '') {
    finalCode = page.pageCode
  }

  // 3. Fall back to PageGenerator (existing legacy path)
  if (!finalCode) {
    const gen = new PageGenerator(config)
    finalCode = await gen.generate(pageForConfig)
  }

  // 4. Post-processing
  finalCode = ensureUseClientIfNeeded(finalCode)

  // 5. Quality validation (NEW)
  const issues = validatePageQuality(finalCode)
  const errors = issues.filter(i => i.severity === 'error')
  const warnings = issues.filter(i => i.severity === 'warning')
  if (errors.length > 0) {
    console.log(chalk.yellow(`⚠ Quality issues in ${page.name}:`))
    errors.forEach(e => console.log(chalk.red(`   ✗ ${e.message} (line ${e.line})`)))
  }
  if (warnings.length > 0) {
    warnings.forEach(w => console.log(chalk.yellow(`   ⚡ ${w.message} (line ${w.line})`)))
  }

  // 6. Write file
  await writeFile(filePath, finalCode)
  break
}
```

### 6.2 Fallback Strategy

```
Priority 1: Template + structuredContent (highest quality, deterministic layout)
    ↓ if template not found or fails
Priority 2: AI pageCode (flexible, AI-generated layout)
    ↓ if no pageCode
Priority 3: PageGenerator legacy path (worst quality, to be deprecated)
```

---

## 7. Quality Validator Architecture

### 7.1 Module: `packages/cli/src/utils/quality-validator.ts`

```typescript
interface QualityIssue {
  line: number
  column?: number
  type: string
  message: string
  severity: 'error' | 'warning'
  autoFixable: boolean
}

interface ValidationResult {
  issues: QualityIssue[]
  score: number           // 0-100, 100 = perfect
  autoFixed?: string      // code after auto-fixes applied
}

function validatePageQuality(code: string): ValidationResult
```

### 7.2 Validation Rules

Rules are organized into categories matching `design-rules.md` Section 4.3:

```typescript
interface ValidationRule {
  id: string
  category: 'colors' | 'typography' | 'spacing' | 'layout' | 'content' | 'interaction'
  severity: 'error' | 'warning'
  test: (code: string) => QualityIssue[]
  autoFix?: (code: string) => string
}
```

**Category: Colors (ERRORS)**
| Rule ID | Pattern | Message | Auto-fixable |
|---------|---------|---------|-------------|
| `NO_RAW_COLORS` | `/(bg\|text\|border)-(gray\|blue\|red\|green\|yellow\|purple\|pink\|indigo\|orange\|slate\|zinc\|neutral\|stone\|amber\|lime\|emerald\|teal\|cyan\|sky\|violet\|fuchsia\|rose)-\d+/` | "Use semantic tokens instead of raw colors" | Yes — map to closest semantic token |

**Category: Typography (ERRORS)**
| Rule ID | Pattern | Message | Auto-fixable |
|---------|---------|---------|-------------|
| `NO_LARGE_CARD_TITLES` | `CardTitle` with `text-(lg\|xl\|2xl)` | "Card titles must use text-sm font-medium" | Yes |
| `NO_HEAVY_SHADOWS` | `shadow-(md\|lg\|xl\|2xl)` | "Max shadow is shadow-sm" | Yes → `shadow-sm` |

**Category: Typography (WARNINGS)**
| Rule ID | Pattern | Message | Auto-fixable |
|---------|---------|---------|-------------|
| `PREFER_TEXT_SM` | `text-base` in body context | "Prefer text-sm as base font size" | No |

**Category: Content (ERRORS)**
| Rule ID | Pattern | Message | Auto-fixable |
|---------|---------|---------|-------------|
| `NO_PLACEHOLDERS` | `"Card content"\|"Lorem ipsum"\|"Your content here"\|"Description"\|"Title"` (as standalone text) | "No placeholder content" | No |

**Category: Layout (WARNINGS)**
| Rule ID | Pattern | Message | Auto-fixable |
|---------|---------|---------|-------------|
| `NO_SM_BREAKPOINT` | `\bsm:` | "Use md: and lg: only" | No |
| `NO_XL_BREAKPOINT` | `\bxl:` | "Use md: and lg: only" | No |

**Category: Interaction (WARNINGS)**
| Rule ID | Pattern | Message | Auto-fixable |
|---------|---------|---------|-------------|
| `BUTTON_HOVER` | `<button` or `<Button` without `hover:` in className | "Buttons must have hover state" | No |
| `INPUT_FOCUS` | `<input` or `<Input` without `focus:` in className | "Inputs must have focus state" | No |

### 7.3 Auto-Fix Pipeline

```typescript
function autoFixQualityIssues(code: string, issues: QualityIssue[]): string {
  let fixed = code
  for (const issue of issues.filter(i => i.autoFixable)) {
    fixed = applyAutoFix(fixed, issue)
  }
  return fixed
}

// Color auto-fix mapping
const RAW_TO_SEMANTIC: Record<string, string> = {
  'bg-gray-50': 'bg-muted/50',
  'bg-gray-100': 'bg-muted',
  'bg-gray-200': 'bg-muted',
  'bg-white': 'bg-background',
  'bg-slate-900': 'bg-primary',
  'text-gray-500': 'text-muted-foreground',
  'text-gray-600': 'text-muted-foreground',
  'text-gray-700': 'text-foreground',
  'text-gray-900': 'text-foreground',
  'text-slate-500': 'text-muted-foreground',
  'text-slate-900': 'text-foreground',
  'border-gray-200': 'border',
  'border-gray-300': 'border',
  // ... extend as needed
}
```

### 7.4 Integration Points

1. **`coherent chat` pipeline** — after generating page code, before writing file
2. **`coherent validate` command** — standalone scan of all `app/**/*.tsx`
3. **`coherent repair`** — extended to run validator + auto-fix on all pages

---

## 8. Page-Type Classification

### 8.1 Classification Hierarchy

Classification happens at two levels:

1. **Pre-classification** (in `page-templates.ts`, EXISTING): Detects page type from prompt name ("add dashboard page" → `dashboard`). Used to expand the prompt.

2. **AI classification** (NEW, in modifier.ts response): AI returns `pageType` field after understanding the full request context.

### 8.2 Updated `page-templates.ts`

The existing `page-templates.ts` currently expands prompts with section descriptions. It needs to be updated to:

1. Keep `expandPageRequest()` for prompt expansion (existing)
2. Add `getContentSchemaForType(pageType: string)` — returns a description of the expected `structuredContent` schema for the AI prompt
3. Keep `detectPageType()` for pre-classification (existing)

```typescript
// New export
export function getContentSchemaForType(pageType: string): string | null {
  const schemas: Record<string, string> = {
    dashboard: `{
  title: string, description: string,
  stats: [{ label: string, value: string, change?: string, icon?: string }],
  recentActivity?: [{ title: string, description: string, time: string }]
}`,
    pricing: `{
  title: string, description: string,
  tiers: [{ name: string, price: string, period?: string, description: string, features: string[], cta: string, highlighted?: boolean }],
  faq?: [{ question: string, answer: string }]
}`,
    // ... other types
  }
  return schemas[pageType] ?? null
}
```

### 8.3 Classification Flow

```
User: "add dashboard page with sales metrics"
  1. detectPageType("dashboard") → "dashboard"         (page-templates.ts)
  2. expandPageRequest("dashboard", message) → expanded prompt
  3. getContentSchemaForType("dashboard") → schema      (page-templates.ts, NEW)
  4. buildModificationPrompt(expanded, config, registry)
     → includes: design constraints + schema for "dashboard"
  5. AI returns: { pageType: "dashboard", structuredContent: {...}, pageCode: "..." }
  6. getTemplateForPageType("dashboard") → dashboardTemplate
  7. dashboardTemplate(structuredContent) → page TSX
  8. validatePageQuality(TSX) → issues[]
  9. write file
```

---

## 9. AppNav Restyle Architecture

### 9.1 Current AppNav Problems

From `PageGenerator.generateAppNav()`:
- FAB uses hardcoded `bg-neutral-900` (raw color)
- Links use minimal styling (`text-sm font-medium transition-colors`)
- No mobile responsive behavior
- Active state is only underline

### 9.2 Target AppNav Design

Following shadcn header pattern (design-rules.md §2.6):

```typescript
// Updated generateAppNav() should produce:

<header className="flex h-16 shrink-0 items-center border-b bg-background px-4 lg:px-6">
  <nav className="flex items-center gap-1">
    {items.map(item => (
      <Link
        href={item.route}
        className={cn(
          "inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors",
          "hover:bg-muted hover:text-foreground",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          pathname === item.route
            ? "bg-muted text-foreground"
            : "text-muted-foreground"
        )}
      >
        {item.label}
      </Link>
    ))}
  </nav>
</header>
```

Changes:
- Uses semantic colors only (`bg-muted`, `text-muted-foreground`, `text-foreground`)
- Fixed height (`h-16`) per shadcn pattern
- Active state: `bg-muted text-foreground` (background highlight, not underline)
- Hover: `hover:bg-muted hover:text-foreground`
- Focus: `focus-visible:ring-2 focus-visible:ring-ring`
- FAB: change `bg-neutral-900` to `bg-primary text-primary-foreground`

---

## 10. File Change Map

### New Files

| File | Story | Description |
|------|-------|-------------|
| `packages/core/src/generators/templates/pages/types.ts` | 1.2 | Content type definitions |
| `packages/core/src/generators/templates/pages/_shared.ts` | 1.2 | Shared design constants |
| `packages/core/src/generators/templates/pages/index.ts` | 1.2 | Template registry |
| `packages/core/src/generators/templates/pages/dashboard.ts` | 1.2 | Dashboard template |
| `packages/core/src/generators/templates/pages/pricing.ts` | 1.2 | Pricing template |
| `packages/core/src/generators/templates/pages/listing.ts` | 1.2 | Listing template |
| `packages/core/src/generators/templates/pages/contact.ts` | 1.2 | Contact template |
| `packages/core/src/generators/templates/pages/settings.ts` | 1.2 | Settings template |
| `packages/core/src/generators/templates/pages/landing.ts` | 1.2 | Landing template |
| `packages/core/src/generators/templates/pages/detail.ts` | 1.2 | Detail template |
| `packages/cli/src/utils/quality-validator.ts` | 1.6 | Quality validator |
| `packages/cli/src/commands/validate.ts` | 1.6 | `coherent validate` command |
| `docs/design-rules.md` | 1.1 | Design rules reference ✅ DONE |

### Modified Files

| File | Story | Changes |
|------|-------|---------|
| `packages/cli/src/agents/modifier.ts` | 1.3 | Add SHADCN_DESIGN_CONSTRAINTS, PAGE_TYPE_INSTRUCTIONS, few-shot examples |
| `packages/cli/src/agents/page-templates.ts` | 1.3 | Add `getContentSchemaForType()` |
| `packages/cli/src/commands/chat.ts` | 1.4 | Template dispatch in `applyModification`, validator integration |
| `packages/core/src/generators/PageGenerator.ts` | 1.5, 1.7 | AppNav restyle, improved section styling |
| `packages/cli/src/commands/repair.ts` | 1.6 | Extend with validator auto-fix |
| `packages/core/src/generators/ProjectScaffolder.ts` | 1.7 | Updated welcome page generation |

---

## 11. Migration / Backwards Compatibility

- **No breaking changes to CLI interface.** All existing commands work as before.
- **PageGenerator legacy path preserved.** If AI returns neither `pageType` nor `pageCode`, the old section-based generation still works.
- **Template output is the same file format** — `app/{route}/page.tsx` with standard Next.js conventions.
- **Validator is additive** — it reports issues but doesn't block file writes (errors are logged, not thrown).
- **Existing projects** can run `coherent repair` → `coherent validate` to identify and fix quality issues in already-generated pages.

---

## 12. Risks and Mitigations

| Risk | Mitigation |
|------|-----------|
| AI ignores `pageType`/`structuredContent` fields and only returns `pageCode` | Fallback to `pageCode` is the default; templates are an upgrade, not a requirement |
| Templates become rigid and can't handle custom requests | "custom" pageType falls through to full `pageCode` generation |
| Prompt size exceeds token limits | Token budget tracked (§5.4); constraints compressed; examples limited to 2 |
| Validator produces false positives | Start with high-confidence rules only; `warning` severity for uncertain ones |
| `design-rules.md` rules conflict with user's design system tokens | Templates use tokens from config, not hardcoded values; rules are about structure not colors |

---

## 13. Implementation Order

```
Phase A (parallel — Stories 1.1 ✅, 1.2, 1.3):
  ├── Story 1.2: Template system (Dev creates templates)
  └── Story 1.3: Prompt overhaul (Dev updates modifier.ts)
      → Both use design-rules.md as input
      → Story 1.3 can be tested independently (just better pageCode)

Phase B (sequential — Stories 1.4, 1.5):
  ├── Story 1.4: Integrate templates into chat pipeline
  └── Story 1.5: Restyle AppNav

Phase C (parallel — Stories 1.6, 1.7):
  ├── Story 1.6: Quality validator
  └── Story 1.7: Welcome page overhaul

Phase D (final — Story 1.8):
  └── Story 1.8: E2E quality smoke test
```

---

## Architect Handoff

This architecture document provides the complete technical design for Epic 1. Dev should:

1. Start with **Story 1.3** (prompt overhaul) — highest impact, lowest risk, can be tested in ~1 hour by generating a test page
2. **Story 1.2** (templates) in parallel — start with `_shared.ts` + `types.ts` + `dashboard.ts`, validate approach, then add remaining templates
3. **Story 1.4** after both 1.2 and 1.3 are merged — integrates template dispatch into chat pipeline
4. Stories 1.5-1.8 follow naturally

The UX Expert should produce front-end specs for each of the 7 template types (exact HTML structure, component composition, spacing values) to guide template implementation in Story 1.2.
