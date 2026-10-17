/**
 * `coherent init` — set a project up for agent mode (ADR-0012).
 *
 *   empty folder      → official create-next-app (--empty) + shadcn, then the agent
 *   Next.js project   → the agent only; nothing of the app is touched
 *   already set up    → refresh the managed files to this version
 *
 * Coherent no longer scaffolds design (ADR-0011): the app's look comes from
 * the agent and the user's prompts. What init writes:
 *   .claude/agents/coherent.md   agent definition (managed, overwritten on update)
 *   .claude/settings.json        "agent": "coherent" + PreToolUse write guard (merged)
 *   .mcp.json                    the coherent MCP server, agent profile (merged)
 *   AGENTS.md                    managed section for Codex and other agents
 *   .gitignore                   Coherent's local state
 * and adds @getcoherent/cli + playwright as dev dependencies so the server,
 * the hook and rendered verification run from the project, at a pinned version.
 */
import chalk from 'chalk'
import { execFileSync } from 'child_process'
import { existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, writeFileSync } from 'fs'
import { dirname, join, resolve } from 'path'
import { fileURLToPath } from 'url'
import { CLI_VERSION } from '@getcoherent/core'

export interface AgentInitOptions {
  /** Use this machine's CLI build by absolute path instead of a project dev dependency (development). */
  link?: boolean
  /** Do not run npm/npx (scaffold, installs, browser download). */
  skipInstall?: boolean
}

/** Runs a command in a directory; injectable for tests. */
export type Runner = (cmd: string, args: string[], cwd: string) => void

const defaultRunner: Runner = (cmd, args, cwd) => {
  execFileSync(cmd, args, { cwd, stdio: 'inherit', shell: process.platform === 'win32' })
}

const START = '<!-- coherent:start -->'
const END = '<!-- coherent:end -->'
const STATE_IGNORES = ['.coherent/tx/', '.coherent/shots/', '.coherent/edits/']

export type ProjectState = 'empty' | 'next' | 'other'

export function detectProject(dir: string): ProjectState {
  if (!existsSync(dir)) return 'empty'
  const visible = readdirSync(dir).filter(f => !f.startsWith('.'))
  if (!visible.length) return 'empty'
  const pkg = join(dir, 'package.json')
  if (existsSync(pkg)) {
    const p = JSON.parse(readFileSync(pkg, 'utf-8'))
    if (p.dependencies?.next || p.devDependencies?.next) return 'next'
  }
  return 'other'
}

function templatesDir(): string {
  // dist/index.js → ../templates/agent ; src/commands/agent-init.ts (tests) → ../../templates/agent
  let d = dirname(fileURLToPath(import.meta.url))
  for (let i = 0; i < 4; i++) {
    if (existsSync(join(d, 'templates', 'agent', 'coherent.md'))) return join(d, 'templates', 'agent')
    d = dirname(d)
  }
  throw new Error('Coherent agent templates not found next to the CLI')
}

/** How the project invokes Coherent: a pinned dev dependency, or (dev) this exact build. */
export function cliInvocation(dir: string, link: boolean): { mcp: { command: string; args: string[] }; hook: string } {
  if (link) {
    const bin = realpathSync(process.argv[1])
    return {
      mcp: { command: 'node', args: [bin, 'mcp', '--profile', 'agent'] },
      hook: `node "${bin}" hook pre-write`,
    }
  }
  return {
    mcp: { command: 'npx', args: ['--no-install', 'coherent', 'mcp', '--profile', 'agent'] },
    // Runs on every write: call node directly instead of paying for npx each time.
    hook: 'node "$CLAUDE_PROJECT_DIR/node_modules/@getcoherent/cli/bin/coherent.js" hook pre-write',
  }
}

const readJson = (p: string): Record<string, unknown> => (existsSync(p) ? JSON.parse(readFileSync(p, 'utf-8')) : {})
const writeJson = (p: string, v: unknown) => {
  mkdirSync(dirname(p), { recursive: true })
  writeFileSync(p, JSON.stringify(v, null, 2) + '\n')
}

type HookGroup = { matcher?: string; hooks?: { type: string; command: string }[] }

/** Write or refresh every managed file. Idempotent; returns notes for the user. */
export function writeAgentFiles(dir: string, inv: ReturnType<typeof cliInvocation>): string[] {
  const notes: string[] = []
  const tpl = templatesDir()

  mkdirSync(join(dir, '.claude', 'agents'), { recursive: true })
  writeFileSync(join(dir, '.claude', 'agents', 'coherent.md'), readFileSync(join(tpl, 'coherent.md'), 'utf-8'))

  const mcpPath = join(dir, '.mcp.json')
  const mcp = readJson(mcpPath) as { mcpServers?: Record<string, unknown> }
  mcp.mcpServers = { ...(mcp.mcpServers ?? {}), coherent: { type: 'stdio', ...inv.mcp } }
  writeJson(mcpPath, mcp)

  const settingsPath = join(dir, '.claude', 'settings.json')
  const settings = readJson(settingsPath) as { agent?: string; hooks?: Record<string, HookGroup[]> }
  if (settings.agent && settings.agent !== 'coherent')
    notes.push(`Kept your default agent "${settings.agent}"; pick "coherent" in the Agent menu to use Coherent.`)
  else settings.agent = 'coherent'
  const pre = (settings.hooks?.PreToolUse ?? []).filter(
    g => !(g.hooks ?? []).some(h => h.command.includes('hook pre-write')),
  )
  settings.hooks = {
    ...(settings.hooks ?? {}),
    PreToolUse: [
      ...pre,
      { matcher: 'Edit|Write|MultiEdit|NotebookEdit', hooks: [{ type: 'command', command: inv.hook }] },
    ],
  }
  writeJson(settingsPath, settings)

  const agentsPath = join(dir, 'AGENTS.md')
  const body = readFileSync(join(tpl, 'coherent.md'), 'utf-8')
    .replace(/^---[\s\S]*?\n---\n/, '')
    .trim()
  const section = `${START}\n## Coherent (managed by \`coherent init\`; edits here are overwritten)\n\nUse the \`coherent\` MCP server's tools for every change to project files.\n\n${body}\n${END}`
  const existing = existsSync(agentsPath) ? readFileSync(agentsPath, 'utf-8') : ''
  const next =
    existing.includes(START) && existing.includes(END)
      ? existing.slice(0, existing.indexOf(START)) + section + existing.slice(existing.indexOf(END) + END.length)
      : (existing ? existing.trimEnd() + '\n\n' : '') + section + '\n'
  writeFileSync(agentsPath, next)

  const giPath = join(dir, '.gitignore')
  const gi = existsSync(giPath) ? readFileSync(giPath, 'utf-8') : ''
  const missing = STATE_IGNORES.filter(l => !gi.split('\n').includes(l))
  if (missing.length)
    writeFileSync(
      giPath,
      (gi && !gi.endsWith('\n') ? gi + '\n' : gi) + '# Coherent local state\n' + missing.join('\n') + '\n',
    )

  return notes
}

/**
 * Coherent's starter home page: fixed content about the platform, no styling.
 * The agent designs it on request (template rule), so every new app gets its
 * own take on the same content.
 */
export function writeWelcomePage(dir: string, pick: () => number = Math.random) {
  const app = existsSync(join(dir, 'src', 'app')) ? join(dir, 'src', 'app') : join(dir, 'app')
  mkdirSync(app, { recursive: true })
  // Left to itself the model converges on one look (observed twice in a row:
  // paper background, serif display, vermilion). A drawn direction makes every
  // new app's starter different while staying in a big-tech register.
  const direction = WELCOME_DIRECTIONS[Math.floor(pick() * WELCOME_DIRECTIONS.length)]
  const page = readFileSync(join(templatesDir(), 'welcome-page.tsx'), 'utf-8').replace(
    /^\/\* coherent-welcome: agent-v1/,
    `/* coherent-welcome: agent-v1 | direction: ${direction}`,
  )
  writeFileSync(join(app, 'page.tsx'), page)
}

export const WELCOME_DIRECTIONS = [
  'Apple — bright white, an enormous tight sans headline, calm gray bands, product-shot gravity, slow precise reveals',
  'Linear — near-black canvas, hairline borders, soft radial glow, crisp small sans, keyboard-fast motion',
  'Stripe — white with a vivid animated gradient mesh in the hero, a precise column grid, confident color',
  'Vercel — pure black and white, visible grid lines, geometric shapes, monospace accents, zero ornament',
  'Google — bright primary color blocks, rounded shapes, friendly sans, playful but orderly motion',
  'Nothing — monochrome with one red signal, dot-matrix and monospace type, industrial labels and modules',
]

/** Dynamic routes that need an example URL in .coherent/preview-params.json to be rendered. */
function dynamicRoutesWithoutParams(dir: string): string[] {
  const out: string[] = []
  const params = readJson(join(dir, '.coherent', 'preview-params.json'))
  const walk = (d: string, route: string) => {
    if (!existsSync(d)) return
    for (const name of readdirSync(d, { withFileTypes: true })) {
      if (!name.isDirectory() || name.name === 'node_modules' || name.name.startsWith('_')) continue
      const seg = /^\(.*\)$/.test(name.name) || name.name.startsWith('@') ? '' : `/${name.name}`
      const r = route + seg
      const full = join(d, name.name)
      if (readdirSync(full).some(f => /^page\.(t|j)sx?$/.test(f)) && r.includes('[') && !(r in params)) out.push(r)
      walk(full, r)
    }
  }
  walk(join(dir, 'src', 'app'), '')
  walk(join(dir, 'app'), '')
  return out
}

export async function agentInitCommand(
  nameArg: string | undefined,
  opts: AgentInitOptions,
  run: Runner = defaultRunner,
): Promise<void> {
  const dir = resolve(nameArg ?? process.cwd())
  const state = detectProject(dir)
  if (state === 'other')
    throw new Error(
      `${dir} is not empty and not a Next.js app. Run coherent init in an empty folder (a new app is created) or in a Next.js project.`,
    )

  if (state === 'empty') {
    if (opts.skipInstall) throw new Error('An empty folder needs a new app; run without --skip-install')
    mkdirSync(dir, { recursive: true })
    console.log(chalk.bold('Creating a Next.js app (official create-next-app, no Coherent styling)…'))
    run(
      'npx',
      [
        '--yes',
        'create-next-app@latest',
        dir,
        '--ts',
        '--tailwind',
        '--eslint',
        '--app',
        '--src-dir',
        '--import-alias',
        '@/*',
        '--use-npm',
        '--empty',
        '--yes',
      ],
      dirname(dir),
    )
    run('npx', ['--yes', 'shadcn@latest', 'init', '--defaults', '--yes'], dir)
    writeWelcomePage(dir)
  }

  const setUp = existsSync(join(dir, '.claude', 'agents', 'coherent.md'))
  if (!opts.link && !opts.skipInstall) {
    console.log(chalk.bold(`Adding @getcoherent/cli@${CLI_VERSION} and the verification browser…`))
    run('npm', ['install', '--save-dev', `@getcoherent/cli@${CLI_VERSION}`, 'playwright'], dir)
    run('npx', ['--no-install', 'playwright', 'install', 'chromium'], dir)
  }
  const inv = cliInvocation(dir, !!opts.link)
  const notes = writeAgentFiles(dir, inv)

  const dynamic = dynamicRoutesWithoutParams(dir)
  console.log(
    chalk.green(
      `\n✓ Coherent agent ${setUp ? 'updated' : 'installed'}${state === 'empty' ? ' in a new app' : ''}: ${dir}`,
    ),
  )
  for (const n of notes) console.log(chalk.yellow(`  ${n}`))
  if (dynamic.length)
    console.log(
      chalk.yellow(
        `  ${dynamic.length} dynamic route(s) need an example URL to be visually verified: ${dynamic.join(', ')}\n` +
          `  Add them to .coherent/preview-params.json, e.g. {"${dynamic[0]}": "${dynamic[0].replace(/\[[^\]]+\]/g, '1')}"}`,
      ),
    )
  console.log(`
${chalk.bold('Next')}
  Claude Code: open this folder (CLI or desktop) and just describe what you want.
               The Coherent agent is the project default; approve the "coherent" MCP server once.
  Codex:       codex mcp add coherent -- ${[inv.mcp.command, ...inv.mcp.args].join(' ')}
               (instructions are in AGENTS.md)
  ${state === 'empty' ? 'Start with: "Restyle the welcome page in your own style", then "Build <your product>: who it is for, the main screens, the feel."' : 'Try: "Make the accent warmer", "Only on <page>, move <section> up", "Undo that".'}
`)
}
