import chalk from 'chalk'
import type { ModificationRequest, DesignSystemConfig, ComponentDefinition, PageDefinition } from '@getcoherent/core'

export function extractImportsFrom(code: string, fromPath: string): string[] {
  const escaped = fromPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const regex = new RegExp(`import\\s*\\{([^}]+)\\}\\s*from\\s*['"\`]${escaped}[^'"\`]*['"\`]`, 'g')
  const results: string[] = []
  let match: RegExpExecArray | null
  while ((match = regex.exec(code)) !== null) {
    const names = match[1]
      .split(',')
      .map(s =>
        s
          .trim()
          .replace(/\s+as\s+.*$/, '')
          .trim(),
      )
      .filter(Boolean)
    results.push(...names)
  }
  return [...new Set(results)]
}

export interface PostGenerationReportOpts {
  action: 'created' | 'updated'
  pageTitle: string
  filePath: string
  code: string
  projectRoot: string
  route?: string
  postFixes?: string[]
  layoutShared?: Array<{ id: string; name: string; type: string }>
  allShared?: Array<{ id: string; name: string; type: string }>
}

export function printPostGenerationReport(opts: PostGenerationReportOpts): void {
  const { action, pageTitle, filePath, code, route, postFixes = [], layoutShared = [], allShared = [] } = opts
  const uiComponents = extractImportsFrom(code, '@/components/ui')
  const sharedImportNames = extractImportsFrom(code, '@/components/shared/')
  const inCodeShared = allShared.filter(s => sharedImportNames.some(n => n === s.name))
  const iconCount = extractImportsFrom(code, 'lucide-react').length
  const hasInstalled = postFixes.some(f => f.startsWith('Installed:'))
  const syntaxStatus =
    postFixes.length > 0
      ? postFixes.some(f => f.includes('metadata'))
        ? 'fixed (escaped metadata quotes) ✔'
        : 'fixed ✔'
      : 'valid ✔'

  console.log(chalk.green(`\n✅ Page "${pageTitle}" ${action} at ${filePath}\n`))
  if (uiComponents.length > 0) {
    console.log(chalk.dim(`  Components:  ${uiComponents.join(', ')} (from @/components/ui)`))
  }
  if (inCodeShared.length > 0) {
    console.log(chalk.dim(`  Shared:      ${inCodeShared.map(s => `${s.id} (${s.name})`).join(', ')}`))
  }
  if (layoutShared.length > 0) {
    console.log(chalk.dim(`  Layout:      ${layoutShared.map(l => `${l.id} (${l.name})`).join(', ')} via layout.tsx`))
  }
  if (iconCount > 0) {
    console.log(chalk.dim(`  Icons:       ${iconCount} from lucide-react`))
  }
  if (hasInstalled) {
    console.log(chalk.dim('  Dependencies: installed ✔'))
  }
  console.log(chalk.dim(`  Syntax:      ${syntaxStatus}`))
  if (route) {
    console.log(chalk.cyan(`\n  Preview: http://localhost:3000${route}`))
  }
  console.log('')
}

export function printSharedComponentReport(opts: {
  id: string
  name: string
  file: string
  instruction?: string
  postFixes?: string[]
}): void {
  const { id, name, file, instruction, postFixes = [] } = opts
  const syntaxStatus = postFixes.length > 0 ? 'fixed ✔' : 'valid ✔'
  console.log(chalk.green(`\n✅ Updated ${id} (${name}) at ${file}\n`))
  if (instruction) {
    const snippet = instruction.length > 60 ? instruction.slice(0, 57) + '...' : instruction
    console.log(chalk.dim(`  Changed:     ${snippet}`))
  }
  console.log(chalk.dim('  Affects:    all pages via layout.tsx'))
  console.log(chalk.dim(`  Syntax:     ${syntaxStatus}`))
  console.log('')
}

export function printLinkSharedReport(opts: {
  sharedId: string
  sharedName: string
  pageTarget: string
  route: string
  postFixes?: string[]
}): void {
  const { sharedId, sharedName, pageTarget, route, postFixes = [] } = opts
  const syntaxStatus = postFixes.length > 0 ? 'fixed ✔' : 'valid ✔'
  console.log(chalk.green(`\n✅ Linked ${sharedId} (${sharedName}) to page "${pageTarget}"\n`))
  console.log(chalk.dim(`  Syntax:     ${syntaxStatus}`))
  console.log(chalk.cyan(`  Preview: http://localhost:3000${route}`))
  console.log('')
}

export function printPromoteAndLinkReport(opts: {
  id: string
  name: string
  file: string
  usedInFiles: string[]
  postFixes?: string[]
}): void {
  const { id, name, file, usedInFiles, postFixes = [] } = opts
  const syntaxStatus = postFixes.length > 0 ? 'fixed ✔' : 'valid ✔'
  console.log(chalk.green(`\n✅ Created ${id} (${name}) at ${file}\n`))
  console.log(chalk.dim(`  Linked to:  ${usedInFiles.length} page(s)`))
  console.log(chalk.dim(`  Syntax:     ${syntaxStatus}`))
  console.log('')
}

export function showPreview(
  requests: ModificationRequest[],
  results: Array<{ success: boolean; message: string; modified: string[] }>,
  config: DesignSystemConfig,
  preflightInstalledNames?: string[],
): void {
  const pairs = requests.map((req, i) => ({ request: req, result: results[i] }))
  const successfulPairs = pairs.filter(({ result }) => result.success)
  const failedPairs = pairs.filter(({ result }) => !result.success)

  const addedPages = successfulPairs.filter(({ request }) => request.type === 'add-page')
  const addedComponents = successfulPairs.filter(
    ({ request }) =>
      request.type === 'add-component' && (request.changes as Record<string, unknown>)?.source === 'shadcn',
  )
  const customComponents = successfulPairs.filter(
    ({ request }) =>
      request.type === 'add-component' && (request.changes as Record<string, unknown>)?.source !== 'shadcn',
  )
  const modifiedComponents = successfulPairs.filter(({ request }) => request.type === 'modify-component')
  const modifiedSharedComponents = successfulPairs.filter(({ request }) => request.type === 'modify-layout-block')
  const modifiedPages = successfulPairs.filter(({ request }) => request.type === 'update-page')
  const tokenChanges = successfulPairs.filter(({ request }) => request.type === 'update-token')

  console.log(chalk.bold.cyan('\n📋 Changes Applied:\n'))

  if (preflightInstalledNames && preflightInstalledNames.length > 0) {
    console.log(chalk.cyan('🔍 Pre-flight check: Installed missing components:'))
    preflightInstalledNames.forEach(name => {
      console.log(chalk.green(`   ✨ Auto-installed ${name}`))
    })
    console.log('')
  }

  if (addedComponents.length > 0) {
    const names = addedComponents.map(({ request }) => (request.changes as ComponentDefinition).name).filter(Boolean)
    console.log(chalk.green('📦 Components:'))
    console.log(chalk.white(`   ✨ Auto-installed: ${names.join(', ')}`))
  }

  if (customComponents.length > 0) {
    const names = customComponents.map(({ request }) => (request.changes as ComponentDefinition).name).filter(Boolean)
    if (addedComponents.length === 0) console.log(chalk.green('📦 Components:'))
    console.log(chalk.white(`   ✨ Created: ${names.join(', ')}`))
  }

  const usedComponentIds = new Set<string>()
  addedPages.forEach(({ request }) => {
    const page = request.changes as PageDefinition
    page.sections?.forEach((s: { componentId?: string }) => {
      if (s.componentId) usedComponentIds.add(s.componentId)
    })
  })
  const newComponentIds = new Set<string>([
    ...addedComponents.map(({ request }) => (request.changes as ComponentDefinition).id),
    ...customComponents.map(({ request }) => (request.changes as ComponentDefinition).id),
  ])
  const reusedIds = [...usedComponentIds].filter(id => !newComponentIds.has(id))

  if (reusedIds.length > 0) {
    if (addedComponents.length === 0 && customComponents.length === 0) console.log(chalk.green('📦 Components:'))
    console.log(chalk.white(`   🔄 Reused: ${reusedIds.join(', ')}`))
  }

  if (addedComponents.length > 0 || customComponents.length > 0 || reusedIds.length > 0) {
    console.log('')
  }

  if (addedPages.length > 0) {
    console.log(chalk.green('📄 Pages Created:'))
    addedPages.forEach(({ request }) => {
      const page = request.changes as PageDefinition
      const route = page.route || '/'
      console.log(chalk.white(`   ✨ ${page.name || 'Page'}`))
      console.log(chalk.gray(`      Route: ${route}`))
      const configPage = config.pages?.find((p: any) => p.id === page.id || p.route === (page.route || '/'))
      const sectionCount = (configPage as any)?.pageAnalysis?.sections?.length ?? page.sections?.length ?? 0
      console.log(chalk.gray(`      Sections: ${sectionCount}`))
    })
    console.log('')
  }

  if (
    modifiedComponents.length > 0 ||
    modifiedSharedComponents.length > 0 ||
    modifiedPages.length > 0 ||
    tokenChanges.length > 0
  ) {
    console.log(chalk.yellow('🔧 Modified:'))
    modifiedComponents.forEach(({ result }) => {
      console.log(chalk.white(`   • ${result.message}`))
    })
    modifiedSharedComponents.forEach(({ result }) => {
      console.log(chalk.white(`   • ${result.message}`))
    })
    modifiedPages.forEach(({ result }) => {
      console.log(chalk.white(`   • ${result.message}`))
    })
    tokenChanges.forEach(({ result }) => {
      console.log(chalk.white(`   • ${result.message}`))
    })
    console.log('')
  }

  if (failedPairs.length > 0) {
    console.log(chalk.red('❌ Failed modifications:'))
    failedPairs.forEach(({ result }) => {
      console.log(chalk.gray(`   ✖ ${result.message}`))
    })
    console.log('')
  }

  const successCount = successfulPairs.length
  const totalCount = results.length
  if (successCount === totalCount) {
    console.log(chalk.green.bold(`✅ Success! ${successCount} modification(s) applied\n`))
  } else {
    console.log(chalk.yellow.bold(`⚠️  Partial success: ${successCount}/${totalCount} modification(s) applied\n`))
  }

  if (addedPages.length > 0) {
    const firstPage = addedPages[0].request.changes as PageDefinition
    const route = firstPage?.route || '/'
    console.log(chalk.cyan("🚀 What's next:\n"))
    console.log(chalk.white('   📺 View in browser:'))
    console.log(chalk.cyan('      coherent preview'))
    console.log(chalk.gray(`      → Opens http://localhost:3000${route}\n`))
    console.log(chalk.white('   🎨 Customize:'))
    console.log(chalk.cyan('      coherent chat "make buttons rounded"'))
    console.log(chalk.cyan(`      coherent chat "add hero section to ${firstPage?.name ?? 'page'}"`))
    console.log('')
  } else if (successCount > 0) {
    console.log(chalk.cyan("🚀 What's next:\n"))
    console.log(chalk.white('   📺 Preview changes:'))
    console.log(chalk.cyan('      coherent preview\n'))
  }
}

export function getChangeDescription(request: ModificationRequest, config: DesignSystemConfig): string {
  switch (request.type) {
    case 'add-page': {
      const page = request.changes as PageDefinition
      return `Added ${page.name || 'page'} page`
    }
    case 'add-component': {
      const comp = request.changes as ComponentDefinition
      return `Added ${comp.name || 'component'} component`
    }
    case 'update-token':
      return `Updated ${request.target || 'token'}`
    case 'modify-component': {
      const comp = config.components.find(c => c.id === request.target)
      return `Modified ${comp?.name || request.target} component`
    }
    case 'modify-layout-block':
      return `Modified shared component ${request.target}`
    case 'link-shared': {
      const ch = request.changes as { sharedIdOrName?: string }
      return `Linked ${ch?.sharedIdOrName ?? request.target} to page`
    }
    case 'promote-and-link': {
      const ch = request.changes as { componentName?: string }
      return `Promoted ${ch?.componentName ?? request.target} to shared and linked`
    }
    case 'update-page': {
      const page = config.pages.find(p => p.id === request.target)
      return `Updated ${page?.name || request.target} page`
    }
    case 'update-navigation':
      return 'Updated navigation'
    default:
      return request.type
  }
}
