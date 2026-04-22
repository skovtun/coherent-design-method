/**
 * Design System home page — Console skin. Placeholders: {{COMPONENTS_JSON}}, {{TOKENS_JSON}}.
 */
export const DESIGN_SYSTEM_HOME = `'use client'
import Link from 'next/link'

const KNOWN_NAMES: Record<string, string> = {
  button: 'Button', input: 'Input', label: 'Label', select: 'Select',
  switch: 'Switch', checkbox: 'Checkbox', card: 'Card', badge: 'Badge',
  table: 'Table', textarea: 'Textarea', dialog: 'Dialog',
  'alert-dialog': 'AlertDialog', separator: 'Separator', progress: 'Progress',
  avatar: 'Avatar', tabs: 'Tabs', accordion: 'Accordion', skeleton: 'Skeleton',
  tooltip: 'Tooltip', 'radio-group': 'RadioGroup', slider: 'Slider',
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-2 flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground/70">
      <span className="h-1.5 w-1.5 rounded-[2px] bg-primary" />
      {children}
    </div>
  )
}

export default function DesignSystemPage() {
  const components = {{COMPONENTS_JSON}}
  const tokens = {{TOKENS_JSON}}

  const colorCount = tokens?.colors?.light ? Object.keys(tokens.colors.light).length : 0
  const spacingCount = tokens?.spacing ? Object.keys(tokens.spacing).length : 0
  const radiusCount = tokens?.radius ? Object.keys(tokens.radius).length : 0
  const tokenTotal = colorCount + spacingCount + radiusCount

  const stats = [
    { label: 'components', value: components.length, hint: 'view all', href: '/design-system/components' },
    { label: 'tokens', value: tokenTotal, hint: 'colors · spacing · radius', href: '/design-system/tokens' },
    { label: 'docs', value: '∞', hint: 'usage & practices', href: '/design-system/docs' },
  ]

  return (
    <div className="flex flex-col gap-8">
      {/* Header */}
      <div>
        <h1 className="text-[28px] font-medium leading-tight tracking-[-0.02em] text-foreground">
          Design System
        </h1>
        <p className="mt-1 text-[13.5px] text-muted-foreground">
          Interactive component library · tokens · recent activity.
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        {stats.map((s) => (
          <Link
            key={s.label}
            href={s.href}
            className="group rounded-md border border-border bg-card p-4 outline-none transition-colors hover:border-primary/50 hover:bg-muted"
          >
            <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground/70">
              {s.label}
            </div>
            <div className="mt-1.5 font-mono text-[28px] font-medium leading-none tracking-tight tabular-nums text-foreground">
              {s.value}
            </div>
            <div className="mt-2 flex items-center justify-between font-mono text-[10.5px] text-muted-foreground/70">
              <span>{s.hint}</span>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="transition-transform duration-150 group-hover:translate-x-0.5 group-hover:text-primary"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
            </div>
          </Link>
        ))}
      </div>

      {/* Components Grid */}
      <div>
        <SectionLabel>components</SectionLabel>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
          {components.map((comp: any) => (
            <Link
              key={comp.id}
              href={\`/design-system/components/\${comp.id}\`}
              className="group flex items-center justify-between rounded-md border border-border bg-card px-4 py-3 outline-none transition-colors hover:border-primary/50 hover:bg-muted"
            >
              <div className="min-w-0">
                <div className="truncate text-[13.5px] font-medium text-foreground">
                  {KNOWN_NAMES[comp.id] || comp.name}
                </div>
                <div className="mt-0.5 font-mono text-[10.5px] text-muted-foreground/70">
                  {(comp.variants?.length ?? 0)} variant{comp.variants?.length === 1 ? '' : 's'} · {(comp.sizes?.length ?? 0)} size{comp.sizes?.length === 1 ? '' : 's'}
                </div>
              </div>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="ml-2 shrink-0 text-muted-foreground/60 transition-transform duration-150 group-hover:translate-x-0.5 group-hover:text-primary"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
            </Link>
          ))}
        </div>
      </div>

      {/* Quick Links */}
      <div>
        <SectionLabel>quick links</SectionLabel>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <Link
            href="/design-system/tokens/colors"
            className="group flex items-center justify-between rounded-md border border-border bg-card p-5 outline-none transition-colors hover:border-primary/50 hover:bg-muted"
          >
            <div>
              <div className="text-[14px] font-medium text-foreground">Color Tokens</div>
              <div className="mt-0.5 font-mono text-[10.5px] text-muted-foreground/70">
                light + dark palettes
              </div>
            </div>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="text-muted-foreground/60 transition-transform duration-150 group-hover:translate-x-0.5 group-hover:text-primary"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
          </Link>
          <Link
            href="/design-system/docs"
            className="group flex items-center justify-between rounded-md border border-border bg-card p-5 outline-none transition-colors hover:border-primary/50 hover:bg-muted"
          >
            <div>
              <div className="text-[14px] font-medium text-foreground">Documentation</div>
              <div className="mt-0.5 font-mono text-[10.5px] text-muted-foreground/70">
                usage · best practices
              </div>
            </div>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="text-muted-foreground/60 transition-transform duration-150 group-hover:translate-x-0.5 group-hover:text-primary"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
          </Link>
        </div>
      </div>
    </div>
  )
}
`
