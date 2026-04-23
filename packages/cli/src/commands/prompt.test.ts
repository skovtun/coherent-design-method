import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { inferPageTypeFromIntent, promptCommand } from './prompt.js'

const MINIMAL_CONFIG = `export const config = {
  meta: { name: 'Test', version: '0.1.0' },
  tokens: { color: {}, typography: {}, spacing: {} },
  components: [],
} as const
`

describe('inferPageTypeFromIntent', () => {
  it('returns auth for login/register/signup intents', () => {
    expect(inferPageTypeFromIntent('build a login page')).toBe('auth')
    expect(inferPageTypeFromIntent('Register new users')).toBe('auth')
    expect(inferPageTypeFromIntent('sign-up flow with OAuth')).toBe('auth')
    expect(inferPageTypeFromIntent('sign in screen')).toBe('auth')
    expect(inferPageTypeFromIntent('forgot password modal')).toBe('auth')
    expect(inferPageTypeFromIntent('auth redirect page')).toBe('auth')
  })

  it('returns marketing for pricing/features/blog/landing intents', () => {
    expect(inferPageTypeFromIntent('pricing page with 3 tiers')).toBe('marketing')
    expect(inferPageTypeFromIntent('Features grid with icons')).toBe('marketing')
    expect(inferPageTypeFromIntent('About us page')).toBe('marketing')
    expect(inferPageTypeFromIntent('blog index')).toBe('marketing')
    expect(inferPageTypeFromIntent('landing page with hero')).toBe('marketing')
    expect(inferPageTypeFromIntent('homepage redesign')).toBe('marketing')
    expect(inferPageTypeFromIntent('testimonials section')).toBe('marketing')
  })

  it('returns app for dashboards/tables/settings and unmatched intents', () => {
    expect(inferPageTypeFromIntent('build a CRM dashboard')).toBe('app')
    expect(inferPageTypeFromIntent('project management app')).toBe('app')
    expect(inferPageTypeFromIntent('settings screen')).toBe('app')
    expect(inferPageTypeFromIntent('generate a user table')).toBe('app')
    expect(inferPageTypeFromIntent('')).toBe('app')
  })

  it('prefers auth over marketing when both keywords appear', () => {
    expect(inferPageTypeFromIntent('landing page with login modal')).toBe('auth')
  })
})

describe('promptCommand', () => {
  let logs: string[]
  let errs: string[]
  let origLog: typeof console.log
  let origErr: typeof console.error
  let origExit: typeof process.exit

  beforeEach(() => {
    logs = []
    errs = []
    origLog = console.log
    origErr = console.error
    origExit = process.exit
    console.log = (...args: unknown[]) => {
      logs.push(args.map(String).join(' '))
    }
    console.error = (...args: unknown[]) => {
      errs.push(args.map(String).join(' '))
    }
    process.exit = ((code?: number) => {
      throw new Error(`process.exit(${code})`)
    }) as typeof process.exit
  })

  afterEach(() => {
    console.log = origLog
    console.error = origErr
    process.exit = origExit
    vi.restoreAllMocks()
  })

  it('prints atmosphere list with --list-atmospheres and returns', async () => {
    await promptCommand(undefined, { listAtmospheres: true })
    const out = logs.join('\n')
    expect(out).toContain('swiss-grid')
    expect(out).toContain('dark-terminal')
    expect(out).toContain('wabi-sabi')
  })

  it('errors with _throwOnError when intent is missing', async () => {
    await expect(promptCommand(undefined, { _throwOnError: true })).rejects.toThrow('No intent provided')
  })

  it('errors with _throwOnError on unknown atmosphere', async () => {
    await expect(
      promptCommand('build something', { atmosphere: 'does-not-exist', _throwOnError: true }),
    ).rejects.toThrow(/Unknown atmosphere/)
  })

  it('emits valid JSON with --format json', async () => {
    await promptCommand('build a CRM dashboard', { format: 'json' })
    const jsonStr = logs.join('\n')
    const parsed = JSON.parse(jsonStr)
    expect(parsed.intent).toBe('build a CRM dashboard')
    expect(parsed.pageType).toBe('app')
    expect(parsed.atmosphere).toBeNull()
    expect(parsed.blocks.coreConstraints).toContain('SHADCN/UI DESIGN CONSTRAINTS')
    expect(parsed.blocks.designThinking).toContain('DESIGN THINKING')
    expect(parsed.generationInstructions).toContain('coherent check')
  })

  it('includes atmosphere in JSON output when --atmosphere is set', async () => {
    await promptCommand('build a dashboard', { format: 'json', atmosphere: 'dark-terminal' })
    const parsed = JSON.parse(logs.join('\n'))
    expect(parsed.atmosphere).not.toBeNull()
    expect(parsed.atmosphere.primaryHint).toBe('emerald')
    expect(parsed.atmosphere.background).toBe('code-bg')
  })

  it('respects --page-type override', async () => {
    await promptCommand('build something ambiguous', { format: 'json', pageType: 'marketing' })
    const parsed = JSON.parse(logs.join('\n'))
    expect(parsed.pageType).toBe('marketing')
  })

  it('markdown output includes all canonical sections', async () => {
    await promptCommand('build a project dashboard', { format: 'markdown' })
    const out = logs.join('\n')
    expect(out).toContain('# Coherent design constraints')
    expect(out).toContain('## Design thinking (TIER 0')
    expect(out).toContain('## Core constraints (TIER 1')
    expect(out).toContain('## Design quality')
    expect(out).toContain('## Visual depth')
    expect(out).toContain('## Interaction patterns')
    expect(out).toContain('## Your task')
    expect(out).toContain('coherent check')
    expect(out).toContain('coherent fix')
  })

  it('markdown output labels page type from atmosphere and intent', async () => {
    await promptCommand('login screen', { format: 'markdown', atmosphere: 'premium-focused' })
    const out = logs.join('\n')
    expect(out).toContain('**Page type:** `auth`')
    expect(out).toContain('**Atmosphere:** `premium-focused`')
  })

  it('plain format concatenates raw constraint blocks', async () => {
    await promptCommand('dashboard', { format: 'plain' })
    const out = logs.join('\n')
    expect(out).toContain('# Coherent constraints for: dashboard')
    expect(out).toContain('DESIGN THINKING')
    expect(out).toContain('SHADCN/UI DESIGN CONSTRAINTS')
  })

  it('always includes the alignment note (context-free)', async () => {
    await promptCommand('dashboard', { format: 'markdown' })
    const out = logs.join('\n')
    expect(out).toContain('Alignment rule')
    expect(out).toContain('CRITICAL LAYOUT RULE')
  })
})

describe('promptCommand — project context injection', () => {
  let projectDir: string
  let logs: string[]
  let origLog: typeof console.log

  beforeEach(() => {
    projectDir = mkdtempSync(join(tmpdir(), 'coherent-prompt-ctx-'))
    writeFileSync(join(projectDir, 'design-system.config.ts'), MINIMAL_CONFIG)
    logs = []
    origLog = console.log
    console.log = (...args: unknown[]) => logs.push(args.map(String).join(' '))
  })

  afterEach(() => {
    console.log = origLog
    rmSync(projectDir, { recursive: true, force: true })
  })

  const out = () => logs.join('\n')

  it('omits design-memory section when decisions.md does not exist', async () => {
    await promptCommand('build a dashboard', { format: 'markdown', _startDir: projectDir })
    expect(out()).not.toContain('## Design memory')
  })

  it('injects design memory from .coherent/wiki/decisions.md', async () => {
    mkdirSync(join(projectDir, '.coherent/wiki'), { recursive: true })
    writeFileSync(
      join(projectDir, '.coherent/wiki/decisions.md'),
      '# Design Decisions\n\n## 2026-04-23\n\n### Home (/)\n- Container: max-w-6xl mx-auto\n- Palette: bg-primary, text-foreground\n',
    )
    await promptCommand('build a dashboard', { format: 'markdown', _startDir: projectDir })
    const o = out()
    expect(o).toContain('## Design memory')
    expect(o).toContain('Container: max-w-6xl mx-auto')
  })

  it('injects shared components list from coherent.components.json', async () => {
    writeFileSync(
      join(projectDir, 'coherent.components.json'),
      JSON.stringify({
        shared: [
          {
            id: 'CID-001',
            name: 'StatCard',
            type: 'widget',
            file: 'components/shared/stat-card.tsx',
            usedIn: [],
            description: 'Dashboard metric card',
          },
        ],
        nextId: 2,
      }),
    )
    await promptCommand('build a dashboard', { format: 'markdown', _startDir: projectDir })
    const o = out()
    expect(o).toContain('Shared components available')
    expect(o).toContain('CID-001')
    expect(o).toContain('StatCard')
    expect(o).toContain('components/shared/stat-card.tsx')
  })

  it('injects existing routes from app/ directory', async () => {
    mkdirSync(join(projectDir, 'app/(app)/dashboard'), { recursive: true })
    mkdirSync(join(projectDir, 'app/pricing'), { recursive: true })
    writeFileSync(join(projectDir, 'app/page.tsx'), 'export default function P() { return null }')
    writeFileSync(join(projectDir, 'app/(app)/dashboard/page.tsx'), 'export default function P() { return null }')
    writeFileSync(join(projectDir, 'app/pricing/page.tsx'), 'export default function P() { return null }')
    await promptCommand('build another page', { format: 'markdown', _startDir: projectDir })
    const o = out()
    expect(o).toContain('Existing routes')
    expect(o).toContain('EXISTING ROUTES in this project')
    expect(o).toContain('/dashboard')
    expect(o).toContain('/pricing')
  })

  it('includes project context marker in plain format when detected', async () => {
    await promptCommand('build a dashboard', { format: 'plain', _startDir: projectDir })
    expect(out()).toContain('# Project context detected:')
  })
})
