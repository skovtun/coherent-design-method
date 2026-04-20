/**
 * Report Issue Command
 *
 * Builds a GitHub issue pre-filled with project context so users can file
 * bugs without manually copying versions, page paths, and project shape.
 *
 * Why a dedicated command: reporting "the chart on Dashboard renders as an
 * empty muted box" via free-form GitHub form loses the metadata that makes
 * triage fast — CLI version, project version, active design constraints
 * version, which page, which plan, whether the project was upgraded.
 *
 * What it does:
 *   1. Reads design-system.config.ts for project version + pages
 *   2. Reads CLI version from @getcoherent/core's CLI_VERSION export
 *   3. Accepts optional --page, --screenshot, --title, --body flags
 *   4. Constructs a pre-filled URL using github.com/new/issue query params
 *   5. Opens the URL in the default browser (and echoes it to stdout)
 *
 * The screenshot path is referenced in the body — users must upload manually
 * after the browser opens (GitHub doesn't accept attachments via URL).
 */

import chalk from 'chalk'
import { existsSync, readFileSync } from 'fs'
import { resolve } from 'path'
import { CLI_VERSION } from '@getcoherent/core'
import { findConfig } from '../utils/find-config.js'

const ISSUE_REPO = 'skovtun/coherent-design-method'

export interface ReportIssueOptions {
  page?: string
  screenshot?: string
  title?: string
  body?: string
  noOpen?: boolean
}

export async function reportIssueCommand(opts: ReportIssueOptions) {
  const project = findConfig()
  const projectVersion = readProjectVersion(project?.root)
  const pages = readProjectPages(project?.root)

  const title = opts.title || buildDefaultTitle(opts.page)
  const body = buildIssueBody({
    projectVersion,
    cliVersion: CLI_VERSION,
    pagePath: opts.page,
    pages,
    screenshot: opts.screenshot,
    extraBody: opts.body,
  })

  const url = buildGitHubIssueURL(ISSUE_REPO, title, body)

  console.log(chalk.cyan('\n📋 Pre-filled issue ready.\n'))
  console.log(chalk.dim('   Title: ') + title)
  console.log(chalk.dim('   Repo:  ') + ISSUE_REPO)
  console.log(chalk.dim('   URL:   ') + url + '\n')

  if (opts.screenshot) {
    console.log(
      chalk.yellow(
        `   ⚠ GitHub does not accept attachments via URL — drag ${opts.screenshot} into the comment field after the page opens.\n`,
      ),
    )
  }

  if (!opts.noOpen) {
    await openInBrowser(url)
  }
}

function readProjectVersion(root: string | undefined): string {
  if (!root) return 'unknown'
  try {
    const configPath = resolve(root, 'design-system.config.ts')
    if (!existsSync(configPath)) return 'unknown'
    const source = readFileSync(configPath, 'utf-8')
    const match = source.match(/coherentVersion\s*:\s*["']([^"']+)["']/)
    return match?.[1] ?? 'unknown'
  } catch {
    return 'unknown'
  }
}

function readProjectPages(root: string | undefined): string[] {
  if (!root) return []
  try {
    const configPath = resolve(root, 'design-system.config.ts')
    if (!existsSync(configPath)) return []
    const source = readFileSync(configPath, 'utf-8')
    const matches = source.match(/route\s*:\s*["']([^"']+)["']/g) || []
    return matches.map(m => m.match(/["']([^"']+)["']/)?.[1] ?? '').filter(Boolean)
  } catch {
    return []
  }
}

function buildDefaultTitle(page: string | undefined): string {
  return page ? `[bug] Issue on ${page} page` : '[bug] Describe the issue here'
}

export function buildIssueBody(input: {
  projectVersion: string
  cliVersion: string
  pagePath?: string
  pages: string[]
  screenshot?: string
  extraBody?: string
}): string {
  const lines: string[] = []
  lines.push('## Describe the issue', '', '<!-- What did you expect? What did you see? -->', '')
  if (input.extraBody) {
    lines.push(input.extraBody, '')
  }

  if (input.pagePath) {
    lines.push('## Page', `\`${input.pagePath}\``, '')
  }

  if (input.screenshot) {
    lines.push(
      '## Screenshot',
      `<!-- Drag this file into the comment to upload: ${input.screenshot} -->`,
      '_(attach after opening)_',
      '',
    )
  }

  lines.push(
    '## Environment',
    `- **Coherent CLI**: v${input.cliVersion}`,
    `- **Project version**: v${input.projectVersion}`,
    `- **Project pages**: ${input.pages.length} (${input.pages.slice(0, 5).join(', ')}${input.pages.length > 5 ? ', …' : ''})`,
    `- **Node**: ${process.version}`,
    `- **Platform**: ${process.platform}`,
    '',
    '## Steps to reproduce',
    '1. ',
    '2. ',
    '3. ',
    '',
    '## Expected behavior',
    '',
    '## Actual behavior',
    '',
  )
  return lines.join('\n')
}

export function buildGitHubIssueURL(repo: string, title: string, body: string): string {
  const params = new URLSearchParams({ title, body })
  return `https://github.com/${repo}/issues/new?${params.toString()}`
}

async function openInBrowser(url: string): Promise<void> {
  const { spawn } = await import('child_process')
  const openCmd = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open'
  try {
    spawn(openCmd, [url], { stdio: 'ignore', detached: true }).unref()
    console.log(chalk.green('   ✓ Opened in browser.\n'))
  } catch {
    console.log(chalk.yellow('   (could not auto-open — copy the URL above)\n'))
  }
}
