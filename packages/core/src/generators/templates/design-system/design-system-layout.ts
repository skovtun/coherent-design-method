/**
 * Design System layout — v0.17.0 redesign per direction doc at
 * ~/.gstack/projects/skovtun-coherent-design-method/design-system-viewer-direction-2026-04-29.md
 *
 * Editorial-first reference site. Permanent left sidebar (dark even in
 * light mode — inverted rail is Coherent's meta-shell, not the project's
 * own surface). Section-level numbering only. Main content uses project
 * tokens (bg-background, text-foreground) so atmosphere flows through.
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

// v0.17 IA per direction doc: 4 top-level groups, numbered.
// Subsections alphabetized, NOT numbered (Cmd-F friendly).
type NavSection = {
  num: string
  label: string
  links: { href: string; label: string }[]
}

const NAV_SECTIONS: NavSection[] = [
  {
    num: '01',
    label: 'Foundations',
    links: [
      { href: '/design-system/tokens/colors', label: 'Color' },
      { href: '/design-system/tokens', label: 'Typography' },
      // typography lives under tokens overview today; will split in a later release
    ],
  },
  {
    num: '02',
    label: 'Components',
    links: [{ href: '/design-system/components', label: 'All components' }],
  },
  {
    num: '03',
    label: 'Patterns',
    links: [
      { href: '/design-system/shared', label: 'Shared blocks' },
      { href: '/design-system/sitemap', label: 'Sitemap' },
    ],
  },
  {
    num: '04',
    label: 'Voice',
    links: [
      { href: '/design-system/voice', label: 'Principles' },
      { href: '/design-system/recommendations', label: 'Recommendations' },
      { href: '/design-system/docs', label: 'Documentation' },
    ],
  },
]

const ALL_LINKS = NAV_SECTIONS.flatMap(s => s.links)

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
      className="inline-flex h-7 w-7 items-center justify-center rounded-md text-white/60 outline-none transition-colors hover:bg-white/5 hover:text-white"
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
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  const isActive = (href: string) =>
    pathname === href || (href !== '/design-system' && pathname?.startsWith(href))

  const renderSection = (section: NavSection) => (
    <div key={section.num} className="mb-6">
      <div className="mb-2 flex items-baseline gap-2 px-3 font-mono text-[10.5px] uppercase tracking-[0.16em] text-white/40">
        <span className="text-white/30">{section.num}</span>
        <span>{section.label}</span>
      </div>
      <div className="flex flex-col gap-[1px]">
        {section.links.map((link) => {
          const active = isActive(link.href)
          return (
            <Link
              key={link.href}
              href={link.href}
              onClick={() => setMobileMenuOpen(false)}
              className={\`rounded-md px-3 py-1.5 text-[13.5px] outline-none transition-colors \${
                active
                  ? 'bg-white/10 text-white'
                  : 'text-white/70 hover:bg-white/5 hover:text-white'
              }\`}
            >
              {link.label}
            </Link>
          )
        })}
      </div>
    </div>
  )

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
      crumbs.push({ label: 'Tokens', href: '/design-system/tokens' })
      if (parts[1]) crumbs.push({ label: parts[1], href: pathname })
    } else if (parts[0] === 'shared') {
      crumbs.push({ label: 'Shared', href: '/design-system/shared' })
      if (parts[1]) crumbs.push({ label: decodeURIComponent(parts[1]), href: pathname })
    } else if (parts[0] === 'docs') {
      crumbs.push({ label: 'Docs', href: '/design-system/docs' })
    } else if (parts[0] === 'voice') {
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
      {/* Permanent left sidebar — dark even in light mode (inverted rail) */}
      <aside className="hidden md:flex w-[260px] shrink-0 flex-col bg-[#0a0a0a] text-white">
        <div className="sticky top-0 flex h-screen flex-col">
          {/* Brand */}
          <div className="px-5 pt-6 pb-4">
            <Link href="/design-system" className="inline-flex items-center gap-2.5 outline-none">
              <span className="grid h-7 w-7 place-items-center rounded-md bg-white/5 text-[13px] font-semibold text-white">C</span>
              <div className="flex flex-col leading-tight">
                <span className="text-[14px] font-semibold tracking-tight text-white">{PROJECT_NAME}</span>
                <span className="text-[10.5px] font-mono uppercase tracking-[0.14em] text-white/40">design system</span>
              </div>
            </Link>
          </div>

          {/* Nav — scrollable */}
          <nav aria-label="Design System navigation" className="flex-1 overflow-y-auto px-3 pt-2 pb-6">
            {NAV_SECTIONS.map(renderSection)}
          </nav>

          {/* Footer — metadata + theme toggle */}
          <div className="border-t border-white/5 px-5 py-4">
            <div className="flex flex-col gap-1 font-mono text-[10.5px] text-white/40">
              <div><span className="text-white/30">version</span> · <span className="tabular-nums">{PROJECT_VERSION}</span></div>
              <div><span className="text-white/30">generated</span> · <span className="tabular-nums">{GENERATED_AT}</span></div>
            </div>
            <div className="mt-3 flex items-center justify-end">
              <ThemeToggle />
            </div>
          </div>
        </div>
      </aside>

      {/* Main column */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile top bar */}
        <header className="sticky top-0 z-40 border-b border-border bg-background/90 backdrop-blur md:hidden">
          <div className="flex h-12 items-center justify-between px-4">
            <Link href="/design-system" className="inline-flex items-center gap-2 text-[13.5px] font-semibold">
              <span className="grid h-6 w-6 place-items-center rounded-md bg-foreground text-[12px] font-semibold text-background">C</span>
              {PROJECT_NAME}
            </Link>
            <button
              type="button"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              aria-label={mobileMenuOpen ? 'Close menu' : 'Open menu'}
              className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border text-muted-foreground"
            >
              {mobileMenuOpen ? (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
              ) : (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><line x1="4" x2="20" y1="6" y2="6"/><line x1="4" x2="20" y1="12" y2="12"/><line x1="4" x2="20" y1="18" y2="18"/></svg>
              )}
            </button>
          </div>
          {mobileMenuOpen && (
            <div className="bg-[#0a0a0a] text-white">
              <div className="px-3 py-3">
                {NAV_SECTIONS.map(renderSection)}
              </div>
              <div className="border-t border-white/5 px-5 py-3 font-mono text-[10.5px] text-white/40">
                v{PROJECT_VERSION} · {GENERATED_AT}
              </div>
            </div>
          )}
        </header>

        {/* Breadcrumbs (subtle, only on subpages) */}
        {breadcrumbs.length > 0 && (
          <div className="border-b border-border">
            <div className="mx-auto w-full max-w-[1024px] px-6 py-3 lg:px-10">
              <div className="flex flex-wrap items-center gap-1.5 font-mono text-[11px] text-muted-foreground">
                <Link href="/design-system" className="transition-colors hover:text-foreground">design system</Link>
                {breadcrumbs.map((crumb, i) => (
                  <Fragment key={\`\${crumb.href}-\${i}\`}>
                    <span aria-hidden className="text-muted-foreground/40">/</span>
                    {i === breadcrumbs.length - 1 ? (
                      <span className="text-foreground">{crumb.label.toLowerCase()}</span>
                    ) : (
                      <Link href={crumb.href} className="transition-colors hover:text-foreground">
                        {crumb.label.toLowerCase()}
                      </Link>
                    )}
                  </Fragment>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Content — generous gutter, max-w varies by route via main child */}
        <main className="flex-1">
          <div className="mx-auto w-full max-w-[1024px] px-6 py-12 lg:px-10 lg:py-16">
            {children}
          </div>
        </main>
      </div>
    </div>
  )
}
`
