import { z } from 'zod'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { resolve } from 'path'
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
  return plan.groups.find((g) => g.pages.includes(route))
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

Pages: ${pages.map((p) => `${p.name} (${p.route})`).join(', ')}

User's request: "${userMessage}"

Navigation type requested: ${layoutHint || 'auto-detect'}`

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const raw = await aiProvider.parseModification(userPrompt)
      const data = Array.isArray(raw) ? raw : raw
      const parsed = ArchitecturePlanSchema.safeParse(data)
      if (parsed.success) return parsed.data
    } catch {
      if (attempt === 1) return null
    }
  }
  return null
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
