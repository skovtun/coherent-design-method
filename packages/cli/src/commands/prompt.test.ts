import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { inferPageTypeFromIntent, promptCommand } from './prompt.js'

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
})
