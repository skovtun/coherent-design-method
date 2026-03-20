import { resolve } from 'path'
import { existsSync, readFileSync } from 'fs'
import { findConfig, exitNotCoherent, warnIfVolatile } from '../../utils/find-config.js'
import { DesignSystemManager, loadManifest, type DesignSystemConfig } from '@getcoherent/core'
import { readFile } from '../../utils/files.js'
import chalk from 'chalk'

const MARKETING_ROUTES = new Set(['', 'landing', 'pricing', 'about', 'contact', 'blog', 'features'])

/** Skip placeholder / near-empty root pages when reusing split-generation style anchor */
export const MIN_ANCHOR_PAGE_CODE_CHARS = 120

const AUTH_ROUTE_SLUGS = new Set(['login', 'register', 'forgot-password', 'reset-password', 'sign-up'])

/**
 * Whether a route lives under `app/(auth)/` (not the same as `requiresAuth` on dashboard pages).
 */
export function inferRouteUsesAuthSegment(route: string): boolean {
  const slug = route.replace(/^\//, '').split('/')[0] || ''
  return AUTH_ROUTE_SLUGS.has(slug)
}

/**
 * Read existing page source for split-generation style anchor (Phase 3).
 * Returns null if missing or too short (placeholder).
 */
export function readAnchorPageCodeFromDisk(projectRoot: string, route: string): string | null {
  const useAuthSegment = inferRouteUsesAuthSegment(route)
  const abs = routeToFsPath(projectRoot, route, useAuthSegment)
  if (!existsSync(abs)) return null
  let code: string
  try {
    code = readFileSync(abs, 'utf-8')
  } catch {
    return null
  }
  if (code.trim().length < MIN_ANCHOR_PAGE_CODE_CHARS) return null
  return code
}

export function isMarketingRoute(route: string): boolean {
  const slug = route.replace(/^\//, '').split('/')[0] || ''
  return MARKETING_ROUTES.has(slug)
}

export function routeToFsPath(projectRoot: string, route: string, isAuth: boolean): string {
  const slug = route.replace(/^\//, '')
  if (isAuth) {
    return resolve(projectRoot, 'app', '(auth)', slug || 'login', 'page.tsx')
  }
  if (!slug) {
    return resolve(projectRoot, 'app', 'page.tsx')
  }
  if (isMarketingRoute(route)) {
    return resolve(projectRoot, 'app', slug, 'page.tsx')
  }
  return resolve(projectRoot, 'app', '(app)', slug, 'page.tsx')
}

export function routeToRelPath(route: string, isAuth: boolean): string {
  const slug = route.replace(/^\//, '')
  if (isAuth) {
    return `app/(auth)/${slug || 'login'}/page.tsx`
  }
  if (!slug) {
    return 'app/page.tsx'
  }
  if (isMarketingRoute(route)) {
    return `app/${slug}/page.tsx`
  }
  return `app/(app)/${slug}/page.tsx`
}

export function deduplicatePages(
  pages: Array<{ name: string; id: string; route: string }>,
): Array<{ name: string; id: string; route: string }> {
  const normalize = (route: string) => route.replace(/\/$/, '').replace(/s$/, '').replace(/ue$/, '')
  const seen = new Map<string, number>()
  return pages.filter((page, idx) => {
    const norm = normalize(page.route)
    if (seen.has(norm)) return false
    seen.set(norm, idx)
    return true
  })
}

export function extractComponentIdsFromCode(code: string): Set<string> {
  const ids = new Set<string>()
  const allMatches = code.matchAll(/@\/components\/((?:ui\/)?[a-z0-9-]+)/g)
  for (const m of allMatches) {
    if (!m[1]) continue
    let id = m[1]
    if (id.startsWith('ui/')) id = id.slice(3)
    if (id === 'shared' || id.startsWith('shared/')) continue
    if (id) ids.add(id)
  }
  return ids
}

export async function warnInlineDuplicates(
  projectRoot: string,
  pageName: string,
  pageCode: string,
  manifest: { shared: Array<{ id: string; name: string; type: string; file: string }> },
): Promise<void> {
  const sectionOrWidget = manifest.shared.filter(e => e.type === 'section' || e.type === 'widget')
  if (sectionOrWidget.length === 0) return

  for (const e of sectionOrWidget) {
    const kebab = e.file.replace(/^components\/shared\//, '').replace(/\.tsx$/, '')
    const hasImport = pageCode.includes(`@/components/shared/${kebab}`)
    if (hasImport) continue
    const sameNameAsTag = new RegExp(`<\\/?${e.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[\\s>]`).test(pageCode)
    if (sameNameAsTag) {
      console.log(
        chalk.yellow(
          `\n⚠ Page "${pageName}" contains inline code similar to ${e.id} (${e.name}). Consider using the shared component instead.`,
        ),
      )
      continue
    }
    try {
      const fullPath = resolve(projectRoot, e.file)
      const sharedSnippet = (await readFile(fullPath)).slice(0, 600)
      const sharedTokens = new Set(sharedSnippet.match(/\b[a-zA-Z0-9-]{4,}\b/g) ?? [])
      const pageTokens: string[] = pageCode.match(/\b[a-zA-Z0-9-]+\b/g) ?? []
      let overlap = 0
      for (const t of sharedTokens) {
        if (pageTokens.includes(t)) overlap++
      }
      if (overlap >= 12 && sharedTokens.size >= 10) {
        console.log(
          chalk.yellow(
            `\n⚠ Page "${pageName}" contains inline code similar to ${e.id} (${e.name}). Consider using the shared component instead.`,
          ),
        )
      }
    } catch {
      // ignore read errors
    }
  }
}

export async function loadConfig(configPath: string): Promise<DesignSystemConfig> {
  if (!existsSync(configPath)) {
    throw new Error(
      `Design system config not found at ${configPath}\n` + 'Run "coherent init" first to create a project.',
    )
  }

  const manager = new DesignSystemManager(configPath)
  await manager.load()
  return manager.getConfig()
}

export function requireProject(): { root: string; configPath: string } {
  const project = findConfig()
  if (!project) {
    exitNotCoherent()
  }
  warnIfVolatile(project.root)
  return project
}

export async function resolveTargetFlags(
  message: string,
  options: { component?: string; page?: string; token?: string },
  config: DesignSystemConfig,
  projectRoot: string,
): Promise<string> {
  if (options.component) {
    const manifest = await loadManifest(projectRoot)
    const target = options.component
    const entry = manifest.shared.find(
      s => s.name.toLowerCase() === target.toLowerCase() || s.id.toLowerCase() === target.toLowerCase(),
    )
    if (entry) {
      const filePath = resolve(projectRoot, entry.file)
      let currentCode = ''
      if (existsSync(filePath)) {
        currentCode = readFileSync(filePath, 'utf-8')
      }
      const codeSnippet = currentCode ? `\n\nCurrent code of ${entry.name}:\n\`\`\`tsx\n${currentCode}\n\`\`\`` : ''
      return `Modify the shared component ${entry.name} (${entry.id}, file: ${entry.file}): ${message}. Read the current code below and apply the requested changes. Return the full updated component code as pageCode.${codeSnippet}`
    }
    console.log(chalk.yellow(`\n⚠️  Component "${target}" not found in shared components.`))
    console.log(chalk.dim('   Available: ' + manifest.shared.map(s => `${s.id} ${s.name}`).join(', ')))
    console.log(chalk.dim('   Proceeding with message as-is...\n'))
  }

  if (options.page) {
    const target = options.page
    const page = config.pages.find(
      p =>
        p.name.toLowerCase() === target.toLowerCase() ||
        p.id.toLowerCase() === target.toLowerCase() ||
        p.route === target ||
        p.route === '/' + target,
    )
    if (page) {
      const relPath = page.route === '/' ? 'app/page.tsx' : `app${page.route}/page.tsx`
      const filePath = resolve(projectRoot, relPath)
      let currentCode = ''
      if (existsSync(filePath)) {
        currentCode = readFileSync(filePath, 'utf-8')
      }
      const codeSnippet = currentCode ? `\n\nCurrent code of ${page.name} page:\n\`\`\`tsx\n${currentCode}\n\`\`\`` : ''
      return `Update page "${page.name}" (id: ${page.id}, route: ${page.route}, file: ${relPath}): ${message}. Read the current code below and apply the requested changes.${codeSnippet}`
    }
    console.log(chalk.yellow(`\n⚠️  Page "${target}" not found.`))
    console.log(chalk.dim('   Available: ' + config.pages.map(p => `${p.id} (${p.route})`).join(', ')))
    console.log(chalk.dim('   Proceeding with message as-is...\n'))
  }

  if (options.token) {
    const target = options.token
    return `Change design token "${target}": ${message}. Update the token value in design-system.config.ts and ensure globals.css reflects the change.`
  }

  return message
}
