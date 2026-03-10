/**
 * Shared Component Generator (Epic 2, Story 2.2).
 * Creates a component file in components/shared/ and registers it in coherent.components.json.
 */

import { writeFile, mkdir } from 'fs/promises'
import { join, dirname } from 'path'
import type { SharedComponentsManifest, SharedComponentType } from '../types/shared-components-manifest.js'
import {
  loadManifest,
  saveManifest,
  createEntry,
  findSharedComponent as findInManifest,
} from '../managers/SharedComponentsRegistry.js'

/** Convert component name to file name (kebab-case). "Main Header" -> "main-header", "PricingCard" -> "pricing-card" */
export function toSharedFileName(name: string): string {
  return name
    .replace(/([a-z])([A-Z])/g, '$1-$2')
    .replace(/\s+/g, '-')
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '')
}

/** Resolve unique display name: if "Header" exists, return "Header2" (or "Header3" etc). */
export function resolveUniqueName(manifest: SharedComponentsManifest, name: string): string {
  const base = name.trim()
  const existingNames = new Set(manifest.shared.map((e) => e.name))
  if (!existingNames.has(base)) return base
  let n = 2
  while (existingNames.has(`${base}${n}`)) n++
  return `${base}${n}`
}

const LAYOUT_PLACEHOLDER = (componentName: string) => `'use client'

export function ${componentName}() {
  return (
    <div className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container flex h-14 items-center">
        <span className="font-semibold">${componentName}</span>
      </div>
    </div>
  )
}
`

const FOOTER_PLACEHOLDER = (componentName: string) => `'use client'

export function ${componentName}() {
  return (
    <footer className="border-t bg-muted/40">
      <div className="container flex h-14 items-center justify-center text-sm text-muted-foreground">
        © {new Date().getFullYear()} — ${componentName}
      </div>
    </footer>
  )
}
`

const SECTION_PLACEHOLDER = (componentName: string) => `'use client'

export function ${componentName}() {
  return (
    <section className="container py-12">
      <h2 className="text-2xl font-semibold">${componentName}</h2>
      <p className="text-muted-foreground">Content placeholder.</p>
    </section>
  )
}
`

function getDefaultTemplate(componentName: string, type: SharedComponentType, name: string): string {
  const safeName = componentName.replace(/[^a-zA-Z0-9]/g, '') || 'Block'
  const lower = name.toLowerCase()
  if (lower.includes('footer')) return FOOTER_PLACEHOLDER(safeName)
  if (type === 'layout' || lower.includes('header') || lower.includes('nav'))
    return LAYOUT_PLACEHOLDER(safeName)
  return SECTION_PLACEHOLDER(safeName)
}

export interface GenerateSharedComponentInput {
  name: string
  type: SharedComponentType
  /** Optional: full TSX code. If not provided, a placeholder template is used. */
  code?: string
  description?: string
  /** Files that will use this component (e.g. ["app/layout.tsx"]). */
  usedIn?: string[]
}

export interface GenerateSharedComponentResult {
  id: string
  name: string
  file: string
}

/**
 * Create a shared component: write file to components/shared/[name].tsx and register in manifest.
 * Returns the created entry id, name, and file path.
 */
export async function generateSharedComponent(
  projectRoot: string,
  input: GenerateSharedComponentInput
): Promise<GenerateSharedComponentResult> {
  const manifest = await loadManifest(projectRoot)
  const uniqueName = resolveUniqueName(manifest, input.name)
  const fileName = toSharedFileName(uniqueName)
  const filePath = `components/shared/${fileName}.tsx`
  const fullPath = join(projectRoot, filePath)

  const componentName = uniqueName.replace(/[^a-zA-Z0-9]/g, '') || 'Block'
  const code = input.code ?? getDefaultTemplate(componentName, input.type, uniqueName)

  await mkdir(dirname(fullPath), { recursive: true })
  await writeFile(fullPath, code, 'utf-8')

  const { entry, nextManifest } = createEntry(manifest, {
    name: uniqueName,
    type: input.type,
    file: filePath,
    usedIn: input.usedIn ?? [],
    description: input.description,
  })
  await saveManifest(projectRoot, nextManifest)

  return { id: entry.id, name: entry.name, file: entry.file }
}

/**
 * Find shared component by ID or name (for modifier/chat).
 */
export async function findSharedComponentByIdOrName(
  projectRoot: string,
  idOrName: string
): Promise<{ id: string; name: string; file: string } | null> {
  const manifest = await loadManifest(projectRoot)
  const entry = findInManifest(manifest, idOrName)
  if (!entry) return null
  return { id: entry.id, name: entry.name, file: entry.file }
}
