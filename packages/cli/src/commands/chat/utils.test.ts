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
  deduplicatePages,
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
      shared: [
        { id: 'CID-003', name: 'FeatureCard', type: 'widget', file: 'components/shared/feature-card.tsx' },
      ],
    }
    await warnInlineDuplicates(tmpDir, 'Dashboard', '/dashboard', pageCode, manifest)
    const warnings = consoleSpy.mock.calls.filter(c => String(c[0]).includes('FeatureCard'))
    expect(warnings).toHaveLength(0)
    consoleSpy.mockRestore()
    rmSync(tmpDir, { recursive: true })
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
})
