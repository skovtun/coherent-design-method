import { resolve } from 'path'
import { mkdir } from 'fs/promises'
import { dirname } from 'path'
import chalk from 'chalk'
import {
  DesignSystemManager,
  ComponentManager,
  PageManager,
  getTemplateForPageType,
  loadManifest,
  saveManifest,
  updateUsedIn,
  findSharedComponentByIdOrName,
  generateSharedComponent,
  type ModificationRequest,
  type ComponentDefinition,
  type PageDefinition,
  type TemplateOptions,
} from '@getcoherent/core'
import { isAuthRoute } from '../../agents/page-templates.js'
import { ensureAuthRouteGroup } from '../../utils/auth-route-group.js'
import { createAIProvider } from '../../utils/ai-provider.js'
import { readFile, writeFile } from '../../utils/files.js'
import { CORE_CONSTRAINTS, DESIGN_QUALITY, selectContextualRules } from '../../agents/design-constraints.js'
import { isShadcnComponent, installShadcnComponent } from '../../utils/shadcn-installer.js'
import {
  validatePageQuality,
  formatIssues,
  autoFixCode,
  checkDesignConsistency,
  verifyIncrementalEdit,
} from '../../utils/quality-validator.js'
import { writeCursorRules } from '../../utils/cursor-rules.js'
import { analyzePageCode } from '../../utils/page-analyzer.js'
import {
  routeToFsPath,
  routeToRelPath,
  extractComponentIdsFromCode,
  warnInlineDuplicates,
  isMarketingRoute,
} from './utils.js'
import { validateAndFixGeneratedCode, ensureComponentsInstalled, regenerateComponent } from './code-generator.js'
import { extractBalancedTag } from './jsx-extractor.js'
import {
  printPostGenerationReport,
  printSharedComponentReport,
  printLinkSharedReport,
  printPromoteAndLinkReport,
} from './reporting.js'
import { buildExistingPagesContext } from './split-generator.js'

const DEBUG = process.env.COHERENT_DEBUG === '1'

/**
 * Strip inline <header>, <nav>, and <footer> elements from page code.
 * Also strips div-based footers preceded by Footer comments in JSX.
 * The root layout provides these via shared components — pages must not include them.
 */
function stripInlineLayoutElements(code: string): { code: string; stripped: string[] } {
  let result = code
  const stripped: string[] = []

  const headerBlock = extractBalancedTag(result, 'header')
  if (headerBlock) {
    result = result.replace(headerBlock, '')
    stripped.push('header')
  }

  const navBlock = extractBalancedTag(result, 'nav')
  if (navBlock) {
    result = result.replace(navBlock, '')
    stripped.push('nav')
  }

  const footerBlock = extractBalancedTag(result, 'footer')
  if (footerBlock) {
    result = result.replace(footerBlock, '')
    stripped.push('footer')
  }

  // Catch div-based footers preceded by {/* Footer */} comment
  const commentFooterRe = /\s*\{\/\*\s*Footer\s*\*\/\}\s*\n/i
  const commentMatch = result.match(commentFooterRe)
  if (commentMatch && commentMatch.index != null) {
    const afterComment = result.slice(commentMatch.index + commentMatch[0].length)
    const divBlock = extractBalancedTag(afterComment, 'div')
    if (divBlock) {
      result = result.replace(commentMatch[0] + divBlock, '')
      stripped.push('footer (div)')
    }
  }

  if (stripped.length > 0) {
    result = result.replace(/\n{3,}/g, '\n\n')
  }
  return { code: result, stripped }
}

const STANDARD_WRAPPER = 'mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8 py-6'

const STANDARD_PAGE_WRAPPER = 'space-y-6'

const HOME_REDIRECT_CODE = `import { redirect } from 'next/navigation'

export default function Home() {
  redirect('/dashboard')
}
`

/**
 * Detect if the AI generated a SPA-style home page (multiple inline views
 * with useState toggling) and replace it with a simple redirect.
 */
function detectAndFixSpaHomePage(code: string, route: string): { code: string; fixed: boolean } {
  if (route !== '/' && route !== '') return { code, fixed: false }
  const hasMultipleRenders = (code.match(/const render\w+\s*=\s*\(\)/g) || []).length >= 2
  const hasPageToggle = /useState\s*\(\s*['"](?:dashboard|home|page)/i.test(code)
  const isMassive = code.split('\n').length > 200
  if ((hasMultipleRenders && hasPageToggle) || (isMassive && hasPageToggle)) {
    return { code: HOME_REDIRECT_CODE, fixed: true }
  }
  return { code, fixed: false }
}

/**
 * Normalize the outermost wrapper in AI-generated page code.
 * The (app) route group layout already provides max-w-7xl + padding,
 * so the page content should use a simple <div className="space-y-6">.
 *
 * 1) Replace <main ...> with <div className="space-y-6">
 * 2) Normalize the first <div className="..."> to use only "space-y-6"
 *    (strip any padding, flex, max-w, mx-auto the AI added)
 */
function normalizePageWrapper(code: string): { code: string; fixed: boolean } {
  let result = code
  let fixed = false

  // Step 1: Replace <main> with <div>
  if (/<main\s+className="[^"]*">/.test(result)) {
    result = result.replace(/<main\s+className="[^"]*">/g, `<div className="${STANDARD_PAGE_WRAPPER}">`)
    result = result.replace(/<\/main>/g, '</div>')
    fixed = true
  }

  // Step 2: Force the outermost <div className="..."> to use standard spacing.
  // No pattern matching — always normalize to prevent AI variation.
  const outerDivRe = /(return\s*\(\s*\n?\s*)<div\s+className="([^"]*)">/
  const match = result.match(outerDivRe)
  if (match) {
    const cls = match[2]
    if (cls !== STANDARD_PAGE_WRAPPER) {
      result = result.replace(match[0], `${match[1]}<div className="${STANDARD_PAGE_WRAPPER}">`)
      fixed = true
    }
  }

  return { code: result, fixed }
}

export async function applyModification(
  request: ModificationRequest,
  dsm: DesignSystemManager,
  cm: ComponentManager,
  pm: PageManager,
  projectRoot: string,
  aiProvider?: 'claude' | 'openai' | 'auto',
  originalMessage?: string,
): Promise<{ success: boolean; message: string; modified: string[] }> {
  switch (request.type) {
    case 'modify-layout-block': {
      const target = request.target
      const instruction = (request.changes as { instruction?: string })?.instruction
      const resolved = await findSharedComponentByIdOrName(projectRoot, target)
      if (!resolved) {
        return {
          success: false,
          message: `Shared component "${target}" not found. Run \`coherent components shared\` to list.`,
          modified: [],
        }
      }
      if (!instruction || typeof instruction !== 'string') {
        return {
          success: false,
          message: 'modify-layout-block requires changes.instruction',
          modified: [],
        }
      }
      const fullPath = resolve(projectRoot, resolved.file)
      let currentCode: string
      try {
        currentCode = await readFile(fullPath)
      } catch {
        return { success: false, message: `Could not read ${resolved.file}`, modified: [] }
      }
      const ai = await createAIProvider(aiProvider ?? 'auto')
      if (!ai.editSharedComponentCode) {
        return {
          success: false,
          message: 'AI provider does not support editing shared component code',
          modified: [],
        }
      }
      const newCode = await ai.editSharedComponentCode(currentCode, instruction, resolved.name)
      const { fixedCode, fixes } = await validateAndFixGeneratedCode(projectRoot, newCode, { isPage: false })
      if (fixes.length > 0) {
        console.log(chalk.dim('  🔧 Post-generation fixes:'))
        fixes.forEach(f => console.log(chalk.dim(`     ${f}`)))
      }
      await writeFile(fullPath, fixedCode)
      printSharedComponentReport({
        id: resolved.id,
        name: resolved.name,
        file: resolved.file,
        instruction: (request.changes as { instruction?: string })?.instruction,
        postFixes: fixes,
      })
      try {
        await writeCursorRules(projectRoot)
      } catch {
        // ignore
      }
      return {
        success: true,
        message: `Updated ${resolved.id} (${resolved.name}). Change is visible on all pages using it.`,
        modified: [resolved.file],
      }
    }

    case 'link-shared': {
      const pageTarget = request.target
      const changes = request.changes as { sharedIdOrName?: string; blockHint?: string }
      const sharedIdOrName = changes?.sharedIdOrName
      if (!sharedIdOrName) {
        return {
          success: false,
          message: 'link-shared requires changes.sharedIdOrName (e.g. CID-003 or HeroSection)',
          modified: [],
        }
      }
      const resolved = await findSharedComponentByIdOrName(projectRoot, sharedIdOrName)
      if (!resolved) {
        return {
          success: false,
          message: `Shared component "${sharedIdOrName}" not found. Run \`coherent components shared\` to list.`,
          modified: [],
        }
      }
      const config = dsm.getConfig()
      const route = pageTarget.startsWith('/')
        ? pageTarget
        : config.pages.find(p => p.name?.toLowerCase() === pageTarget.toLowerCase() || p.id === pageTarget)?.route
      if (!route) {
        return {
          success: false,
          message: `Page "${pageTarget}" not found. Use page name (e.g. About) or route (e.g. /about).`,
          modified: [],
        }
      }
      const pageFilePath = routeToFsPath(projectRoot, route, false)
      let pageCode: string
      try {
        pageCode = await readFile(pageFilePath)
      } catch {
        return { success: false, message: `Could not read ${pageFilePath}`, modified: [] }
      }
      const sharedPath = resolve(projectRoot, resolved.file)
      let sharedCode: string
      try {
        sharedCode = await readFile(sharedPath)
      } catch {
        return { success: false, message: `Could not read ${resolved.file}`, modified: [] }
      }
      const ai = await createAIProvider(aiProvider ?? 'auto')
      if (!ai.replaceInlineWithShared) {
        return {
          success: false,
          message: 'AI provider does not support replaceInlineWithShared',
          modified: [],
        }
      }
      const newPageCode = await ai.replaceInlineWithShared(pageCode, sharedCode, resolved.name, changes?.blockHint)
      const { fixedCode, fixes } = await validateAndFixGeneratedCode(projectRoot, newPageCode, { isPage: true })
      if (fixes.length > 0) {
        console.log(chalk.dim('  🔧 Post-generation fixes:'))
        fixes.forEach(f => console.log(chalk.dim(`     ${f}`)))
      }
      await writeFile(pageFilePath, fixedCode)
      const manifest = await loadManifest(projectRoot)
      const usedIn = manifest.shared.find(e => e.id === resolved.id)?.usedIn ?? []
      const routePath = route.replace(/^\//, '')
      const filePathRel = routePath ? `app/${routePath}/page.tsx` : 'app/page.tsx'
      if (!usedIn.includes(filePathRel)) {
        const nextManifest = updateUsedIn(manifest, resolved.id, [...usedIn, filePathRel])
        await saveManifest(projectRoot, nextManifest)
      }
      printLinkSharedReport({
        sharedId: resolved.id,
        sharedName: resolved.name,
        pageTarget,
        route: route ?? `/${routePath}`,
        postFixes: fixes,
      })
      try {
        await writeCursorRules(projectRoot)
      } catch {
        // ignore
      }
      return {
        success: true,
        message: `Linked ${resolved.id} (${resolved.name}) to page "${pageTarget}". Inline code replaced.`,
        modified: [filePathRel],
      }
    }

    case 'promote-and-link': {
      const sourcePageName = request.target
      const ch = request.changes as {
        blockHint?: string
        componentName?: string
        targetPages?: string[]
      }
      const blockHint = ch?.blockHint ?? 'section'
      const componentName =
        ch?.componentName ?? blockHint.replace(/\s+/g, '').replace(/^./, s => s.toUpperCase()) + 'Section'
      const targetPages = Array.isArray(ch?.targetPages) ? ch.targetPages : []
      const config = dsm.getConfig()
      const sourcePage = config.pages.find(
        p => p.name?.toLowerCase() === sourcePageName.toLowerCase() || p.id === sourcePageName,
      )
      if (!sourcePage) {
        return {
          success: false,
          message: `Source page "${sourcePageName}" not found.`,
          modified: [],
        }
      }
      const allPagesToLink = [sourcePageName, ...targetPages]
      const routeToPath = (nameOrRoute: string): string | null => {
        if (nameOrRoute.startsWith('/')) {
          return routeToRelPath(nameOrRoute, false)
        }
        const p = config.pages.find(x => x.name?.toLowerCase() === nameOrRoute.toLowerCase() || x.id === nameOrRoute)
        if (!p?.route) return null
        return routeToRelPath(p.route, false)
      }
      const sourcePath = routeToPath(sourcePageName)
      if (!sourcePath) {
        return { success: false, message: `Could not resolve path for page "${sourcePageName}"`, modified: [] }
      }
      let sourceCode: string
      try {
        sourceCode = await readFile(resolve(projectRoot, sourcePath))
      } catch {
        return { success: false, message: `Could not read ${sourcePath}`, modified: [] }
      }
      const ai = await createAIProvider(aiProvider ?? 'auto')
      if (!ai.extractBlockAsComponent) {
        return {
          success: false,
          message: 'AI provider does not support extractBlockAsComponent',
          modified: [],
        }
      }
      const extractedCode = await ai.extractBlockAsComponent(sourceCode, blockHint, componentName)
      const created = await generateSharedComponent(projectRoot, {
        name: componentName,
        type: 'section',
        code: extractedCode,
        description: `Extracted from ${sourcePageName}: ${blockHint}`,
        usedIn: [],
      })
      const sharedPath = resolve(projectRoot, created.file)
      let sharedCode: string
      try {
        sharedCode = await readFile(sharedPath)
      } catch {
        return { success: false, message: `Could not read created ${created.file}`, modified: [] }
      }
      const usedInFiles: string[] = []
      for (const pageName of allPagesToLink) {
        const relPath = routeToPath(pageName)
        if (!relPath) continue
        const fullPath = resolve(projectRoot, relPath)
        let linkPageCode: string
        try {
          linkPageCode = await readFile(fullPath)
        } catch {
          continue
        }
        if (!ai.replaceInlineWithShared) continue
        const newCode = await ai.replaceInlineWithShared(linkPageCode, sharedCode, created.name, blockHint)
        const { fixedCode, fixes } = await validateAndFixGeneratedCode(projectRoot, newCode, { isPage: true })
        if (fixes.length > 0) {
          console.log(chalk.dim('  🔧 Post-generation fixes:'))
          fixes.forEach(f => console.log(chalk.dim(`     ${f}`)))
        }
        await writeFile(fullPath, fixedCode)
        usedInFiles.push(relPath)
      }
      const manifest = await loadManifest(projectRoot)
      const nextManifest = updateUsedIn(manifest, created.id, usedInFiles)
      await saveManifest(projectRoot, nextManifest)
      printPromoteAndLinkReport({
        id: created.id,
        name: created.name,
        file: created.file,
        usedInFiles,
      })
      try {
        await writeCursorRules(projectRoot)
      } catch {
        // ignore
      }
      return {
        success: true,
        message: `Created ${created.id} (${created.name}). Linked to ${usedInFiles.length} page(s): ${allPagesToLink.slice(0, 5).join(', ')}${allPagesToLink.length > 5 ? '...' : ''}.`,
        modified: [created.file, ...usedInFiles],
      }
    }

    case 'update-token': {
      const path = request.target
      const value = request.changes.value
      const result = await dsm.updateToken(path, value)
      return {
        success: result.success,
        message: result.message,
        modified: result.modified,
      }
    }

    case 'add-component': {
      const componentData = request.changes as ComponentDefinition

      if (componentData.source === 'shadcn' && isShadcnComponent(componentData.id)) {
        try {
          const shadcnDef = await installShadcnComponent(componentData.id, projectRoot)
          if (shadcnDef) {
            const mergedData: ComponentDefinition = {
              ...shadcnDef,
              variants:
                componentData.variants && componentData.variants.length > 0
                  ? componentData.variants
                  : shadcnDef.variants,
              sizes: componentData.sizes && componentData.sizes.length > 0 ? componentData.sizes : shadcnDef.sizes,
            }
            const result = await cm.register(mergedData)
            if (result.success) {
              dsm.updateConfig(result.config)
              cm.updateConfig(result.config)
              pm.updateConfig(result.config)
            }
            return {
              success: result.success,
              message: result.success ? `✨ Auto-installed ${componentData.name}` : result.message,
              modified: result.modified,
            }
          }
        } catch (error) {
          console.error(`Failed to auto-install ${componentData.name}:`, error)
        }
      }

      const result = await cm.register(componentData)
      if (result.success) {
        dsm.updateConfig(result.config)
        cm.updateConfig(result.config)
        pm.updateConfig(result.config)
      }
      return {
        success: result.success,
        message: result.message,
        modified: result.modified,
      }
    }

    case 'modify-component': {
      const componentId = request.target
      const changes = request.changes as Record<string, unknown> | undefined

      const result = await cm.update(componentId, changes ?? {})
      if (result.success) {
        dsm.updateConfig(result.config)
        cm.updateConfig(result.config)
        pm.updateConfig(result.config)
      }
      return {
        success: result.success,
        message: result.message,
        modified: result.modified,
      }
    }

    case 'add-page': {
      const page = request.changes as PageDefinition & {
        pageCode?: string
        pageType?: string
        structuredContent?: Record<string, unknown>
      }

      let finalPageCode: string | undefined
      const aiPageCode = typeof page.pageCode === 'string' && page.pageCode.trim() !== '' ? page.pageCode : undefined

      if (aiPageCode) {
        finalPageCode = aiPageCode
        if (DEBUG) console.log(chalk.dim(`  [pageCode] Using AI-generated pageCode (user content priority)`))
      } else if (page.pageType && page.structuredContent) {
        const templateFn = getTemplateForPageType(page.pageType)
        if (templateFn) {
          try {
            const pageName = (page.name || 'Page').replace(/\s+/g, '')
            const opts: TemplateOptions = {
              route: page.route || `/${page.id || 'page'}`,
              pageName,
            }
            finalPageCode = templateFn(page.structuredContent, opts)
            if (DEBUG) console.log(chalk.dim(`  [template] Used "${page.pageType}" template (no pageCode provided)`))
          } catch {
            if (DEBUG) console.log(chalk.dim(`  [template] Failed for "${page.pageType}"`))
          }
        }
      }

      if (!finalPageCode) {
        console.log(chalk.yellow(`\n⚠️  Page "${page.name || page.id}" has no generated code — it will appear empty.`))
        console.log(chalk.dim('   This usually means the AI did not produce pageCode for this page.'))
        console.log(
          chalk.dim(
            '   Try running: coherent chat "regenerate the ' + (page.name || page.id) + ' page with full content"',
          ),
        )
      }

      const pageForConfig: PageDefinition = {
        ...page,
        sections: page.sections ?? [],
        ...(finalPageCode ? { generatedWithPageCode: true, sections: [] } : {}),
      }
      delete (pageForConfig as Record<string, unknown>).pageCode
      delete (pageForConfig as Record<string, unknown>).pageType
      delete (pageForConfig as Record<string, unknown>).structuredContent
      let result = await pm.create(pageForConfig)
      if (!result.success && result.message?.includes('already exists') && pageForConfig.id) {
        result = await pm.update(pageForConfig.id, pageForConfig)
      }
      if (result.success) {
        dsm.updateConfig(result.config)
        cm.updateConfig(result.config)
        pm.updateConfig(result.config)
        if (finalPageCode) {
          const neededIds = extractComponentIdsFromCode(finalPageCode)
          const { installed } = await ensureComponentsInstalled(neededIds, cm, dsm, pm, projectRoot)
          const config = dsm.getConfig()
          for (const id of installed) {
            await regenerateComponent(id, config, projectRoot)
          }
          if (installed.length > 0) {
            result.modified = [...result.modified, ...installed.map(id => `component:${id}`)]
          }
          const route = page.route || `/${page.id || 'page'}`
          const isAuth = isAuthRoute(route) || isAuthRoute(page.name || page.id || '')
          if (isAuth) {
            await ensureAuthRouteGroup(projectRoot)
          }
          const filePath = routeToFsPath(projectRoot, route, isAuth)
          await mkdir(dirname(filePath), { recursive: true })
          const { fixedCode, fixes: postFixes } = await validateAndFixGeneratedCode(projectRoot, finalPageCode, {
            isPage: true,
          })
          let codeToWrite = fixedCode
          const { code: autoFixed, fixes: autoFixes } = await autoFixCode(codeToWrite)
          codeToWrite = autoFixed
          const { code: spaFixed, fixed: spaWasFixed } = detectAndFixSpaHomePage(codeToWrite, route)
          if (spaWasFixed) {
            codeToWrite = spaFixed
            autoFixes.push('replaced SPA-style home page with redirect to /dashboard')
          }
          const { code: layoutStripped, stripped } = stripInlineLayoutElements(codeToWrite)
          codeToWrite = layoutStripped
          if (!isMarketingRoute(route)) {
            const { code: normalized, fixed: wrapperFixed } = normalizePageWrapper(codeToWrite)
            if (wrapperFixed) {
              codeToWrite = normalized
              autoFixes.push('normalized page wrapper to standard spacing')
            }
          }
          const allFixes = [...postFixes, ...autoFixes]
          if (stripped.length > 0) allFixes.push(`stripped inline ${stripped.join(', ')} (layout owns these)`)
          if (allFixes.length > 0) {
            console.log(chalk.dim('  🔧 Post-generation fixes:'))
            allFixes.forEach(f => console.log(chalk.dim(`     ${f}`)))
          }
          await writeFile(filePath, codeToWrite)

          const pageIdx = dsm.getConfig().pages.findIndex(p => p.id === page.id)
          if (pageIdx !== -1) {
            const cfg = dsm.getConfig()
            ;(cfg.pages[pageIdx] as any).pageAnalysis = analyzePageCode(codeToWrite)
            dsm.updateConfig(cfg)
            cm.updateConfig(cfg)
            pm.updateConfig(cfg)
          }

          const manifestForAudit = await loadManifest(projectRoot)
          await warnInlineDuplicates(projectRoot, page.name || page.id || route.slice(1), codeToWrite, manifestForAudit)

          const relFilePath = routeToRelPath(route, isAuth)
          printPostGenerationReport({
            action: 'created',
            pageTitle: page.name || page.id || 'Page',
            filePath: relFilePath,
            code: codeToWrite,
            projectRoot,
            route,
            postFixes: postFixes,
            layoutShared: manifestForAudit.shared.filter(c => c.type === 'layout'),
            allShared: manifestForAudit.shared,
          })

          const validRoutes = dsm.getConfig().pages.map((p: any) => p.route)
          const issues = validatePageQuality(codeToWrite, validRoutes)
          const errors = issues.filter(i => i.severity === 'error')

          if (errors.length >= 5 && aiProvider) {
            console.log(
              chalk.yellow(`\n🔄 ${errors.length} quality errors — attempting AI fix for ${page.name || page.id}...`),
            )
            try {
              const ai = await createAIProvider(aiProvider)
              if (ai.editPageCode) {
                const errorList = errors.map(e => `Line ${e.line}: [${e.type}] ${e.message}`).join('\n')
                const instruction = `Fix these quality issues:\n${errorList}\n\nRules:\n- Replace raw Tailwind colors (bg-emerald-500, text-zinc-400, etc.) with semantic tokens (bg-primary, text-muted-foreground, bg-muted, etc.)\n- Ensure heading hierarchy (h1 → h2 → h3, no skipping)\n- Add Label components for form inputs\n- Keep all existing functionality and layout intact`
                const fixedCode = await ai.editPageCode(codeToWrite, instruction, page.name || page.id || 'Page')
                if (fixedCode && fixedCode.length > 100 && /export\s+default/.test(fixedCode)) {
                  const recheck = validatePageQuality(fixedCode, validRoutes)
                  const recheckErrors = recheck.filter(i => i.severity === 'error')
                  if (recheckErrors.length < errors.length) {
                    codeToWrite = fixedCode
                    await writeFile(filePath, codeToWrite)
                    console.log(chalk.green(`   ✔ Quality fix: ${errors.length} → ${recheckErrors.length} errors`))
                  }
                }
              }
            } catch {
              /* retry failed, keep original */
            }
          }

          const report = formatIssues(issues)
          if (report) {
            console.log(chalk.yellow(`\n🔍 Quality check for ${page.name || page.id}:`))
            console.log(chalk.dim(report))
          }

          const consistency = checkDesignConsistency(codeToWrite)
          if (consistency.length > 0) {
            console.log(chalk.yellow(`\n🎨 Design consistency for ${page.name || page.id}:`))
            consistency.forEach(w => console.log(chalk.dim(`   ⚠ [${w.type}] ${w.message}`)))
          }
        }
      }
      return {
        success: result.success,
        message: result.message,
        modified: result.modified,
      }
    }

    case 'update-page': {
      const pageId = request.target
      const changes = request.changes as Record<string, unknown> | undefined
      const instruction =
        originalMessage || (typeof changes?.instruction === 'string' ? (changes.instruction as string) : undefined)
      let resolvedPageCode =
        typeof changes?.pageCode === 'string' && (changes.pageCode as string).trim() !== ''
          ? (changes.pageCode as string)
          : undefined

      if (DEBUG && instruction) console.log(chalk.dim(`  [update-page] instruction: ${instruction.slice(0, 120)}...`))
      if (DEBUG && resolvedPageCode)
        console.log(chalk.dim(`  [update-page] has pageCode (${resolvedPageCode.length} chars)`))

      const configChanges = { ...changes } as Record<string, unknown>
      delete configChanges.pageCode
      delete configChanges.pageType
      delete configChanges.structuredContent
      delete configChanges.instruction

      const result = await pm.update(pageId, configChanges as Partial<PageDefinition>)
      if (result.success) {
        dsm.updateConfig(result.config)
        cm.updateConfig(result.config)
        pm.updateConfig(result.config)
        const config = dsm.getConfig()
        const pageDef = config.pages.find(
          p => p.id === pageId || p.name?.toLowerCase() === String(pageId).toLowerCase(),
        )
        if (pageDef?.route) {
          const route = pageDef.route
          const isAuth = isAuthRoute(route) || isAuthRoute(pageDef.name || pageDef.id || '')
          const absPath = routeToFsPath(projectRoot, route, isAuth)

          if (!resolvedPageCode && instruction) {
            let currentCode: string | undefined
            try {
              currentCode = await readFile(absPath)
            } catch {
              if (DEBUG) console.log(chalk.dim(`  [update-page] Could not read current file at ${absPath}`))
            }
            if (currentCode) {
              const ai = await createAIProvider(aiProvider ?? 'auto')
              if (ai.editPageCode) {
                console.log(chalk.dim('  ✏️  Applying changes to existing page...'))
                const coreRules = CORE_CONSTRAINTS
                const qualityRules = DESIGN_QUALITY
                const contextualRules = selectContextualRules(instruction)
                const existingRoutes = dsm
                  .getConfig()
                  .pages.map((p: any) => p.route)
                  .join(', ')
                const routeRules = `\nEXISTING ROUTES: ${existingRoutes}\nAll internal links MUST point to existing routes. Never link to routes not in this list. Use href="#" for missing targets.\n`
                const pagesCtx = buildExistingPagesContext(dsm.getConfig())
                resolvedPageCode = await ai.editPageCode(
                  currentCode,
                  instruction,
                  pageDef.name || pageDef.id || 'Page',
                  `${coreRules}\n${qualityRules}\n${contextualRules}\n${routeRules}\n${pagesCtx}`,
                )
                if (DEBUG) console.log(chalk.dim(`  [update-page] AI returned ${resolvedPageCode.length} chars`))

                const editIssues = verifyIncrementalEdit(currentCode, resolvedPageCode)
                if (editIssues.length > 0) {
                  console.log(chalk.yellow(`\n⚠ Incremental edit issues for ${pageDef.name || pageDef.id}:`))
                  editIssues.forEach(issue => console.log(chalk.dim(`   [${issue.type}] ${issue.message}`)))
                }
              } else {
                console.log(chalk.yellow('  ⚠ AI provider does not support editPageCode'))
              }
            }
          }

          if (resolvedPageCode) {
            const pageIdx = dsm.getConfig().pages.findIndex(p => p.id === pageDef.id)
            if (pageIdx !== -1) {
              const updatedConfig = dsm.getConfig()
              ;(
                updatedConfig.pages[pageIdx] as PageDefinition & { generatedWithPageCode?: boolean }
              ).generatedWithPageCode = true
              updatedConfig.pages[pageIdx].sections = []
              dsm.updateConfig(updatedConfig)
              cm.updateConfig(updatedConfig)
              pm.updateConfig(updatedConfig)
            }

            const neededIds = extractComponentIdsFromCode(resolvedPageCode)
            const { installed } = await ensureComponentsInstalled(neededIds, cm, dsm, pm, projectRoot)
            const latestConfig = dsm.getConfig()
            for (const id of installed) {
              await regenerateComponent(id, latestConfig, projectRoot)
            }
            if (installed.length > 0) {
              result.modified = [...result.modified, ...installed.map(id => `component:${id}`)]
            }
            await mkdir(dirname(absPath), { recursive: true })
            const { fixedCode, fixes: postFixes } = await validateAndFixGeneratedCode(projectRoot, resolvedPageCode, {
              isPage: true,
            })
            let codeToWrite = fixedCode
            const { code: autoFixed, fixes: autoFixes } = await autoFixCode(codeToWrite)
            codeToWrite = autoFixed
            const { code: spaFixed, fixed: spaWasFixed } = detectAndFixSpaHomePage(codeToWrite, route)
            if (spaWasFixed) {
              codeToWrite = spaFixed
              autoFixes.push('replaced SPA-style home page with redirect to /dashboard')
            }
            const { code: layoutStripped, stripped } = stripInlineLayoutElements(codeToWrite)
            codeToWrite = layoutStripped
            if (!isMarketingRoute(route)) {
              const { code: normalized, fixed: wrapperFixed } = normalizePageWrapper(codeToWrite)
              if (wrapperFixed) {
                codeToWrite = normalized
                autoFixes.push('normalized page wrapper to standard spacing')
              }
            }
            const allFixes = [...postFixes, ...autoFixes]
            if (stripped.length > 0) allFixes.push(`stripped inline ${stripped.join(', ')} (layout owns these)`)
            if (allFixes.length > 0) {
              console.log(chalk.dim('  🔧 Post-generation fixes:'))
              allFixes.forEach(f => console.log(chalk.dim(`     ${f}`)))
            }
            await writeFile(absPath, codeToWrite)

            const updatePageIdx = dsm.getConfig().pages.findIndex(p => p.id === pageDef.id)
            if (updatePageIdx !== -1) {
              const cfg = dsm.getConfig()
              ;(cfg.pages[updatePageIdx] as any).pageAnalysis = analyzePageCode(codeToWrite)
              dsm.updateConfig(cfg)
              cm.updateConfig(cfg)
              pm.updateConfig(cfg)
            }

            const manifestForAudit = await loadManifest(projectRoot)
            await warnInlineDuplicates(
              projectRoot,
              pageDef.name || pageDef.id || route.slice(1),
              codeToWrite,
              manifestForAudit,
            )

            const relFilePath = routeToRelPath(route, isAuth)
            printPostGenerationReport({
              action: 'updated',
              pageTitle: pageDef.name || pageDef.id || 'Page',
              filePath: relFilePath,
              code: codeToWrite,
              projectRoot,
              route,
              postFixes,
              allShared: manifestForAudit.shared,
              layoutShared: manifestForAudit.shared.filter(c => c.type === 'layout'),
            })

            const issues = validatePageQuality(codeToWrite)
            const report = formatIssues(issues)
            if (report) {
              console.log(chalk.yellow(`\n🔍 Quality check for ${pageDef.name || pageDef.id}:`))
              console.log(chalk.dim(report))
            }

            const consistency = checkDesignConsistency(codeToWrite)
            if (consistency.length > 0) {
              console.log(chalk.yellow(`\n🎨 Design consistency for ${pageDef.name || pageDef.id}:`))
              consistency.forEach(w => console.log(chalk.dim(`   ⚠ [${w.type}] ${w.message}`)))
            }
          } else {
            try {
              let code = await readFile(absPath)
              const { code: fixed, fixes } = await autoFixCode(code)
              if (fixes.length > 0) {
                code = fixed
                await writeFile(absPath, code)
                console.log(chalk.dim('  🔧 Auto-fixes applied:'))
                fixes.forEach(f => console.log(chalk.dim(`     ${f}`)))
              }
              const relFilePath = routeToRelPath(route, isAuth)
              const manifest = await loadManifest(projectRoot)
              printPostGenerationReport({
                action: 'updated',
                pageTitle: pageDef.name || pageDef.id || 'Page',
                filePath: relFilePath,
                code,
                projectRoot,
                route,
                allShared: manifest.shared,
                layoutShared: manifest.shared.filter(c => c.type === 'layout'),
              })

              const issues = validatePageQuality(code)
              const report = formatIssues(issues)
              if (report) {
                console.log(chalk.yellow(`\n🔍 Quality check for ${pageDef.name || pageDef.id}:`))
                console.log(chalk.dim(report))
              }
            } catch {
              // file may not exist if update only touched config
            }
          }
        }
      }
      return {
        success: result.success,
        message: result.message,
        modified: result.modified,
      }
    }

    case 'update-navigation': {
      return {
        success: true,
        message: 'Navigation updated',
        modified: ['navigation'],
      }
    }

    default:
      return {
        success: false,
        message: `Unknown modification type: ${(request as any).type}`,
        modified: [],
      }
  }
}
