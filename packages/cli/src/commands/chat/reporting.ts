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
  groupLayout?: string
}

export function printPostGenerationReport(opts: PostGenerationReportOpts): void {
  // Compact one-liner per page. Components/Icons/Shared/Layout/Syntax/Preview
  // were noise — the manifest, the imports in the file, and the lack of an
  // error already convey them. Everything important rides on the same line:
  // verb glyph, page name, route, and an optional fix count when auto-fix
  // touched the output.
  const { action, pageTitle, route, postFixes = [] } = opts
  const verb = action === 'created' ? '✓' : '↻'
  const routePart = route ? `  ${chalk.dim(route)}` : ''
  const fixPart = postFixes.length > 0 ? chalk.dim(`  ↻ ${postFixes.length} auto-fix`) : ''
  console.log(`  ${chalk.green(verb)} ${chalk.white(pageTitle)}${routePart}${fixPart}`)
}

export function printSharedComponentReport(opts: {
  id: string
  name: string
  file: string
  instruction?: string
  postFixes?: string[]
}): void {
  const { id, name, file, postFixes = [] } = opts
  const fixPart = postFixes.length > 0 ? chalk.dim(`  ↻ ${postFixes.length} auto-fix`) : ''
  console.log(`  ${chalk.green('↻')} ${chalk.white(`${id} ${name}`)}  ${chalk.dim(file)}${fixPart}`)
}

export function printLinkSharedReport(opts: {
  sharedId: string
  sharedName: string
  pageTarget: string
  route: string
  postFixes?: string[]
}): void {
  const { sharedId, sharedName, pageTarget, postFixes = [] } = opts
  const fixPart = postFixes.length > 0 ? chalk.dim(`  ↻ ${postFixes.length} auto-fix`) : ''
  console.log(
    `  ${chalk.green('↻')} ${chalk.dim('linked')} ${chalk.white(`${sharedId} ${sharedName}`)} ${chalk.dim('→')} ${chalk.white(pageTarget)}${fixPart}`,
  )
}

export function printPromoteAndLinkReport(opts: {
  id: string
  name: string
  file: string
  usedInFiles: string[]
  postFixes?: string[]
}): void {
  const { id, name, file, usedInFiles, postFixes = [] } = opts
  const fixPart = postFixes.length > 0 ? chalk.dim(`  ↻ ${postFixes.length} auto-fix`) : ''
  console.log(
    `  ${chalk.green('✓')} ${chalk.white(`${id} ${name}`)}  ${chalk.dim(file)}  ${chalk.dim(`(${usedInFiles.length} page${usedInFiles.length === 1 ? '' : 's'})`)}${fixPart}`,
  )
}

export function showPreview(
  requests: ModificationRequest[],
  results: Array<{ success: boolean; message: string; modified: string[] }>,
  config: DesignSystemConfig,
  preflightInstalledNames?: string[],
): void {
  // Compact summary. Per-page lines were already streamed during execution
  // (printPostGenerationReport), and pre-flight component installs were
  // already streamed in chat.ts, so this block only emits signal the user
  // couldn't see in the stream: "Modified" entries (token / component / page
  // edits as opposed to creates), failures, the success count, and a single
  // "Next: coherent preview" pointer.
  const pairs = requests.map((req, i) => ({ request: req, result: results[i] }))
  const successfulPairs = pairs.filter(({ result }) => result.success)
  const failedPairs = pairs.filter(({ result }) => !result.success)

  const modifiedAll = successfulPairs.filter(({ request }) =>
    ['modify-component', 'modify-layout-block', 'update-page', 'update-token'].includes(request.type),
  )
  if (modifiedAll.length > 0) {
    console.log('')
    for (const { result } of modifiedAll) {
      console.log(`  ${chalk.green('↻')} ${chalk.white(result.message)}`)
    }
  }

  if (failedPairs.length > 0) {
    console.log('')
    for (const { result } of failedPairs) {
      console.log(`  ${chalk.red('✖')} ${chalk.dim(result.message)}`)
    }
  }

  const successCount = successfulPairs.length
  const totalCount = results.length
  console.log('')
  if (successCount === totalCount) {
    console.log(
      `  ${chalk.green('✓')} ${chalk.dim(`${successCount} modification${successCount === 1 ? '' : 's'} applied`)}`,
    )
  } else {
    console.log(`  ${chalk.yellow('⚠')} ${chalk.dim(`${successCount}/${totalCount} modifications applied`)}`)
  }

  // Next: single CTA. The wider command list lives in `coherent --help` —
  // first-time chat output should not enumerate it.
  if (successCount > 0) {
    console.log('')
    console.log(chalk.bold('  Next:'))
    console.log(`    ${chalk.green('coherent preview')}   ${chalk.dim('→ http://localhost:3000')}`)
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
