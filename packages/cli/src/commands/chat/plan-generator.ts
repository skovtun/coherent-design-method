import { z } from 'zod'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { dirname, resolve } from 'path'
import { mkdir, writeFile } from 'fs/promises'
import type { AIProviderInterface } from '../../utils/ai-provider.js'

export const RouteGroupSchema = z.object({
  id: z.string(),
  layout: z.enum(['header', 'sidebar', 'both', 'none']),
  pages: z.array(z.string()),
})

export const PlannedComponentSchema = z.object({
  name: z.string(),
  description: z.string(),
  props: z.string(),
  usedBy: z.array(z.string()),
  type: z.enum(['section', 'widget']),
  shadcnDeps: z.array(z.string()).default([]),
})

export const PageNoteSchema = z.object({
  type: z.enum(['marketing', 'app', 'auth']),
  sections: z.array(z.string()),
  links: z.record(z.string()).optional(),
})

export const ArchitecturePlanSchema = z.object({
  appName: z.string().optional(),
  groups: z.array(RouteGroupSchema),
  sharedComponents: z.array(PlannedComponentSchema).max(8),
  pageNotes: z.record(z.string(), PageNoteSchema),
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
  return (plan.pageNotes[routeToKey(route)]?.type as 'marketing' | 'app' | 'auth') ?? 'app'
}

const PLAN_SYSTEM_PROMPT = `You are a UI architect. Given a list of pages for a web application, create a Component Architecture Plan.

Your task:
1. Group pages by navigation context (e.g., public marketing pages, authenticated app pages, auth flows)
2. Identify reusable UI components that appear on 2+ pages
3. Describe each page's sections and cross-page links

Rules:
- Each group gets a layout type: "header" (horizontal nav), "sidebar" (vertical nav), "both", or "none" (no nav)
- Shared components must be genuinely reusable (appear on 2+ pages). Do NOT create a shared component for patterns used on only one page.
- Page types: "marketing" (landing, features, pricing — spacious, section-based), "app" (dashboard, settings — compact, data-dense), "auth" (login, register — centered card form)
- Component props should be a TypeScript-like interface string
- shadcnDeps lists the shadcn/ui atoms the component will need (e.g., "card", "badge", "avatar")
- Cross-page links: map link labels to target routes (e.g., {"Sign in": "/login"})
- Maximum 8 shared components

Respond with valid JSON matching the schema.`

export async function generateArchitecturePlan(
  pages: Array<{ name: string; id: string; route: string }>,
  userMessage: string,
  aiProvider: AIProviderInterface,
  layoutHint: string | null,
): Promise<ArchitecturePlan | null> {
  const userPrompt = `${PLAN_SYSTEM_PROMPT}

Pages: ${pages.map(p => `${p.name} (${p.route})`).join(', ')}

User's request: "${userMessage}"

Navigation type requested: ${layoutHint || 'auto-detect'}`

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const raw = await aiProvider.parseModification(userPrompt)
      const parsed = ArchitecturePlanSchema.safeParse(raw)
      if (parsed.success) return parsed.data
    } catch {
      if (attempt === 1) return null
    }
  }
  return null
}

export async function updateArchitecturePlan(
  existingPlan: ArchitecturePlan,
  newPages: Array<{ name: string; id: string; route: string }>,
  userMessage: string,
  aiProvider: AIProviderInterface,
): Promise<ArchitecturePlan> {
  const prompt = `${PLAN_SYSTEM_PROMPT}

Existing plan:
${JSON.stringify(existingPlan, null, 2)}

New pages to integrate: ${newPages.map(p => `${p.name} (${p.route})`).join(', ')}

User's request: "${userMessage}"

Update the existing plan to include these new pages. Keep all existing groups, components, and pageNotes. Add the new pages to appropriate groups and add pageNotes for them.`

  try {
    const raw = await aiProvider.parseModification(prompt)
    const parsed = ArchitecturePlanSchema.safeParse(raw)
    if (parsed.success) return parsed.data
  } catch {
    // fall through to deterministic merge
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

  const prompt = `Generate React components as separate files. For EACH component below, return an add-page request with name and pageCode fields.

Components to generate:
${componentSpecs}

Style context: ${styleContext || 'default'}

Requirements:
- Each component MUST have \`export default function ComponentName\`
- Use shadcn/ui imports from @/components/ui/*
- Use Tailwind CSS classes matching the style context
- TypeScript with proper props interface
- Each component is a standalone file

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
      if (code && code.includes('export default')) {
        const file = `components/shared/${toKebabCase(comp.name)}.tsx`
        results.push({ name: comp.name, code, file })
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
        if (code && code.includes('export default')) {
          const file = `components/shared/${toKebabCase(comp.name)}.tsx`
          results.push({ name: comp.name, code, file })
        }
      } catch {
        // skip this component
      }
    }
  }

  for (const comp of results) {
    const fullPath = resolve(projectRoot, comp.file)
    await mkdir(dirname(fullPath), { recursive: true })
    await writeFile(fullPath, comp.code, 'utf-8')
  }

  return results
}
