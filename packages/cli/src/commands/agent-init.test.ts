import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import {
  agentInitCommand,
  cliInvocation,
  detectPackageManager,
  detectProject,
  writeAgentFiles,
  type Runner,
} from './agent-init.js'

let dir: string
const write = (p: string, c: string) => {
  mkdirSync(join(dir, p, '..'), { recursive: true })
  writeFileSync(join(dir, p), c)
}
const read = (p: string) => readFileSync(join(dir, p), 'utf-8')
const json = (p: string) => JSON.parse(read(p))
const nextApp = () => {
  write('package.json', JSON.stringify({ dependencies: { next: '16.0.0' } }))
  write('src/app/page.tsx', 'export default () => <p>mine</p>\n')
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'cinit-'))
  vi.spyOn(console, 'log').mockImplementation(() => {})
})
afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
  vi.restoreAllMocks()
})

describe('detectProject', () => {
  it('tells empty, Next.js and other folders apart', () => {
    expect(detectProject(join(dir, 'missing'))).toBe('empty')
    write('.git/HEAD', 'ref')
    expect(detectProject(dir)).toBe('empty')
    write('notes.txt', 'x')
    expect(detectProject(dir)).toBe('other')
    nextApp()
    expect(detectProject(dir)).toBe('next')
  })
})

describe('detectPackageManager', () => {
  it('prefers the packageManager field, then the lockfile, then npm', () => {
    write('package.json', JSON.stringify({ packageManager: 'yarn@4.5.0' }))
    write('pnpm-lock.yaml', '')
    expect(detectPackageManager(dir)).toBe('yarn')
    write('package.json', '{}')
    expect(detectPackageManager(dir)).toBe('pnpm')
    rmSync(join(dir, 'pnpm-lock.yaml'))
    write('bun.lock', '')
    expect(detectPackageManager(dir)).toBe('bun')
    rmSync(join(dir, 'bun.lock'))
    expect(detectPackageManager(dir)).toBe('npm')
  })
})

describe('writeAgentFiles', () => {
  const inv = cliInvocation(dir, false)

  it('installs the agent, server, guard and AGENTS.md section without clobbering user config', () => {
    write('.mcp.json', JSON.stringify({ mcpServers: { other: { command: 'x' } } }))
    write(
      '.claude/settings.json',
      JSON.stringify({ permissions: { allow: ['Bash(ls)'] }, hooks: { PreToolUse: [{ matcher: 'Bash', hooks: [] }] } }),
    )
    write('AGENTS.md', '# My project\n\nHouse rules.\n')
    write('.gitignore', 'node_modules\n')
    writeAgentFiles(dir, inv)

    expect(read('.claude/agents/coherent.md')).toMatch(/^---\nname: coherent/)
    expect(Object.keys(json('.mcp.json').mcpServers).sort()).toEqual(['coherent', 'other'])
    expect(json('.mcp.json').mcpServers.coherent.args).toEqual([
      '--no-install',
      'coherent',
      'mcp',
      '--profile',
      'agent',
    ])
    const s = json('.claude/settings.json')
    expect(s.agent).toBe('coherent')
    expect(s.permissions).toEqual({ allow: ['Bash(ls)'] })
    expect(s.hooks.PreToolUse).toHaveLength(2)
    expect(read('AGENTS.md')).toMatch(/^# My project\n\nHouse rules.\n\n<!-- coherent:start -->/)
    expect(read('.gitignore')).toContain('.coherent/tx/')
  })

  it('is idempotent: a second run replaces its own entries instead of duplicating them', () => {
    writeAgentFiles(dir, inv)
    writeAgentFiles(dir, inv)
    expect(json('.claude/settings.json').hooks.PreToolUse).toHaveLength(1)
    expect(read('AGENTS.md').match(/coherent:start/g)).toHaveLength(1)
    expect(read('.gitignore').match(/\.coherent\/tx\//g)).toHaveLength(1)
  })

  it("keeps a user's own default agent and says so", () => {
    write('.claude/settings.json', JSON.stringify({ agent: 'reviewer' }))
    const notes = writeAgentFiles(dir, inv)
    expect(json('.claude/settings.json').agent).toBe('reviewer')
    expect(notes.join()).toMatch(/Kept your default agent "reviewer"/)
  })
})

describe('agentInitCommand', () => {
  it('adds only the agent to an existing Next.js app and leaves the app alone', async () => {
    nextApp()
    const run = vi.fn<Parameters<Runner>, void>()
    await agentInitCommand(dir, { skipInstall: true }, run)
    expect(run).not.toHaveBeenCalled()
    expect(read('src/app/page.tsx')).toBe('export default () => <p>mine</p>\n')
    expect(existsSync(join(dir, '.claude/agents/coherent.md'))).toBe(true)
  })

  it('pins the CLI and the browser as dev dependencies of the project', async () => {
    nextApp()
    const run = vi.fn<Parameters<Runner>, void>()
    await agentInitCommand(dir, {}, run)
    expect(run.mock.calls.map(c => c[0] + ' ' + c[1].slice(0, 3).join(' '))).toEqual([
      expect.stringMatching(/^npm install --save-dev @getcoherent\/cli@/),
      'npx --no-install playwright install',
    ])
  })

  it("installs with the project's own package manager instead of npm", async () => {
    nextApp()
    write('pnpm-lock.yaml', 'lockfileVersion: 9.0\n')
    const run = vi.fn<Parameters<Runner>, void>()
    await agentInitCommand(dir, {}, run)
    expect(run.mock.calls.map(c => c[0] + ' ' + c[1].slice(0, 2).join(' '))).toEqual([
      'pnpm add --save-dev',
      'pnpm exec playwright',
    ])
    expect(existsSync(join(dir, 'package-lock.json'))).toBe(false)
  })

  it('refuses Yarn Plug-n-Play, where the hook cannot find the CLI in node_modules', async () => {
    nextApp()
    write('.pnp.cjs', '')
    await expect(agentInitCommand(dir, {}, vi.fn())).rejects.toThrow(/Plug'n'Play/)
  })

  it('creates a new app in an empty folder with the welcome page, unstyled', async () => {
    const app = join(dir, 'shop')
    // Stand-in for create-next-app + shadcn.
    const run: Runner = (cmd, args) => {
      if (args.includes('create-next-app@latest')) {
        mkdirSync(join(app, 'src', 'app'), { recursive: true })
        writeFileSync(join(app, 'package.json'), JSON.stringify({ dependencies: { next: '16' } }))
        writeFileSync(join(app, 'src', 'app', 'page.tsx'), 'export default () => null\n')
      }
    }
    await agentInitCommand(app, { link: true }, run)
    const page = readFileSync(join(app, 'src', 'app', 'page.tsx'), 'utf-8')
    expect(page).toMatch(
      /^\/\* coherent-welcome: agent-v1 \| direction: (Apple|Linear|Stripe|Vercel|Google|Nothing) — /,
    )
    expect(page).toContain('Describe your product. Your agent builds it.')
    expect(page).toContain('function CoherentMark')
    expect(existsSync(join(app, 'src', 'app', 'icon.svg'))).toBe(true)
    expect(existsSync(join(app, '.mcp.json'))).toBe(true)
  })

  it('refuses a non-empty folder that is not a Next.js app', async () => {
    write('README.md', 'hi')
    await expect(agentInitCommand(dir, { skipInstall: true }, vi.fn())).rejects.toThrow(/not a Next.js app/)
  })
})
