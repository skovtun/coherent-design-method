import { z } from 'zod'

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
