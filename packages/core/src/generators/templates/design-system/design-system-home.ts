/**
 * Design System home page — v0.17.0 redesign.
 *
 * Editorial-first per direction doc: opens with one paragraph of prose
 * before any preview. Hero stats become a quiet aside, not the headline.
 *
 * Placeholders: {{COMPONENTS_JSON}}, {{TOKENS_JSON}}, {{PROJECT_NAME}},
 * {{HAS_VOICE}} (string boolean from generator).
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

const PROJECT_NAME = '{{PROJECT_NAME}}'
const HAS_VOICE = {{HAS_VOICE}}

export default function DesignSystemPage() {
  const components = {{COMPONENTS_JSON}}
  const tokens = {{TOKENS_JSON}}

  const colorCount = tokens?.colors?.light ? Object.keys(tokens.colors.light).length : 0
  const spacingCount = tokens?.spacing ? Object.keys(tokens.spacing).length : 0
  const radiusCount = tokens?.radius ? Object.keys(tokens.radius).length : 0
  const tokenTotal = colorCount + spacingCount + radiusCount

  return (
    <article className="space-y-16">
      {/* Editorial intro */}
      <header className="space-y-4">
        <div className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
          {PROJECT_NAME} · design system
        </div>
        <h1 className="text-[40px] font-semibold leading-[1.05] tracking-[-0.02em] text-foreground md:text-[48px]">
          Foundations and components used across {PROJECT_NAME}.
        </h1>
        <p className="max-w-[60ch] text-[16px] leading-[1.6] text-muted-foreground">
          A working reference, not a sketch. Every token, component, and pattern
          below is what ships in production — copy, paste, and stay in sync.
        </p>
      </header>

      {/* Section index — numbered top-level groups per direction doc */}
      <section className="grid gap-4 md:grid-cols-2">
        <Link
          href="/design-system/tokens/colors"
          className="group block rounded-lg border border-border bg-card p-6 outline-none transition-colors hover:border-foreground/30"
        >
          <div className="font-mono text-[10.5px] uppercase tracking-[0.18em] text-muted-foreground">01 — Foundations</div>
          <div className="mt-2 text-[20px] font-semibold leading-tight tracking-tight text-foreground">Color, Type, Spacing</div>
          <div className="mt-1 text-[14px] text-muted-foreground">{tokenTotal} tokens · light + dark palettes</div>
          <div className="mt-4 inline-flex items-center gap-1.5 font-mono text-[12px] text-foreground/80 group-hover:text-foreground">
            see foundations
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="transition-transform group-hover:translate-x-0.5"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
          </div>
        </Link>

        <Link
          href="/design-system/components"
          className="group block rounded-lg border border-border bg-card p-6 outline-none transition-colors hover:border-foreground/30"
        >
          <div className="font-mono text-[10.5px] uppercase tracking-[0.18em] text-muted-foreground">02 — Components</div>
          <div className="mt-2 text-[20px] font-semibold leading-tight tracking-tight text-foreground">{components.length} primitives</div>
          <div className="mt-1 text-[14px] text-muted-foreground">Button, Input, Card, Dialog, …</div>
          <div className="mt-4 inline-flex items-center gap-1.5 font-mono text-[12px] text-foreground/80 group-hover:text-foreground">
            see components
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="transition-transform group-hover:translate-x-0.5"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
          </div>
        </Link>

        <Link
          href="/design-system/shared"
          className="group block rounded-lg border border-border bg-card p-6 outline-none transition-colors hover:border-foreground/30"
        >
          <div className="font-mono text-[10.5px] uppercase tracking-[0.18em] text-muted-foreground">03 — Patterns</div>
          <div className="mt-2 text-[20px] font-semibold leading-tight tracking-tight text-foreground">Shared blocks</div>
          <div className="mt-1 text-[14px] text-muted-foreground">Header, footer, layout assemblies</div>
          <div className="mt-4 inline-flex items-center gap-1.5 font-mono text-[12px] text-foreground/80 group-hover:text-foreground">
            see patterns
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="transition-transform group-hover:translate-x-0.5"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
          </div>
        </Link>

        <Link
          href={HAS_VOICE ? '/design-system/voice' : '/design-system/recommendations'}
          className="group block rounded-lg border border-border bg-card p-6 outline-none transition-colors hover:border-foreground/30"
        >
          <div className="font-mono text-[10.5px] uppercase tracking-[0.18em] text-muted-foreground">04 — Voice</div>
          <div className="mt-2 text-[20px] font-semibold leading-tight tracking-tight text-foreground">
            {HAS_VOICE ? 'How this product talks' : 'Set a voice profile'}
          </div>
          <div className="mt-1 text-[14px] text-muted-foreground">
            {HAS_VOICE ? 'Tone, copywriting rules, banned words' : 'Configure voice in design-system.config.ts'}
          </div>
          <div className="mt-4 inline-flex items-center gap-1.5 font-mono text-[12px] text-foreground/80 group-hover:text-foreground">
            {HAS_VOICE ? 'see voice' : 'how to set voice'}
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="transition-transform group-hover:translate-x-0.5"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
          </div>
        </Link>
      </section>

      {/* Components quick grid (kept from prior version, simplified) */}
      <section>
        <div className="mb-6 flex items-baseline justify-between">
          <h2 className="text-[22px] font-semibold leading-tight tracking-tight text-foreground">Component primitives</h2>
          <Link href="/design-system/components" className="font-mono text-[12px] text-muted-foreground transition-colors hover:text-foreground">all components →</Link>
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
          {components.slice(0, 9).map((comp: any) => (
            <Link
              key={comp.id}
              href={\`/design-system/components/\${comp.id}\`}
              className="group flex items-center justify-between rounded-md border border-border bg-card px-4 py-3 outline-none transition-colors hover:border-foreground/30"
            >
              <div className="min-w-0">
                <div className="truncate text-[14px] font-medium text-foreground">
                  {KNOWN_NAMES[comp.id] || comp.name}
                </div>
                <div className="mt-0.5 font-mono text-[10.5px] text-muted-foreground">
                  {(comp.variants?.length ?? 0)} variant{comp.variants?.length === 1 ? '' : 's'} · {(comp.sizes?.length ?? 0)} size{comp.sizes?.length === 1 ? '' : 's'}
                </div>
              </div>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="ml-2 shrink-0 text-muted-foreground/60 transition-transform group-hover:translate-x-0.5"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
            </Link>
          ))}
        </div>
      </section>
    </article>
  )
}
`
