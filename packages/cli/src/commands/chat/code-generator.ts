import { resolve } from 'path'
import { existsSync, readdirSync, readFileSync } from 'fs'
import { mkdir } from 'fs/promises'
import { dirname } from 'path'
import {
  ComponentGenerator,
  PageGenerator,
  TailwindConfigGenerator,
  ComponentManager,
  DesignSystemManager,
  PageManager,
  type DesignSystemConfig,
  type PageDefinition,
} from '@getcoherent/core'
import { isAuthRoute } from '../../agents/page-templates.js'
import type { ArchitecturePlan } from './plan-generator.js'
import { integrateSharedLayoutIntoRootLayout, generateSharedComponent } from '@getcoherent/core'
import { ensureAuthRouteGroup } from '../../utils/auth-route-group.js'
import chalk from 'chalk'
import { writeFile } from '../../utils/files.js'
import { isManuallyEdited } from '../../utils/file-hashes.js'
import { getComponentProvider } from '../../providers/index.js'
import {
  sanitizeMetadataStrings,
  ensureUseClientIfNeeded,
  fixEscapedClosingQuotes,
  fixUnescapedLtInJsx,
  findMissingPackagesInCode,
  installPackages,
} from '../../utils/self-heal.js'
import { toKebabCase } from '../../utils/strings.js'
import { routeToFsPath } from './utils.js'

export async function validateAndFixGeneratedCode(
  projectRoot: string,
  code: string,
  options: { isPage?: boolean } = {},
): Promise<{ fixedCode: string; fixes: string[] }> {
  const fixes: string[] = []
  let fixed = fixEscapedClosingQuotes(code)
  fixed = fixUnescapedLtInJsx(fixed)
  if (fixed !== code) fixes.push('Fixed syntax issues')
  const beforeMeta = fixed
  fixed =
    options.isPage !== false ? sanitizeMetadataStrings(ensureUseClientIfNeeded(fixed)) : ensureUseClientIfNeeded(fixed)
  if (fixed !== beforeMeta) fixes.push('Fixed metadata / use client')
  const missing = findMissingPackagesInCode(fixed, projectRoot)
  if (missing.length > 0) {
    const ok = await installPackages(projectRoot, missing)
    if (ok) fixes.push(`Installed: ${missing.join(', ')}`)
  }
  return { fixedCode: fixed, fixes }
}

export async function ensureComponentsInstalled(
  componentIds: Set<string> | string[],
  cm: ComponentManager,
  dsm: DesignSystemManager,
  pm: PageManager,
  projectRoot: string,
): Promise<{ installed: string[] }> {
  const installed: string[] = []
  const ids = Array.from(componentIds)
  const provider = getComponentProvider()

  for (const componentId of ids) {
    const isRegistered = !!cm.read(componentId)
    const fileName = toKebabCase(componentId) + '.tsx'
    const filePath = resolve(projectRoot, 'components', 'ui', fileName)
    const fileExists = existsSync(filePath)

    if (isRegistered && fileExists) continue

    const result = await provider.installComponent(componentId, projectRoot)
    if (result.success && result.componentDef) {
      if (!isRegistered) {
        const regResult = await cm.register(result.componentDef)
        if (regResult.success) {
          dsm.updateConfig(regResult.config)
          cm.updateConfig(regResult.config)
          pm.updateConfig(regResult.config)
        }
      }
      installed.push(result.componentDef.id)
    }
  }
  return { installed }
}

export async function regenerateComponent(
  componentId: string,
  config: DesignSystemConfig,
  projectRoot: string,
): Promise<void> {
  const component = config.components.find(c => c.id === componentId)
  if (!component) return
  if (component.source === 'shadcn') return

  const generator = new ComponentGenerator(config)
  const code = await generator.generate(component)
  const fileName = toKebabCase(component.name) + '.tsx'
  const filePath = resolve(projectRoot, 'components', 'ui', fileName)
  await writeFile(filePath, code)
}

export async function regeneratePage(pageId: string, config: DesignSystemConfig, projectRoot: string): Promise<void> {
  const page = config.pages.find(p => p.id === pageId)
  if (!page) return
  if ((page as PageDefinition & { generatedWithPageCode?: boolean }).generatedWithPageCode) return

  const generator = new PageGenerator(config)
  const appType = config.settings.appType || 'multi-page'
  const code = await generator.generate(page, appType)

  const route = page.route || '/'
  const isAuth = isAuthRoute(route) || isAuthRoute(page.name || page.id || '')
  const { loadPlan: loadPlanForPath } = await import('./plan-generator.js')
  const planForPath = loadPlanForPath(projectRoot)
  const filePath = routeToFsPath(projectRoot, route, planForPath || isAuth)

  await mkdir(dirname(filePath), { recursive: true })
  await writeFile(filePath, code)
}

async function canOverwriteShared(
  projectRoot: string,
  componentFile: string,
  storedHashes: Record<string, string>,
): Promise<boolean> {
  const filePath = resolve(projectRoot, componentFile)
  if (!existsSync(filePath)) return true
  const storedHash = storedHashes[componentFile]
  if (!storedHash) return true
  const edited = await isManuallyEdited(filePath, storedHash)
  if (edited) {
    console.log(chalk.yellow(`  ⚠ Skipping ${componentFile} — manually edited since last generation`))
  }
  return !edited
}

export async function regenerateLayout(
  config: DesignSystemConfig,
  projectRoot: string,
  options: { navChanged: boolean; storedHashes?: Record<string, string>; groupLayouts?: Record<string, string> } = {
    navChanged: false,
  },
): Promise<void> {
  const appType = config.settings.appType || 'multi-page'
  const generator = new PageGenerator(config)
  const initialized = config.settings.initialized !== false
  const hashes = options.storedHashes ?? {}

  if (!initialized) {
    const layout = config.pages[0]?.layout || 'centered'
    const code = await generator.generateLayout(layout, appType, { skipNav: true })
    await writeFile(resolve(projectRoot, 'app', 'layout.tsx'), code)
  }

  if (config.navigation?.enabled && appType === 'multi-page') {
    const navType = config.navigation.type || 'header'
    const shouldRegenShared = !initialized || options.navChanged

    if (shouldRegenShared) {
      if (navType === 'header' || navType === 'both') {
        if (await canOverwriteShared(projectRoot, 'components/shared/header.tsx', hashes)) {
          const headerCode = generator.generateSharedHeaderCode()
          await generateSharedComponent(projectRoot, {
            name: 'Header',
            type: 'layout',
            code: headerCode,
            description: 'Main site header with navigation and theme toggle',
            usedIn: ['app/layout.tsx'],
            overwrite: true,
          })
        }
      }
      if (await canOverwriteShared(projectRoot, 'components/shared/footer.tsx', hashes)) {
        const footerCode = generator.generateSharedFooterCode()
        await generateSharedComponent(projectRoot, {
          name: 'Footer',
          type: 'layout',
          code: footerCode,
          description: 'Site footer',
          usedIn: ['app/layout.tsx'],
          overwrite: true,
        })
      }
      if (navType === 'sidebar' || navType === 'both') {
        if (await canOverwriteShared(projectRoot, 'components/shared/sidebar.tsx', hashes)) {
          const sidebarCode = generator.generateSharedSidebarCode()
          await generateSharedComponent(projectRoot, {
            name: 'AppSidebar',
            type: 'layout',
            code: sidebarCode,
            description: 'Application sidebar using shadcn/ui Sidebar components',
            usedIn: ['app/(app)/layout.tsx'],
            overwrite: true,
          })
        }
      }
    }
  }

  try {
    await integrateSharedLayoutIntoRootLayout(projectRoot)
    await ensureAuthRouteGroup(projectRoot)
    await ensureAppRouteGroupLayout(projectRoot, config.navigation?.type, options.navChanged, options.groupLayouts)
  } catch (err) {
    if (process.env.COHERENT_DEBUG === '1') {
      console.log(chalk.dim('Layout integration warning:', err))
    }
  }
}

export async function scanAndInstallSharedDeps(projectRoot: string): Promise<string[]> {
  const sharedDir = resolve(projectRoot, 'components', 'shared')
  if (!existsSync(sharedDir)) return []

  const files = readdirSync(sharedDir).filter(f => f.endsWith('.tsx') || f.endsWith('.ts'))
  const installed: string[] = []
  const provider = getComponentProvider()

  for (const file of files) {
    const code = readFileSync(resolve(sharedDir, file), 'utf-8')
    const importMatches = [...code.matchAll(/@\/components\/ui\/([a-z0-9-]+)/g)]
    for (const [, componentId] of importMatches) {
      const uiPath = resolve(projectRoot, 'components', 'ui', `${componentId}.tsx`)
      if (!existsSync(uiPath) && provider.has(componentId)) {
        try {
          await provider.installComponent(componentId, projectRoot)
          installed.push(componentId)
        } catch {
          /* best-effort */
        }
      }
    }
  }
  return [...new Set(installed)]
}

export async function ensureAppRouteGroupLayout(
  projectRoot: string,
  navType?: string,
  forceUpdate = false,
  groupLayouts?: Record<string, string>,
): Promise<void> {
  const effectiveNavType = groupLayouts?.['app'] || navType
  const layoutPath = resolve(projectRoot, 'app', '(app)', 'layout.tsx')
  if (existsSync(layoutPath) && !forceUpdate) return
  const { mkdir: mkdirAsync } = await import('fs/promises')
  await mkdirAsync(resolve(projectRoot, 'app', '(app)'), { recursive: true })
  const code = buildAppLayoutCode(effectiveNavType)
  await writeFile(layoutPath, code)
}

export function buildAppLayoutCode(navType?: string): string {
  const hasSidebar = navType === 'sidebar' || navType === 'both'
  if (hasSidebar) {
    return `import { AppSidebar } from '@/components/shared/sidebar'
import { SidebarProvider, SidebarInset } from '@/components/ui/sidebar'

export default function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <main className="flex-1 px-4 sm:px-6 lg:px-8 py-6">
          {children}
        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}
`
  }
  return `export default function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <main className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8 py-6">
      {children}
    </main>
  )
}
`
}

export function buildGroupLayoutCode(layout: string, _pages: string[]): string {
  if (layout === 'sidebar' || layout === 'both') {
    return `import { AppSidebar } from '@/components/shared/sidebar'
import { SidebarProvider, SidebarInset } from '@/components/ui/sidebar'

export default function GroupLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <main className="flex-1 px-4 sm:px-6 lg:px-8 py-6">
          {children}
        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}
`
  }

  if (layout === 'none') {
    return `export default function GroupLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="min-h-svh flex items-center justify-center p-4">
      {children}
    </div>
  )
}
`
  }

  // header (default)
  return `export default function GroupLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <main className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8 py-6">
      {children}
    </main>
  )
}
`
}

export async function ensurePlanGroupLayouts(
  projectRoot: string,
  plan: ArchitecturePlan,
  storedHashes: Record<string, string> = {},
  config?: DesignSystemConfig,
): Promise<void> {
  const { mkdir: mkdirAsync } = await import('fs/promises')
  const { createHash } = await import('crypto')

  for (const group of plan.groups) {
    const groupDir = resolve(projectRoot, 'app', `(${group.id})`)
    await mkdirAsync(groupDir, { recursive: true })
    const layoutPath = resolve(groupDir, 'layout.tsx')
    const relPath = `app/(${group.id})/layout.tsx`

    if (existsSync(layoutPath)) {
      const currentContent = readFileSync(layoutPath, 'utf-8')
      const currentHash = createHash('md5').update(currentContent).digest('hex')
      const storedHash = storedHashes[relPath]
      if (storedHash && storedHash !== currentHash) {
        continue
      }
    }

    const code = buildGroupLayoutCode(group.layout, group.pages)
    await writeFile(layoutPath, code)
  }

  if (config) {
    const layouts: Record<string, 'header' | 'sidebar' | 'both' | 'none'> = {}
    for (const group of plan.groups) {
      layouts[group.id] = group.layout
    }
    config.groupLayouts = layouts
  }
}

export async function regenerateFiles(
  modified: string[],
  config: DesignSystemConfig,
  projectRoot: string,
  options: { navChanged: boolean; storedHashes?: Record<string, string> } = { navChanged: false },
): Promise<void> {
  const componentIds = new Set<string>()
  const pageIds = new Set<string>()

  for (const item of modified) {
    if (item.startsWith('component:')) {
      componentIds.add(item.replace('component:', ''))
    } else if (item.startsWith('page:')) {
      pageIds.add(item.replace('page:', ''))
    }
  }

  if (config.navigation?.enabled && modified.length > 0) {
    await regenerateLayout(config, projectRoot, {
      navChanged: options.navChanged,
      storedHashes: options.storedHashes,
    })
    const sharedInstalled = await scanAndInstallSharedDeps(projectRoot)
    if (sharedInstalled.length > 0 && process.env.COHERENT_DEBUG === '1') {
      console.log(chalk.dim(`  Auto-installed shared deps: ${sharedInstalled.join(', ')}`))
    }
  }

  if (componentIds.size > 0) {
    const twGen = new TailwindConfigGenerator(config)
    const twPath = resolve(projectRoot, 'tailwind.config.ts')
    const twCjsPath = resolve(projectRoot, 'tailwind.config.cjs')
    if (existsSync(twPath)) {
      await writeFile(twPath, await twGen.generate())
    } else if (existsSync(twCjsPath)) {
      await writeFile(twCjsPath, await twGen.generateCjs())
    }
  }

  for (const componentId of componentIds) {
    await regenerateComponent(componentId, config, projectRoot)
  }

  const pageCodeIds = new Set(
    config.pages
      .filter(p => (p as PageDefinition & { generatedWithPageCode?: boolean }).generatedWithPageCode)
      .map(p => p.id),
  )
  for (const pageId of pageIds) {
    if (pageCodeIds.has(pageId)) continue
    await regeneratePage(pageId, config, projectRoot)
  }
}
