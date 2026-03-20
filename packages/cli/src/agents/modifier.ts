/**
 * Modifier Agent
 *
 * AI agent that handles incremental modifications with component reuse.
 * Parses natural language into structured ModificationRequest.
 */

import chalk from 'chalk'
import type { DesignSystemConfig, ModificationRequest, ComponentSpec } from '@getcoherent/core'
import { ComponentManager } from '@getcoherent/core'
import { createAIProvider, type AIProvider } from '../utils/ai-provider.js'
import { expandPageRequest } from './page-templates.js'
import { listShadcnComponents } from '../utils/shadcn-installer.js'
import {
  DESIGN_THINKING,
  CORE_CONSTRAINTS,
  DESIGN_QUALITY,
  VISUAL_DEPTH,
  INTERACTION_PATTERNS,
  selectContextualRules,
} from './design-constraints.js'

export interface ModificationContext {
  config: DesignSystemConfig
  componentManager: ComponentManager
}

/**
 * Parse natural language modification request
 */
export interface ParseModificationResult {
  requests: ModificationRequest[]
  uxRecommendations?: string
}

export interface ParseModificationOptions {
  sharedComponentsSummary?: string
  planOnly?: boolean
}

export async function parseModification(
  message: string,
  context: ModificationContext,
  provider: AIProvider = 'auto',
  options?: ParseModificationOptions,
): Promise<ParseModificationResult> {
  const ai = await createAIProvider(provider)

  if (options?.planOnly) {
    const prompt = buildPlanOnlyPrompt(message, context.config)
    const raw = await ai.parseModification(prompt)
    const requestsArray = Array.isArray(raw) ? raw : (raw?.requests ?? [])
    return { requests: requestsArray as ModificationRequest[], uxRecommendations: undefined }
  }

  const componentRegistry = buildComponentRegistry(context.componentManager)

  let enhancedMessage = message
  let isExpandedPageRequest = false

  const isAddPage = /add|create|make.*page/i.test(message)
  if (isAddPage) {
    const pageNameMatch = message.match(/(?:add|create|make)\s+(?:a\s+)?(\w+)\s+page/i)
    if (pageNameMatch) {
      const pageName = pageNameMatch[1]
      enhancedMessage = expandPageRequest(pageName, message)
      if (enhancedMessage !== message) {
        isExpandedPageRequest = true
        console.log(chalk.cyan('💡 Expanding request with best practices...'))
      }
    }
  }

  const prompt = buildModificationPrompt(enhancedMessage, context.config, componentRegistry, {
    isExpandedPageRequest,
    sharedComponentsSummary: options?.sharedComponentsSummary,
  })

  const raw = await ai.parseModification(prompt)
  const requestsArray = Array.isArray(raw) ? raw : (raw?.requests ?? [])
  const uxRecommendations = Array.isArray(raw)
    ? undefined
    : raw?.uxRecommendations && String(raw.uxRecommendations).trim()
      ? String(raw.uxRecommendations)
      : undefined

  const requests = await checkComponentReuse(requestsArray as ModificationRequest[], context.componentManager)
  return { requests, uxRecommendations }
}

/**
 * Build component registry summary for Claude
 */
function buildComponentRegistry(componentManager: ComponentManager): string {
  const components = componentManager.getAllComponents()

  if (components.length === 0) {
    return 'No components in registry yet.'
  }

  const registry = components
    .map(comp => {
      const variants = comp.variants.map(v => v.name).join(', ')
      const sizes = comp.sizes.map(s => s.name).join(', ')
      const usedIn = comp.usedInPages.length > 0 ? `Used in: ${comp.usedInPages.join(', ')}` : 'Not used yet'

      return `- ${comp.name} (id: ${comp.id})
  Category: ${comp.category}
  Source: ${comp.source}${comp.shadcnComponent ? ` (${comp.shadcnComponent})` : ''}
  Variants: ${variants || 'none'}
  Sizes: ${sizes || 'none'}
  ${usedIn}`
    })
    .join('\n')

  return `Available components:\n${registry}`
}

/**
 * Lightweight prompt for plan-only phase — returns only page names/routes, no pageCode.
 * ~500 tokens vs ~3000+ for the full prompt.
 */
function buildPlanOnlyPrompt(message: string, config: DesignSystemConfig): string {
  return `You are a web app planner. Given the user's request, determine which pages need to be created.

Existing pages: ${config.pages.map(p => `${p.name} (${p.route})`).join(', ') || '(none)'}

User Request: "${message}"

Return ONLY a JSON object with this structure (no pageCode, no sections, no content):
{
  "requests": [
    { "type": "add-page", "target": "new", "changes": { "id": "page-id", "name": "Page Name", "route": "/page-route" } }
  ]
}

Rules:
- Use kebab-case for id and route
- Route must start with /
- Keep response under 500 tokens
- Do NOT include pageCode, sections, or any other fields
- Include ALL pages the user explicitly requested
- ALSO include logically related pages that a real app would need. For example:
  * If there is a catalog/listing page, add a detail page (e.g. /products → /products/[id])
  * If there is login, also add registration and forgot-password (and vice versa)
  * If there is a dashboard, consider adding settings and/or profile pages
  * If there is a blog/news listing, add an article/post detail page
  * Think about what pages users would naturally navigate to from the requested pages`
}

/**
 * Build prompt for Claude to parse modification
 */
function buildModificationPrompt(
  message: string,
  config: DesignSystemConfig,
  componentRegistry: string,
  options?: { isExpandedPageRequest?: boolean; sharedComponentsSummary?: string },
): string {
  const now = new Date().toISOString()
  const expandedHint =
    options?.isExpandedPageRequest === true
      ? '\nIMPORTANT: The user request has been expanded with best practices. Use ALL the details provided when generating sections and content.\n\n'
      : ''
  const sharedSection = options?.sharedComponentsSummary
    ? `

## SHARED COMPONENTS (MANDATORY REUSE)

You MUST import and use existing shared components when the page type matches. NEVER recreate inline what already exists as shared.
Example: if a shared component "PricingCard" (section/widget) exists and the user asks for a pricing page — you MUST add \`import { PricingCard } from '@/components/shared/pricing-card'\` and use <PricingCard /> (or with props). Do NOT build pricing tiers from Card/Button/Badge inline.

Available shared components:
${options.sharedComponentsSummary}

When using a shared component, import from @/components/shared/{kebab-name} (see Import line above).
If the shared component needs minor adaptation (e.g., different props), use its props interface — do NOT copy and modify the code inline.

For editing an existing shared component use type "modify-layout-block" with target "CID-XXX" or name.
`
    : ''
  const availableShadcn = listShadcnComponents()

  const designThinking = DESIGN_THINKING
  const coreRules = CORE_CONSTRAINTS
  const designQuality = DESIGN_QUALITY
  const visualDepth = VISUAL_DEPTH
  const contextualRules = selectContextualRules(message)
  const interactionPatterns = INTERACTION_PATTERNS

  return `You are a design-forward UI architect. Your goal is to create interfaces that are not just functional, but visually distinctive and memorable — while staying within shadcn/ui and Tailwind CSS.

Parse the user's natural language request into structured modification requests.
${designThinking}
${coreRules}
${designQuality}
${visualDepth}
${contextualRules}
${interactionPatterns}
${expandedHint}
Current Design System:
- Name: ${config.name}
- App Type: ${config.settings.appType}
- Pages: ${config.pages.map(p => `${p.name} (${p.route})`).join(', ')}
- Components: ${config.components.length} components

EXISTING ROUTES IN THIS PROJECT:
${config.pages.map(p => p.route).join(', ') || '(no pages yet)'}

LINKING RULES (CRITICAL — prevents broken links):
- All internal links (Sign In, Get Started, Learn More, etc.) MUST use href pointing to one of the existing routes listed above.
- NEVER create links to routes that don't exist (e.g. /login, /terms, /privacy unless they are listed above).
- If a link target doesn't exist yet, use href="#" with a comment: {/* TODO: create /login page */}
- Map link patterns to nearest existing route: "Sign In" / "Login" → nearest auth route from list above. "Get Started" → / or nearest onboarding.
- Navigation components should link to ALL existing page routes.

${componentRegistry}
${sharedSection}

Available shadcn/ui components (can be auto-installed): ${availableShadcn.join(', ')}

COMPONENT USAGE RULES:
1. ALWAYS check component registry first - reuse existing components
2. If a component doesn't exist but is in the shadcn/ui list above: add it with type "add-component", source: "shadcn", id matching the shadcn name (e.g. "input", "textarea") - the system will auto-install it
3. DO NOT reference components that don't exist and aren't in the shadcn/ui list
4. For forms, prefer: input, textarea, checkbox, select
5. For UI elements, prefer: badge, dialog

User Request: "${message}"

Parse this into one or more ModificationRequest objects. Each request should be:
1. Specific and actionable
2. Reference existing components when possible (check registry above)
3. Use correct modification types
4. For add-page: include ALL required fields below
5. For add-component with source "shadcn": include id, name, category, source: "shadcn", shadcnComponent, baseClassName (or omit for default), variants: [], sizes: [], usedInPages: [], createdAt, updatedAt

Available modification types:
- "update-token": Change design token (e.g., colors.light.primary)
- "add-component": Add new component (check registry first for reuse!)
- "modify-component": Update existing component
- "modify-layout-block": Edit a shared layout component by ID or name (target: "CID-001" or "Header"). changes: { "instruction": "user instruction e.g. add a search button" }. Use when user says "in CID-001 add...", "update the header...", "change the footer...".
- "link-shared": Replace an inline block on a page with an existing shared component. target: page name or route. changes: { "sharedIdOrName": "CID-003" or "HeroSection", "blockHint": "hero section" (optional) }. Use when user says "replace the hero on About with CID-003", "use CID-003 on the About page".
- "promote-and-link": Extract a block from a source page as a new shared component, then use it on source and other pages. target: source page name (e.g. "Home"). changes: { "blockHint": "CTA section", "componentName": "CTASection", "targetPages": ["Pricing", "About"] }. Use when user says "make the CTA on Home shared and use on Pricing and About", "the hero on Landing is the standard, make it shared and use on About and Pricing".
- "add-page": Add new page — MUST include pageCode (full page.tsx) + metadata below
- "update-page": Modify existing page — MUST include changes.instruction (what to change). The system reads the current page file and applies changes via AI. Do NOT try to return pageCode for update-page — you don't have the current code. Just describe what to change in instruction.
- "update-navigation": Update navigation structure

ADD-PAGE: MODEL GENERATES FULL PAGE CODE + OPTIONAL TEMPLATE DATA.

For add-page you MUST return:
1. Metadata (id, name, route, title, description, layout, createdAt, updatedAt)
2. pageCode: the COMPLETE content of app/{route}/page.tsx as a single string (escape newlines as \\n and quotes as \\" in JSON).
3. pageType (OPTIONAL): if the page matches one of these types, include it: dashboard, pricing, listing, contact, settings, landing. The system has built-in templates for these types.
4. structuredContent (OPTIONAL): if pageType is set, include a structured content object matching the type's schema (see below). pageCode ALWAYS takes priority over structuredContent — only provide structuredContent as a fallback if pageCode is empty.

CRITICAL — CONTENT AND STYLE FIDELITY (highest priority, overrides design constraints):
- Use EXACTLY the content, headlines, descriptions, and language specified by the user. NEVER substitute with generic or template text.
- If the user specifies English — ALL text must be in English. If Russian — all in Russian. Match the user's language.
- If the user specifies a headline (e.g. "Headline: Design once.") — use that EXACT headline. Do not invent alternatives.
- If the user provides specific copy, CTAs, or descriptions — use them verbatim.
- If the user specifies EXACT CSS classes, colors, or styles (e.g. "bg-zinc-950", "text-emerald-400", "text-red-400") — use those EXACT classes. User-specified styles OVERRIDE design constraints about semantic tokens.
- If the user says "keep all content exactly as is" — do NOT change any text, headings, descriptions, button labels, or structure. ONLY modify the styles/classes they explicitly mention.
- structuredContent fields (title, description, hero.headline, feature titles, etc.) MUST reflect the user's actual request, not generic filler.
- "No placeholders" means no Lorem ipsum AND no generic marketing copy that ignores the user's instructions.

STRUCTURED CONTENT SCHEMAS (include when pageType is set):
- dashboard: { title, description, stats: [{ label, value, change?, icon? }], recentActivity?: [{ title, description, time }] }
- pricing: { title, description, tiers: [{ name, price, period?, description, features: string[], cta, highlighted? }], faq?: [{ question, answer }] }
- listing: { title, description, items: [{ title, description, badge?, icon? }], filters?: string[], columns?: 2|3|4 }
- contact: { title, description, fields: [{ name, label, type: text|email|tel|textarea, placeholder, required? }], submitLabel, contactInfo?: [{ label, value, icon? }] }
- settings: { title, description, sections: [{ title, description, fields: [{ name, label, type: text|email|toggle|password, value? }] }] }
- landing: { title, description, hero: { headline, subheadline, primaryCta, secondaryCta? }, features: [{ title, description, icon? }], finalCta?: { headline, description, buttonText } }

Format:
{
  "id": "unique-kebab-id",
  "name": "Display Name",
  "route": "/path",
  "layout": "centered",
  "title": "Page Title for SEO",
  "description": "Short description for SEO",
  "createdAt": "${now}",
  "updatedAt": "${now}",
  "requiresAuth": false,
  "noIndex": false,
  "pageType": "dashboard",
  "structuredContent": { "title": "Dashboard", "description": "...", "stats": [...] },
  "pageCode": "import { Metadata } from 'next'\\n..."
}

LAYOUT CONTRACT (CRITICAL — prevents duplicate navigation and footer):
- The app has a root layout (app/layout.tsx) that renders a shared Header and Footer.
- Pages are rendered INSIDE this layout, between the Header and Footer.
- NEVER include <header>, <nav>, or <footer> elements in pageCode. Also do NOT add a footer-like section at the bottom (no "© 2024", no site links, no logo + nav links at the bottom).
- If the page needs sub-navigation (tabs, breadcrumbs, sidebar nav), use elements like <div role="tablist"> or <aside> — NOT <header>, <nav>, or <footer>.
- Do NOT add any navigation bars, logo headers, site-wide menus, or site footers to pages. The layout provides all of these.

PAGE WRAPPER (CRITICAL — the layout provides width/padding automatically):
- App pages are rendered inside a route group layout that ALREADY provides: <main className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-6">
- Your outermost element MUST be exactly: <div className="space-y-6">
- FORBIDDEN on the outermost element: <main>, max-w-*, mx-auto, px-*, py-*, p-*, flex-1, min-h-*
- FORBIDDEN anywhere: <div className="max-w-4xl mx-auto">, <div className="max-w-2xl mx-auto">, or any inner centering wrapper
- The first child inside <div className="space-y-6"> should be the page header (h1 + description)
- ALL app pages must follow this exact same structure so content aligns consistently across pages
- Landing/marketing pages are an exception: they render outside the app layout and should use full-width <section> elements with inner "mx-auto max-w-6xl" for content.

PAGE CONTENT (CRITICAL — prevents empty or duplicate pages):
- Every page MUST have substantial content. NEVER generate a page with only metadata and an empty <main> element.
- NEVER create an inline preview/demo of another page (e.g., embedding a "dashboard view" inside the landing page with a toggle). Each page should be its own route.
- NEVER create a single-page app (SPA) that renders multiple views via useState. Each view must be a separate Next.js page with its own route.
- The home page (route "/") should be a simple redirect using next/navigation redirect('/dashboard') — OR a standalone landing page. NEVER a multi-view SPA.
- Landing pages should link to app pages via <Link href="/dashboard">, NOT via useState toggles that render inline content.

pageCode rules (shadcn/ui blocks quality):
- Full Next.js App Router page. Imports from '@/components/ui/...' for registry components.
- Follow ALL design constraints above: text-sm base, semantic colors only, restricted spacing, weight-based hierarchy.
- Stat card pattern: Card > CardHeader(flex flex-row items-center justify-between space-y-0 pb-2) > CardTitle(text-sm font-medium) + Icon(size-4 text-muted-foreground) ; CardContent > metric(text-2xl font-bold) + change(text-xs text-muted-foreground).
- Login/form pattern: outer div(flex min-h-svh flex-col items-center justify-center p-6 md:p-10) > inner div(w-full max-w-sm) > Card with form.
- Dashboard pattern: div(space-y-6) > page header(h1 text-2xl font-bold tracking-tight + p text-sm text-muted-foreground) > stats grid(grid gap-4 md:grid-cols-2 lg:grid-cols-4) > content cards. No <main> wrapper — the layout provides it.
- No placeholders: real contextual copy only. Use the EXACT text, language, and content from the user's request.
- IMAGES: For avatar/profile photos, use https://i.pravatar.cc/150?u=<unique-seed> (e.g. ?u=sarah.johnson). For hero/product images, use https://picsum.photos/800/400?random=N. Use standard <img> tags with className, NOT Next.js <Image>. Always provide alt text.
- BUTTON + LINK: The Button component supports asChild prop. To make a button that navigates, use <Button asChild><Link href="/path"><Plus className="size-4" /> Label</Link></Button>. Never nest <button> inside <Link> or vice versa without asChild.
- Hover/focus on every interactive element (hover:bg-muted, focus-visible:ring-2 focus-visible:ring-ring).
- LANGUAGE: Match the language of the user's request. English request → English page. Russian request → Russian page. Never switch languages.
- NEVER use native HTML <select> or <option>. Always use Select, SelectTrigger, SelectValue, SelectContent, SelectItem from @/components/ui/select.

NEXT.JS APP ROUTER RULE (CRITICAL — invalid code fails to compile):
- "use client" and export const metadata are FORBIDDEN in the same file.
- If the page has useState, useEffect, onClick, onChange, or any client hooks/handlers: put "use client" on the first line and do NOT include export const metadata (no Metadata import, no metadata export).
- If the page has no hooks/handlers (static content only): you may use export const metadata; do NOT add "use client".

COMPONENT EXPORTS (use ONLY these names when importing from @/components/ui/...):
- @/components/ui/card → Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter (use these for card layout)
- @/components/ui/button → Button only
- @/components/ui/input → Input only
- @/components/ui/textarea → Textarea only
- @/components/ui/badge → Badge only
- @/components/ui/label → Label only
- @/components/ui/select → Select only. It is a wrapper over native <select>; use onChange (NOT onValueChange). onValueChange is only for shadcn Radix Select, which we do not have.
- @/components/ui/checkbox → Checkbox only
- Other @/components/ui/{id} → usually one export matching the component name (PascalCase). Do not assume subcomponents like CardContent unless listed above.

In pageCode: import from @/components/ui/{kebab-name} using ONLY the exports listed above. Use <main>, <section>, <form>, <Input>, <Textarea>, <Button>, <Card>, <CardHeader>, <CardTitle>, <CardContent>, <CardFooter> etc. in JSX. No sections array — you write the full TSX.

CRITICAL: id and route must be kebab-case. route must start with /. layout must be one of: centered | sidebar-left | sidebar-right | full-width | grid.

UPDATE-PAGE: For modifying an existing page, return:
{
  "type": "update-page",
  "target": "page-id-or-name-or-route",
  "changes": {
    "instruction": "Detailed description of what to change. Include specific CSS classes, colors, structural changes. The system will read the current page code and apply this instruction via AI."
  }
}
The instruction should be as specific as possible. Include exact class names (e.g. "change bg-muted to bg-zinc-950"), exact text changes (e.g. "change headline to 'New Title'"), and structural changes (e.g. "add a new section after the hero with...").
Do NOT include pageCode in update-page — you don't have the current page code. The system handles reading and modifying the file.

CRITICAL COMPONENT RULES:

RULE 0 - NEVER change component identity with modify-component:
- modify-component is ONLY for updating existing component properties (variants, sizes, styles)
- NEVER use modify-component to change: id, name, source, shadcnComponent, category
- To add a different component (e.g. Textarea when Input exists), use add-component

WRONG (DO NOT DO THIS):
{
  "type": "modify-component",
  "target": "input",
  "changes": {
    "id": "input",
    "name": "Textarea",
    "shadcnComponent": "textarea"
  }
}
(Same ID but changed name/type - WRONG.)

CORRECT:
{
  "type": "add-component",
  "target": "new",
  "changes": {
    "id": "textarea",
    "name": "Textarea",
    "shadcnComponent": "textarea"
  }
}
(New component with correct id - CORRECT.)

RULE 1 - To ADD a new component that doesn't exist: use type "add-component". Set source "shadcn" for auto-install. NEVER use modify-component for new components.
RULE 2 - To UPDATE an existing component: use type "modify-component" ONLY if the component already exists in the registry. Use the correct component ID from the registry. Only change properties like variants, sizes, baseClassName - NEVER change id, name, shadcnComponent.
RULE 3 - Component ID must match the shadcn component name exactly: "input", "textarea", "button", "checkbox", etc. NEVER create a Textarea with id "input". id and shadcnComponent must match.

WRONG (DO NOT DO THIS):
{ "type": "modify-component", "target": "input", "changes": { "name": "Textarea" } }  // Wrong - creating new component via modify
{ "type": "add-component", "changes": { "id": "input", "name": "Textarea", "shadcnComponent": "textarea" } }  // Wrong - id must match name

CORRECT:
{ "type": "add-component", "target": "new", "changes": { "id": "textarea", "name": "Textarea", "source": "shadcn", "shadcnComponent": "textarea", ... } }  // Correct - new component, id matches

FEW-SHOT EXAMPLE — correct stat card in pageCode (follow this pattern exactly):
\`\`\`
<Card>
  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
    <CardTitle className="text-sm font-medium">Total Revenue</CardTitle>
    <DollarSign className="size-4 text-muted-foreground" />
  </CardHeader>
  <CardContent>
    <div className="text-2xl font-bold">$45,231.89</div>
    <p className="text-xs text-muted-foreground">+20.1% from last month</p>
  </CardContent>
</Card>
\`\`\`
Key: CardTitle is text-sm font-medium (NOT text-lg). Metric is text-2xl font-bold. Subtext is text-xs text-muted-foreground. Icon is size-4 text-muted-foreground.

SURGICAL MODIFICATION RULES (CRITICAL for incremental edits):
- When modifying an existing page, return the COMPLETE page code
- Change ONLY the specific section, component, or element the user requested
- Do NOT modify imports unless the change requires new imports
- Do NOT change state variables, event handlers, or data in unrelated sections
- Do NOT restyle sections the user did not mention
- Preserve all existing className values on unchanged elements
- If the user asks to change a "section" or "block", identify it by heading, content, or position

Component Promotion Rules:
- When the user asks to "make X a shared component" or "reuse X across pages":
  - Use request type "promote-and-link"
  - Extract the JSX block into a separate component file
  - Replace inline code with the component import on all specified pages

Global Component Change Rules:
- When the user asks to change "all cards" or "every button" or similar:
  - If the pattern is already a shared component, modify the shared component file
  - If the pattern is inline across pages, first promote it to a shared component, then modify it

OPTIONAL UX RECOMMENDATIONS:
If you see opportunities to improve UX (accessibility, layout, consistency, responsiveness, visual hierarchy), add a short markdown block in "uxRecommendations". Otherwise omit it.

Return valid JSON only, no markdown code fence. Use this shape:
{ "requests": [ ... array of ModificationRequest ... ], "uxRecommendations": "optional markdown or omit key" }
Legacy: returning only a JSON array of requests is still accepted.`
}

/**
 * Check component registry for reuse opportunities
 */
async function checkComponentReuse(
  requests: ModificationRequest[],
  componentManager: ComponentManager,
): Promise<ModificationRequest[]> {
  const enhanced: ModificationRequest[] = []

  for (const request of requests) {
    if (request.type === 'add-component') {
      const componentSpec = extractComponentSpec(request.changes)
      const requestedId = (request.changes as Record<string, unknown>)?.id as string | undefined
      const existing = componentManager.findBestMatch(componentSpec)

      if (existing && requestedId && existing.id === requestedId) {
        enhanced.push({
          type: 'modify-component',
          target: existing.id,
          changes: request.changes,
          reason: `${request.reason || ''} (Reusing existing component: ${existing.name})`,
        })
      } else {
        enhanced.push(request)
      }
    } else if (request.type === 'add-page') {
      // Check if page components exist in registry
      const sections = request.changes.sections || []
      const missingComponents: string[] = []

      for (const section of sections) {
        if (section.componentId) {
          const component = componentManager.read(section.componentId)
          if (!component) {
            missingComponents.push(section.componentId)
          }
        }
      }

      if (missingComponents.length > 0) {
        // Try to find similar components
        for (const missingId of missingComponents) {
          const spec: ComponentSpec = {
            name: missingId,
          }
          const match = componentManager.findBestMatch(spec)
          if (match) {
            // Update section to use existing component
            const section = sections.find((s: any) => s.componentId === missingId)
            if (section) {
              section.componentId = match.id
            }
          }
        }
      }

      enhanced.push(request)
    } else {
      enhanced.push(request)
    }
  }

  return enhanced
}

/**
 * Extract ComponentSpec from modification changes
 */
function extractComponentSpec(changes: Record<string, any>): ComponentSpec {
  return {
    name: changes.name,
    category: changes.category,
    source: changes.source,
    shadcnComponent: changes.shadcnComponent,
    baseClassName: changes.baseClassName,
    requiredVariants: changes.variants?.map((v: any) => v.name),
    requiredSizes: changes.sizes?.map((s: any) => s.name),
  }
}
