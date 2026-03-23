/**
 * Chat Command
 *
 * Conversational interface for modifying design system.
 * Parses natural language, applies modifications, and regenerates files.
 */

import chalk from 'chalk'
import ora from 'ora'
import { resolve, relative, join } from 'path'
import { existsSync, readFileSync, mkdirSync, readdirSync } from 'fs'
import {
  DesignSystemManager,
  ComponentManager,
  PageManager,
  CLI_VERSION,
  getTemplateForPageType,
  loadManifest,
  saveManifest,
  updateEntry,
  type ModificationRequest,
  type PageDefinition,
} from '@getcoherent/core'
import { parseModification } from '../agents/modifier.js'
import { isAuthRoute } from '../agents/page-templates.js'
import { ensureAuthRouteGroup } from '../utils/auth-route-group.js'
import { setDefaultDarkTheme, ensureThemeToggle } from '../utils/dark-mode.js'
import { readFile, writeFile, acquireProjectLock } from '../utils/files.js'
import { appendFile } from 'fs/promises'
import { appendRecentChanges, type RecentChange } from '../utils/recent-changes.js'
import { createBackup, logBackupCreated } from '../utils/backup.js'
import { needsGlobalsFix, fixGlobalsCss } from '../utils/fix-globals-css.js'
import { getComponentProvider } from '../providers/index.js'
import {
  installPackages,
  getInstalledPackages,
  extractNpmPackagesFromCode,
  COHERENT_REQUIRED_PACKAGES,
} from '../utils/self-heal.js'

import { validatePageQuality } from '../utils/quality-validator.js'
import { requireProject, loadConfig, routeToFsPath, resolveTargetFlags, AUTH_SYNONYMS } from './chat/utils.js'
import { extractInternalLinks, normalizeRequest, applyDefaults, AUTH_FLOW_PATTERNS } from './chat/request-parser.js'
import { splitGeneratePages, buildSharedComponentsSummary } from './chat/split-generator.js'
import { buildReusePlan, buildReusePlanDirective } from '../utils/reuse-planner.js'
import { inferPageTypeFromRoute } from '../agents/design-constraints.js'
import { savePlan, loadPlan } from './chat/plan-generator.js'
import { applyModification } from './chat/modification-handler.js'
import { regenerateFiles, scanAndInstallSharedDeps, ensurePlanGroupLayouts } from './chat/code-generator.js'
import { takeNavSnapshot, hasNavChanged } from '../utils/nav-snapshot.js'
import { loadHashes, saveHashes, computeFileHash } from '../utils/file-hashes.js'
import { showPreview, getChangeDescription } from './chat/reporting.js'
import { interactiveChat } from './chat/interactive.js'

const DEBUG = process.env.COHERENT_DEBUG === '1'

export async function chatCommand(
  message: string | undefined,
  options: {
    provider?: string
    component?: string
    page?: string
    token?: string
    interactive?: boolean
    newComponent?: string
    type?: string
    _throwOnError?: boolean
  },
) {
  if (options.interactive) {
    return interactiveChat(options, chatCommand)
  }

  const bail = (msg: string): never => {
    if (options._throwOnError) throw new Error(msg)
    process.exit(1)
  }

  if (!message) {
    console.error(chalk.red('\n❌ No message provided. Use: coherent chat "your request"\n'))
    console.log(chalk.dim('   Or use interactive mode: coherent chat -i\n'))
    bail('No message provided')
  }

  const spinner = ora('Processing your request...').start()

  const project = requireProject()
  const projectRoot = project.root
  const configPath = project.configPath

  const migrationGuard = join(projectRoot, '.coherent', 'migration-in-progress')
  if (existsSync(migrationGuard)) {
    spinner.fail('Migration in progress')
    console.error(chalk.red('\n❌ A migration is in progress. Run `coherent migrate --rollback` to undo first.'))
    bail('Migration in progress')
  }

  const validProviders = ['claude', 'openai', 'auto']
  const provider = (options.provider || 'auto').toLowerCase() as 'claude' | 'openai' | 'auto'
  let releaseLock: (() => void) | undefined
  try {
    releaseLock = await acquireProjectLock(projectRoot)

    if (!validProviders.includes(provider)) {
      spinner.fail('Invalid provider')
      console.error(chalk.red(`\n❌ Invalid provider: ${options.provider}`))
      console.log(chalk.dim(`Valid options: ${validProviders.join(', ')}`))
      bail(`Invalid provider: ${options.provider}`)
    }

    spinner.text = 'Loading design system configuration...'
    const config = await loadConfig(configPath)

    if (config.coherentVersion && config.coherentVersion !== CLI_VERSION) {
      spinner.stop()
      console.log(chalk.yellow('\n⚠️  Version mismatch detected\n'))
      console.log(chalk.gray('   Project created with: ') + chalk.white(`v${config.coherentVersion}`))
      console.log(chalk.gray('   Current CLI version: ') + chalk.white(`v${CLI_VERSION}`))
      console.log(chalk.cyan('\n   💡 Run `coherent update` to apply latest changes to your project.\n'))
      console.log(chalk.dim('   Continuing anyway...\n'))
      spinner.start('Loading design system configuration...')
    }

    if (needsGlobalsFix(projectRoot)) {
      spinner.text = 'Fixing globals.css...'
      try {
        fixGlobalsCss(projectRoot, config)
        spinner.succeed('Fixed globals.css')
      } catch {
        spinner.warn('Could not auto-fix globals.css')
      }
      spinner.text = 'Loading design system configuration...'
    }

    const storedHashes = await loadHashes(projectRoot)

    const dsm = new DesignSystemManager(configPath)
    await dsm.load()

    const cm = new ComponentManager(config)
    const pm = new PageManager(config, cm)

    spinner.succeed('Configuration loaded')

    message = await resolveTargetFlags(message!, options, config, projectRoot)

    // --new-component: create a shared component directly
    if (options.newComponent) {
      const componentName = options.newComponent
      spinner.start(`Creating shared component: ${componentName}...`)

      const { createAIProvider } = await import('../utils/ai-provider.js')
      const { generateSharedComponent } = await import('@getcoherent/core')
      const { autoFixCode } = await import('../utils/quality-validator.js')
      const { extractPropsInterface, extractDependencies } = await import('../utils/component-extractor.js')

      const aiProvider = await createAIProvider((provider ?? 'auto') as 'claude' | 'openai' | 'auto')
      const prompt = `Generate a React component called "${componentName}". Description: ${message}.
Use shadcn/ui components and Tailwind CSS semantic tokens. Export the component as a named export.
Include a TypeScript props interface.
Return JSON: { "requests": [{ "type": "add-page", "changes": { "name": "${componentName}", "pageCode": "...full TSX..." } }] }`

      const raw = await aiProvider.parseModification(prompt)
      const requests = Array.isArray(raw) ? raw : (raw?.requests ?? [])
      const codeMatch = (requests as Array<{ changes?: { pageCode?: string } }>).find(
        r => (r.changes as Record<string, unknown>)?.pageCode,
      )
      const rawCode = (codeMatch?.changes?.pageCode as string) || ''
      if (!rawCode) {
        spinner.fail(`Could not generate component ${componentName}`)
        releaseLock?.()
        return
      }
      const { code: fixedCode } = await autoFixCode(rawCode)

      const props = extractPropsInterface(fixedCode)
      const deps = extractDependencies(fixedCode)
      const componentType = (options.type as string) || 'section'

      const genResult = await generateSharedComponent(projectRoot, {
        name: componentName,
        type: componentType as 'layout' | 'navigation' | 'data-display' | 'form' | 'feedback' | 'section' | 'widget',
        code: fixedCode,
        description: message,
        propsInterface: props ?? undefined,
        dependencies: deps,
        source: 'manual',
      })

      if (!options.type) {
        try {
          const { classifyComponents } = await import('../utils/ai-classifier.js')
          const classifications = await classifyComponents(
            [{ name: componentName, signature: props || componentName }],
            async p => JSON.stringify(await aiProvider.generateJSON('You are a component classifier.', p)),
          )
          if (classifications.length > 0) {
            let manifest = await loadManifest(projectRoot)
            manifest = updateEntry(manifest, genResult.id, {
              type: classifications[0].type as
                | 'layout'
                | 'navigation'
                | 'data-display'
                | 'form'
                | 'feedback'
                | 'section'
                | 'widget',
              description: classifications[0].description || message,
            })
            await saveManifest(projectRoot, manifest)
          }
        } catch {
          // classification is best-effort
        }
      }

      spinner.succeed(`Created ${genResult.name} (${genResult.id}) at ${genResult.file}`)
      releaseLock?.()
      return
    }

    // Dark/light mode shortcut intents
    const isPageGenRequest =
      /\bpages?\s*[:)]/i.test(message) || /\bcreate\b.*\bpage/i.test(message) || message.length > 200
    if (!isPageGenRequest) {
      if (/switch to dark mode|default to dark|make.*dark.*(default|theme)|dark theme/i.test(message)) {
        spinner.start('Setting default theme to dark...')
        const done = await setDefaultDarkTheme(projectRoot)
        spinner.stop()
        if (done) {
          console.log(chalk.green('\n✅ Default theme set to dark. Reload the app to see changes.\n'))
        } else {
          console.log(chalk.yellow('\n⚠️  Could not update layout (app/layout.tsx not found).\n'))
        }
        return
      }
      if (/switch to light mode|default to light|make.*light.*(default|theme)|light theme/i.test(message)) {
        spinner.start('Setting default theme to light...')
        const layoutPath = resolve(projectRoot, 'app/layout.tsx')
        try {
          let layout = await readFile(layoutPath)
          layout = layout.replace(/className="dark"/, '')
          await writeFile(layoutPath, layout)
          const cfg = dsm.getConfig()
          if (cfg.theme) cfg.theme.defaultMode = 'light'
          dsm.updateConfig(cfg)
          dsm.save()
          spinner.stop()
          console.log(chalk.green('\n✅ Default theme set to light. Reload the app to see changes.\n'))
        } catch {
          spinner.stop()
          console.log(chalk.yellow('\n⚠️  Could not update layout (app/layout.tsx not found).\n'))
        }
        return
      }
      if (/add dark mode toggle|dark mode toggle|theme toggle/i.test(message)) {
        spinner.start('Adding theme toggle...')
        try {
          const { created, id } = await ensureThemeToggle(projectRoot)
          spinner.stop()
          console.log(
            chalk.green(
              `\n✅ ${created ? `Created ${id} (ThemeToggle) and added to layout` : 'ThemeToggle already present; layout updated'}.\n`,
            ),
          )
        } catch (e) {
          spinner.fail('Failed to add theme toggle')
          if (e instanceof Error) console.error(chalk.red('\n❌ ' + e.message + '\n'))
        }
        return
      }
    }

    // Parse modification request
    spinner.start('Parsing your request...')
    let manifest = await loadManifest(project.root)

    const validShared = manifest.shared.filter(s => {
      const fp = resolve(project.root, s.file)
      return existsSync(fp)
    })
    if (validShared.length !== manifest.shared.length) {
      const cleaned = manifest.shared.length - validShared.length
      manifest = { ...manifest, shared: validShared }
      await saveManifest(project.root, manifest)
      if (DEBUG) {
        console.log(chalk.dim(`[pre-gen] Cleaned ${cleaned} orphaned component(s) from manifest`))
      }
    }

    const sharedComponentsSummary = buildSharedComponentsSummary(manifest)
    if (DEBUG && sharedComponentsSummary) {
      console.log(chalk.dim('[add-page] sharedComponentsSummary in prompt:\n' + sharedComponentsSummary))
    }

    let requests: ModificationRequest[]
    let uxRecommendations: string | undefined

    const SPLIT_THRESHOLD = 4
    const parseOpts = { sharedComponentsSummary, projectRoot }
    const modCtx = { config: dsm.getConfig(), componentManager: cm }

    const multiPageHint =
      /\b(pages?|sections?)\s*[:]\s*\w/i.test(message) ||
      (
        message.match(
          /\b(?:registration|about|catal|account|contact|pricing|dashboard|settings|login|sign.?up|blog|portfolio|features)\b/gi,
        ) || []
      ).length >= SPLIT_THRESHOLD

    if (multiPageHint) {
      try {
        const splitResult = await splitGeneratePages(spinner, message, modCtx, provider, parseOpts)
        requests = splitResult.requests
        if (splitResult.plan && projectRoot) {
          savePlan(projectRoot, splitResult.plan)
          await ensurePlanGroupLayouts(projectRoot, splitResult.plan, storedHashes, dsm.getConfig())
        }
        uxRecommendations = undefined
      } catch {
        spinner.warn('Split generation encountered an issue — trying page-by-page...')
        try {
          const planResult = await parseModification(message, modCtx, provider, { ...parseOpts, planOnly: true })
          const pageReqs = planResult.requests.filter((r: ModificationRequest) => r.type === 'add-page')
          requests = []
          for (let i = 0; i < pageReqs.length; i++) {
            const page = pageReqs[i].changes as Record<string, unknown>
            const pageName = (page.name as string) || 'page'
            const pageRoute = (page.route as string) || '/'
            spinner.start(`Generating page ${i + 1}/${pageReqs.length}: ${pageName}...`)
            try {
              const single = await parseModification(
                `Create ONE page called "${pageName}" at route "${pageRoute}". Context: ${message}. Generate complete pageCode for this single page only.`,
                modCtx,
                provider,
                parseOpts,
              )
              const codePage = single.requests.find((r: ModificationRequest) => r.type === 'add-page')
              if (codePage) requests.push(codePage)
              else requests.push(pageReqs[i])
            } catch {
              spinner.warn(`Could not generate ${pageName} — skipped`)
              requests.push(pageReqs[i])
            }
          }
          spinner.succeed(
            `Generated ${requests.filter(r => (r.changes as Record<string, unknown>)?.pageCode).length}/${pageReqs.length} pages with full code`,
          )
          uxRecommendations = undefined
        } catch {
          spinner.fail('Could not generate pages — try a simpler request or generate one page at a time')
          return
        }
      }
    } else {
      let reusePlanDirective: string | undefined
      try {
        const singlePageManifest = await loadManifest(projectRoot)
        if (singlePageManifest.shared.length > 0) {
          const reusePlan = buildReusePlan({
            pageName: 'page',
            pageType: inferPageTypeFromRoute('/') as 'marketing' | 'app' | 'auth',
            sections: [],
            manifest: singlePageManifest,
            existingPageCode: {},
            userRequest: message,
          })
          reusePlanDirective = buildReusePlanDirective(reusePlan) || undefined
        }
      } catch {
        /* graceful degradation */
      }

      try {
        const result = await parseModification(message, modCtx, provider, { ...parseOpts, reusePlanDirective })
        requests = result.requests
        uxRecommendations = result.uxRecommendations

        const pagesWithoutCode = requests.filter(
          r => r.type === 'add-page' && !(r.changes as Record<string, unknown>)?.pageCode,
        )
        if (pagesWithoutCode.length >= SPLIT_THRESHOLD) {
          spinner.text = 'Generating individual pages for better quality...'
          for (let i = 0; i < pagesWithoutCode.length; i++) {
            const page = pagesWithoutCode[i].changes as Record<string, unknown>
            const pageName = (page.name as string) || (page.id as string) || 'page'
            spinner.text = `Generating page ${i + 1}/${pagesWithoutCode.length}: ${pageName}...`
            try {
              const single = await parseModification(
                `Create a page called "${pageName}" at route "${page.route || '/' + (page.id || pageName.toLowerCase())}". ${message}. Generate complete pageCode for this ONE page only.`,
                modCtx,
                provider,
                parseOpts,
              )
              const codePage = single.requests.find((r: ModificationRequest) => r.type === 'add-page')
              if (codePage) {
                const idx = requests.indexOf(pagesWithoutCode[i])
                if (idx !== -1) requests[idx] = codePage
              }
            } catch {
              /* keep plan-only version */
            }
          }
        }
      } catch (firstError: any) {
        const isTruncated = firstError?.code === 'RESPONSE_TRUNCATED'
        const isJsonError =
          firstError?.message?.includes('Unterminated string') ||
          firstError?.message?.includes('Unexpected end of JSON') ||
          firstError?.message?.includes('Unexpected token')
        if (isTruncated || isJsonError) {
          spinner.warn('Response too large — splitting into smaller requests...')
          try {
            const splitResult = await splitGeneratePages(spinner, message, modCtx, provider, parseOpts)
            requests = splitResult.requests
            if (splitResult.plan && projectRoot) {
              savePlan(projectRoot, splitResult.plan)
              await ensurePlanGroupLayouts(projectRoot, splitResult.plan, storedHashes, dsm.getConfig())
            }
            uxRecommendations = undefined
          } catch {
            throw firstError
          }
        } else {
          throw firstError
        }
      }
    }

    if (requests.length === 0) {
      spinner.fail('No modifications found in your request')
      console.log(chalk.yellow('\n💡 Try being more specific, e.g.:'))
      console.log(chalk.dim('  - "make buttons blue"'))
      console.log(chalk.dim('  - "add a pricing page"'))
      console.log(chalk.dim('  - "change primary color to green"'))
      return
    }

    spinner.succeed(`Parsed ${requests.length} modification(s)`)

    let normalizedRequests = requests.map(req => applyDefaults(req))

    normalizedRequests = normalizedRequests
      .map(req => {
        const result = normalizeRequest(req, dsm.getConfig())
        if ('error' in result) {
          console.log(chalk.yellow(`  ⚠ Skipped: ${result.error}`))
          return null
        }
        if (result.type !== req.type) {
          console.log(chalk.dim(`  ℹ Adjusted: ${req.type} → ${result.type} (target: ${req.target})`))
        }
        return result
      })
      .filter((r): r is ModificationRequest => r !== null)

    if (normalizedRequests.length === 0) {
      spinner.fail('All modifications were unrecoverable')
      return
    }

    // Pre-flight component check — Phase 1: Collect all needed component IDs across all pages
    const pageRequests = normalizedRequests.filter(
      (r): r is ModificationRequest & { type: 'add-page' } => r.type === 'add-page',
    )
    const preflightInstalledIds: string[] = []
    const allNpmImportsFromPages = new Set<string>()
    const allNeededComponentIds = new Set<string>()

    for (const pageRequest of pageRequests) {
      const page = pageRequest.changes as PageDefinition & {
        sections?: Array<{ componentId?: string; props?: { fields?: Array<{ component?: string }> } }>
        pageCode?: string
      }

      page.sections?.forEach(
        (section: { componentId?: string; props?: { fields?: Array<{ component?: string }> } }) => {
          if (section.componentId) {
            allNeededComponentIds.add(section.componentId)
          }
          if (section.props?.fields && Array.isArray(section.props.fields)) {
            section.props.fields.forEach((field: { component?: string }) => {
              if (field.component) {
                allNeededComponentIds.add(field.component)
              }
            })
          }
        },
      )
      if (typeof page.pageCode === 'string' && page.pageCode.trim() !== '') {
        const importMatches = page.pageCode.matchAll(/@\/components\/ui\/([a-z0-9-]+)/g)
        for (const m of importMatches) {
          if (m[1]) allNeededComponentIds.add(m[1])
        }
        extractNpmPackagesFromCode(page.pageCode).forEach(p => allNpmImportsFromPages.add(p))
      }

      const pageAny = page as Record<string, unknown>
      if (pageAny.pageType && pageAny.structuredContent) {
        const tmplFn = getTemplateForPageType(pageAny.pageType as string)
        if (tmplFn) {
          try {
            const preview = tmplFn(pageAny.structuredContent as Record<string, unknown>, {
              route: page.route || '/preview',
              pageName: (page.name || 'Page').replace(/\s+/g, ''),
            })
            const tmplImports = preview.matchAll(/@\/components\/ui\/([a-z0-9-]+)/g)
            for (const m of tmplImports) {
              if (m[1]) allNeededComponentIds.add(m[1])
            }
            extractNpmPackagesFromCode(preview).forEach(p => allNpmImportsFromPages.add(p))
          } catch {
            /* template generation failed — will retry in applyModification */
          }
        }
      }

      if (DEBUG) {
        console.log(chalk.gray(`\n[DEBUG] Pre-flight analysis for page "${page.name || page.route}": `))
        console.log(chalk.gray(`  Page sections: ${page.sections?.length || 0}`))
        if (page.sections?.[0]?.props?.fields) {
          console.log(chalk.gray(`  First section has ${page.sections[0].props.fields.length} fields`))
          page.sections[0].props.fields.forEach((f: { component?: string }, i: number) => {
            console.log(chalk.gray(`    Field ${i}: component=${f.component}`))
          })
        }
      }
    }

    // Phase 1b: Scan shared component files (header, footer, etc.) for UI dependencies
    if (manifest.shared.length > 0) {
      for (const entry of manifest.shared) {
        try {
          const sharedPath = resolve(projectRoot, entry.file)
          if (existsSync(sharedPath)) {
            const sharedCode = readFileSync(sharedPath, 'utf-8')
            const sharedImports = sharedCode.matchAll(/@\/components\/ui\/([a-z0-9-]+)/g)
            for (const m of sharedImports) {
              if (m[1]) allNeededComponentIds.add(m[1])
            }
          }
        } catch {
          /* shared file unreadable — skip */
        }
      }
    }

    // Phase 2: Single batch install of all missing components
    const INVALID_COMPONENT_IDS = new Set(['ui', 'shared', 'lib', 'utils', 'hooks', 'app', 'components'])
    for (const id of INVALID_COMPONENT_IDS) allNeededComponentIds.delete(id)

    if (DEBUG) {
      console.log(chalk.gray('\n[DEBUG] Pre-flight analysis (consolidated):'))
      console.log(chalk.gray(`  All needed components: ${Array.from(allNeededComponentIds).join(', ')}`))
      console.log('')
    }

    const missingComponents: string[] = []
    for (const componentId of allNeededComponentIds) {
      const isRegistered = !!cm.read(componentId)
      const filePath = join(projectRoot, 'components', 'ui', `${componentId}.tsx`)
      const fileExists = existsSync(filePath)
      if (DEBUG) console.log(chalk.gray(`    Checking ${componentId}: registered=${isRegistered} file=${fileExists}`))
      if (!isRegistered || !fileExists) {
        missingComponents.push(componentId)
      }
    }

    if (missingComponents.length > 0) {
      spinner.stop()
      console.log(chalk.cyan('\n🔍 Pre-flight check: Installing missing components...\n'))
      const provider = getComponentProvider()

      for (const componentId of missingComponents) {
        if (DEBUG) {
          console.log(chalk.gray(`    [DEBUG] Trying to install: ${componentId}`))
          console.log(chalk.gray(`    [DEBUG] provider.has(${componentId}): ${provider.has(componentId)}`))
        }

        if (provider.has(componentId)) {
          try {
            const result = await provider.installComponent(componentId, projectRoot)
            if (DEBUG) console.log(chalk.gray(`    [DEBUG] installComponent result: ${result.success}`))

            if (result.success && result.componentDef) {
              if (!cm.read(componentId)) {
                if (DEBUG)
                  console.log(
                    chalk.gray(`    [DEBUG] Registering ${result.componentDef.id} (${result.componentDef.name})`),
                  )
                const regResult = await cm.register(result.componentDef)
                if (DEBUG) {
                  console.log(
                    chalk.gray(
                      `    [DEBUG] Register result: ${regResult.success ? 'SUCCESS' : 'FAILED'}${!regResult.success && regResult.message ? ` - ${regResult.message}` : ''}`,
                    ),
                  )
                }

                if (regResult.success) {
                  preflightInstalledIds.push(result.componentDef.id)
                  console.log(chalk.green(`   ✨ Auto-installed ${result.componentDef.name} component`))
                  dsm.updateConfig(regResult.config)
                  cm.updateConfig(regResult.config)
                  pm.updateConfig(regResult.config)
                }
              } else {
                preflightInstalledIds.push(result.componentDef.id)
                console.log(chalk.green(`   ✨ Re-installed ${result.componentDef.name} component (file was missing)`))
              }
            }
          } catch (error) {
            console.log(chalk.red(`   ❌ Failed to install ${componentId}:`))
            console.log(chalk.red(`      ${error instanceof Error ? error.message : error}`))
            if (error instanceof Error && error.stack) {
              console.log(chalk.gray(`      ${error.stack.split('\n')[1]}`))
            }
          }
        } else {
          console.log(chalk.yellow(`   ⚠️  Component ${componentId} not available`))
        }
      }
      console.log('')
      spinner.start('Applying modifications...')
    }

    // Pre-flight npm deps
    const installedPkgs = getInstalledPackages(projectRoot)
    const neededPkgs = new Set([...COHERENT_REQUIRED_PACKAGES, ...allNpmImportsFromPages])
    const toInstallNpm = [...neededPkgs].filter(p => !installedPkgs.has(p))
    if (toInstallNpm.length > 0) {
      spinner.stop()
      console.log(chalk.cyan(`\n📦 Auto-installing missing dependencies: ${toInstallNpm.join(', ')}\n`))
      const ok = await installPackages(projectRoot, toInstallNpm)
      if (!ok) console.log(chalk.yellow(`   Run manually: npm install ${toInstallNpm.join(' ')}\n`))
      spinner.start('Applying modifications...')
    }

    // Filter duplicate pre-flight installs
    const preflightComponentIds = new Set(preflightInstalledIds)
    normalizedRequests = normalizedRequests.filter(req => {
      if (req.type === 'add-component') {
        const componentId = (req.changes as Record<string, unknown>)?.id as string | undefined
        if (componentId && preflightComponentIds.has(componentId)) {
          if (DEBUG) {
            console.log(
              chalk.gray(`[DEBUG] Filtered duplicate add-component: ${componentId} (already installed in pre-flight)`),
            )
          }
          return false
        }
      }
      return true
    })

    if (DEBUG && preflightComponentIds.size > 0) {
      console.log(chalk.gray(`[DEBUG] Remaining requests after filtering: ${normalizedRequests.length}`))
    }

    try {
      createBackup(projectRoot)
      if (DEBUG) console.log(chalk.dim('[backup] Created snapshot'))
    } catch {
      // non-critical
    }

    const navBefore = takeNavSnapshot(
      config.navigation?.items?.map(i => ({ label: i.label, href: i.route || `/${i.label.toLowerCase()}` })),
      config.navigation?.type,
    )

    // Apply modifications
    spinner.start('Applying modifications...')
    const results: Array<{ success: boolean; message: string; modified: string[] }> = []

    for (const request of normalizedRequests) {
      const result = await applyModification(request, dsm, cm, pm, projectRoot, provider, message)
      results.push(result)
    }

    // Flip homePagePlaceholder after home page is generated
    for (const request of normalizedRequests) {
      const changes = request.changes as Record<string, unknown>
      if (
        (request.type === 'add-page' || request.type === 'update-page') &&
        changes?.route === '/' &&
        changes?.pageCode
      ) {
        const cfg = dsm.getConfig()
        if (cfg.settings.homePagePlaceholder) {
          cfg.settings.homePagePlaceholder = false
          dsm.updateConfig(cfg)
        }
        break
      }
    }

    // Reuse validation
    try {
      const { validateReuse } = await import('../utils/reuse-validator.js')
      const { inferPageTypeFromRoute } = await import('../agents/design-constraints.js')
      const manifest = await loadManifest(projectRoot)
      const reuseplan = projectRoot ? loadPlan(projectRoot) : null

      if (manifest.shared.length > 0) {
        for (const request of normalizedRequests) {
          if (request.type !== 'add-page') continue
          const changes = request.changes as Record<string, unknown>
          const pageCode = changes?.pageCode as string | undefined
          if (!pageCode) continue

          const route = (changes.route as string) || ''
          const pageType = inferPageTypeFromRoute(route)
          const planned = reuseplan
            ? new Set(reuseplan.sharedComponents.filter(c => c.usedBy.includes(route)).map(c => c.name))
            : undefined
          const warnings = validateReuse(manifest, pageCode, pageType, undefined, planned)

          for (const w of warnings) {
            console.log(chalk.yellow(`  ⚠ ${w.message}`))
          }
        }
      }
    } catch {
      // best-effort
    }

    // Auto-scaffold linked pages
    const currentConfig = dsm.getConfig()
    const autoScaffoldEnabled = currentConfig.settings.autoScaffold === true
    const scaffoldedPages: Array<{ route: string; name: string }> = []

    if (autoScaffoldEnabled) {
      const addedPageRequests = normalizedRequests
        .map((req, i) => ({ req, result: results[i] }))
        .filter(({ req, result }) => req.type === 'add-page' && result.success)

      const allLinkedRoutes = new Set<string>()

      for (const { req } of addedPageRequests) {
        const page = req.changes as PageDefinition & { pageCode?: string; route?: string }
        const route = page.route || `/${page.id || 'page'}`
        const pageFilePath = routeToFsPath(projectRoot, route, false)

        let pageCode = ''
        if (existsSync(pageFilePath)) {
          try {
            pageCode = readFileSync(pageFilePath, 'utf-8')
          } catch {
            /* */
          }
        }

        const codeLinks = extractInternalLinks(pageCode)
        codeLinks.forEach(l => allLinkedRoutes.add(l))

        const authRelated = AUTH_FLOW_PATTERNS[route]
        if (authRelated) authRelated.forEach(l => allLinkedRoutes.add(l))
      }

      const existingRoutes = new Set(currentConfig.pages.map(p => p.route).filter(Boolean))
      const expandedExisting = new Set(existingRoutes)
      for (const route of existingRoutes) {
        const canonical = AUTH_SYNONYMS[route] ?? route
        expandedExisting.add(canonical)
        for (const [syn, can] of Object.entries(AUTH_SYNONYMS)) {
          if (can === canonical) expandedExisting.add(syn)
        }
      }
      const missingRoutes = [...allLinkedRoutes].filter(route => {
        if (expandedExisting.has(route)) return false
        if (existsSync(routeToFsPath(projectRoot, route, false))) return false
        if (existsSync(routeToFsPath(projectRoot, route, true))) return false
        return true
      })

      const SCAFFOLD_AI_LIMIT = 10
      if (missingRoutes.length > 0 && missingRoutes.length <= SCAFFOLD_AI_LIMIT) {
        spinner.stop()
        console.log(chalk.cyan(`\n🔗 Auto-scaffolding ${missingRoutes.length} linked page(s)...`))
        console.log(
          chalk.dim(
            `   (${missingRoutes.length} additional AI call(s) — disable with settings.autoScaffold: false in config)\n`,
          ),
        )

        for (const linkedRoute of missingRoutes) {
          const pageName = linkedRoute
            .slice(1)
            .split('-')
            .map(w => w.charAt(0).toUpperCase() + w.slice(1))
            .join(' ')

          const scaffoldSpinner = ora(`  Creating "${pageName}" (${linkedRoute})...`).start()
          try {
            const { requests: linkedRequests } = await parseModification(
              `add ${pageName} page at route ${linkedRoute}`,
              { config: dsm.getConfig(), componentManager: cm },
              provider,
            )

            let anySuccess = false
            for (const raw of linkedRequests.map(r => applyDefaults(r))) {
              const linkedReq = normalizeRequest(raw, dsm.getConfig())
              if ('error' in linkedReq) {
                scaffoldSpinner.warn(`  Skipped scaffold: ${linkedReq.error}`)
                continue
              }
              const linkedResult = await applyModification(linkedReq, dsm, cm, pm, projectRoot, provider)
              if (linkedResult.success) {
                results.push(linkedResult)
                normalizedRequests.push(linkedReq)
                scaffoldedPages.push({ route: linkedRoute, name: pageName })
                scaffoldSpinner.succeed(`  Created "${pageName}" at ${linkedRoute}`)
                anySuccess = true
              } else {
                scaffoldSpinner.warn(`  Could not create "${pageName}": ${linkedResult.message}`)
              }
            }
            if (!anySuccess && linkedRequests.length === 0) {
              scaffoldSpinner.warn(`  No modifications generated for "${pageName}"`)
            }
          } catch (err) {
            scaffoldSpinner.warn(`  Could not scaffold "${pageName}" (${linkedRoute}) — skipped`)
            if (DEBUG) console.log(chalk.dim(`    ${err instanceof Error ? err.message : 'unknown error'}`))
          }
        }
        console.log('')
        spinner.start('Finalizing...')
      } else if (missingRoutes.length > SCAFFOLD_AI_LIMIT) {
        spinner.stop()
        console.log(
          chalk.yellow(
            `\n⚠ Found ${missingRoutes.length} linked pages — creating placeholder pages (too many for AI generation).`,
          ),
        )
        for (const linkedRoute of missingRoutes) {
          const pageName =
            linkedRoute
              .slice(1)
              .split('-')
              .map(w => w.charAt(0).toUpperCase() + w.slice(1))
              .join(' ') || 'Page'

          const isAuth = isAuthRoute(linkedRoute)
          const filePath = routeToFsPath(projectRoot, linkedRoute, isAuth)
          if (isAuth) await ensureAuthRouteGroup(projectRoot)
          const dir = resolve(filePath, '..')
          if (!existsSync(dir)) {
            mkdirSync(dir, { recursive: true })
          }
          const placeholderCode = `export default function ${pageName.replace(/\s/g, '')}Page() {\n  return (\n    <div className="flex min-h-[60vh] items-center justify-center">\n      <div className="text-center space-y-4">\n        <h1 className="text-3xl font-bold">${pageName}</h1>\n        <p className="text-muted-foreground">This page is under construction.</p>\n      </div>\n    </div>\n  )\n}\n`
          await writeFile(filePath, placeholderCode)
          scaffoldedPages.push({ route: linkedRoute, name: `${pageName} (placeholder)` })
        }
        console.log(
          chalk.cyan(`   Created ${missingRoutes.length} placeholder pages. Use \`coherent chat\` to fill them.\n`),
        )
        spinner.start('Finalizing...')
      }
    }

    // Deferred BROKEN_INTERNAL_LINK validation — after ALL pages exist
    const finalConfig = dsm.getConfig()
    const allRoutes = finalConfig.pages.map((p: { route?: string }) => p.route).filter(Boolean) as string[]

    if (allRoutes.length > 1) {
      const linkIssues: Array<{ page: string; message: string }> = []

      for (const result of results) {
        if (!result.success) continue
        for (const mod of result.modified) {
          if (mod.startsWith('app/') && mod.endsWith('/page.tsx')) {
            try {
              const code = readFileSync(resolve(projectRoot, mod), 'utf-8')
              const issues = validatePageQuality(code, allRoutes).filter(
                (i: { type: string }) => i.type === 'BROKEN_INTERNAL_LINK',
              )
              for (const issue of issues) {
                linkIssues.push({ page: mod, message: (issue as { message: string }).message })
              }
            } catch {
              // file might not exist
            }
          }
        }
      }

      if (linkIssues.length > 0) {
        console.log(chalk.yellow('\n🔗 Broken internal links:'))
        for (const { page, message } of linkIssues) {
          console.log(chalk.dim(`   ${page}: ${message}`))
        }
      }
    }

    const updatedConfig = dsm.getConfig()

    // Auto-detect theme mode
    const darkMatch = /\bdark\s*(theme|mode|background)\b/i.test(message)
    const lightMatch = /\blight\s*(theme|mode|background)\b/i.test(message)
    if (darkMatch || lightMatch) {
      const targetMode = darkMatch ? 'dark' : 'light'
      const latestConfig = dsm.getConfig()
      if (latestConfig.theme.defaultMode !== targetMode) {
        latestConfig.theme.defaultMode = targetMode as 'light' | 'dark'
        dsm.updateConfig(latestConfig)
        if (DEBUG) console.log(chalk.dim(`  [theme] Set defaultMode to "${targetMode}"`))
      }
      const layoutPath = resolve(projectRoot, 'app', 'layout.tsx')
      try {
        let layoutCode = await readFile(layoutPath)
        if (targetMode === 'dark' && !layoutCode.includes('className="dark"')) {
          layoutCode = layoutCode.replace(/<html\s+lang="en"/, '<html lang="en" className="dark"')
          await writeFile(layoutPath, layoutCode)
          console.log(chalk.dim(`  🌙 Applied dark theme to layout`))
        } else if (targetMode === 'light' && layoutCode.includes('className="dark"')) {
          layoutCode = layoutCode.replace(' className="dark"', '')
          await writeFile(layoutPath, layoutCode)
          console.log(chalk.dim(`  ☀️ Applied light theme to layout`))
        }
      } catch {
        // layout might not exist yet
      }
    }

    // Flip initialized flag after first chat
    if (updatedConfig.settings.initialized === false) {
      updatedConfig.settings.initialized = true
      dsm.updateConfig(updatedConfig)
    }

    // Save config
    spinner.text = 'Saving configuration...'
    await dsm.save()
    spinner.succeed('Configuration saved')

    // Regenerate affected files
    const allModified = new Set<string>()
    results.forEach(r => r.modified.forEach(m => allModified.add(m)))
    preflightInstalledIds.forEach(id => allModified.add(`component:${id}`))
    scaffoldedPages.forEach(({ route }) => {
      allModified.add(`page:${route.slice(1) || 'home'}`)
    })

    const navAfter = takeNavSnapshot(
      updatedConfig.navigation?.items?.map(i => ({
        label: i.label,
        href: i.route || `/${i.label.toLowerCase()}`,
      })),
      updatedConfig.navigation?.type,
    )
    const navChanged = hasNavChanged(navBefore, navAfter)

    if (allModified.size > 0) {
      spinner.start('Regenerating affected files...')
      await regenerateFiles(Array.from(allModified), updatedConfig, projectRoot, { navChanged, storedHashes })
      spinner.succeed('Files regenerated')
    }

    const finalDeps = await scanAndInstallSharedDeps(projectRoot)
    if (finalDeps.length > 0) {
      console.log(chalk.dim(`  Auto-installed shared deps: ${finalDeps.join(', ')}`))
    }

    try {
      fixGlobalsCss(projectRoot, updatedConfig)
    } catch {
      /* best-effort */
    }

    // Update file hashes for all written files
    try {
      const updatedHashes = { ...storedHashes }
      const sharedDir = resolve(projectRoot, 'components', 'shared')
      const layoutFile = resolve(projectRoot, 'app', 'layout.tsx')
      const filesToHash = [layoutFile]
      if (existsSync(sharedDir)) {
        for (const f of readdirSync(sharedDir)) {
          if (f.endsWith('.tsx')) filesToHash.push(resolve(sharedDir, f))
        }
      }
      for (const filePath of filesToHash) {
        if (existsSync(filePath)) {
          const rel = relative(projectRoot, filePath)
          updatedHashes[rel] = await computeFileHash(filePath)
        }
      }
      await saveHashes(projectRoot, updatedHashes)
    } catch {
      if (DEBUG) console.log(chalk.dim('[hashes] Could not save file hashes'))
    }

    // Lightweight auto-sync: update manifest with metadata from generated files
    try {
      const { extractPropsInterface, extractDependencies, extractUsageExample } =
        await import('../utils/component-extractor.js')
      let currentManifest = await loadManifest(projectRoot)
      let manifestChanged = false

      for (const entry of currentManifest.shared) {
        const fullPath = resolve(projectRoot, entry.file)
        if (!existsSync(fullPath)) continue
        const code = readFileSync(fullPath, 'utf-8')
        const props = extractPropsInterface(code)
        const deps = extractDependencies(code)

        if ((props && props !== entry.propsInterface) || deps.length !== (entry.dependencies?.length ?? 0)) {
          currentManifest = updateEntry(currentManifest, entry.id, {
            propsInterface: props ?? entry.propsInterface,
            dependencies: deps,
          })
          manifestChanged = true
        }
      }

      const pageFiles = Array.from(allModified).filter(f => f.startsWith('app/') && f.endsWith('page.tsx'))
      for (const pageFile of pageFiles) {
        const fullPath = resolve(projectRoot, pageFile)
        if (!existsSync(fullPath)) continue
        const pageCode = readFileSync(fullPath, 'utf-8')

        for (const entry of currentManifest.shared) {
          const isUsed =
            pageCode.includes(`from '@/components/shared/`) &&
            (pageCode.includes(`{ ${entry.name} }`) || pageCode.includes(`{ ${entry.name},`))
          if (isUsed && !entry.usedIn.includes(pageFile)) {
            currentManifest = updateEntry(currentManifest, entry.id, {
              usedIn: [...entry.usedIn, pageFile],
            })
            manifestChanged = true

            if (!entry.usageExample) {
              const usage = extractUsageExample(pageCode, entry.name)
              if (usage) {
                currentManifest = updateEntry(currentManifest, entry.id, { usageExample: usage })
              }
            }
          }
        }
      }

      if (manifestChanged) {
        await saveManifest(projectRoot, currentManifest)
        if (DEBUG) console.log(chalk.dim('[auto-sync] Manifest updated'))
      }
    } catch {
      if (DEBUG) console.log(chalk.dim('[auto-sync] Skipped'))
    }

    // Record recent changes
    const successfulPairs = normalizedRequests
      .map((request, index) => ({ request, result: results[index] }))
      .filter(({ result }) => result.success)
    if (successfulPairs.length > 0) {
      const changes: RecentChange[] = successfulPairs.map(({ request }) => ({
        type: request.type,
        description: getChangeDescription(request, updatedConfig),
        timestamp: new Date().toISOString(),
      }))
      appendRecentChanges(projectRoot, changes)
    }

    const backupPath = createBackup(projectRoot)
    logBackupCreated(backupPath)

    // Show preview
    spinner.stop()
    const preflightNames = preflightInstalledIds
      .map(id => updatedConfig.components.find(c => c.id === id)?.name)
      .filter(Boolean) as string[]
    showPreview(normalizedRequests, results, updatedConfig, preflightNames)

    if (scaffoldedPages.length > 0) {
      const uniqueScaffolded = [...new Map(scaffoldedPages.map(s => [s.route, s])).values()]
      console.log(chalk.cyan('🔗 Auto-scaffolded linked pages:'))
      uniqueScaffolded.forEach(({ route, name }) => {
        console.log(chalk.white(`   ✨ ${name} → ${route}`))
      })
      console.log('')
    }

    // UX recommendations
    if (uxRecommendations) {
      const recPath = resolve(projectRoot, 'recommendations.md')
      const section = `\n\n---\n\n## ${new Date().toISOString().slice(0, 10)}\n\n${uxRecommendations}\n`
      try {
        if (!existsSync(recPath)) {
          await writeFile(
            recPath,
            '# UX/UI Recommendations\n\nRecommendations are added here when you use `coherent chat` and the AI suggests improvements.\n',
          )
        }
        await appendFile(recPath, section)
        console.log(chalk.cyan('\n📋 UX Recommendations:'))
        for (const line of uxRecommendations.split('\n').filter(Boolean)) {
          console.log(chalk.dim(`   ${line}`))
        }
        console.log(chalk.dim('   → Saved to /design-system/docs/recommendations'))
      } catch (e) {
        console.log(
          chalk.yellow('\n⚠️  Could not write recommendations.md: ' + (e instanceof Error ? e.message : String(e))),
        )
        console.log(chalk.dim('Recommendations:\n') + uxRecommendations)
      }
    }
  } catch (error) {
    spinner.fail('Chat command failed')
    console.error(chalk.red('\n✖ Chat command failed'))

    const zodError = error as { issues?: Array<{ path: (string | number)[]; message: string }> }
    const issues =
      zodError.issues || (error as { errors?: Array<{ path: (string | number)[]; message: string }> }).errors
    if (issues && Array.isArray(issues)) {
      console.log(chalk.yellow('\n⚠️  AI generated incomplete data. Missing or invalid fields:'))
      issues.forEach((err: { path: (string | number)[]; message: string }) => {
        console.log(chalk.gray(`   • ${err.path.join('.')}: ${err.message}`))
      })
      console.log(chalk.cyan('\n💡 Try being more specific, e.g.:'))
      console.log(chalk.white('   coherent chat "add a dashboard page with hero section using Button component"'))
      console.log(chalk.white('   coherent chat "add pricing page"'))
    } else if (error instanceof Error) {
      console.error(chalk.red(error.message))
      if (
        error.message.includes('Unterminated string') ||
        error.message.includes('Unexpected end of JSON') ||
        (error.message.includes('Failed to parse modification') && error.message.includes('JSON'))
      ) {
        console.log(
          chalk.yellow('\n💡 The AI response was too large or contained invalid JSON. Try splitting your request:'),
        )
        console.log(chalk.white('   coherent chat "add dashboard page with stats and recent activity"'))
        console.log(chalk.white('   coherent chat "add account page"'))
        console.log(chalk.white('   coherent chat "add settings page"'))
      } else if (
        error.message.includes('API key not found') ||
        error.message.includes('ANTHROPIC_API_KEY') ||
        error.message.includes('OPENAI_API_KEY')
      ) {
        const isOpenAI = error.message.includes('OpenAI') || (typeof provider !== 'undefined' && provider === 'openai')
        const providerName = isOpenAI ? 'OpenAI' : 'Anthropic Claude'
        const envVar = isOpenAI ? 'OPENAI_API_KEY' : 'ANTHROPIC_API_KEY'
        const url = isOpenAI ? 'https://platform.openai.com' : 'https://console.anthropic.com'

        console.log(chalk.yellow('\n💡 Setup Instructions:'))
        console.log(chalk.dim(`  1. Get your ${providerName} API key from: ${url}`))
        console.log(chalk.dim('  2. Create a .env file in the current directory:'))
        console.log(chalk.cyan(`     echo "${envVar}=your_key_here" > .env`))
        console.log(chalk.dim('  3. Or export it in your shell:'))
        console.log(chalk.cyan(`     export ${envVar}=your_key_here`))

        if (isOpenAI) {
          console.log(chalk.dim('\n  Also ensure "openai" package is installed:'))
          console.log(chalk.cyan('     npm install openai'))
        }
      }
    } else {
      console.error(chalk.red('Unknown error occurred'))
    }
    console.log('')
    if (options._throwOnError) {
      throw error instanceof Error ? error : new Error(String(error))
    }
    process.exit(1)
  } finally {
    releaseLock?.()
  }
}
