/**
 * Shared Components Registry (Epic 2).
 * CRUD for coherent.components.json manifest.
 * See docs/epic-2-shared-components.md.
 */

import { readFile, writeFile } from 'fs/promises'
import { join } from 'path'
import { existsSync } from 'fs'
import type {
  SharedComponentsManifest,
  SharedComponentEntry,
  SharedComponentType,
} from '../types/shared-components-manifest.js'
import { SharedComponentsManifestSchema, formatCid, parseCid } from '../types/shared-components-manifest.js'

export const MANIFEST_FILENAME = 'coherent.components.json'

/**
 * Get manifest file path for a project root.
 */
export function getManifestPath(projectRoot: string): string {
  return join(projectRoot, MANIFEST_FILENAME)
}

/**
 * Load manifest from project root. Creates default manifest if file does not exist.
 */
export async function loadManifest(projectRoot: string): Promise<SharedComponentsManifest> {
  const path = getManifestPath(projectRoot)
  if (!existsSync(path)) {
    return { shared: [], nextId: 1 }
  }
  const raw = await readFile(path, 'utf-8')
  const data = JSON.parse(raw) as unknown
  return SharedComponentsManifestSchema.parse(data)
}

/**
 * Save manifest to project root.
 */
export async function saveManifest(projectRoot: string, manifest: SharedComponentsManifest): Promise<void> {
  const path = getManifestPath(projectRoot)
  await writeFile(path, JSON.stringify(manifest, null, 2), 'utf-8')
}

/**
 * Find shared component by ID (e.g. CID-001) or by name (case-insensitive).
 */
export function findSharedComponent(
  manifest: SharedComponentsManifest,
  idOrName: string,
): SharedComponentEntry | undefined {
  const byId = manifest.shared.find(e => e.id === idOrName)
  if (byId) return byId
  const upper = idOrName.toUpperCase()
  if (upper.startsWith('CID-')) return byId
  return manifest.shared.find(e => e.name.toLowerCase() === idOrName.toLowerCase())
}

/**
 * Allocate next CID and increment nextId. Caller must save manifest after adding the entry.
 */
export function allocateNextCid(manifest: SharedComponentsManifest): string {
  const cid = formatCid(manifest.nextId)
  return cid
}

export interface CreateSharedComponentInput {
  name: string
  type: SharedComponentType
  file: string
  usedIn?: string[]
  description?: string
  propsInterface?: string
  usageExample?: string
  dependencies?: string[]
  source?: 'extracted' | 'generated' | 'manual'
}

/**
 * Add a new shared component: allocate CID, set createdAt, append to shared, increment nextId.
 * Name deduplication should be done by the caller (e.g. SharedComponentGenerator) via resolveUniqueName()
 * BEFORE building the file path, so name and file stay consistent.
 * Returns the created entry. Caller is responsible for saving the manifest and writing the file.
 */
export function createEntry(
  manifest: SharedComponentsManifest,
  input: CreateSharedComponentInput,
): { entry: SharedComponentEntry; nextManifest: SharedComponentsManifest } {
  const id = formatCid(manifest.nextId)
  const now = new Date().toISOString()
  const entry: SharedComponentEntry = {
    id,
    name: input.name,
    type: input.type,
    file: input.file,
    usedIn: input.usedIn ?? [],
    description: input.description,
    propsInterface: input.propsInterface,
    usageExample: input.usageExample,
    dependencies: input.dependencies ?? [],
    source: input.source,
    createdAt: now,
  }
  const nextManifest: SharedComponentsManifest = {
    shared: [...manifest.shared, entry],
    nextId: manifest.nextId + 1,
  }
  return { entry, nextManifest }
}

/**
 * Update usedIn for an entry (e.g. add or remove a file path).
 */
export function updateUsedIn(
  manifest: SharedComponentsManifest,
  id: string,
  usedIn: string[],
): SharedComponentsManifest {
  const index = manifest.shared.findIndex(e => e.id === id)
  if (index === -1) return manifest
  const next = [...manifest.shared]
  next[index] = { ...next[index], usedIn }
  return { ...manifest, shared: next }
}

/**
 * Update an entry by ID. Partial update; only provided fields are changed.
 */
export function updateEntry(
  manifest: SharedComponentsManifest,
  id: string,
  partial: Partial<Omit<SharedComponentEntry, 'id'>>,
): SharedComponentsManifest {
  const index = manifest.shared.findIndex(e => e.id === id)
  if (index === -1) return manifest
  const next = [...manifest.shared]
  next[index] = { ...next[index], ...partial }
  return { ...manifest, shared: next }
}

/**
 * Remove an entry by ID. Returns updated manifest.
 */
export function removeEntry(manifest: SharedComponentsManifest, id: string): SharedComponentsManifest {
  return {
    ...manifest,
    shared: manifest.shared.filter(e => e.id !== id),
  }
}

export { formatCid, parseCid, type SharedComponentsManifest, type SharedComponentEntry, type SharedComponentType }
