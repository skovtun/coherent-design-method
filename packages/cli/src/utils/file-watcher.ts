/**
 * File watcher for coherent preview: monitor app/ and components/, auto-fix and warn.
 */

import { readFileSync, writeFileSync, existsSync } from 'fs'
import { relative, join } from 'path'
import { loadManifest, saveManifest } from '@coherent/core'
import type { SharedComponentsManifest } from '@coherent/core'
import {
  findMissingPackagesInCode,
  installPackages,
  sanitizeMetadataStrings,
  ensureUseClientIfNeeded,
} from './self-heal.js'
import { writeCursorRules } from './cursor-rules.js'
import { extractExportedComponentNames } from './component-integrity.js'

const NATIVE_PATTERNS = [
  { pattern: /<button(\s|>)/g, name: '<button>' },
  { pattern: /<select(\s|>)/g, name: '<select>' },
  { pattern: /<input[^>]*type\s*=\s*["']checkbox["']/g, name: '<input type="checkbox">' },
  { pattern: /<table(\s|>)/g, name: '<table>' },
]

function hasNativeElements(content: string): boolean {
  return NATIVE_PATTERNS.some(({ pattern }) => pattern.test(content))
}

function findInlineDuplicatesOfShared(
  content: string,
  manifest: SharedComponentsManifest
): Array<{ cid: string; name: string; file: string }> {
  const matches: Array<{ cid: string; name: string; file: string }> = []
  for (const entry of manifest.shared) {
    const kebab = entry.file.replace(/^components\/shared\//, '').replace(/\.tsx$/, '')
    const hasImport = content.includes(`@/components/shared/${kebab}`) || content.includes(`@/components/shared/${entry.file.replace('.tsx', '')}`)
    if (hasImport) continue
    const tagName = entry.name
    const openTag = new RegExp(`<${tagName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(\\s|>)`)
    if (openTag.test(content)) {
      matches.push({ cid: entry.id, name: entry.name, file: entry.file })
    }
  }
  return matches
}

function getWatcherConfig(projectRoot: string): {
  enabled: boolean
  autoInstall: boolean
  autoFix: boolean
  warnNativeElements: boolean
  warnSharedReuse: boolean
} {
  try {
    const pkgPath = join(projectRoot, 'package.json')
    if (!existsSync(pkgPath)) return defaultWatcherConfig()
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'))
    const c = pkg?.coherent?.watcher ?? {}
    return {
      enabled: c.enabled !== false,
      autoInstall: c.autoInstall !== false,
      autoFix: c.autoFix !== false,
      warnNativeElements: c.warnNativeElements !== false,
      warnSharedReuse: c.warnSharedReuse !== false,
    }
  } catch {
    return defaultWatcherConfig()
  }
}

function defaultWatcherConfig() {
  return {
    enabled: true,
    autoInstall: true,
    autoFix: true,
    warnNativeElements: true,
    warnSharedReuse: true,
  }
}

export async function handleFileChange(projectRoot: string, filePath: string): Promise<void> {
  const relativePath = relative(projectRoot, filePath).replace(/\\/g, '/')
  if (!relativePath.endsWith('.tsx') && !relativePath.endsWith('.ts')) return
  if (relativePath.includes('node_modules') || relativePath.includes('.next')) return

  let content: string
  try {
    content = readFileSync(filePath, 'utf-8')
  } catch {
    return
  }

  const config = getWatcherConfig(projectRoot)
  const chalk = (await import('chalk')).default

  if (config.autoInstall) {
    const missing = findMissingPackagesInCode(content, projectRoot)
    if (missing.length > 0) {
      const ok = await installPackages(projectRoot, missing)
      if (ok) {
        console.log(chalk.cyan(`\n  🔧 Auto-installed: ${missing.join(', ')} (needed by ${relativePath})`))
      }
    }
  }

  if (config.autoFix) {
    let fixed = sanitizeMetadataStrings(ensureUseClientIfNeeded(content))
    if (fixed !== content) {
      writeFileSync(filePath, fixed, 'utf-8')
      console.log(chalk.cyan(`  🔧 Auto-fixed syntax in ${relativePath}`))
    }
  }

  if (config.warnNativeElements && hasNativeElements(content)) {
    console.log(chalk.yellow(`  ⚠ ${relativePath}: uses native HTML elements (<button>, <select>, etc.)`))
    console.log(chalk.dim('    Use components from @/components/ui/ instead'))
  }

  if (config.warnSharedReuse) {
    let manifest: SharedComponentsManifest
    try {
      manifest = await loadManifest(projectRoot)
    } catch {
      manifest = { shared: [], nextId: 1 }
    }
    if (manifest.shared.length > 0) {
      const dupes = findInlineDuplicatesOfShared(content, manifest)
      for (const d of dupes) {
        const importPath = d.file.replace(/\.tsx$/, '').replace(/^components\/shared\//, '')
        console.log(chalk.yellow(`  ⚠ ${relativePath}: has inline code similar to ${d.cid} (${d.name})`))
        console.log(chalk.dim(`    Consider: import { ${d.name} } from "@/components/shared/${importPath}"`))
      }
    }
  }
}

/**
 * Handle file deletion: auto-remove orphaned manifest entries.
 */
export async function handleFileDelete(projectRoot: string, filePath: string): Promise<void> {
  const relativePath = relative(projectRoot, filePath).replace(/\\/g, '/')
  if (!relativePath.startsWith('components/') || relativePath.startsWith('components/ui/')) return

  try {
    const chalk = (await import('chalk')).default
    const manifest = await loadManifest(projectRoot)
    const orphaned = manifest.shared.find(s => s.file === relativePath)
    if (orphaned) {
      const cleaned = {
        ...manifest,
        shared: manifest.shared.filter(s => s.id !== orphaned.id),
      }
      await saveManifest(projectRoot, cleaned)
      console.log(chalk.cyan(`\n  🗑 Auto-removed ${orphaned.id} (${orphaned.name}) — file deleted`))
      await writeCursorRules(projectRoot)
    }
  } catch { /* ignore */ }
}

/**
 * Detect new unregistered component files on creation.
 */
async function detectNewComponent(projectRoot: string, filePath: string): Promise<void> {
  const relativePath = relative(projectRoot, filePath).replace(/\\/g, '/')
  if (!relativePath.startsWith('components/') || relativePath.startsWith('components/ui/')) return
  if (!relativePath.endsWith('.tsx') && !relativePath.endsWith('.jsx')) return

  try {
    const chalk = (await import('chalk')).default
    const manifest = await loadManifest(projectRoot)
    const alreadyRegistered = manifest.shared.some(s => s.file === relativePath)
    if (alreadyRegistered) return

    const code = readFileSync(filePath, 'utf-8')
    const exports = extractExportedComponentNames(code)
    if (exports.length > 0) {
      const alreadyByName = exports.every(n => manifest.shared.some(s => s.name === n))
      if (!alreadyByName) {
        console.log(chalk.cyan(`\n  ℹ New component detected: ${exports[0]} in ${relativePath}`))
        console.log(chalk.dim('    Register with: coherent sync'))
      }
    }
  } catch { /* ignore */ }
}

export async function handleManifestChange(projectRoot: string): Promise<void> {
  try {
    await writeCursorRules(projectRoot)
  } catch {
    // ignore
  }
}

export function startFileWatcher(projectRoot: string): () => void {
  const config = getWatcherConfig(projectRoot)
  if (!config.enabled) return () => {}

  let watcher: { close: () => void } | null = null
  let manifestWatcher: { close: () => void } | null = null

  import('chokidar').then((chokidar) => {
    const appGlob = join(projectRoot, 'app', '**', '*.tsx')
    const compGlob = join(projectRoot, 'components', '**', '*.tsx')
    watcher = chokidar.default.watch([appGlob, compGlob], {
      ignoreInitial: true,
      awaitWriteFinish: { stabilityThreshold: 500 },
    })
    watcher.on('change', (fp: string) => handleFileChange(projectRoot, fp))
    watcher.on('add', (fp: string) => {
      handleFileChange(projectRoot, fp)
      detectNewComponent(projectRoot, fp)
    })
    watcher.on('unlink', (fp: string) => handleFileDelete(projectRoot, fp))
  })

  const manifestPath = join(projectRoot, 'coherent.components.json')
  if (existsSync(manifestPath)) {
    import('chokidar').then((chokidar) => {
      manifestWatcher = chokidar.default.watch(manifestPath, { ignoreInitial: true })
      manifestWatcher!.on('change', () => handleManifestChange(projectRoot))
    })
  }

  return () => {
    if (watcher) watcher.close()
    if (manifestWatcher) manifestWatcher.close()
  }
}
