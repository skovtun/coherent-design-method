/**
 * Design System layout — Console skin (token-driven, portable).
 *
 * Uses shadcn CSS tokens (bg-card, bg-muted, text-muted-foreground, text-primary)
 * so the same layout reads natively inside any downstream atmosphere. Identity
 * is carried by rhythm (mono labels, tabular-nums, border-first, accent dots)
 * not by fixed colors.
 */
export const DESIGN_SYSTEM_LAYOUT = `'use client'
import Link from 'next/link'
import { Fragment, useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'

const CATEGORY_NAMES: Record<string, string> = {
  form: 'Form',
  layout: 'Layout',
  navigation: 'Navigation',
  'data-display': 'Data Display',
  overlay: 'Overlay',
  feedback: 'Feedback',
  other: 'Other',
}

const KNOWN_NAMES: Record<string, string> = {
  button: 'Button', input: 'Input', label: 'Label', select: 'Select',
  switch: 'Switch', checkbox: 'Checkbox', card: 'Card', badge: 'Badge',
  table: 'Table', textarea: 'Textarea', dialog: 'Dialog',
  'alert-dialog': 'AlertDialog', separator: 'Separator', progress: 'Progress',
  avatar: 'Avatar', tabs: 'Tabs', accordion: 'Accordion', skeleton: 'Skeleton',
  tooltip: 'Tooltip', 'radio-group': 'RadioGroup', slider: 'Slider',
}

const NAV_LINKS = [
  { href: '/design-system', label: 'Overview' },
  { href: '/design-system/components', label: 'Components' },
  { href: '/design-system/shared', label: 'Shared' },
  { href: '/design-system/tokens', label: 'Tokens' },
  { href: '/design-system/sitemap', label: 'Sitemap' },
  { href: '/design-system/docs', label: 'Docs' },
  { href: '/design-system/recommendations', label: 'Recs' },
]

function ThemeToggle() {
  const [dark, setDark] = useState(false)
  useEffect(() => {
    setDark(document.documentElement.classList.contains('dark'))
  }, [])
  const toggle = () => {
    const next = !dark
    setDark(next)
    document.documentElement.classList.toggle('dark', next)
  }
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={dark ? 'Switch to light theme' : 'Switch to dark theme'}
      className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border bg-muted text-muted-foreground outline-none transition-colors hover:text-foreground"
    >
      {dark ? (
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/></svg>
      ) : (
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/></svg>
      )}
    </button>
  )
}

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
      .then((res) => res.json())
      .then((data) => setComponents(data.components || []))
      .catch(() => [])
  }, [])

  const groupedComponents = components.reduce((acc, comp) => {
    const category = comp.category || 'other'
    if (!acc[category]) acc[category] = []
    acc[category].push(comp)
    return acc
  }, {} as Record<string, any[]>)

  const compName = (c: any) => KNOWN_NAMES[c.id] || c.name || c.id

  const getBreadcrumbs = () => {
    if (!pathname) return []
    const parts = pathname.replace('/design-system', '').split('/').filter(Boolean)
    const crumbs: { label: string; href: string }[] = [
      { label: 'design-system', href: '/design-system' },
    ]
    if (parts[0] === 'components') {
      crumbs.push({ label: 'components', href: '/design-system/components' })
      if (parts[1]) {
        crumbs.push({ label: KNOWN_NAMES[parts[1]] || parts[1].replace(/-/g, ' '), href: pathname })
      }
    }
    if (parts[0] === 'shared') {
      crumbs.push({ label: 'shared', href: '/design-system/shared' })
      if (parts[1]) crumbs.push({ label: decodeURIComponent(parts[1]), href: pathname })
    }
    if (parts[0] === 'tokens') {
      crumbs.push({ label: 'tokens', href: '/design-system/tokens' })
      if (parts[1]) crumbs.push({ label: parts[1], href: pathname })
    }
    if (parts[0] === 'sitemap') crumbs.push({ label: 'sitemap', href: '/design-system/sitemap' })
    if (parts[0] === 'docs') {
      crumbs.push({ label: 'docs', href: '/design-system/docs' })
      if (parts[1]) {
        const label = parts[1] === 'for-designers' ? 'for designers' : parts[1]
        crumbs.push({ label, href: pathname })
      }
    }
    if (parts[0] === 'recommendations') {
      crumbs.push({ label: 'recommendations', href: '/design-system/recommendations' })
    }
    return crumbs
  }

  const breadcrumbs = getBreadcrumbs()
  const isActive = (href: string) =>
    pathname === href || (href !== '/design-system' && pathname?.startsWith(href))

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      {/* HEADER */}
      <header className="sticky top-0 z-50 border-b border-border bg-background/90 backdrop-blur supports-[backdrop-filter]:bg-background/70">
        <div className="mx-auto flex h-14 w-full max-w-[1200px] items-center gap-4 px-4 lg:px-6">
          <Link
            href="/design-system"
            className="inline-flex items-center gap-2 font-mono text-[12px] font-medium uppercase tracking-[0.18em] text-foreground outline-none transition-colors hover:text-primary"
          >
            <span className="h-1.5 w-1.5 rounded-[2px] bg-primary" />
            design system
          </Link>

          <nav
            aria-label="Design System navigation"
            className="hidden flex-1 items-center justify-center gap-1 font-mono md:flex"
          >
            {NAV_LINKS.map((link) => {
              const active = isActive(link.href)
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={\`inline-flex h-8 items-center rounded-md px-3 text-[12.5px] outline-none transition-colors \${
                    active
                      ? 'bg-muted text-foreground shadow-[inset_0_0_0_1px_hsl(var(--border))]'
                      : 'text-muted-foreground hover:text-foreground'
                  }\`}
                >
                  {link.label}
                </Link>
              )
            })}
          </nav>

          <div className="ml-auto flex items-center gap-1.5 md:ml-0">
            <ThemeToggle />
            <button
              type="button"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              aria-label={mobileMenuOpen ? 'Close menu' : 'Open menu'}
              className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border bg-muted text-muted-foreground outline-none transition-colors hover:text-foreground md:hidden"
            >
              {mobileMenuOpen ? (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
              ) : (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><line x1="4" x2="20" y1="6" y2="6"/><line x1="4" x2="20" y1="12" y2="12"/><line x1="4" x2="20" y1="18" y2="18"/></svg>
              )}
            </button>
          </div>
        </div>

        {/* mobile menu */}
        <div
          className={\`overflow-hidden border-t border-border bg-background/90 backdrop-blur transition-[max-height,opacity] duration-[220ms] ease-[cubic-bezier(0.25,1,0.5,1)] md:hidden \${
            mobileMenuOpen ? 'max-h-[480px] opacity-100' : 'max-h-0 opacity-0'
          }\`}
          aria-hidden={!mobileMenuOpen}
        >
          <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-1 px-4 py-3 lg:px-6">
            {NAV_LINKS.map((link) => {
              const active = isActive(link.href)
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className={\`flex items-center justify-between rounded-md px-3 py-2.5 font-mono text-[13px] \${
                    active
                      ? 'bg-muted text-foreground shadow-[inset_0_0_0_1px_hsl(var(--border))]'
                      : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                  }\`}
                >
                  {link.label}
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="text-muted-foreground/60"><path d="m9 18 6-6-6-6"/></svg>
                </Link>
              )
            })}
          </div>
        </div>
      </header>

      {/* BREADCRUMBS */}
      {breadcrumbs.length > 1 && (
        <div className="border-b border-border bg-card">
          <div className="mx-auto w-full max-w-[1200px] px-4 py-2 lg:px-6">
            <div className="flex flex-wrap items-center gap-1.5 font-mono text-[11px] text-muted-foreground/70">
              {breadcrumbs.map((crumb, i) => (
                <Fragment key={\`\${crumb.href}-\${i}\`}>
                  {i > 0 && <span aria-hidden>/</span>}
                  {i === breadcrumbs.length - 1 ? (
                    <span className="text-primary">{crumb.label}</span>
                  ) : (
                    <Link href={crumb.href} className="transition-colors hover:text-foreground">
                      {crumb.label}
                    </Link>
                  )}
                </Fragment>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* CONTENT */}
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="mx-auto flex w-full min-h-0 max-w-[1200px] flex-1 px-4 lg:px-6">
          {isComponentsPage && (
            <aside className="hidden w-[220px] shrink-0 flex-col border-r border-border md:flex">
              <nav className="sticky top-14 h-[calc(100vh-3.5rem)] space-y-5 overflow-y-auto py-6 pr-4">
                {Object.entries(groupedComponents).map(([category, comps]) => (
                  <div key={category}>
                    <div className="mb-1.5 px-2 font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground/70">
                      {CATEGORY_NAMES[category] || category}
                    </div>
                    <div className="flex flex-col gap-[2px]">
                      {(comps as any[]).map((comp: any) => {
                        const active = pathname === \`/design-system/components/\${comp.id}\`
                        return (
                          <Link
                            key={comp.id}
                            href={\`/design-system/components/\${comp.id}\`}
                            className={\`rounded-md px-2 py-1.5 font-mono text-[12.5px] outline-none transition-colors \${
                              active
                                ? 'bg-muted text-foreground shadow-[inset_0_0_0_1px_hsl(var(--border))]'
                                : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                            }\`}
                          >
                            {compName(comp)}
                          </Link>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </nav>
            </aside>
          )}

          <main className={\`min-w-0 flex-1 py-8 \${isComponentsPage ? 'md:pl-8' : ''}\`}>
            {children}
          </main>
        </div>

        {/* FOOTER */}
        <footer className="border-t border-border bg-card">
          <div className="mx-auto w-full max-w-[1200px] px-4 py-4 lg:px-6">
            <div className="flex flex-col items-start justify-between gap-2 font-mono text-[11px] text-muted-foreground/70 sm:flex-row sm:items-center">
              <span>design system · generated by coherent</span>
              <span className="inline-flex items-center gap-1.5 tabular-nums">
                <span className="h-1.5 w-1.5 rounded-[2px] bg-primary" />
                every token editable
              </span>
            </div>
          </div>
        </footer>
      </div>
    </div>
  )
}
`
