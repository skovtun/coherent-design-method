/**
 * Design System layout (Next.js App Router)
 * Centered max-width container. Sidebar + content fill full width inside it.
 */
export const DESIGN_SYSTEM_LAYOUT = `'use client'
import Link from 'next/link'
import { Fragment } from 'react'
import { usePathname } from 'next/navigation'
import { useState, useEffect } from 'react'

export default function DesignSystemLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const [components, setComponents] = useState<any[]>([])
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const isComponentsPage = pathname?.startsWith('/design-system/components')

  useEffect(() => {
    fetch('/api/design-system/config')
      .then(res => res.json())
      .then(data => setComponents(data.components || []))
      .catch(() => [])
  }, [])

  const groupedComponents = components.reduce((acc, comp) => {
    const category = comp.category || 'other'
    if (!acc[category]) acc[category] = []
    acc[category].push(comp)
    return acc
  }, {} as Record<string, any[]>)

  const categoryNames: Record<string, string> = {
    form: 'Form',
    layout: 'Layout',
    navigation: 'Navigation',
    'data-display': 'Data Display',
    overlay: 'Overlay',
    feedback: 'Feedback',
    other: 'Other'
  }

  const knownNames: Record<string, string> = {
    button: 'Button', input: 'Input', label: 'Label', select: 'Select',
    switch: 'Switch', checkbox: 'Checkbox', card: 'Card', badge: 'Badge',
    table: 'Table', textarea: 'Textarea', dialog: 'Dialog',
    'alert-dialog': 'AlertDialog', separator: 'Separator', progress: 'Progress',
    avatar: 'Avatar', tabs: 'Tabs', accordion: 'Accordion', skeleton: 'Skeleton',
    tooltip: 'Tooltip', 'radio-group': 'RadioGroup', slider: 'Slider',
  }
  const compName = (c: any) => knownNames[c.id] || c.name || c.id

  const getBreadcrumbs = () => {
    if (!pathname) return []
    const parts = pathname.replace('/design-system', '').split('/').filter(Boolean)
    const crumbs: { label: string; href: string }[] = [{ label: 'Design System', href: '/design-system' }]
    if (parts[0] === 'components') {
      crumbs.push({ label: 'Components', href: '/design-system/components' })
      if (parts[1]) {
        const bcName = knownNames[parts[1]] || parts[1].charAt(0).toUpperCase() + parts[1].slice(1).replace(/-/g, ' ')
        crumbs.push({ label: bcName, href: pathname })
      }
    }
    if (parts[0] === 'shared') {
      crumbs.push({ label: 'Shared Components', href: '/design-system/shared' })
      if (parts[1]) {
        crumbs.push({ label: decodeURIComponent(parts[1]), href: pathname })
      }
    }
    if (parts[0] === 'tokens') {
      crumbs.push({ label: 'Tokens', href: '/design-system/tokens' })
      if (parts[1]) {
        crumbs.push({ label: parts[1].charAt(0).toUpperCase() + parts[1].slice(1), href: pathname })
      }
    }
    if (parts[0] === 'sitemap') {
      crumbs.push({ label: 'Sitemap', href: '/design-system/sitemap' })
    }
    if (parts[0] === 'docs') {
      crumbs.push({ label: 'Documentation', href: '/design-system/docs' })
      if (parts[1]) {
        const label = parts[1] === 'for-designers' ? 'For designers' : parts[1].charAt(0).toUpperCase() + parts[1].slice(1)
        crumbs.push({ label, href: pathname })
      }
    }
    if (parts[0] === 'recommendations') {
      crumbs.push({ label: 'Recommendations', href: '/design-system/recommendations' })
    }
    return crumbs
  }

  const breadcrumbs = getBreadcrumbs()

  const navLinks = [
    { href: '/design-system', label: 'Overview' },
    { href: '/design-system/components', label: 'Components' },
    { href: '/design-system/shared', label: 'Shared Components' },
    { href: '/design-system/tokens', label: 'Tokens' },
    { href: '/design-system/sitemap', label: 'Sitemap' },
    { href: '/design-system/docs', label: 'Documentation' },
    { href: '/design-system/recommendations', label: 'Recommendations' },
  ]

  const isActive = (href: string) =>
    pathname === href || (href !== '/design-system' && pathname?.startsWith(href))

  const [dark, setDark] = useState(false)
  useEffect(() => {
    setDark(document.documentElement.classList.contains('dark'))
  }, [])
  const toggleTheme = () => {
    const next = !dark
    setDark(next)
    document.documentElement.classList.toggle('dark', next)
  }

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Top bar */}
      <header className="sticky top-0 z-50 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="mx-auto w-full max-w-[1200px] px-6 lg:px-8">
          <div className="flex h-14 items-center justify-between gap-4">
            <Link
              href="/"
              className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors shrink-0"
            >
              ← Back to App
            </Link>
            <nav className="hidden md:flex items-center gap-1 flex-1 justify-center">
              {navLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className={\`px-3 py-2 rounded-md text-sm font-medium transition-colors \${isActive(link.href) ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'}\`}
                >
                  {link.label}
                </Link>
              ))}
            </nav>
            <div className="flex items-center gap-1 shrink-0">
              <button
                onClick={toggleTheme}
                className="flex items-center justify-center w-9 h-9 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                title={dark ? 'Switch to light theme' : 'Switch to dark theme'}
                aria-label="Toggle theme"
              >
                {dark ? (
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/></svg>
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/></svg>
                )}
              </button>
              <button
                type="button"
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="md:hidden flex items-center justify-center w-9 h-9 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                aria-label={mobileMenuOpen ? 'Close menu' : 'Open menu'}
              >
                {mobileMenuOpen ? (
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="4" x2="20" y1="12" y2="12"/><line x1="4" x2="20" y1="6" y2="6"/><line x1="4" x2="20" y1="18" y2="18"/></svg>
                )}
              </button>
            </div>
          </div>
        </div>
        {mobileMenuOpen && (
          <div className="border-t border-border md:hidden">
            <nav className="mx-auto w-full max-w-[1200px] px-6 py-3 flex flex-col gap-0.5">
              {navLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className={\`px-3 py-2.5 rounded-lg text-sm font-medium transition-colors \${isActive(link.href) ? 'bg-muted text-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground'}\`}
                >
                  {link.label}
                </Link>
              ))}
            </nav>
          </div>
        )}
      </header>

      {breadcrumbs.length > 2 && (
        <div className="border-b border-border bg-muted/30">
          <div className="mx-auto w-full max-w-[1200px] px-6 lg:px-8 py-2.5">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              {breadcrumbs.map((crumb, i) => (
                <Fragment key={\`\${crumb.href}-\${i}\`}>
                  {i > 0 && <span aria-hidden className="text-border">/</span>}
                  {i === breadcrumbs.length - 1 ? (
                    <span className="text-foreground font-medium">{crumb.label}</span>
                  ) : (
                    <Link href={crumb.href} className="hover:text-foreground transition-colors">{crumb.label}</Link>
                  )}
                </Fragment>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Content area — centered container, sidebar + main fill its width */}
      <div className="flex-1 flex flex-col min-h-0">
        <div className="mx-auto w-full max-w-[1200px] px-6 lg:px-8 flex-1 flex min-h-0">
          {/* Sidebar — always visible on desktop for components pages */}
          {isComponentsPage && (
            <aside className="hidden md:flex flex-col shrink-0 w-[200px] border-r border-border">
              <nav className="sticky top-14 overflow-y-auto py-6 pr-4 space-y-6 h-[calc(100vh-3.5rem)]">
                {Object.entries(groupedComponents).map(([category, comps]) => (
                  <div key={category}>
                    <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      {categoryNames[category] || category}
                    </div>
                    <div className="space-y-0.5">
                      {(comps as any[]).map((comp: any) => (
                        <Link
                          key={comp.id}
                          href={\`/design-system/components/\${comp.id}\`}
                          className={\`block px-3 py-1.5 rounded-md text-sm transition-colors \${pathname === \`/design-system/components/\${comp.id}\` ? 'bg-muted text-foreground font-medium' : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'}\`}
                        >
                          {compName(comp)}
                        </Link>
                      ))}
                    </div>
                  </div>
                ))}
              </nav>
            </aside>
          )}

          {/* Main content — fills remaining width */}
          <main className={\`flex-1 min-w-0 py-8 \${isComponentsPage ? 'md:pl-8' : ''}\`}>
            {children}
          </main>
        </div>

        <footer className="border-t border-border shrink-0">
          <div className="mx-auto w-full max-w-[1200px] px-6 lg:px-8 py-5">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 text-sm text-muted-foreground">
              <p>
                Coherent Design Method · by{' '}
                <a href="https://www.linkedin.com/in/sergeikovtun/" target="_blank" rel="noopener noreferrer" className="underline hover:text-foreground transition-colors">
                  Sergei Kovtun
                </a>
              </p>
              <Link href="/" className="hover:text-foreground transition-colors">Back to App</Link>
            </div>
          </div>
        </footer>
      </div>
    </div>
  )
}
`
