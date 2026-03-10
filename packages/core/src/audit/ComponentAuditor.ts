/**
 * Story 2.11 Part C: Consistency audit for shared components.
 * - Verify usedIn vs actual imports
 * - Find inline code similar to existing shared (signature match)
 * - Find unused shared components
 */

import { readFile, readdir } from 'fs/promises'
import { join } from 'path'
import { existsSync } from 'fs'
import type { SharedComponentsManifest, SharedComponentEntry } from '../types/shared-components-manifest.js'
import { loadManifest } from '../managers/SharedComponentsRegistry.js'

const SIGNATURE_TOKEN_MIN_LEN = 3
const SIMILARITY_THRESHOLD = 0.7
const SIGNATURE_SNIPPET_LEN = 800

export interface AuditEntryResult {
  id: string
  name: string
  type: string
  status: 'ok' | 'unused' | 'used_but_mismatch' | 'has_inline_duplicates'
  usedIn: string[]
  message: string
  suggestions?: string[]
}

export interface AuditResult {
  shared: AuditEntryResult[]
  summary: {
    total: number
    consistent: number
    withInlineDuplicates: number
    unused: number
    usedButMismatch: number
  }
}

/**
 * Extract a simple signature from code (tag names + className values) for similarity comparison.
 */
function extractSignature(code: string, maxChars: number = SIGNATURE_SNIPPET_LEN): Set<string> {
  const snippet = code.slice(0, maxChars)
  const tokens = new Set<string>()
  // Tag names (JSX/HTML): <Section, <div, <Card, etc.
  const tagMatches = snippet.matchAll(/<([A-Za-z][A-Za-z0-9]*)/g)
  for (const m of tagMatches) {
    if (m[1].length >= SIGNATURE_TOKEN_MIN_LEN) tokens.add(m[1].toLowerCase())
  }
  // className values: split by spaces and take significant parts
  const classMatches = snippet.matchAll(/className=["'`]([^"'`]+)["'`]/g)
  for (const m of classMatches) {
    const parts = m[1].split(/\s+/).filter((p) => p.length >= SIGNATURE_TOKEN_MIN_LEN)
    parts.forEach((p) => tokens.add(p))
  }
  return tokens
}

/**
 * Get all app page and layout file paths (app/.../page.tsx, app/layout.tsx).
 */
async function getAppPageFiles(projectRoot: string): Promise<string[]> {
  const appDir = join(projectRoot, 'app')
  if (!existsSync(appDir)) return []
  const files: string[] = []
  async function walk(dir: string): Promise<void> {
    const entries = await readdir(dir, { withFileTypes: true })
    for (const e of entries) {
      const full = join(dir, e.name)
      const rel = full.slice(projectRoot.length + 1)
      if (e.isFile()) {
        if (e.name === 'page.tsx' || e.name === 'layout.tsx') files.push(rel)
      } else if (e.isDirectory() && !e.name.startsWith('_') && e.name !== 'api') {
        await walk(full)
      }
    }
  }
  await walk(appDir)
  return files
}

/**
 * Check if file content imports the shared component (by kebab path).
 */
function fileImportsShared(fileContent: string, sharedFile: string): boolean {
  const kebab = sharedFile.replace(/^components\/shared\//, '').replace(/\.tsx$/, '')
  return fileContent.includes(`@/components/shared/${kebab}`)
}

/**
 * Verify usedIn: for each shared entry, check that listed files actually import it.
 */
function auditSharedUsage(
  manifest: SharedComponentsManifest,
  fileContents: Map<string, string>
): Map<string, { actualImports: string[]; usedInMismatch: boolean }> {
  const results = new Map<string, { actualImports: string[]; usedInMismatch: boolean }>()
  for (const e of manifest.shared) {
    const actualImports: string[] = []
    for (const [path, content] of fileContents) {
      if (fileImportsShared(content, e.file)) actualImports.push(path)
    }
    const usedInSet = new Set(e.usedIn)
    const actualSet = new Set(actualImports)
    const usedInMismatch =
      usedInSet.size !== actualSet.size || [...usedInSet].some((p) => !actualSet.has(p))
    results.set(e.id, { actualImports, usedInMismatch })
  }
  return results
}

/**
 * Find shared components with usedIn.length === 0.
 */
function findUnusedShared(manifest: SharedComponentsManifest): Set<string> {
  const unused = new Set<string>()
  for (const e of manifest.shared) {
    if (!e.usedIn || e.usedIn.length === 0) unused.add(e.id)
  }
  return unused
}

/**
 * For each shared (section/widget), find pages that don't import it but have high signature overlap.
 */
function findInlineDuplicates(
  manifest: SharedComponentsManifest,
  projectRoot: string,
  sharedSignatures: Map<string, Set<string>>,
  fileContents: Map<string, string>
): Map<string, Array<{ file: string; matchPercent: number }>> {
  const duplicates = new Map<string, Array<{ file: string; matchPercent: number }>>()
  const sectionOrWidget = manifest.shared.filter((e) => e.type === 'section' || e.type === 'widget')
  for (const e of sectionOrWidget) {
    const sig = sharedSignatures.get(e.id)
    if (!sig || sig.size < 5) continue
    const kebab = e.file.replace(/^components\/shared\//, '').replace(/\.tsx$/, '')
    const list: Array<{ file: string; matchPercent: number }> = []
    for (const [filePath, content] of fileContents) {
      if (filePath.includes('design-system') || filePath.includes('api/')) continue
      if (content.includes(`@/components/shared/${kebab}`)) continue
      const pageSig = extractSignature(content, 2000)
      if (pageSig.size === 0) continue
      let overlap = 0
      for (const t of sig) {
        if (pageSig.has(t)) overlap++
      }
      const ratio = overlap / sig.size
      if (ratio >= SIMILARITY_THRESHOLD) {
        list.push({ file: filePath, matchPercent: Math.round(ratio * 100) })
      }
    }
    if (list.length > 0) duplicates.set(e.id, list)
  }
  return duplicates
}

/**
 * Run full consistency audit.
 */
export async function runAudit(projectRoot: string): Promise<AuditResult> {
  const manifest = await loadManifest(projectRoot)
  const pageFiles = await getAppPageFiles(projectRoot)
  const fileContents = new Map<string, string>()
  for (const f of pageFiles) {
    try {
      const content = await readFile(join(projectRoot, f), 'utf-8')
      fileContents.set(f, content)
    } catch {
      // skip unreadable
    }
  }

  const usageResults = auditSharedUsage(manifest, fileContents)
  const unusedIds = findUnusedShared(manifest)

  const sharedSignatures = new Map<string, Set<string>>()
  for (const e of manifest.shared) {
    try {
      const fullPath = join(projectRoot, e.file)
      const content = await readFile(fullPath, 'utf-8')
      sharedSignatures.set(e.id, extractSignature(content))
    } catch {
      // skip
    }
  }
  const inlineDupes = findInlineDuplicates(manifest, projectRoot, sharedSignatures, fileContents)

  const shared: AuditEntryResult[] = []
  let consistent = 0
  let withInlineDuplicates = 0
  let unused = 0
  let usedButMismatch = 0

  for (const e of manifest.shared) {
    const usage = usageResults.get(e.id)!
    const dupes = inlineDupes.get(e.id)
    const isUnused = unusedIds.has(e.id)

    let status: AuditEntryResult['status'] = 'ok'
    let message: string
    const suggestions: string[] = []

    if (isUnused) {
      status = 'unused'
      unused++
      message = 'registered but not used on any page'
    } else if (usage.usedInMismatch) {
      status = 'used_but_mismatch'
      usedButMismatch++
      message = `usedIn in manifest may be outdated; actual imports in: ${usage.actualImports.join(', ') || 'none'}`
    } else if (dupes && dupes.length > 0) {
      status = 'has_inline_duplicates'
      withInlineDuplicates++
      const route = (path: string) => {
        const m = path.match(/app\/(.*)\/page\.tsx/)
        return m ? `/${m[1]}` : path
      }
      message = `used on ${usage.actualImports.length} page(s), but:`
      dupes.forEach((d) => {
        suggestions.push(
          `→ ${d.file} has similar inline code (${d.matchPercent}% match). Consider: coherent chat "link ... on ${route(d.file)} to ${e.id}"`
        )
      })
    } else {
      consistent++
      const viaLayout = e.type === 'layout' && usage.actualImports.some((p) => p === 'app/layout.tsx')
      message = viaLayout
        ? 'used on all pages via layout.tsx'
        : `used on ${usage.actualImports.length} page(s)`
    }

    shared.push({
      id: e.id,
      name: e.name,
      type: e.type,
      status,
      usedIn: usage.actualImports,
      message,
      suggestions: suggestions.length > 0 ? suggestions : undefined,
    })
  }

  return {
    shared,
    summary: {
      total: manifest.shared.length,
      consistent,
      withInlineDuplicates,
      unused,
      usedButMismatch,
    },
  }
}
