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
} from './utils.js'
import { ArchitecturePlanSchema } from './plan-generator.js'

describe('inferRouteUsesAuthSegment', () => {
  it('is true for login', () => {
    expect(inferRouteUsesAuthSegment('/login')).toBe(true)
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
      shared: [
        { id: 'CID-001', name: 'StatCard', type: 'widget', file: 'components/shared/stat-card.tsx' },
      ],
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
      shared: [
        { id: 'CID-001', name: 'StatCard', type: 'widget', file: 'components/shared/stat-card.tsx' },
      ],
    }
    await warnInlineDuplicates(
      '/tmp',
      'Dashboard',
      '/dashboard',
      'export default function Page() {}',
      manifest,
      plan,
    )
    expect(consoleSpy).not.toHaveBeenCalled()
  })
})
