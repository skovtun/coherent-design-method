/**
 * Types for Epic 2: Shared Components manifest (coherent.components.json).
 * See docs/epic-2-shared-components.md.
 */

import { z } from 'zod'

/** Shared component type classification */
export const SharedComponentTypeSchema = z.enum([
  'layout',
  'navigation',
  'data-display',
  'form',
  'feedback',
  'section',
  'widget',
])
export type SharedComponentType = z.infer<typeof SharedComponentTypeSchema>

/** Single entry in the shared components registry */
export const SharedComponentEntrySchema = z.object({
  /** Unique ID: CID-001, CID-002, ... */
  id: z.string().regex(/^CID-\d{3,}$/, 'Must be CID-XXX with zero-padded number'),
  /** Display name (e.g. "Header", "PricingCard") */
  name: z.string(),
  /** layout | section | widget */
  type: SharedComponentTypeSchema,
  /** Path to component file relative to project root */
  file: z.string(),
  /** List of file paths that import this component (e.g. ["app/layout.tsx", "app/dashboard/page.tsx"]) */
  usedIn: z.array(z.string()).default([]),
  createdAt: z.string().datetime().optional(),
  /** Human-readable description */
  description: z.string().optional(),
  /** TypeScript props interface body, e.g. "{ icon: React.ReactNode; title: string }" */
  propsInterface: z.string().optional(),
  /** Example JSX usage, e.g. '<StatsCard icon={Users} value="1,234" />' */
  usageExample: z.string().optional(),
  /** Package and component dependencies, e.g. ['lucide-react', 'components/ui/card'] */
  dependencies: z.array(z.string()).default([]),
  /** How this component was created */
  source: z.enum(['extracted', 'generated', 'manual']).optional(),
})
export type SharedComponentEntry = z.infer<typeof SharedComponentEntrySchema>

/** Root schema for coherent.components.json */
export const SharedComponentsManifestSchema = z.object({
  shared: z.array(SharedComponentEntrySchema).default([]),
  /** Next numeric id for new entries (CID-XXX → nextId = 4 for CID-004) */
  nextId: z.number().int().positive().default(1),
})
export type SharedComponentsManifest = z.infer<typeof SharedComponentsManifestSchema>

/** Generate next CID string from nextId (e.g. 4 → "CID-004") */
export function formatCid(nextId: number): string {
  return `CID-${String(nextId).padStart(3, '0')}`
}

/** Parse numeric part from CID (e.g. "CID-001" → 1) */
export function parseCid(id: string): number | null {
  const m = id.match(/^CID-(\d+)$/)
  return m ? parseInt(m[1], 10) : null
}
