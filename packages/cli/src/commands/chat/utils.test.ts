import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import {
  inferRouteUsesAuthSegment,
  readAnchorPageCodeFromDisk,
  MIN_ANCHOR_PAGE_CODE_CHARS,
  routeToFsPath,
  routeToRelPath,
  warnInlineDuplicates,
  injectMissingSharedImports,
  deduplicatePages,
  hasBroadAppIntent,
  startSpinnerHeartbeat,
  isMultiPageRequest,
  MULTI_PAGE_KEYWORD_THRESHOLD,
  withRequestTimeout,
  withAbortableTimeout,
  RequestTimeoutError,
  getDefaultRequestTimeoutMs,
  startPhaseTimer,
  resolvePageByFuzzyMatch,
} from './utils.js'
import { ArchitecturePlanSchema } from './plan-generator.js'

describe('deduplicatePages', () => {
  it('deduplicates /signup and /register to a single page (signup first)', () => {
    const pages = [
      { name: 'Signup', id: 'signup', route: '/signup' },
      { name: 'Register', id: 'register', route: '/register' },
    ]
    const out = deduplicatePages(pages)
    expect(out).toHaveLength(1)
    expect(out[0]!.route).toBe('/signup')
  })

  it('deduplicates /sign-up and /registration', () => {
    const pages = [
      { name: 'Sign Up', id: 'sign-up', route: '/sign-up' },
      { name: 'Registration', id: 'registration', route: '/registration' },
    ]
    const out = deduplicatePages(pages)
    expect(out).toHaveLength(1)
  })

  it('deduplicates /login and /signin to a single page (login first)', () => {
    const pages = [
      { name: 'Login', id: 'login', route: '/login' },
      { name: 'Signin', id: 'signin', route: '/signin' },
    ]
    const out = deduplicatePages(pages)
    expect(out).toHaveLength(1)
    expect(out[0]!.route).toBe('/login')
  })

  it('does not merge distinct non-auth routes', () => {
    const pages = [
      { name: 'About', id: 'about', route: '/about' },
      { name: 'Dashboard', id: 'dashboard', route: '/dashboard' },
    ]
    expect(deduplicatePages(pages)).toHaveLength(2)
  })
})

describe('inferRouteUsesAuthSegment', () => {
  it('is true for login', () => {
    expect(inferRouteUsesAuthSegment('/login')).toBe(true)
  })

  it('is true for sign-in', () => {
    expect(inferRouteUsesAuthSegment('/sign-in')).toBe(true)
  })

  it('is true for signin', () => {
    expect(inferRouteUsesAuthSegment('/signin')).toBe(true)
  })

  it('is false for root', () => {
    expect(inferRouteUsesAuthSegment('/')).toBe(false)
  })

  it('is false for dashboard', () => {
    expect(inferRouteUsesAuthSegment('/dashboard')).toBe(false)
  })
})

describe('readAnchorPageCodeFromDisk', () => {
  let dir: string
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'coherent-anchor-'))
  })
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it('returns null when app/page.tsx is missing', () => {
    mkdirSync(join(dir, 'app'), { recursive: true })
    expect(readAnchorPageCodeFromDisk(dir, '/')).toBeNull()
  })

  it('returns null when file is too short (placeholder)', () => {
    mkdirSync(join(dir, 'app'), { recursive: true })
    const short = 'x'.repeat(MIN_ANCHOR_PAGE_CODE_CHARS - 1)
    writeFileSync(join(dir, 'app', 'page.tsx'), short, 'utf-8')
    expect(readAnchorPageCodeFromDisk(dir, '/')).toBeNull()
  })

  it('reads root page from app/page.tsx when substantial', () => {
    mkdirSync(join(dir, 'app'), { recursive: true })
    const code = `'use client'\nexport default function Home() {\n  return <div className="container max-w-6xl mx-auto px-4 py-12">${'x'.repeat(MIN_ANCHOR_PAGE_CODE_CHARS)}</div>\n}\n`
    writeFileSync(join(dir, 'app', 'page.tsx'), code, 'utf-8')
    const got = readAnchorPageCodeFromDisk(dir, '/')
    expect(got).toContain('container max-w-6xl')
  })

  it('reads dashboard from app/(app)/dashboard/page.tsx', () => {
    const segment = join(dir, 'app', '(app)', 'dashboard')
    mkdirSync(segment, { recursive: true })
    const code = `export default function Dash() { return <div className="p-4">${'y'.repeat(MIN_ANCHOR_PAGE_CODE_CHARS)}</div> }`
    writeFileSync(join(segment, 'page.tsx'), code, 'utf-8')
    const got = readAnchorPageCodeFromDisk(dir, '/dashboard')
    expect(got).toContain('p-4')
  })
})

const testPlan = ArchitecturePlanSchema.parse({
  groups: [
    { id: 'public', layout: 'header', pages: ['/features'] },
    { id: 'app', layout: 'sidebar', pages: ['/dashboard'] },
    { id: 'auth', layout: 'none', pages: ['/login'] },
  ],
  sharedComponents: [],
  pageNotes: {},
})

describe('routeToFsPath with plan', () => {
  it('puts /dashboard in (app) group', () => {
    const result = routeToFsPath('/tmp', '/dashboard', testPlan)
    expect(result).toContain('(app)')
    expect(result).toContain('dashboard')
  })

  it('puts /login in (auth) group', () => {
    const result = routeToFsPath('/tmp', '/login', testPlan)
    expect(result).toContain('(auth)')
  })

  it('puts /features in (public) group', () => {
    const result = routeToFsPath('/tmp', '/features', testPlan)
    expect(result).toContain('(public)')
  })

  it('root route always goes to app/page.tsx', () => {
    const result = routeToFsPath('/tmp', '/', testPlan)
    expect(result).toMatch(/app\/page\.tsx$/)
    expect(result).not.toContain('(public)')
  })

  it('backward compat: boolean isAuth still works', () => {
    const result = routeToFsPath('/tmp', '/login', true)
    expect(result).toContain('(auth)')
  })

  it('backward compat: no third arg uses default behavior', () => {
    const result = routeToFsPath('/tmp', '/dashboard')
    expect(result).toContain('dashboard')
    expect(result).toContain('page.tsx')
  })
})

describe('routeToRelPath with plan', () => {
  it('puts /dashboard in (app) group', () => {
    const result = routeToRelPath('/dashboard', testPlan)
    expect(result).toContain('(app)')
    expect(result).toContain('dashboard')
  })

  it('backward compat: boolean isAuth still works', () => {
    const result = routeToRelPath('/login', true)
    expect(result).toContain('(auth)')
  })
})

describe('warnInlineDuplicates with plan', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('warns when planned component is not imported', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const plan = ArchitecturePlanSchema.parse({
      groups: [],
      sharedComponents: [
        {
          name: 'StatCard',
          description: 'd',
          props: '{}',
          usedBy: ['/dashboard'],
          type: 'widget',
        },
      ],
      pageNotes: {},
    })
    const manifest = {
      shared: [{ id: 'CID-001', name: 'StatCard', type: 'widget', file: 'components/shared/stat-card.tsx' }],
    }
    await warnInlineDuplicates(
      '/tmp',
      'Dashboard',
      '/dashboard',
      'export default function Page() { return <div>no import</div> }',
      manifest,
      plan,
    )
    expect(consoleSpy).toHaveBeenCalled()
  })

  it('does NOT false-positive warn when overlap is generic UI tokens', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const tmpDir = mkdtempSync(join(tmpdir(), 'warn-overlap-'))
    const sharedDir = join(tmpDir, 'components', 'shared')
    mkdirSync(sharedDir, { recursive: true })
    // Realistic shared component with ~25 unique tokens
    writeFileSync(
      join(sharedDir, 'feature-card.tsx'),
      `import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
export default function FeatureCard({ title, description, icon, badge }: Props) {
  return (
    <Card className="p-6 flex flex-col items-center text-center rounded-lg border shadow-sm">
      <CardHeader><CardTitle className="text-lg font-semibold">{title}</CardTitle></CardHeader>
      <CardDescription>{description}</CardDescription>
      <CardContent className="flex-1"><Badge>{badge}</Badge></CardContent>
      <CardFooter><Button variant="outline">Learn More</Button></CardFooter>
    </Card>
  )
}`,
    )
    // Login page shares generic tokens (Card, CardContent, Button, import, export, etc.)
    // but is semantically unrelated to FeatureCard. ~16 overlapping tokens out of ~35 shared tokens.
    const pageCode = `import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
export default function LoginPage() {
  return (
    <Card className="flex">
      <CardHeader><CardTitle>Login</CardTitle></CardHeader>
      <CardContent>
        <Input placeholder="Email" />
        <Button>Submit</Button>
      </CardContent>
    </Card>
  )
}`
    const manifest = {
      shared: [{ id: 'CID-003', name: 'FeatureCard', type: 'widget', file: 'components/shared/feature-card.tsx' }],
    }
    await warnInlineDuplicates(tmpDir, 'Dashboard', '/dashboard', pageCode, manifest)
    const warnings = consoleSpy.mock.calls.filter(c => String(c[0]).includes('FeatureCard'))
    expect(warnings).toHaveLength(0)
    consoleSpy.mockRestore()
    rmSync(tmpDir, { recursive: true })
  })

  it('warns for data-display components not imported', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const plan = ArchitecturePlanSchema.parse({
      groups: [{ id: 'app', layout: 'sidebar', pages: ['/dashboard'] }],
      sharedComponents: [
        { name: 'StatCard', description: 'Metric card', props: '{}', usedBy: ['/dashboard'], type: 'data-display' },
      ],
      pageNotes: {},
    })
    const manifest = {
      shared: [{ id: 'CID-003', name: 'StatCard', type: 'data-display', file: 'components/shared/stat-card.tsx' }],
    }
    await warnInlineDuplicates(
      '/tmp',
      'Dashboard',
      '/dashboard',
      'export default function Page() { return <div/> }',
      manifest,
      plan,
    )
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('StatCard'))
    consoleSpy.mockRestore()
  })

  it('does NOT warn when page is not in usedBy', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const plan = ArchitecturePlanSchema.parse({
      groups: [],
      sharedComponents: [
        {
          name: 'StatCard',
          description: 'd',
          props: '{}',
          usedBy: ['/projects'],
          type: 'widget',
        },
      ],
      pageNotes: {},
    })
    const manifest = {
      shared: [{ id: 'CID-001', name: 'StatCard', type: 'widget', file: 'components/shared/stat-card.tsx' }],
    }
    await warnInlineDuplicates('/tmp', 'Dashboard', '/dashboard', 'export default function Page() {}', manifest, plan)
    expect(consoleSpy).not.toHaveBeenCalled()
  })

  it('returns missingPlannedImports for planned but missing components', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {})
    const plan = ArchitecturePlanSchema.parse({
      groups: [],
      sharedComponents: [{ name: 'StatCard', description: 'd', props: '{}', usedBy: ['/dashboard'], type: 'widget' }],
      pageNotes: {},
    })
    const manifest = {
      shared: [{ id: 'CID-001', name: 'StatCard', type: 'widget', file: 'components/shared/stat-card.tsx' }],
    }
    const result = await warnInlineDuplicates(
      '/tmp',
      'Dashboard',
      '/dashboard',
      'export default function Page() { return <div>No StatCard import</div> }',
      manifest,
      plan,
    )
    expect(result.missingPlannedImports).toHaveLength(1)
    expect(result.missingPlannedImports[0].name).toBe('StatCard')
    expect(result.missingPlannedImports[0].importPath).toBe('@/components/shared/stat-card')
  })
})

describe('injectMissingSharedImports', () => {
  it('injects import after last existing import', () => {
    const code = `'use client'\nimport { Button } from '@/components/ui/button'\n\nexport default function Page() {}`
    const result = injectMissingSharedImports(code, [{ name: 'StatCard', importPath: '@/components/shared/stat-card' }])
    expect(result).toContain("import { StatCard } from '@/components/shared/stat-card'")
    expect(result.indexOf('StatCard')).toBeGreaterThan(result.indexOf('Button'))
  })

  it('injects after use client when no imports exist', () => {
    const code = `'use client'\n\nexport default function Page() {}`
    const result = injectMissingSharedImports(code, [{ name: 'StatCard', importPath: '@/components/shared/stat-card' }])
    expect(result).toContain("import { StatCard } from '@/components/shared/stat-card'")
    expect(result.indexOf('import')).toBeGreaterThan(result.indexOf('use client'))
  })

  it('returns code unchanged when no missing imports', () => {
    const code = `export default function Page() {}`
    const result = injectMissingSharedImports(code, [])
    expect(result).toBe(code)
  })
})

describe('hasBroadAppIntent', () => {
  it.each([
    'create me ui for a financial app',
    'build a SaaS platform for teachers',
    'generate a full website for my bakery',
    'make a project management tool',
    'scaffold a dashboard portal',
    'start a prototype for fintech',
    'develop a web app for booking',
  ])('matches broad intent: %s', msg => {
    expect(hasBroadAppIntent(msg)).toBe(true)
  })

  it('does not match a single-screen request', () => {
    expect(hasBroadAppIntent('create a dashboard with stats')).toBe(false)
  })

  it('does not match "update the login page"', () => {
    expect(hasBroadAppIntent('update the login page')).toBe(false)
  })

  it('does not match "build login page" (no multi-page noun)', () => {
    expect(hasBroadAppIntent('build login page')).toBe(false)
  })

  it('does not fire across sentence boundaries', () => {
    expect(hasBroadAppIntent('create a heading. it should link to the app store.')).toBe(false)
  })
})

describe('startSpinnerHeartbeat', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('advances spinner text through stages as time passes', () => {
    const spinner = { text: 'initial' }
    const stop = startSpinnerHeartbeat(spinner, [
      { after: 2, text: 'stage A' },
      { after: 5, text: 'stage B' },
    ])

    vi.advanceTimersByTime(1000)
    expect(spinner.text).toBe('initial')

    vi.advanceTimersByTime(2000) // 3s total
    expect(spinner.text).toBe('stage A')

    vi.advanceTimersByTime(3000) // 6s total
    expect(spinner.text).toBe('stage B')

    stop()
  })

  it('stop() prevents further text changes', () => {
    const spinner = { text: 'initial' }
    const stop = startSpinnerHeartbeat(spinner, [{ after: 1, text: 'should not appear' }])
    stop()
    vi.advanceTimersByTime(5000)
    expect(spinner.text).toBe('initial')
  })

  it('empty stages returns a noop stop without errors', () => {
    const spinner = { text: 'initial' }
    const stop = startSpinnerHeartbeat(spinner, [])
    expect(() => stop()).not.toThrow()
    vi.advanceTimersByTime(5000)
    expect(spinner.text).toBe('initial')
  })

  it('handles unsorted stages correctly', () => {
    const spinner = { text: 'initial' }
    const stop = startSpinnerHeartbeat(spinner, [
      { after: 5, text: 'B' },
      { after: 2, text: 'A' },
    ])
    vi.advanceTimersByTime(3000)
    expect(spinner.text).toBe('A')
    vi.advanceTimersByTime(3000)
    expect(spinner.text).toBe('B')
    stop()
  })

  it('skips text update when spinner is not spinning', () => {
    const spinner = { text: 'initial', isSpinning: false }
    const stop = startSpinnerHeartbeat(spinner, [{ after: 1, text: 'should not set' }])
    vi.advanceTimersByTime(2000)
    expect(spinner.text).toBe('initial')
    stop()
  })
})

describe('isMultiPageRequest', () => {
  it.each([
    'create me ui for a financial app',
    'build a SaaS platform for teachers',
    'generate a full website for my bakery',
    'scaffold a dashboard portal',
  ])('triggers on broad app intent: %s', msg => {
    expect(isMultiPageRequest(msg)).toBe(true)
  })

  it('triggers on "pages: a, b, c" form', () => {
    expect(isMultiPageRequest('build me something with pages: home, pricing, login')).toBe(true)
  })

  it('triggers when ≥3 known page keywords appear', () => {
    expect(isMultiPageRequest('I need dashboard, settings, and a pricing page')).toBe(true)
  })

  it('does NOT trigger on a single-page request', () => {
    expect(isMultiPageRequest('add a pricing page')).toBe(false)
  })

  it('does NOT trigger on "change primary color to green"', () => {
    expect(isMultiPageRequest('change primary color to green')).toBe(false)
  })

  it('threshold is 3', () => {
    expect(MULTI_PAGE_KEYWORD_THRESHOLD).toBe(3)
  })
})

describe('withRequestTimeout', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('resolves when promise settles before timeout', async () => {
    const p = Promise.resolve('ok')
    await expect(withRequestTimeout(p, 'test', 1000)).resolves.toBe('ok')
  })

  it('rejects with RequestTimeoutError when promise exceeds timeout', async () => {
    // Promise that never resolves in test scope
    const neverSettles = new Promise(() => {})
    const racing = withRequestTimeout(neverSettles, 'test', 500)
    vi.advanceTimersByTime(600)
    await expect(racing).rejects.toBeInstanceOf(RequestTimeoutError)
    await expect(racing).rejects.toMatchObject({ code: 'REQUEST_TIMEOUT', label: 'test' })
  })

  it('disabled when timeoutMs <= 0 (returns original promise)', async () => {
    const p = Promise.resolve('passthrough')
    await expect(withRequestTimeout(p, 'test', 0)).resolves.toBe('passthrough')
  })

  it('propagates underlying rejection even before timeout', async () => {
    const p = Promise.reject(new Error('boom'))
    await expect(withRequestTimeout(p, 'test', 5000)).rejects.toThrow('boom')
  })
})

describe('withAbortableTimeout', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('passes the signal to the factory and resolves on success', async () => {
    let receivedSignal: AbortSignal | null = null
    const result = await withAbortableTimeout(
      signal => {
        receivedSignal = signal
        return Promise.resolve('ok')
      },
      'test',
      5000,
    )
    expect(result).toBe('ok')
    expect(receivedSignal).not.toBeNull()
    expect(receivedSignal!.aborted).toBe(false)
  })

  it('aborts the signal and throws RequestTimeoutError when timeout fires', async () => {
    let receivedSignal: AbortSignal | null = null
    const racing = withAbortableTimeout(
      signal => {
        receivedSignal = signal
        return new Promise((_, reject) => {
          signal.addEventListener('abort', () => reject(new Error('aborted by signal')))
        })
      },
      'test',
      500,
    )
    vi.advanceTimersByTime(600)
    await expect(racing).rejects.toBeInstanceOf(RequestTimeoutError)
    expect(receivedSignal!.aborted).toBe(true)
  })

  it('propagates non-timeout rejection without wrapping', async () => {
    await expect(withAbortableTimeout(() => Promise.reject(new Error('boom')), 'test', 5000)).rejects.toThrow('boom')
  })

  it('timeoutMs=0 disables abort (request runs to completion)', async () => {
    let receivedSignal: AbortSignal | null = null
    const result = await withAbortableTimeout(
      signal => {
        receivedSignal = signal
        return Promise.resolve('ok')
      },
      'test',
      0,
    )
    expect(result).toBe('ok')
    expect(receivedSignal!.aborted).toBe(false)
  })
})

describe('getDefaultRequestTimeoutMs', () => {
  it('returns a positive number', () => {
    expect(getDefaultRequestTimeoutMs()).toBeGreaterThan(0)
  })
})

describe('startPhaseTimer', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('is a no-op when COHERENT_DEBUG is not set', () => {
    const original = process.env.COHERENT_DEBUG
    delete process.env.COHERENT_DEBUG
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const end = startPhaseTimer('test phase')
    end()
    expect(spy).not.toHaveBeenCalled()
    if (original !== undefined) process.env.COHERENT_DEBUG = original
  })

  it('logs elapsed when COHERENT_DEBUG=1', () => {
    const original = process.env.COHERENT_DEBUG
    process.env.COHERENT_DEBUG = '1'
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const end = startPhaseTimer('probe phase')
    end()
    expect(spy).toHaveBeenCalled()
    const logged = String(spy.mock.calls[0][0])
    expect(logged).toContain('probe phase')
    expect(logged).toMatch(/\d+\.\d+s/)
    if (original === undefined) delete process.env.COHERENT_DEBUG
    else process.env.COHERENT_DEBUG = original
  })
})

describe('resolvePageByFuzzyMatch', () => {
  const pages = [
    { id: 'home', name: 'Home', route: '/' },
    { id: 'account', name: 'Account', route: '/account' },
    { id: 'dashboard', name: 'Dashboard', route: '/dashboard' },
    { id: 'settings', name: 'Settings', route: '/settings' },
    { id: 'accounts-list', name: 'Accounts', route: '/accounts' },
  ]

  it('exact id match wins first', () => {
    expect(resolvePageByFuzzyMatch(pages, 'account')?.id).toBe('account')
  })

  it('exact route match (plural) wins when both exist', () => {
    expect(resolvePageByFuzzyMatch(pages, 'accounts')?.id).toBe('accounts-list')
  })

  it('plural → singular: "accounts" finds /account when /accounts does not exist', () => {
    const narrower = pages.filter(p => p.id !== 'accounts-list')
    expect(resolvePageByFuzzyMatch(narrower, 'accounts')?.id).toBe('account')
  })

  it('singular → plural: "setting" finds /settings', () => {
    expect(resolvePageByFuzzyMatch(pages, 'setting')?.id).toBe('settings')
  })

  it('prefix match: "dash" finds /dashboard', () => {
    expect(resolvePageByFuzzyMatch(pages, 'dash')?.id).toBe('dashboard')
  })

  it('too-short prefix does not match', () => {
    expect(resolvePageByFuzzyMatch(pages, 'da')).toBeNull()
  })

  it('returns null for no match', () => {
    expect(resolvePageByFuzzyMatch(pages, 'billing')).toBeNull()
  })

  it('handles leading slash in target', () => {
    expect(resolvePageByFuzzyMatch(pages, '/account')?.id).toBe('account')
  })

  it('route segment match: falls back to first-segment match when no plural/prefix hit', () => {
    // Only a detail page exists, no list. Plural "accounts" has no exact hit,
    // plural→singular swap fails (no /account), prefix fails (no id starts with
    // "accounts"). Segment match picks the detail page.
    const detailOnly = [
      { id: 'home', name: 'Home', route: '/' },
      { id: 'accounts-id', name: 'Account Detail', route: '/accounts/[id]' },
    ]
    expect(resolvePageByFuzzyMatch(detailOnly, 'accounts')?.id).toBe('accounts-id')
  })
})
