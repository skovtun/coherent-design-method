/**
 * Design System layout — v0.17.1 redesign per user feedback on v0.17.0.
 *
 * Changes from v0.17.0:
 * - Two-level navigation: top categories with auto-expanded subitems
 * - Components list dynamically fetched from /api/design-system/config
 * - Back to App link above project brand (chrome, not IA)
 * - Theme toggle moved to top-right of main content (sticky bar)
 * - "C" logo letter removed — project name only
 * - Sidebar hybrid: #0a0a0a in light mode (inverted rail), bg-card in
 *   dark mode (matches project palette per codex consult)
 * - Mono usage reduced — kept only for: number prefixes, version/date,
 *   code blocks. Sans for nav labels, group names, headings.
 * - Reduced content padding
 *
 * Placeholders: {{PROJECT_NAME}}, {{PROJECT_VERSION}}, {{GENERATED_AT}}.
 */
export const DESIGN_SYSTEM_LAYOUT = `'use client'
import Link from 'next/link'
import { Fragment, useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'

const PROJECT_NAME = '{{PROJECT_NAME}}'
const PROJECT_VERSION = '{{PROJECT_VERSION}}'
const GENERATED_AT = '{{GENERATED_AT}}'

const KNOWN_NAMES: Record<string, string> = {
  button: 'Button', input: 'Input', label: 'Label', select: 'Select',
  switch: 'Switch', checkbox: 'Checkbox', card: 'Card', badge: 'Badge',
  table: 'Table', textarea: 'Textarea', dialog: 'Dialog',
  'alert-dialog': 'AlertDialog', separator: 'Separator', progress: 'Progress',
  avatar: 'Avatar', tabs: 'Tabs', accordion: 'Accordion', skeleton: 'Skeleton',
  tooltip: 'Tooltip', 'radio-group': 'RadioGroup', slider: 'Slider',
}

// Static IA. 'Components' and 'Patterns' get dynamic children appended at runtime.
type StaticGroup = {
  num: string
  label: string
  href: string                // group overview link (clicking the label navigates here)
  links: { href: string; label: string }[]
  routePrefix: string         // for active-state matching
}

const STATIC_GROUPS: StaticGroup[] = [
  {
    num: '01',
    label: 'Foundations',
    href: '/design-system/tokens',
    routePrefix: '/design-system/tokens',
    links: [
      { href: '/design-system/tokens/colors', label: 'Color' },
      { href: '/design-system/tokens/typography', label: 'Typography' },
      { href: '/design-system/tokens/spacing', label: 'Spacing' },
      { href: '/design-system/tokens', label: 'All tokens' },
    ],
  },
  {
    num: '02',
    label: 'Components',
    href: '/design-system/components',
    routePrefix: '/design-system/components',
    links: [],   // populated dynamically
  },
  {
    num: '03',
    label: 'Patterns',
    href: '/design-system/shared',
    routePrefix: '/design-system/shared',
    links: [
      { href: '/design-system/shared', label: 'Shared blocks' },
      { href: '/design-system/sitemap', label: 'Sitemap' },
    ],
  },
  {
    num: '04',
    label: 'Voice',
    href: '/design-system/voice',
    routePrefix: '/design-system/voice',
    links: [
      { href: '/design-system/voice', label: 'Principles' },
      { href: '/design-system/recommendations', label: 'Recommendations' },
      { href: '/design-system/docs', label: 'Documentation' },
    ],
  },
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
      className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border bg-card text-muted-foreground outline-none transition-colors hover:text-foreground"
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
  const [components, setComponents] = useState<{ id: string; name: string; category?: string }[]>([])
  const [shared, setShared] = useState<{ id: string; name: string }[]>([])
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  useEffect(() => {
    fetch('/api/design-system/config')
      .then(r => r.json())
      .then(d => {
        const sorted = (d.components ?? []).slice().sort((a: any, b: any) => {
          const an = (KNOWN_NAMES[a.id] || a.name || a.id).toLowerCase()
          const bn = (KNOWN_NAMES[b.id] || b.name || b.id).toLowerCase()
          return an.localeCompare(bn)
        })
        setComponents(sorted)
      })
      .catch(() => setComponents([]))
    fetch('/api/design-system/shared-components')
      .then(r => r.json())
      .then(d => setShared((d.shared ?? d ?? []).slice().sort((a: any, b: any) => (a.name || '').localeCompare(b.name || ''))))
      .catch(() => setShared([]))
  }, [])

  const isPathActive = (href: string) =>
    pathname === href || (href !== '/design-system' && pathname?.startsWith(href + '/'))

  const isGroupActive = (group: StaticGroup) =>
    pathname === group.routePrefix || pathname?.startsWith(group.routePrefix + '/')

  const buildGroupLinks = (group: StaticGroup): { href: string; label: string }[] => {
    if (group.label === 'Components') {
      const dynamic = components.map(c => ({
        href: \`/design-system/components/\${c.id}\`,
        label: KNOWN_NAMES[c.id] || c.name || c.id,
      }))
      return [{ href: '/design-system/components', label: 'All components' }, ...dynamic]
    }
    if (group.label === 'Patterns') {
      const dynamic = shared.map(s => ({
        href: \`/design-system/shared/\${s.id}\`,
        label: s.name,
      }))
      return [...group.links.filter(l => !l.href.includes('/shared/')), ...(dynamic.length ? [{ href: '/design-system/shared', label: 'Shared blocks' }, ...dynamic, { href: '/design-system/sitemap', label: 'Sitemap' }] : group.links)]
    }
    return group.links
  }

  const renderGroup = (group: StaticGroup) => {
    const active = isGroupActive(group)
    const links = buildGroupLinks(group)
    return (
      <div key={group.num} className="mb-5">
        <Link
          href={group.href}
          onClick={() => setMobileMenuOpen(false)}
          className={\`flex items-baseline gap-2 px-3 py-1 text-[11.5px] font-medium uppercase tracking-[0.12em] transition-colors \${
            active ? 'text-white' : 'text-white/55 hover:text-white/80'
          }\`}
        >
          <span className="font-mono text-[10.5px] text-white/30">{group.num}</span>
          <span>{group.label}</span>
        </Link>
        {active && links.length > 0 && (
          <div className="mt-1 flex flex-col gap-[1px]">
            {links.map((link) => {
              const linkActive = isPathActive(link.href)
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className={\`rounded-md px-3 py-[7px] text-[13.5px] outline-none transition-colors \${
                    linkActive
                      ? 'bg-white/10 text-white'
                      : 'text-white/65 hover:bg-white/5 hover:text-white'
                  }\`}
                >
                  {link.label}
                </Link>
              )
            })}
          </div>
        )}
      </div>
    )
  }

  // Subtle breadcrumb at top of main content area for orientation.
  const getBreadcrumbs = () => {
    if (!pathname) return []
    const parts = pathname.replace('/design-system', '').split('/').filter(Boolean)
    if (parts.length === 0) return []
    const crumbs: { label: string; href: string }[] = []
    if (parts[0] === 'components') {
      crumbs.push({ label: 'Components', href: '/design-system/components' })
      if (parts[1]) crumbs.push({ label: KNOWN_NAMES[parts[1]] || parts[1].replace(/-/g, ' '), href: pathname })
    } else if (parts[0] === 'tokens') {
      crumbs.push({ label: 'Foundations', href: '/design-system/tokens' })
      if (parts[1]) crumbs.push({ label: parts[1], href: pathname })
    } else if (parts[0] === 'shared') {
      crumbs.push({ label: 'Patterns', href: '/design-system/shared' })
      if (parts[1]) crumbs.push({ label: decodeURIComponent(parts[1]), href: pathname })
    } else if (parts[0] === 'docs') {
      crumbs.push({ label: 'Voice', href: '/design-system/voice' })
      crumbs.push({ label: 'Documentation', href: '/design-system/docs' })
    } else if (parts[0] === 'voice') {
      crumbs.push({ label: 'Voice', href: '/design-system/voice' })
    } else if (parts[0] === 'sitemap') {
      crumbs.push({ label: 'Patterns', href: '/design-system/shared' })
      crumbs.push({ label: 'Sitemap', href: '/design-system/sitemap' })
    } else if (parts[0] === 'recommendations') {
      crumbs.push({ label: 'Voice', href: '/design-system/voice' })
      crumbs.push({ label: 'Recommendations', href: '/design-system/recommendations' })
    }
    return crumbs
  }

  const breadcrumbs = getBreadcrumbs()

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      {/* Permanent left sidebar — dark in light mode (inverted rail);
          uses bg-card token in dark mode so it harmonizes with the rest. */}
      <aside className="hidden md:flex w-[260px] shrink-0 flex-col bg-[#0a0a0a] dark:bg-card dark:border-r dark:border-border text-white dark:text-foreground">
        <div className="sticky top-0 flex h-screen flex-col">
          {/* Back to App — chrome, sits above the brand */}
          <div className="px-4 pt-4 pb-3">
            <Link
              href="/"
              className="inline-flex items-center gap-2 rounded-md px-2 py-1.5 text-[12.5px] text-white/55 outline-none transition-colors hover:bg-white/5 hover:text-white dark:text-muted-foreground dark:hover:bg-muted dark:hover:text-foreground"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m12 19-7-7 7-7"/><path d="M19 12H5"/></svg>
              Back to App
            </Link>
          </div>

          <div className="border-b border-white/5 dark:border-border" />

          {/* Brand — name only, no logo letter */}
          <div className="px-5 pt-5 pb-5">
            <Link href="/design-system" className="block outline-none">
              <div className="text-[15px] font-semibold tracking-tight text-white dark:text-foreground">{PROJECT_NAME}</div>
              <div className="mt-0.5 text-[11px] uppercase tracking-[0.16em] text-white/40 dark:text-muted-foreground">Design System</div>
            </Link>
          </div>

          {/* Nav — scrollable, two-level, auto-expands active group */}
          <nav aria-label="Design System navigation" className="flex-1 overflow-y-auto px-3 pb-6">
            {STATIC_GROUPS.map(renderGroup)}
          </nav>

          {/* Footer — metadata only (theme toggle moved to main content top-right) */}
          <div className="border-t border-white/5 dark:border-border px-5 py-4">
            <div className="flex flex-col gap-1 font-mono text-[10.5px] text-white/40 dark:text-muted-foreground">
              <div><span className="text-white/30 dark:text-muted-foreground/70">version</span> · <span className="tabular-nums">{PROJECT_VERSION}</span></div>
              <div><span className="text-white/30 dark:text-muted-foreground/70">generated</span> · <span className="tabular-nums">{GENERATED_AT}</span></div>
            </div>
          </div>
        </div>
      </aside>

      {/* Main column */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top bar — desktop has theme toggle right-aligned; mobile has full header */}
        <header className="sticky top-0 z-40 flex h-12 items-center justify-between border-b border-border bg-background/90 px-4 backdrop-blur lg:px-6">
          <div className="flex items-center gap-3 md:hidden">
            <Link href="/design-system" className="text-[14px] font-semibold tracking-tight">
              {PROJECT_NAME}
            </Link>
            <span className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">DS</span>
          </div>

          {/* Breadcrumbs on desktop, takes left space */}
          <div className="hidden items-center md:flex">
            {breadcrumbs.length > 0 ? (
              <div className="flex flex-wrap items-center gap-1.5 text-[12.5px] text-muted-foreground">
                <Link href="/design-system" className="transition-colors hover:text-foreground">Design System</Link>
                {breadcrumbs.map((crumb, i) => (
                  <Fragment key={\`\${crumb.href}-\${i}\`}>
                    <span aria-hidden className="text-muted-foreground/40">/</span>
                    {i === breadcrumbs.length - 1 ? (
                      <span className="text-foreground">{crumb.label}</span>
                    ) : (
                      <Link href={crumb.href} className="transition-colors hover:text-foreground">
                        {crumb.label}
                      </Link>
                    )}
                  </Fragment>
                ))}
              </div>
            ) : (
              <span className="text-[12.5px] text-muted-foreground">Design System</span>
            )}
          </div>

          {/* Right side — theme toggle + mobile menu */}
          <div className="flex items-center gap-1.5">
            <ThemeToggle />
            <button
              type="button"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              aria-label={mobileMenuOpen ? 'Close menu' : 'Open menu'}
              className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border bg-card text-muted-foreground outline-none md:hidden"
            >
              {mobileMenuOpen ? (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
              ) : (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><line x1="4" x2="20" y1="6" y2="6"/><line x1="4" x2="20" y1="12" y2="12"/><line x1="4" x2="20" y1="18" y2="18"/></svg>
              )}
            </button>
          </div>
        </header>

        {/* Mobile drawer */}
        {mobileMenuOpen && (
          <div className="border-b border-border bg-[#0a0a0a] dark:bg-card text-white dark:text-foreground md:hidden">
            <div className="px-3 py-4">
              <Link
                href="/"
                onClick={() => setMobileMenuOpen(false)}
                className="mb-3 inline-flex items-center gap-2 rounded-md px-2 py-1.5 text-[12.5px] text-white/55 hover:bg-white/5 hover:text-white"
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m12 19-7-7 7-7"/><path d="M19 12H5"/></svg>
                Back to App
              </Link>
              {STATIC_GROUPS.map(renderGroup)}
              <div className="mt-4 border-t border-white/5 px-2 pt-3 font-mono text-[10.5px] text-white/40">
                v{PROJECT_VERSION} · {GENERATED_AT}
              </div>
            </div>
          </div>
        )}

        {/* Content — reduced padding from v0.17.0 */}
        <main className="flex-1">
          <div className="mx-auto w-full max-w-[1024px] px-5 py-8 lg:px-8 lg:py-10">
            {children}
          </div>
        </main>
      </div>
    </div>
  )
}
`
