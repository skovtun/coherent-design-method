/**
 * Component Integrity Utilities
 *
 * Shared helpers for reconciling the component manifest with the actual filesystem.
 * Used by: sync, check, fix, file-watcher, chat (pre-generation).
 */

import { existsSync, readFileSync, readdirSync } from 'fs'
import { join, relative } from 'path'
import type { SharedComponentsManifest } from '@getcoherent/core'

// ── Types ────────────────────────────────────────────────────────

export interface ReconcileResult {
  removed: Array<{ id: string; name: string; reason: string }>
  updated: Array<{ id: string; field: string; from: string; to: string }>
  added: Array<{ id: string; name: string; file: string; type: string }>
  warnings: Array<{ id: string; name: string; type: string; message: string; suggestion: string }>
}

export interface UnregisteredComponent {
  name: string
  file: string
  type: 'layout' | 'navigation' | 'data-display' | 'form' | 'feedback' | 'section' | 'widget'
  usedIn: string[]
}

export interface InlineDuplicate {
  componentName: string
  sharedId: string
  sharedFile: string
  pageFile: string
}

// ── Core Helpers ─────────────────────────────────────────────────

export function extractExportedComponentNames(code: string): string[] {
  const names: string[] = []
  let m
  const funcRe = /export\s+(?:default\s+)?function\s+([A-Z]\w+)/g
  while ((m = funcRe.exec(code)) !== null) names.push(m[1])
  const constRe = /export\s+const\s+([A-Z]\w+)\s*[=:]/g
  while ((m = constRe.exec(code)) !== null) names.push(m[1])
  return [...new Set(names)]
}

export function inferComponentType(
  name: string,
  code: string,
): 'layout' | 'navigation' | 'data-display' | 'form' | 'feedback' | 'section' | 'widget' {
  const lower = name.toLowerCase()
  if (/header|footer|layout|appbar|topbar/.test(lower)) return 'layout'
  if (/sidebar|nav|menu|breadcrumb|tabs/.test(lower)) return 'navigation'
  if (/table|chart|stats|metric|list|grid|card/.test(lower)) return 'data-display'
  if (/form|input|filter|search|select|picker/.test(lower)) return 'form'
  if (/alert|toast|modal|dialog|notification|error|snackbar/.test(lower)) return 'feedback'
  if (/section|hero|pricing|testimonial|features|cta|banner/.test(lower)) return 'section'
  if (/<header[\s>]/.test(code) || /<footer[\s>]/.test(code)) return 'layout'
  if (/<nav[\s>]/.test(code)) return 'navigation'
  if (/<form[\s>]/.test(code)) return 'form'
  if (/<section[\s>]/.test(code)) return 'section'
  return 'widget'
}

export function arraysEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false
  const sa = [...a].sort()
  const sb = [...b].sort()
  return sa.every((v, i) => v === sb[i])
}

/**
 * Find all page.tsx files that import a given component name.
 * Returns relative paths like "app/page.tsx", "app/about/page.tsx".
 */
export function findPagesImporting(projectRoot: string, componentName: string, componentFile: string): string[] {
  const results: string[] = []
  const appDir = join(projectRoot, 'app')
  if (!existsSync(appDir)) return results

  const pageFiles = collectFiles(appDir, name => name === 'page.tsx' || name === 'page.jsx')

  const componentImportPath = componentFile.replace(/\.tsx$/, '').replace(/\.jsx$/, '')

  for (const absPath of pageFiles) {
    if (absPath.includes('design-system')) continue
    try {
      const code = readFileSync(absPath, 'utf-8')
      const hasNamedImport = new RegExp(`import\\s+\\{[^}]*\\b${componentName}\\b[^}]*\\}\\s+from\\s+['"]`).test(code)
      const hasDefaultImport = new RegExp(`import\\s+${componentName}\\s+from\\s+['"]`).test(code)
      const hasPathImport = code.includes(`@/${componentImportPath}`)

      if (hasNamedImport || hasDefaultImport || hasPathImport) {
        results.push(relative(projectRoot, absPath))
      }
    } catch {
      /* skip unreadable */
    }
  }

  return results
}

/**
 * Check if a component is imported in app/layout.tsx.
 */
export function isUsedInLayout(projectRoot: string, componentName: string): boolean {
  const layoutPath = join(projectRoot, 'app', 'layout.tsx')
  if (!existsSync(layoutPath)) return false
  try {
    const code = readFileSync(layoutPath, 'utf-8')
    return code.includes(componentName)
  } catch {
    return false
  }
}

/**
 * Find component files in components/ (excluding ui/) that are NOT in the manifest.
 */
export function findUnregisteredComponents(
  projectRoot: string,
  manifest: SharedComponentsManifest,
): UnregisteredComponent[] {
  const results: UnregisteredComponent[] = []
  const componentsDir = join(projectRoot, 'components')
  if (!existsSync(componentsDir)) return results

  const registeredFiles = new Set(manifest.shared.map(s => s.file))
  const registeredNames = new Set(manifest.shared.map(s => s.name))

  const files = collectFiles(
    componentsDir,
    name => (name.endsWith('.tsx') || name.endsWith('.jsx')) && !name.startsWith('.'),
    ['ui', 'node_modules'],
  )

  for (const absPath of files) {
    const relFile = relative(projectRoot, absPath)
    if (registeredFiles.has(relFile)) continue
    try {
      const code = readFileSync(absPath, 'utf-8')
      const exports = extractExportedComponentNames(code)
      for (const name of exports) {
        if (registeredNames.has(name)) continue
        const type = inferComponentType(name, code)
        const usedIn = findPagesImporting(projectRoot, name, relFile)
        results.push({ name, file: relFile, type, usedIn })
      }
    } catch {
      /* skip */
    }
  }

  return results
}

/**
 * Find pages that define a function/const with the same name as a shared component
 * without importing the shared version.
 */
export function findInlineDuplicates(projectRoot: string, manifest: SharedComponentsManifest): InlineDuplicate[] {
  const results: InlineDuplicate[] = []
  const appDir = join(projectRoot, 'app')
  if (!existsSync(appDir)) return results

  const pageFiles = collectFiles(appDir, name => name === 'page.tsx' || name === 'page.jsx')

  for (const absPath of pageFiles) {
    if (absPath.includes('design-system')) continue
    let code: string
    try {
      code = readFileSync(absPath, 'utf-8')
    } catch {
      continue
    }
    const relPath = relative(projectRoot, absPath)

    for (const shared of manifest.shared) {
      const importPath = shared.file.replace(/\.tsx$/, '').replace(/\.jsx$/, '')
      const isImported =
        code.includes(`@/${importPath}`) ||
        code.includes(`from './${importPath}'`) ||
        code.includes(`from "../${importPath}"`)
      if (isImported) continue

      const hasInline = new RegExp(`(?:function|const)\\s+${shared.name}\\s*[=(]`).test(code)

      if (hasInline) {
        results.push({
          componentName: shared.name,
          sharedId: shared.id,
          sharedFile: shared.file,
          pageFile: relPath,
        })
      }
    }
  }

  return results
}

/**
 * Find a component file by export name (for detecting moved files).
 */
export function findComponentFileByExportName(projectRoot: string, componentName: string): string | null {
  const componentsDir = join(projectRoot, 'components')
  if (!existsSync(componentsDir)) return null

  const files = collectFiles(
    componentsDir,
    name => (name.endsWith('.tsx') || name.endsWith('.jsx')) && !name.startsWith('.'),
    ['ui', 'node_modules'],
  )

  for (const absPath of files) {
    try {
      const code = readFileSync(absPath, 'utf-8')
      const exports = extractExportedComponentNames(code)
      if (exports.includes(componentName)) {
        return relative(projectRoot, absPath)
      }
    } catch {
      /* skip */
    }
  }

  return null
}

/**
 * Quick orphan cleanup: remove manifest entries whose files no longer exist.
 * Returns the cleaned manifest and list of removed entries.
 */
export function removeOrphanedEntries(
  projectRoot: string,
  manifest: SharedComponentsManifest,
): { manifest: SharedComponentsManifest; removed: Array<{ id: string; name: string }> } {
  const removed: Array<{ id: string; name: string }> = []
  const valid = manifest.shared.filter(entry => {
    const filePath = join(projectRoot, entry.file)
    if (existsSync(filePath)) return true
    removed.push({ id: entry.id, name: entry.name })
    return false
  })
  return {
    manifest: { ...manifest, shared: valid, nextId: manifest.nextId },
    removed,
  }
}

/**
 * Full reconciliation: checks every manifest entry against reality.
 * Used by `coherent sync`.
 */
export function reconcileComponents(
  projectRoot: string,
  manifest: SharedComponentsManifest,
): { manifest: SharedComponentsManifest; result: ReconcileResult } {
  const result: ReconcileResult = {
    removed: [],
    updated: [],
    added: [],
    warnings: [],
  }

  const m = { ...manifest, shared: [...manifest.shared], nextId: manifest.nextId }

  // ── Pass 1: Validate existing entries ──

  m.shared = m.shared.filter(entry => {
    const filePath = join(projectRoot, entry.file)

    // 1. File exists?
    if (!existsSync(filePath)) {
      // Try to find moved file
      const newPath = findComponentFileByExportName(projectRoot, entry.name)
      if (newPath) {
        result.updated.push({ id: entry.id, field: 'file', from: entry.file, to: newPath })
        entry.file = newPath
      } else {
        result.removed.push({ id: entry.id, name: entry.name, reason: `File not found: ${entry.file}` })
        return false
      }
    }

    // 2. Read file and check export name
    let code: string
    try {
      code = readFileSync(join(projectRoot, entry.file), 'utf-8')
    } catch {
      return true
    }

    const actualExports = extractExportedComponentNames(code)
    if (actualExports.length > 0 && !actualExports.includes(entry.name)) {
      const oldName = entry.name
      entry.name = actualExports[0]
      result.updated.push({ id: entry.id, field: 'name', from: oldName, to: entry.name })
    }

    // 3. Recalculate usedIn
    const actualUsedIn = findPagesImporting(projectRoot, entry.name, entry.file)
    const inLayout = isUsedInLayout(projectRoot, entry.name)
    const fullUsedIn = inLayout ? [...new Set([...actualUsedIn, 'app/layout.tsx'])] : actualUsedIn

    if (!arraysEqual(fullUsedIn, entry.usedIn || [])) {
      result.updated.push({
        id: entry.id,
        field: 'usedIn',
        from: (entry.usedIn || []).join(', ') || 'none',
        to: fullUsedIn.join(', ') || 'none',
      })
      entry.usedIn = fullUsedIn
    }

    // 4. Check if unused
    if (fullUsedIn.length === 0) {
      result.warnings.push({
        id: entry.id,
        name: entry.name,
        type: 'unused',
        message: `${entry.id} (${entry.name}) is not imported in any page or layout`,
        suggestion: `Remove with: coherent components shared remove ${entry.id}`,
      })
    }

    // 5. Check type
    const inferredType = inferComponentType(entry.name, code)
    if (inferredType !== entry.type) {
      result.updated.push({ id: entry.id, field: 'type', from: entry.type, to: inferredType })
      entry.type = inferredType
    }

    return true
  })

  // ── Pass 2: Find unregistered components ──

  const unregistered = findUnregisteredComponents(projectRoot, m)
  for (const comp of unregistered) {
    // Check if name already exists but file moved
    const byName = m.shared.find(s => s.name === comp.name)
    if (byName) {
      const oldFile = byName.file
      byName.file = comp.file
      result.updated.push({ id: byName.id, field: 'file', from: oldFile, to: comp.file })
      continue
    }

    const id = `CID-${String(m.nextId).padStart(3, '0')}`
    m.shared.push({
      id,
      name: comp.name,
      type: comp.type,
      file: comp.file,
      usedIn: comp.usedIn,
      description: `Auto-registered by sync from ${comp.file}`,
      createdAt: new Date().toISOString(),
      dependencies: [],
      source: 'extracted' as const,
    })
    m.nextId++
    result.added.push({ id, name: comp.name, file: comp.file, type: comp.type })
  }

  // ── Pass 3: Find inline duplicates ──

  const duplicates = findInlineDuplicates(projectRoot, m)
  for (const dup of duplicates) {
    result.warnings.push({
      id: dup.sharedId,
      name: dup.componentName,
      type: 'inline-duplicate',
      message: `${dup.pageFile} defines inline ${dup.componentName} instead of importing shared ${dup.sharedId}`,
      suggestion: `Replace with: import { ${dup.componentName} } from "@/${dup.sharedFile.replace('.tsx', '')}"`,
    })
  }

  return { manifest: m, result }
}

// ── File collection helper ───────────────────────────────────────

function collectFiles(dir: string, filter: (name: string) => boolean, skipDirs: string[] = []): string[] {
  const results: string[] = []
  function walk(d: string) {
    let entries
    try {
      entries = readdirSync(d, { withFileTypes: true })
    } catch {
      return
    }
    for (const e of entries) {
      const full = join(d, e.name)
      if (e.isDirectory()) {
        if (skipDirs.includes(e.name) || e.name.startsWith('.')) continue
        walk(full)
      } else if (filter(e.name)) {
        results.push(full)
      }
    }
  }
  walk(dir)
  return results
}
