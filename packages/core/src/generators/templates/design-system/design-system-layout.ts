/**
 * Design System layout — v0.17.2 redesign per user feedback on v0.17.1.
 *
 * Changes from v0.17.1:
 * - Sidebar header reordered: brand block top → divider → Back to App → divider → nav
 * - IA restructure (no numbering): Foundations (Color/Typography/Spacing/Voice) /
 *   Base Components (dynamic) / Shared Components (dynamic) / Sitemap /
 *   Documentation / Recommendations. Tail-3 are flat (no children).
 * - Sidebar uses bg-background in BOTH modes (no more #0a0a0a inverted rail).
 *   Reason: black inverted rail clashes with project dark blue in dark mode.
 *   Now a quiet panel with border-r — matches Geist/Primer/Atlassian.
 * - Reduced inner content padding (px-4 py-6 lg:px-6 lg:py-8)
 * - Voice moved INSIDE Foundations (semantic primitive, not own group)
 * - Tail groups (Sitemap/Documentation/Recommendations) below a soft divider
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

// IA — flat, 2 sections in nav. Top: Foundations / Base Components /
// Shared Components. Tail: Sitemap / Documentation / Recommendations.
type NavGroup = {
  label: string
  href: string                         // group overview link
  routePrefix: string                  // for active-state matching
  links: { href: string; label: string }[]   // children (empty = no expand)
  dynamic?: 'base-components' | 'shared-components'
  icon: 'foundations' | 'base' | 'shared' | 'sitemap' | 'docs' | 'recs'
}

const TOP_GROUPS: NavGroup[] = [
  {
    label: 'Foundations',
    href: '/design-system/tokens',
    routePrefix: '/design-system/tokens',
    icon: 'foundations',
    links: [
      { href: '/design-system/tokens/colors', label: 'Color' },
      { href: '/design-system/tokens/typography', label: 'Typography' },
      { href: '/design-system/tokens/spacing', label: 'Spacing' },
      { href: '/design-system/voice', label: 'Voice' },
    ],
  },
  {
    label: 'Base Components',
    href: '/design-system/components',
    routePrefix: '/design-system/components',
    icon: 'base',
    links: [],
    dynamic: 'base-components',
  },
  {
    label: 'Shared Components',
    href: '/design-system/shared',
    routePrefix: '/design-system/shared',
    icon: 'shared',
    links: [],
    dynamic: 'shared-components',
  },
]

const TAIL_GROUPS: NavGroup[] = [
  {
    label: 'Sitemap',
    href: '/design-system/sitemap',
    routePrefix: '/design-system/sitemap',
    icon: 'sitemap',
    links: [],
  },
  {
    label: 'Documentation',
    href: '/design-system/docs',
    routePrefix: '/design-system/docs',
    icon: 'docs',
    links: [],
  },
  {
    label: 'Recommendations',
    href: '/design-system/recommendations',
    routePrefix: '/design-system/recommendations',
    icon: 'recs',
    links: [],
  },
]

// Inline SVG icons — 14px stroke 1.5, picked to communicate the group's
// concept at a glance. Lucide-style.
function GroupIcon({ name }: { name: NavGroup['icon'] }) {
  const common = { width: 14, height: 14, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true }
  if (name === 'foundations') {
    // Stack/layers — primitives
    return <svg {...common}><path d="M12 2 2 7l10 5 10-5-10-5z"/><path d="m2 17 10 5 10-5"/><path d="m2 12 10 5 10-5"/></svg>
  }
  if (name === 'base') {
    // Box — base component primitives
    return <svg {...common}><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/></svg>
  }
  if (name === 'shared') {
    // Blocks — assembled from primitives
    return <svg {...common}><rect width="7" height="7" x="3" y="3" rx="1"/><rect width="7" height="7" x="14" y="3" rx="1"/><rect width="7" height="7" x="14" y="14" rx="1"/><rect width="7" height="7" x="3" y="14" rx="1"/></svg>
  }
  if (name === 'sitemap') {
    // Network — page tree
    return <svg {...common}><circle cx="12" cy="5" r="2"/><circle cx="5" cy="19" r="2"/><circle cx="19" cy="19" r="2"/><path d="M12 7v4"/><path d="M5 17v-2a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v2"/></svg>
  }
  if (name === 'docs') {
    // Book — documentation
    return <svg {...common}><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20"/></svg>
  }
  // recs — lightbulb (suggestions)
  return <svg {...common}><path d="M9 18h6"/><path d="M10 22h4"/><path d="M12 2a7 7 0 0 0-4 12.7c.5.4 1 .9 1 1.6V18h6v-1.7c0-.7.5-1.2 1-1.6A7 7 0 0 0 12 2Z"/></svg>
}

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
  const [pageCount, setPageCount] = useState(0)
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
        setPageCount(Array.isArray(d.pages) ? d.pages.length : 0)
      })
      .catch(() => setComponents([]))
    fetch('/api/design-system/shared-components')
      .then(r => r.json())
      .then(d => setShared((d.shared ?? d ?? []).slice().sort((a: any, b: any) => (a.name || '').localeCompare(b.name || ''))))
      .catch(() => setShared([]))
  }, [])

  // Exact match — used for nav children. Prevents "All X" overview links
  // from staying active when the user drills into /All/Badge etc.
  const isExactActive = (href: string) => pathname === href

  // Used for breadcrumbs — startsWith is correct there.
  const isPathActive = (href: string) =>
    pathname === href || (href !== '/design-system' && pathname?.startsWith(href + '/'))

  // Group is active if its routePrefix matches OR any of its child links does.
  // The child-link check makes Foundations expand when on /voice (Voice is
  // a Foundations child but lives under a different routePrefix).
  const isGroupActive = (group: NavGroup) => {
    if (pathname === group.routePrefix || pathname?.startsWith(group.routePrefix + '/')) {
      return true
    }
    return group.links.some(l => isPathActive(l.href))
  }

  const buildGroupLinks = (group: NavGroup): { href: string; label: string }[] => {
    if (group.dynamic === 'base-components') {
      const dynamic = components.map(c => ({
        href: \`/design-system/components/\${c.id}\`,
        label: KNOWN_NAMES[c.id] || c.name || c.id,
      }))
      return [{ href: '/design-system/components', label: 'All components' }, ...dynamic]
    }
    if (group.dynamic === 'shared-components') {
      if (shared.length === 0) return [{ href: '/design-system/shared', label: 'All shared blocks' }]
      const dynamic = shared.map(s => ({
        href: \`/design-system/shared/\${s.id}\`,
        label: s.name,
      }))
      return [{ href: '/design-system/shared', label: 'All shared blocks' }, ...dynamic]
    }
    return group.links
  }

  const renderGroup = (group: NavGroup) => {
    const active = isGroupActive(group)
    const links = buildGroupLinks(group)
    const hasChildren = links.length > 0
    // Count badge logic: dynamic groups show live count, Foundations
    // shows static child count, Sitemap shows page count, others null.
    const count =
      group.dynamic === 'base-components' ? components.length :
      group.dynamic === 'shared-components' ? shared.length :
      group.icon === 'foundations' ? group.links.length :
      group.icon === 'sitemap' ? pageCount :
      null
    return (
      <div key={group.label} className="mb-1">
        <Link
          href={group.href}
          onClick={() => setMobileMenuOpen(false)}
          className={\`flex items-center gap-2.5 rounded-md px-3 py-1.5 text-[12px] font-medium uppercase tracking-[0.12em] transition-colors \${
            active
              ? 'bg-muted text-foreground'
              : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'
          }\`}
        >
          <span className={\`shrink-0 \${active ? 'text-foreground' : 'text-muted-foreground/70'}\`}>
            <GroupIcon name={group.icon} />
          </span>
          <span className="flex-1">{group.label}</span>
          {count !== null && count > 0 && (
            <span className="font-mono text-[10px] tabular-nums text-muted-foreground/60 normal-case tracking-normal">
              {count}
            </span>
          )}
        </Link>
        {active && hasChildren && (
          <div className="mt-1 mb-3 flex flex-col gap-[1px]">
            {links.map((link) => {
              const linkActive = isExactActive(link.href)
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className={\`rounded-md px-3 py-[6px] text-[13px] outline-none transition-colors \${
                    linkActive
                      ? 'bg-muted text-foreground'
                      : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'
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
      crumbs.push({ label: 'Base Components', href: '/design-system/components' })
      if (parts[1]) crumbs.push({ label: KNOWN_NAMES[parts[1]] || parts[1].replace(/-/g, ' '), href: pathname })
    } else if (parts[0] === 'tokens') {
      crumbs.push({ label: 'Foundations', href: '/design-system/tokens' })
      if (parts[1]) crumbs.push({ label: parts[1], href: pathname })
    } else if (parts[0] === 'shared') {
      crumbs.push({ label: 'Shared Components', href: '/design-system/shared' })
      if (parts[1]) crumbs.push({ label: decodeURIComponent(parts[1]), href: pathname })
    } else if (parts[0] === 'docs') {
      crumbs.push({ label: 'Documentation', href: '/design-system/docs' })
    } else if (parts[0] === 'voice') {
      crumbs.push({ label: 'Foundations', href: '/design-system/tokens' })
      crumbs.push({ label: 'Voice', href: '/design-system/voice' })
    } else if (parts[0] === 'sitemap') {
      crumbs.push({ label: 'Sitemap', href: '/design-system/sitemap' })
    } else if (parts[0] === 'recommendations') {
      crumbs.push({ label: 'Recommendations', href: '/design-system/recommendations' })
    }
    return crumbs
  }

  const breadcrumbs = getBreadcrumbs()

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      {/* Permanent left sidebar — subtle muted/30 surface in both modes,
          divided from content by a single border. Differentiates from
          the white content area without going to inverted-rail. */}
      <aside className="hidden md:flex w-[260px] shrink-0 flex-col border-r border-border bg-muted/30">
        <div className="sticky top-0 flex h-screen flex-col">
          {/* Brand block — name + DS subtitle, sits at the very top */}
          <div className="px-5 pt-5 pb-4">
            <Link href="/design-system" className="block outline-none">
              <div className="text-[15px] font-semibold tracking-tight text-foreground">{PROJECT_NAME}</div>
              <div className="mt-0.5 text-[10.5px] uppercase tracking-[0.18em] text-muted-foreground">Design System</div>
            </Link>
          </div>

          <div className="border-b border-border" />

          {/* Back to App — chrome, sits below brand */}
          <div className="px-3 py-2">
            <Link
              href="/"
              className="inline-flex items-center gap-2 rounded-md px-2 py-1.5 text-[12.5px] text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m12 19-7-7 7-7"/><path d="M19 12H5"/></svg>
              Back to App
            </Link>
          </div>

          <div className="border-b border-border" />

          {/* Nav — scrollable, two-section (top + tail), auto-expands active group */}
          <nav aria-label="Design System navigation" className="flex-1 overflow-y-auto px-3 py-4">
            {TOP_GROUPS.map(renderGroup)}
            <div className="my-3 border-t border-border/60" />
            {TAIL_GROUPS.map(renderGroup)}
          </nav>

          {/* Footer — version + generated metadata */}
          <div className="border-t border-border px-5 py-3">
            <div className="flex flex-col gap-0.5 font-mono text-[10.5px] text-muted-foreground">
              <div><span className="opacity-70">version</span> · <span className="tabular-nums text-foreground/80">{PROJECT_VERSION}</span></div>
              <div><span className="opacity-70">generated</span> · <span className="tabular-nums text-foreground/80">{GENERATED_AT}</span></div>
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
          <div className="border-b border-border bg-background md:hidden">
            <div className="px-3 py-4">
              <Link
                href="/"
                onClick={() => setMobileMenuOpen(false)}
                className="mb-3 inline-flex items-center gap-2 rounded-md px-2 py-1.5 text-[12.5px] text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m12 19-7-7 7-7"/><path d="M19 12H5"/></svg>
                Back to App
              </Link>
              {TOP_GROUPS.map(renderGroup)}
              <div className="my-3 border-t border-border/60" />
              {TAIL_GROUPS.map(renderGroup)}
              <div className="mt-4 border-t border-border px-2 pt-3 font-mono text-[10.5px] text-muted-foreground">
                v{PROJECT_VERSION} · {GENERATED_AT}
              </div>
            </div>
          </div>
        )}

        {/* Content — full-width with sensible cap. Wider max-w-[1280px]
            (was 1024px) gives content area more room and reduces the
            empty horizontal margins on wide displays. */}
        <main className="flex-1">
          <div className="mx-auto w-full max-w-[1280px] px-4 py-6 lg:px-6 lg:py-8">
            {children}
          </div>
        </main>
      </div>
    </div>
  )
}
`
