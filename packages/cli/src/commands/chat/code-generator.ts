import { resolve } from 'path'
import { existsSync } from 'fs'
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
import { integrateSharedLayoutIntoRootLayout, generateSharedComponent } from '@getcoherent/core'
import { ensureAuthRouteGroup } from '../../utils/auth-route-group.js'
import chalk from 'chalk'
import { writeFile } from '../../utils/files.js'
import { isShadcnComponent, installShadcnComponent } from '../../utils/shadcn-installer.js'
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
  for (const componentId of ids) {
    const isRegistered = !!cm.read(componentId)
    const fileName = componentId.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase() + '.tsx'
    const filePath = resolve(projectRoot, 'components', 'ui', fileName)
    const fileExists = existsSync(filePath)

    if (isRegistered && fileExists) continue
    if (!isShadcnComponent(componentId)) continue
    try {
      const shadcnDef = await installShadcnComponent(componentId, projectRoot)
      if (shadcnDef) {
        if (!isRegistered) {
          const result = await cm.register(shadcnDef)
          if (result.success) {
            dsm.updateConfig(result.config)
            cm.updateConfig(result.config)
            pm.updateConfig(result.config)
          }
        }
        installed.push(shadcnDef.id)
      }
    } catch {
      // ignore single failure; page write will still happen
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
  const filePath = routeToFsPath(projectRoot, route, isAuth)

  await mkdir(dirname(filePath), { recursive: true })
  await writeFile(filePath, code)
}

export async function regenerateLayout(config: DesignSystemConfig, projectRoot: string): Promise<void> {
  const layout = config.pages[0]?.layout || 'centered'
  const appType = config.settings.appType || 'multi-page'
  const generator = new PageGenerator(config)

  const code = await generator.generateLayout(layout, appType, { skipNav: true })
  const layoutPath = resolve(projectRoot, 'app', 'layout.tsx')
  await writeFile(layoutPath, code)

  if (config.navigation?.enabled && appType === 'multi-page') {
    const navType = config.navigation.type || 'header'

    if (navType === 'header' || navType === 'both') {
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
    const footerCode = generator.generateSharedFooterCode()
    await generateSharedComponent(projectRoot, {
      name: 'Footer',
      type: 'layout',
      code: footerCode,
      description: 'Site footer',
      usedIn: ['app/layout.tsx'],
      overwrite: true,
    })
    if (navType === 'sidebar' || navType === 'both') {
      const sidebarCode = generator.generateSharedSidebarCode()
      await generateSharedComponent(projectRoot, {
        name: 'Sidebar',
        type: 'layout',
        code: sidebarCode,
        description: 'Vertical sidebar navigation with collapsible sections',
        usedIn: ['app/(app)/layout.tsx'],
        overwrite: true,
      })
    }
  }

  try {
    await integrateSharedLayoutIntoRootLayout(projectRoot)
    await ensureAuthRouteGroup(projectRoot)
    await ensureAppRouteGroupLayout(projectRoot, config.navigation?.type)
  } catch (err) {
    if (process.env.COHERENT_DEBUG === '1') {
      console.log(chalk.dim('Layout integration warning:', err))
    }
  }
}

async function ensureAppRouteGroupLayout(projectRoot: string, navType?: string): Promise<void> {
  const layoutPath = resolve(projectRoot, 'app', '(app)', 'layout.tsx')
  if (existsSync(layoutPath)) return
  const { mkdir: mkdirAsync } = await import('fs/promises')
  await mkdirAsync(resolve(projectRoot, 'app', '(app)'), { recursive: true })
  const code = buildAppLayoutCode(navType)
  await writeFile(layoutPath, code)
}

function buildAppLayoutCode(navType?: string): string {
  const hasSidebar = navType === 'sidebar' || navType === 'both'
  if (hasSidebar) {
    return `import { Sidebar } from '@/components/shared/sidebar'

export default function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="flex min-h-[calc(100vh-3.5rem)]">
      <Sidebar />
      <main className="flex-1 px-4 sm:px-6 lg:px-8 py-6">
        {children}
      </main>
    </div>
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

export async function regenerateFiles(
  modified: string[],
  config: DesignSystemConfig,
  projectRoot: string,
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
    await regenerateLayout(config, projectRoot)
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
