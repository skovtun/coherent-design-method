import { z } from 'zod'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { resolve } from 'path'
import chalk from 'chalk'
import { generateSharedComponent } from '@getcoherent/core'
import type { AIProviderInterface } from '../../utils/ai-provider.js'
import { inferPageTypeFromRoute, getDesignQualityForType, CORE_CONSTRAINTS } from '../../agents/design-constraints.js'
import { findMissingPackagesInCode, installPackages } from '../../utils/self-heal.js'
import { autoFixCode } from '../../utils/quality-validator.js'

const LAYOUT_SYNONYMS: Record<string, string> = {
  horizontal: 'header',
  top: 'header',
  nav: 'header',
  navbar: 'header',
  topbar: 'header',
  'top-bar': 'header',
  vertical: 'sidebar',
  left: 'sidebar',
  side: 'sidebar',
  drawer: 'sidebar',
  full: 'both',
  combined: 'both',
  empty: 'none',
  minimal: 'none',
  clean: 'none',
}

const PAGE_TYPE_SYNONYMS: Record<string, string> = {
  landing: 'marketing',
  public: 'marketing',
  home: 'marketing',
  website: 'marketing',
  static: 'marketing',
  application: 'app',
  dashboard: 'app',
  admin: 'app',
  panel: 'app',
  console: 'app',
  authentication: 'auth',
  login: 'auth',
  'log-in': 'auth',
  register: 'auth',
  signin: 'auth',
  'sign-in': 'auth',
  signup: 'auth',
  'sign-up': 'auth',
}

const COMPONENT_TYPE_SYNONYMS: Record<string, string> = {
  component: 'widget',
  ui: 'widget',
  element: 'widget',
  block: 'widget',
  'page-section': 'section',
  hero: 'section',
  feature: 'section',
  area: 'section',
  nav: 'navigation',
  navbar: 'navigation',
  sidebar: 'navigation',
  menu: 'navigation',
  'data display': 'data-display',
  table: 'data-display',
  chart: 'data-display',
  card: 'data-display',
  stats: 'data-display',
  input: 'form',
  filter: 'form',
  search: 'form',
  error: 'feedback',
  alert: 'feedback',
  toast: 'feedback',
  notification: 'feedback',
  modal: 'feedback',
  dialog: 'feedback',
}

function normalizeEnum(synonyms: Record<string, string>) {
  return (v: string) => {
    const trimmed = v.trim().toLowerCase()
    return synonyms[trimmed] ?? trimmed
  }
}

export const RouteGroupSchema = z.object({
  id: z.string(),
  layout: z
    .string()
    .transform(normalizeEnum(LAYOUT_SYNONYMS))
    .pipe(z.enum(['header', 'sidebar', 'both', 'none'])),
  pages: z.array(z.string()),
})

export const PlannedComponentSchema = z.object({
  name: z.string(),
  description: z.string().default(''),
  props: z.string().default('{}'),
  usedBy: z.array(z.string()).default([]),
  type: z
    .string()
    .transform(normalizeEnum(COMPONENT_TYPE_SYNONYMS))
    .pipe(z.enum(['layout', 'navigation', 'data-display', 'form', 'feedback', 'section', 'widget']))
    .catch('section'),
  shadcnDeps: z.array(z.string()).default([]),
})

export const PageNoteSchema = z.object({
  type: z
    .string()
    .transform(normalizeEnum(PAGE_TYPE_SYNONYMS))
    .pipe(z.enum(['marketing', 'app', 'auth'])),
  sections: z.array(z.string()).default([]),
  links: z.record(z.string()).optional(),
})

export const AtmosphereSchema = z.object({
  moodPhrase: z.string().default(''),
  background: z
    .enum(['dark-zinc', 'warm-stone', 'minimal-paper', 'gradient-bold', 'soft-warm', 'code-bg'])
    .default('minimal-paper'),
  heroLayout: z
    .enum(['split-text-image', 'centered-bold', 'left-editorial', 'code-preview', 'photo-warm'])
    .default('split-text-image'),
  spacing: z.enum(['tight', 'medium', 'wide']).default('medium'),
  accents: z.enum(['monochrome', 'multi-gradient', 'warm-soft', 'code-mono', 'editorial']).default('monochrome'),
  fontStyle: z.enum(['sans', 'serif-headings', 'mono-labels']).default('sans'),
  primaryHint: z.string().default(''),
})

export type Atmosphere = z.infer<typeof AtmosphereSchema>

export const ArchitecturePlanSchema = z.object({
  appName: z.string().optional(),
  atmosphere: AtmosphereSchema.optional(),
  groups: z.array(RouteGroupSchema),
  sharedComponents: z.array(PlannedComponentSchema).max(12).default([]),
  pageNotes: z.record(z.string(), PageNoteSchema).default({}),
})

export type ArchitecturePlan = z.infer<typeof ArchitecturePlanSchema>
export type RouteGroup = z.infer<typeof RouteGroupSchema>
export type PlannedComponent = z.infer<typeof PlannedComponentSchema>

export function routeToKey(route: string): string {
  return route.replace(/^\//, '') || 'home'
}

export function getPageGroup(route: string, plan: ArchitecturePlan): RouteGroup | undefined {
  return plan.groups.find(g => g.pages.includes(route))
}

export function getPageType(route: string, plan: ArchitecturePlan): 'marketing' | 'app' | 'auth' {
  return (plan.pageNotes[routeToKey(route)]?.type as 'marketing' | 'app' | 'auth') ?? inferPageTypeFromRoute(route)
}

const PLAN_SYSTEM_PROMPT = `You are a UI architect. Given a list of pages for a web application, create a Component Architecture Plan as JSON.

Your task:
1. Extract the visual atmosphere from the user's request (mood phrases, brand references, style adjectives)
2. Group pages by navigation context (e.g., public marketing pages, authenticated app pages, auth flows)
3. Identify reusable UI components that appear on 2+ pages
4. Describe each page's sections and cross-page links

Rules:
- Each group gets a layout type: "header" (horizontal nav), "sidebar" (vertical nav), "both", or "none" (no nav)
- Shared components must be genuinely reusable (appear on 2+ pages). Do NOT create a shared component for patterns used on only one page.
- Page types: "marketing" (landing, features, pricing — spacious, section-based), "app" (dashboard, settings — compact, data-dense), "auth" (login, register — centered card form)
- Component props should be a TypeScript-like interface string
- shadcnDeps lists the shadcn/ui atoms the component will need (e.g., "card", "badge", "avatar")
- Component "type" rules — choose carefully, this controls auto-injection into root layout:
  - "layout" — RESERVED for site chrome only: Header, Footer, Topbar, Navbar. Do NOT use for DataTable, ProgressBar, etc.
  - "navigation" — sidebar/menu/breadcrumb components
  - "data-display" — tables, lists, grids of records (DataTable, Timeline, ActivityFeed)
  - "form" — inputs, validation, login forms (FilterBar, SearchBar, LoginForm)
  - "feedback" — alerts, toasts, skeletons
  - "section" — full landing-page sections (PricingTable, FeatureGrid, Testimonials)
  - "widget" — small reusable cards (StatCard, ProjectCard, MemberCard)
- Cross-page links: map link labels to target routes (e.g., {"Sign in": "/login"})
- Maximum 12 shared components

ATMOSPHERE EXTRACTION (CRITICAL — this drives every page's visual treatment):
The user's message contains mood/brand hints. Capture them into an atmosphere object that page generators MUST follow.

- moodPhrase: VERBATIM the mood phrase from the user (e.g., "premium and focused, Notion meets Linear"). If none, write what the app implies.
- background: pick ONE — "dark-zinc" (bg-zinc-950, premium/focused/dark/Notion/Linear/dev) | "warm-stone" (bg-stone-50, premium-light/editorial/warm) | "minimal-paper" (bg-background, default) | "gradient-bold" (gradient hero, playful/bold/consumer) | "soft-warm" (warm-tinted muted, friendly/approachable) | "code-bg" (bg-background mono, technical/developer)
- heroLayout: "split-text-image" | "centered-bold" | "left-editorial" | "code-preview" | "photo-warm"
- spacing: "tight" (gap-2/p-3, dense/premium/Notion) | "medium" (gap-4/p-4, default) | "wide" (gap-8/p-8, editorial/playful)
- accents: "monochrome" (1 brand color, premium/dark) | "multi-gradient" (playful) | "warm-soft" (rounded, friendly) | "code-mono" (monospace labels, developer) | "editorial" (one accent, serif feel)
- fontStyle: "sans" | "serif-headings" (editorial) | "mono-labels" (developer/premium-tech)
- primaryHint: ONE color word that should drive the primary token (e.g., "zinc", "indigo", "amber", "emerald") — choose based on mood, not user-said-blue defaults

Mood mapping examples:
- "premium and focused, Notion meets Linear" → background:"dark-zinc", heroLayout:"split-text-image", spacing:"tight", accents:"monochrome", fontStyle:"mono-labels", primaryHint:"zinc"
- "bold and playful, like Stripe" → background:"gradient-bold", heroLayout:"centered-bold", spacing:"wide", accents:"multi-gradient", fontStyle:"sans", primaryHint:"indigo"
- "minimal and editorial, like Vercel docs" → background:"minimal-paper", heroLayout:"left-editorial", spacing:"wide", accents:"editorial", fontStyle:"serif-headings", primaryHint:"zinc"
- "warm and approachable, like Airbnb" → background:"soft-warm", heroLayout:"photo-warm", spacing:"medium", accents:"warm-soft", fontStyle:"sans", primaryHint:"rose"
- "developer-focused, like GitHub" → background:"code-bg", heroLayout:"code-preview", spacing:"tight", accents:"code-mono", fontStyle:"mono-labels", primaryHint:"emerald"

Respond with EXACTLY this JSON structure (use these exact field names):

{
  "appName": "MyApp",
  "atmosphere": {
    "moodPhrase": "premium and focused, Notion meets Linear",
    "background": "dark-zinc",
    "heroLayout": "split-text-image",
    "spacing": "tight",
    "accents": "monochrome",
    "fontStyle": "mono-labels",
    "primaryHint": "zinc"
  },
  "groups": [
    { "id": "public", "layout": "header", "pages": ["/", "/pricing"] },
    { "id": "app", "layout": "sidebar", "pages": ["/dashboard", "/settings"] },
    { "id": "auth", "layout": "none", "pages": ["/login", "/register"] }
  ],
  "sharedComponents": [
    {
      "name": "StatCard",
      "description": "Displays a single metric with label and value",
      "props": "{ label: string; value: string; icon?: React.ReactNode }",
      "usedBy": ["/dashboard", "/projects"],
      "type": "widget",
      "shadcnDeps": ["card"]
    }
  ],
  "pageNotes": {
    "home": { "type": "marketing", "sections": ["Hero", "Features", "Pricing"], "links": { "Sign in": "/login" } },
    "dashboard": { "type": "app", "sections": ["Stats row", "Recent tasks", "Activity feed"] },
    "login": { "type": "auth", "sections": ["Login form"] }
  }
}`

export interface PlanResult {
  plan: ArchitecturePlan | null
  warnings: string[]
}

/**
 * Deterministic mood-phrase → atmosphere extractor.
 *
 * Run as a fallback when the AI plan-generator omits the atmosphere field
 * or fills it with the safe defaults. Returns a partial atmosphere — only
 * the fields that confidently match — so the AI's selections (when present)
 * always win unless they look like the generic defaults.
 *
 * The order of brand checks matters: more specific phrases (e.g. "Notion meets Linear")
 * must be tested before single-brand mentions to avoid mis-classification.
 */
export function extractAtmosphereFromMessage(message: string): Partial<Atmosphere> {
  const m = message.toLowerCase()
  const out: Partial<Atmosphere> = {}

  const moodPhraseMatch =
    m.match(/(?:should\s+)?(?:feel|look|be)\s+([a-z\s,]+?)(?:[.—]|\s+think|\s+like|$)/i) ||
    m.match(
      /(?:premium|bold|minimal|warm|playful|editorial|developer|technical|focused|elegant|dramatic)[\s,]+(?:and\s+)?[a-z]+/i,
    )
  if (moodPhraseMatch) out.moodPhrase = moodPhraseMatch[0].trim()

  if (
    /\b(?:notion meets linear|linear meets notion|notion-?like|linear-?like|premium and focused|dark and focused|focused and (?:premium|dark))\b/i.test(
      m,
    )
  ) {
    out.background = 'dark-zinc'
    out.heroLayout = 'split-text-image'
    out.spacing = 'tight'
    out.accents = 'monochrome'
    out.fontStyle = 'mono-labels'
    out.primaryHint = 'zinc'
    return out
  }
  if (/\bdark\b.*\b(?:gradient|background)|\bdark\s+(?:and\s+)?(?:premium|focused|moody)/i.test(m)) {
    out.background = 'dark-zinc'
    out.accents = 'monochrome'
    out.primaryHint = 'zinc'
  }
  if (/\b(?:premium|sophisticated|elegant|refined)\b/i.test(m) && !out.background) {
    out.background = 'dark-zinc'
    out.spacing = 'tight'
    out.accents = 'monochrome'
    out.primaryHint = 'zinc'
  }
  if (/\b(?:bold|playful|vibrant|energetic|fun|consumer)\b/i.test(m)) {
    out.background = 'gradient-bold'
    out.heroLayout = 'centered-bold'
    out.spacing = 'wide'
    out.accents = 'multi-gradient'
    out.primaryHint = out.primaryHint || 'indigo'
  }
  if (/\b(?:editorial|magazine|long-?form|content-?heavy)\b/i.test(m)) {
    out.background = 'minimal-paper'
    out.heroLayout = 'left-editorial'
    out.spacing = 'wide'
    out.accents = 'editorial'
    out.fontStyle = 'serif-headings'
  }
  if (/\b(?:warm|approachable|friendly|cozy|community)\b/i.test(m)) {
    out.background = 'soft-warm'
    out.heroLayout = 'photo-warm'
    out.accents = 'warm-soft'
    out.primaryHint = out.primaryHint || 'rose'
  }
  if (/\b(?:developer|engineer|technical|cli|terminal|code|api)\b/i.test(m)) {
    out.background = 'code-bg'
    out.heroLayout = 'code-preview'
    out.spacing = 'tight'
    out.accents = 'code-mono'
    out.fontStyle = 'mono-labels'
    out.primaryHint = out.primaryHint || 'emerald'
  }
  if (/\b(?:healthcare|medical|patient|clinic|hospital|health)\b/i.test(m) && !out.background) {
    out.background = 'soft-warm'
    out.heroLayout = 'photo-warm'
    out.accents = 'warm-soft'
    out.primaryHint = out.primaryHint || 'blue'
  }
  if (/\b(?:shop|store|product|ecommerce|e-commerce|retail|marketplace)\b/i.test(m) && !out.background) {
    out.background = 'minimal-paper'
    out.spacing = 'medium'
    out.accents = 'warm-soft'
    out.primaryHint = out.primaryHint || 'amber'
  }

  return out
}

/**
 * Render an atmosphere object into a directive block that anchors page generation.
 *
 * The output is intentionally imperative ("USE bg-zinc-950") rather than advisory
 * ("consider a dark background") because the AI under-applies suggestion-style guidance.
 * Only emit a block when the atmosphere is non-default — emitting boilerplate for every
 * generation just adds noise.
 */
export function renderAtmosphereDirective(atmosphere: Atmosphere | undefined): string {
  if (!atmosphere) return ''
  const isDefault =
    atmosphere.background === 'minimal-paper' &&
    atmosphere.heroLayout === 'split-text-image' &&
    atmosphere.spacing === 'medium' &&
    atmosphere.accents === 'monochrome'
  if (isDefault && !atmosphere.moodPhrase) return ''

  const bgRule: Record<Atmosphere['background'], string> = {
    'dark-zinc':
      'Dark sections use bg-zinc-950 / bg-zinc-900. Light sections use bg-stone-50. NO pure white. NO gradient backgrounds.',
    'warm-stone':
      'Use bg-stone-50 as default surface. Cards bg-white. Section dividers via subtle warm tint, not gradient.',
    'minimal-paper': 'Use bg-background everywhere. NO decorative gradients. Whitespace is the design.',
    'gradient-bold': 'Hero section: gradient bg (from-primary via-accent to-secondary). Other sections plain.',
    'soft-warm': 'Use bg-muted with warm tint. Cards rounded-2xl with soft shadow-sm.',
    'code-bg': 'bg-background everywhere. Use code blocks (bg-zinc-900 text-emerald-400 font-mono) as visual element.',
  }
  const heroRule: Record<Atmosphere['heroLayout'], string> = {
    'split-text-image':
      'Hero is 2-column: text left (max-w-prose), single image/illustration right. NO centered headline.',
    'centered-bold': 'Hero is centered. Headline text-7xl tracking-tighter. Big primary CTA below.',
    'left-editorial': 'Hero is left-aligned, max-w-3xl. Long-form headline (60-100 chars) reads like an essay.',
    'code-preview': 'Hero shows a code snippet (terminal block) as primary visual. Headline above, CTA below.',
    'photo-warm': 'Hero has a warm photo of people/space. Headline overlaid bottom-left.',
  }
  const spacingRule: Record<Atmosphere['spacing'], string> = {
    tight: 'Use gap-2/gap-3 between elements, p-3/p-4 inside cards, py-12 between sections. Dense data presentation.',
    medium: 'Use gap-4/gap-6 between elements, p-4/p-6 inside cards, py-16 between sections.',
    wide: 'Use gap-6/gap-8 between elements, p-6/p-8 inside cards, py-24 between sections. Generous breathing room.',
  }
  const accentRule: Record<Atmosphere['accents'], string> = {
    monochrome:
      'Use ONE brand color (primary). All other elements: neutral grays. NO secondary accent. NO multi-color gradients.',
    'multi-gradient': 'Use primary + secondary + accent. Gradients allowed in hero and CTA only.',
    'warm-soft': 'Rounded buttons (rounded-full), soft shadows (shadow-sm), warm primary tint.',
    'code-mono': 'Code-style accents: bg-emerald-500/10 text-emerald-600, monospace badges, bracket-wrapped labels.',
    editorial: 'One accent color used sparingly (highlights, drop caps). Otherwise pure typography.',
  }
  const fontRule: Record<Atmosphere['fontStyle'], string> = {
    sans: '',
    'serif-headings': 'Page heading uses font-serif (Georgia, Charter). Body stays sans.',
    'mono-labels':
      'Section labels and small UI text use font-mono (e.g. text-xs uppercase tracking-wider font-mono text-muted-foreground for "OVERVIEW", "FEATURES").',
  }

  const lines = [
    '',
    'ATMOSPHERE DIRECTIVE (apply BEFORE any other styling — overrides default SaaS look):',
    `- Mood: ${atmosphere.moodPhrase || '(unspecified)'}`,
    `- Background: ${bgRule[atmosphere.background]}`,
    `- Hero: ${heroRule[atmosphere.heroLayout]}`,
    `- Spacing: ${spacingRule[atmosphere.spacing]}`,
    `- Accents: ${accentRule[atmosphere.accents]}`,
  ]
  if (fontRule[atmosphere.fontStyle]) lines.push(`- Typography: ${fontRule[atmosphere.fontStyle]}`)
  if (atmosphere.primaryHint) {
    lines.push(
      `- Primary: Use ${atmosphere.primaryHint} tones for --primary token. Buttons, links, active states, and focus rings should use this color family — not the default blue.`,
    )
  }
  lines.push(
    '',
    'REJECT these defaults (they violate the atmosphere): centered-headline + 3-card-feature-grid + bg-white + multi-color icon containers + cliché copy ("Seamless", "Elevate"). If you find yourself writing that, STOP and apply the directive above instead.',
    '',
  )
  return lines.join('\n')
}

export async function generateArchitecturePlan(
  pages: Array<{ name: string; id: string; route: string }>,
  userMessage: string,
  aiProvider: AIProviderInterface,
  layoutHint: string | null,
): Promise<PlanResult> {
  const userPrompt = `Pages: ${pages.map(p => `${p.name} (${p.route})`).join(', ')}

User's request: "${userMessage}"

Navigation type requested: ${layoutHint || 'auto-detect'}`

  const warnings: string[] = []

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const raw = await aiProvider.generateJSON(PLAN_SYSTEM_PROMPT, userPrompt)
      const parsed = ArchitecturePlanSchema.safeParse(raw)
      if (parsed.success) return { plan: parsed.data, warnings }
      warnings.push(
        `Validation (attempt ${attempt + 1}): ${parsed.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ')}`,
      )
    } catch (err) {
      warnings.push(`Error (attempt ${attempt + 1}): ${err instanceof Error ? err.message : String(err)}`)
      if (attempt === 1) return { plan: null, warnings }
    }
  }
  return { plan: null, warnings }
}

export async function updateArchitecturePlan(
  existingPlan: ArchitecturePlan,
  newPages: Array<{ name: string; id: string; route: string }>,
  userMessage: string,
  aiProvider: AIProviderInterface,
): Promise<ArchitecturePlan> {
  const userPrompt = `Existing plan:
${JSON.stringify(existingPlan, null, 2)}

New pages to integrate: ${newPages.map(p => `${p.name} (${p.route})`).join(', ')}

User's request: "${userMessage}"

Update the existing plan to include these new pages. Keep all existing groups, components, and pageNotes. Add the new pages to appropriate groups and add pageNotes for them.`

  try {
    const raw = await aiProvider.generateJSON(PLAN_SYSTEM_PROMPT, userPrompt)
    const parsed = ArchitecturePlanSchema.safeParse(raw)
    if (parsed.success) return parsed.data
    const issues = parsed.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ')
    console.warn(chalk.dim(`  Plan update validation failed: ${issues}`))
  } catch (err) {
    console.warn(chalk.dim(`  Plan update error: ${err instanceof Error ? err.message : String(err)}`))
  }

  // Deterministic merge: append new pages to the largest group
  const merged = structuredClone(existingPlan)
  const largestGroup = merged.groups.reduce(
    (best, g) => (g.pages.length > (best?.pages.length ?? 0) ? g : best),
    merged.groups[0],
  )

  for (const page of newPages) {
    const alreadyPlaced = merged.groups.some(g => g.pages.includes(page.route))
    if (!alreadyPlaced && largestGroup) {
      largestGroup.pages.push(page.route)
    }
    const key = routeToKey(page.route)
    if (!merged.pageNotes[key]) {
      merged.pageNotes[key] = { type: 'app', sections: [] }
    }
  }

  return merged
}

let cachedPlan: { path: string; plan: ArchitecturePlan } | null = null

export function savePlan(projectRoot: string, plan: ArchitecturePlan): void {
  cachedPlan = null
  const dir = resolve(projectRoot, '.coherent')
  mkdirSync(dir, { recursive: true })
  writeFileSync(resolve(dir, 'plan.json'), JSON.stringify(plan, null, 2))
}

export function loadPlan(projectRoot: string): ArchitecturePlan | null {
  const planPath = resolve(projectRoot, '.coherent', 'plan.json')

  if (cachedPlan?.path === planPath) return cachedPlan.plan

  if (!existsSync(planPath)) return null

  try {
    const raw = JSON.parse(readFileSync(planPath, 'utf-8'))
    const parsed = ArchitecturePlanSchema.safeParse(raw)
    if (!parsed.success) return null
    cachedPlan = { path: planPath, plan: parsed.data }
    return parsed.data
  } catch {
    return null
  }
}

export interface GeneratedComponent {
  name: string
  code: string
  file: string
}

function toKebabCase(name: string): string {
  return name.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase()
}

function extractPropsInterface(code: string, componentName: string): string | undefined {
  const interfaceRe = new RegExp(`interface\\s+${componentName}Props\\s*\\{([^}]+)\\}`, 's')
  const match = code.match(interfaceRe)
  if (match) {
    return match[1]
      .split('\n')
      .map(l => l.trim())
      .filter(l => l && !l.startsWith('//'))
      .join('; ')
  }
  const typeRe = new RegExp(`type\\s+${componentName}Props\\s*=\\s*\\{([^}]+)\\}`, 's')
  const typeMatch = code.match(typeRe)
  if (typeMatch) {
    return typeMatch[1]
      .split('\n')
      .map(l => l.trim())
      .filter(l => l && !l.startsWith('//'))
      .join('; ')
  }
  return undefined
}

function extractUsageExample(code: string, componentName: string): string | undefined {
  const funcMatch = code.match(new RegExp(`export function ${componentName}\\s*\\(\\{([^}]+)\\}`, 's'))
  if (!funcMatch) return undefined
  const props = funcMatch[1]
    .split(',')
    .map(p => p.split(':')[0].trim())
    .filter(Boolean)
  const example = props
    .map(p => {
      if (p.startsWith('...')) return `${p.slice(3)}={{}}`
      return `${p}={...}`
    })
    .join(' ')
  return `<${componentName} ${example} />`
}

export async function generateSharedComponentsFromPlan(
  plan: ArchitecturePlan,
  styleContext: string,
  projectRoot: string,
  aiProvider: AIProviderInterface,
): Promise<GeneratedComponent[]> {
  if (plan.sharedComponents.length === 0) return []

  const componentSpecs = plan.sharedComponents
    .map(
      c =>
        `- ${c.name}: ${c.description}. Props: ${c.props}. Type: ${c.type}. shadcn deps: ${c.shadcnDeps.join(', ') || 'none'}`,
    )
    .join('\n')

  const designRules = `${CORE_CONSTRAINTS}\n${getDesignQualityForType('app')}`

  const prompt = `Generate React components as separate files. For EACH component below, return an add-page request with name and pageCode fields.

Components to generate:
${componentSpecs}

Style context: ${styleContext || 'default'}

${designRules}

Requirements:
- Each component MUST use a NAMED export: \`export function ComponentName\` (NOT export default)
- Use shadcn/ui imports from @/components/ui/*
- Use Tailwind CSS classes matching the style context
- TypeScript with proper props interface
- Each component is a standalone file
- Icon props MUST use \`icon: React.ElementType\` (NOT React.ReactNode) and render as \`<Icon className="size-4" />\` where \`const Icon = icon\`. Lucide icons are forwardRef components, not elements.

Return JSON with { requests: [{ type: "add-page", changes: { name: "ComponentName", pageCode: "..." } }, ...] }`

  const results: GeneratedComponent[] = []

  try {
    const raw = await aiProvider.parseModification(prompt)
    const requests = Array.isArray(raw) ? raw : (raw?.requests ?? [])

    for (const comp of plan.sharedComponents) {
      const match = (requests as Array<{ type: string; changes: Record<string, unknown> }>).find(
        r => r.type === 'add-page' && (r.changes as Record<string, string>)?.name === comp.name,
      )
      const code = (match?.changes as Record<string, string>)?.pageCode
      if (code && (code.includes('export function') || code.includes('export default'))) {
        const fixedCode = code.replace(/export default function (\w+)/g, 'export function $1')
        const file = `components/shared/${toKebabCase(comp.name)}.tsx`
        results.push({ name: comp.name, code: fixedCode, file })
      }
    }
  } catch {
    for (const comp of plan.sharedComponents) {
      try {
        const singlePrompt = `Generate a React component: ${comp.name} — ${comp.description}. Props: ${comp.props}. shadcn deps: ${comp.shadcnDeps.join(', ') || 'none'}. Style: ${styleContext || 'default'}. Return { requests: [{ type: "add-page", changes: { name: "${comp.name}", pageCode: "..." } }] }`
        const raw = await aiProvider.parseModification(singlePrompt)
        const requests = Array.isArray(raw) ? raw : (raw?.requests ?? [])
        const match = (requests as Array<{ type: string; changes: Record<string, string> }>).find(
          r => r.type === 'add-page' && r.changes?.name === comp.name,
        )
        const code = match?.changes?.pageCode
        if (code && (code.includes('export function') || code.includes('export default'))) {
          const fixedCode = code.replace(/export default function (\w+)/g, 'export function $1')
          const file = `components/shared/${toKebabCase(comp.name)}.tsx`
          results.push({ name: comp.name, code: fixedCode, file })
        }
      } catch {
        // skip this component
      }
    }
  }

  for (const comp of results) {
    const planned = plan.sharedComponents.find(c => c.name === comp.name)
    const { code: fixedCode } = await autoFixCode(comp.code)
    const missing = findMissingPackagesInCode(fixedCode, projectRoot)
    if (missing.length > 0) await installPackages(projectRoot, missing)
    const propsInterface = extractPropsInterface(fixedCode, comp.name)
    const usageExample = extractUsageExample(fixedCode, comp.name)
    await generateSharedComponent(projectRoot, {
      name: comp.name,
      type: planned?.type ?? 'section',
      code: fixedCode,
      description: planned?.description,
      usedIn: planned?.usedBy ?? [],
      source: 'generated',
      overwrite: true,
      propsInterface,
      usageExample,
    })
  }

  return results
}
