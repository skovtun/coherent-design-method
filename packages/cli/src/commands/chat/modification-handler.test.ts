import { describe, it, expect } from 'vitest'
import {
  inferPageType,
  isSiteWideHeader,
  isSiteWideFooter,
  stripInlineLayoutElements,
  detectAndFixSpaHomePage,
} from './modification-handler.js'

describe('isSiteWideHeader', () => {
  it('detects header with Link components', () => {
    expect(isSiteWideHeader('<header><Link href="/">Home</Link></header>')).toBe(true)
  })

  it('detects header with nav element', () => {
    expect(isSiteWideHeader('<header><nav>Menu</nav></header>')).toBe(true)
  })

  it('detects header with anchor links', () => {
    expect(isSiteWideHeader('<header><a href="/about">About</a></header>')).toBe(true)
  })

  it('rejects header without navigation', () => {
    expect(isSiteWideHeader('<header><h1>Page Title</h1></header>')).toBe(false)
  })
})

describe('isSiteWideFooter', () => {
  it('detects footer with copyright', () => {
    expect(isSiteWideFooter('<footer>© 2026 Company</footer>')).toBe(true)
  })

  it('detects footer with &copy; entity', () => {
    expect(isSiteWideFooter('<footer>&copy; 2026</footer>')).toBe(true)
  })

  it('detects footer with "All rights"', () => {
    expect(isSiteWideFooter('<footer>All rights reserved</footer>')).toBe(true)
  })

  it('detects footer with multiple links', () => {
    expect(isSiteWideFooter('<footer><a href="/a">A</a><a href="/b">B</a><a href="/c">C</a></footer>')).toBe(true)
  })

  it('rejects footer without copyright or links', () => {
    expect(isSiteWideFooter('<footer><p>Contact us</p></footer>')).toBe(false)
  })
})

describe('stripInlineLayoutElements', () => {
  it('strips header with navigation', () => {
    const code = '<div>\n<header><nav><Link href="/">Home</Link></nav></header>\n<main>Content</main>\n</div>'
    const result = stripInlineLayoutElements(code)
    expect(result.stripped).toContain('header')
    expect(result.code).not.toContain('<header>')
    expect(result.code).toContain('Content')
  })

  it('strips footer with copyright', () => {
    const code = '<div>\n<main>Content</main>\n<footer>© 2026 Company. All rights reserved.</footer>\n</div>'
    const result = stripInlineLayoutElements(code)
    expect(result.stripped).toContain('footer')
    expect(result.code).not.toContain('<footer>')
  })

  it('returns unchanged code when no layout elements', () => {
    const code = '<div><main>Content</main></div>'
    const result = stripInlineLayoutElements(code)
    expect(result.stripped).toHaveLength(0)
    expect(result.code).toBe(code)
  })
})

describe('detectAndFixSpaHomePage', () => {
  it('does not fix non-root routes', () => {
    const code = 'const renderDashboard = () => {}\nconst renderSettings = () => {}'
    const result = detectAndFixSpaHomePage(code, '/dashboard')
    expect(result.fixed).toBe(false)
    expect(result.code).toBe(code)
  })

  it('does not fix short root pages', () => {
    const code = 'export default function Home() { return <div>Welcome</div> }'
    const result = detectAndFixSpaHomePage(code, '/')
    expect(result.fixed).toBe(false)
  })
})

describe('inferPageType', () => {
  it('infers auth types', () => {
    expect(inferPageType('/login', 'Login')).toBe('login')
    expect(inferPageType('/register', 'Register')).toBe('register')
    expect(inferPageType('/forgot-password', 'Forgot')).toBe('forgot-password')
    expect(inferPageType('/reset-password', 'Reset')).toBe('reset-password')
  })

  it('infers app types', () => {
    expect(inferPageType('/dashboard', 'Dashboard')).toBe('dashboard')
    expect(inferPageType('/settings', 'Settings')).toBe('settings')
    expect(inferPageType('/profile', 'Profile')).toBe('profile')
    expect(inferPageType('/team', 'Team')).toBe('team')
    expect(inferPageType('/tasks', 'Tasks')).toBe('tasks')
  })

  it('infers marketing types', () => {
    expect(inferPageType('/pricing', 'Pricing')).toBe('pricing')
    expect(inferPageType('/about', 'About')).toBe('about')
    expect(inferPageType('/features', 'Features')).toBe('features')
  })

  it('infers detail pages', () => {
    expect(inferPageType('/tasks/[id]', 'Task Detail')).toBe('task-detail')
    expect(inferPageType('/projects/[id]', 'Project Detail')).toBe('project-detail')
  })

  it('returns null for unknown routes', () => {
    expect(inferPageType('/custom-page', 'Custom')).toBeNull()
  })
})
