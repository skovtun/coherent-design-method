/**
 * Design System: Shared Components section — Console skin.
 */

export const SHARED_COMPONENTS_INDEX_PAGE = `'use client'
import Link from 'next/link'
import { useEffect, useState } from 'react'

interface SharedEntry {
  id: string
  name: string
  type: string
  file: string
  usedIn: string[]
  description?: string
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground/70">
      <span className="h-1.5 w-1.5 rounded-[2px] bg-primary" />
      {children}
    </div>
  )
}

export default function SharedComponentsPage() {
  const [shared, setShared] = useState<SharedEntry[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/design-system/shared-components')
      .then((res) => res.json())
      .then((data) => setShared(data.shared ?? []))
      .catch(() => setShared([]))
      .finally(() => setLoading(false))
  }, [])

  const order = { layout: 0, section: 1, widget: 2 }
  const sorted = [...shared].sort(
    (a, b) => (order[a.type as keyof typeof order] ?? 3) - (order[b.type as keyof typeof order] ?? 3) || a.name.localeCompare(b.name)
  )

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-[28px] font-medium leading-tight tracking-[-0.02em] text-foreground">
          Shared Components
        </h1>
        <p className="mt-1 text-[13.5px] text-muted-foreground">
          Reusable layout and section components with unique IDs · edit via{' '}
          <code className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[11px] text-foreground">coherent chat</code>{' '}
          by ID or name.
        </p>
      </div>

      {loading ? (
        <p className="font-mono text-[11.5px] text-muted-foreground/70">loading…</p>
      ) : sorted.length === 0 ? (
        <div className="rounded-md border border-dashed border-border bg-card p-8 text-center font-mono text-[12px] text-muted-foreground/70">
          no shared components yet · run{' '}
          <code className="rounded border border-border bg-muted px-1.5 py-0.5 text-foreground">coherent components shared add Header --type layout</code>{' '}
          or ask chat "add a page with header and footer".
        </div>
      ) : (
        <div className="overflow-hidden rounded-md border border-border bg-card">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-muted font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground/70">
                  <th className="px-4 py-2 text-left font-normal">name</th>
                  <th className="px-4 py-2 text-left font-normal">id</th>
                  <th className="px-4 py-2 text-left font-normal">type</th>
                  <th className="px-4 py-2 text-left font-normal">used in</th>
                  <th className="px-4 py-2 text-left font-normal">description</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((entry) => (
                  <tr key={entry.id} className="border-b border-border font-mono text-[12px] transition-colors last:border-0 hover:bg-muted">
                    {/* Name primary — colored link, the actual click target */}
                    <td className="px-4 py-2.5">
                      <Link href={\`/design-system/shared/\${encodeURIComponent(entry.id)}\`} className="font-medium text-primary outline-none transition-colors hover:text-primary/80">
                        {entry.name}
                      </Link>
                    </td>
                    {/* ID secondary — quiet mono identifier */}
                    <td className="px-4 py-2.5 text-[11px] text-muted-foreground/70">{entry.id}</td>
                    <td className="px-4 py-2.5 text-muted-foreground">{entry.type}</td>
                    <td className="px-4 py-2.5 text-muted-foreground">
                      {entry.usedIn.length === 0
                        ? '—'
                        : entry.usedIn.length === 1 && entry.usedIn[0] === 'app/layout.tsx'
                          ? 'layout (all pages)'
                          : entry.usedIn.join(', ')}
                    </td>
                    {/* Description shown in full — was truncated before */}
                    <td className="px-4 py-2.5 text-muted-foreground">
                      {entry.description ?? '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
`

export const SHARED_COMPONENT_DETAIL_PAGE = `'use client'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { useEffect, useState } from 'react'

interface Entry {
  id: string
  name: string
  type: string
  file: string
  usedIn: string[]
  description?: string
}

interface DesignerMeta {
  tokens: {
    colors: string[]
    spacing: string[]
    typography: string[]
    radius: string[]
    shadow: string[]
    border: string[]
  }
  anatomy: {
    icons: string[]
    buttons: number
    links: number
    images: number
    structural: string[]
  }
  states: string[]
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground/70">
      <span className="h-1.5 w-1.5 rounded-[2px] bg-primary" />
      {children}
    </div>
  )
}

export default function SharedComponentDetailPage() {
  const params = useParams()
  const id = typeof params?.id === 'string' ? params.id : ''
  const [entry, setEntry] = useState<Entry | null>(null)
  const [code, setCode] = useState<string>('')
  const [meta, setMeta] = useState<DesignerMeta | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!id) return
    fetch(\`/api/design-system/shared-components/\${encodeURIComponent(id)}\`)
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then((data) => {
        setEntry(data.entry)
        setCode(data.code ?? '')
        setMeta(data.meta ?? null)
      })
      .catch(() => {
        setEntry(null)
        setCode('')
        setMeta(null)
      })
      .finally(() => setLoading(false))
  }, [id])

  if (loading) return <p className="font-mono text-[11.5px] text-muted-foreground/70">loading…</p>
  if (!entry) return <p className="font-mono text-[11.5px] text-muted-foreground/70">component not found.</p>

  // Pick a usable page-route to preview the component IN CONTEXT.
  // Layout components (Header/Footer) appear on every page — pick the first
  // non-layout entry that points to an app route. Widgets/data-display appear
  // on a specific page — use the first entry directly.
  const previewRoute = (() => {
    const fileToRoute = (f: string): string | null => {
      // app/layout.tsx → layout (skip, no specific route)
      if (f === 'app/layout.tsx') return null
      // app/(group)/path/page.tsx → /path
      const match = f.match(/^app(?:\\/\\([^)]+\\))?(.*?)\\/page\\.tsx$/)
      if (!match) return null
      const route = match[1] || '/'
      // Skip dynamic [id] routes — we don't know what id to pass.
      if (route.includes('[')) return null
      return route
    }
    for (const f of entry.usedIn) {
      const route = fileToRoute(f)
      if (route) return route
    }
    return null
  })()

  return (
    <div className="flex flex-col gap-6">
      <div>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-[28px] font-medium leading-tight tracking-[-0.02em] text-foreground">
              {entry.name}
            </h1>
            <p className="mt-1 font-mono text-[11.5px] text-muted-foreground/70">
              <span className="text-primary">{entry.id}</span> · {entry.type} · {entry.file}
            </p>
          </div>
          {previewRoute && (
            <a
              href={previewRoute}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-1 inline-flex shrink-0 items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1 font-mono text-[11.5px] text-muted-foreground outline-none transition-colors hover:border-foreground/30 hover:text-foreground"
            >
              <span>view on {previewRoute}</span>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M7 17 17 7"/><path d="M7 7h10v10"/></svg>
            </a>
          )}
        </div>
        {entry.description && (
          <p className="mt-2 text-[13px] text-muted-foreground">{entry.description}</p>
        )}
      </div>

      {/* Tokens used — designer-relevant. Pulls semantic Tailwind classes
          from source to show which design tokens this component touches.
          Lets a designer verify the component stays on-system at a glance. */}
      {meta && (meta.tokens.colors.length > 0 || meta.tokens.spacing.length > 0 || meta.tokens.typography.length > 0 || meta.tokens.radius.length > 0) && (
        <div className="rounded-md border border-border bg-card">
          <div className="rounded-t-md border-b border-border bg-muted px-4 py-3">
            <SectionLabel>tokens used</SectionLabel>
          </div>
          <div className="divide-y divide-border">
            {meta.tokens.colors.length > 0 && (
              <div className="flex flex-wrap items-baseline gap-3 px-4 py-3">
                <Link href="/design-system/tokens/colors" className="w-20 shrink-0 font-mono text-[10.5px] uppercase tracking-[0.14em] text-muted-foreground/70 outline-none transition-colors hover:text-foreground">color →</Link>
                <div className="flex flex-wrap gap-1.5">
                  {meta.tokens.colors.map(c => (
                    <span key={c} className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-2 py-1 font-mono text-[11.5px] text-foreground">
                      <span className="size-3 shrink-0 rounded-sm border border-border" style={{ backgroundColor: \`var(--\${c})\` }} aria-hidden />
                      {c}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {meta.tokens.spacing.length > 0 && (
              <div className="flex flex-wrap items-baseline gap-3 px-4 py-3">
                <Link href="/design-system/tokens/spacing" className="w-20 shrink-0 font-mono text-[10.5px] uppercase tracking-[0.14em] text-muted-foreground/70 outline-none transition-colors hover:text-foreground">spacing →</Link>
                <div className="flex flex-wrap gap-1.5">
                  {meta.tokens.spacing.map(s => (
                    <code key={s} className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[11px] text-foreground">{s}</code>
                  ))}
                </div>
              </div>
            )}
            {meta.tokens.typography.length > 0 && (
              <div className="flex flex-wrap items-baseline gap-3 px-4 py-3">
                <Link href="/design-system/tokens/typography" className="w-20 shrink-0 font-mono text-[10.5px] uppercase tracking-[0.14em] text-muted-foreground/70 outline-none transition-colors hover:text-foreground">type →</Link>
                <div className="flex flex-wrap gap-1.5">
                  {meta.tokens.typography.map(t => (
                    <code key={t} className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[11px] text-foreground">{t}</code>
                  ))}
                </div>
              </div>
            )}
            {(meta.tokens.radius.length > 0 || meta.tokens.shadow.length > 0 || meta.tokens.border.length > 0) && (
              <div className="flex flex-wrap items-baseline gap-3 px-4 py-3">
                <span className="w-20 shrink-0 font-mono text-[10.5px] uppercase tracking-[0.14em] text-muted-foreground/70">surface</span>
                <div className="flex flex-wrap gap-1.5">
                  {[...meta.tokens.radius, ...meta.tokens.shadow, ...meta.tokens.border].map(s => (
                    <code key={s} className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[11px] text-foreground">{s}</code>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Anatomy — what's visually inside the component. */}
      {meta && (meta.anatomy.icons.length > 0 || meta.anatomy.buttons + meta.anatomy.links + meta.anatomy.images > 0 || meta.anatomy.structural.length > 0) && (
        <div className="rounded-md border border-border bg-card">
          <div className="rounded-t-md border-b border-border bg-muted px-4 py-3">
            <SectionLabel>anatomy</SectionLabel>
          </div>
          <div className="divide-y divide-border">
            {/* Element counts grid */}
            {(meta.anatomy.buttons + meta.anatomy.links + meta.anatomy.images > 0) && (
              <dl className="grid grid-cols-3 gap-px">
                {[
                  { label: 'buttons', value: meta.anatomy.buttons },
                  { label: 'links', value: meta.anatomy.links },
                  { label: 'images', value: meta.anatomy.images },
                ].filter(s => s.value > 0).map(s => (
                  <div key={s.label} className="bg-card px-4 py-3">
                    <dt className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-muted-foreground">{s.label}</dt>
                    <dd className="mt-1 font-mono text-[18px] tabular-nums text-foreground">{s.value}</dd>
                  </div>
                ))}
              </dl>
            )}
            {/* Icons */}
            {meta.anatomy.icons.length > 0 && (
              <div className="flex flex-wrap items-baseline gap-3 px-4 py-3">
                <span className="w-20 shrink-0 font-mono text-[10.5px] uppercase tracking-[0.14em] text-muted-foreground/70">icons</span>
                <div className="flex flex-wrap gap-1.5">
                  {meta.anatomy.icons.map(i => (
                    <code key={i} className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[11px] text-foreground">{i}</code>
                  ))}
                </div>
              </div>
            )}
            {/* Structural tags */}
            {meta.anatomy.structural.length > 0 && (
              <div className="flex flex-wrap items-baseline gap-3 px-4 py-3">
                <span className="w-20 shrink-0 font-mono text-[10.5px] uppercase tracking-[0.14em] text-muted-foreground/70">structure</span>
                <div className="flex flex-wrap gap-1.5">
                  {meta.anatomy.structural.map(t => (
                    <code key={t} className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[11px] text-foreground">&lt;{t}&gt;</code>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* States — what changes on user interaction. */}
      {meta && meta.states.length > 0 && (
        <div className="rounded-md border border-border bg-card">
          <div className="rounded-t-md border-b border-border bg-muted px-4 py-3">
            <SectionLabel>interactive states · {meta.states.length}</SectionLabel>
          </div>
          <div className="px-4 py-3">
            <p className="mb-2 max-w-[58ch] text-[12.5px] leading-[1.55] text-muted-foreground">
              Variables that change based on user interaction. Each implies a different visual state of the component.
            </p>
            <div className="flex flex-wrap gap-1.5">
              {meta.states.map(s => (
                <span key={s} className="inline-flex items-center gap-1.5 rounded-md border border-border bg-muted px-2 py-1 font-mono text-[11.5px] text-foreground">
                  <span className="size-1.5 shrink-0 rounded-full bg-primary" aria-hidden />
                  {s}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      {entry.usedIn.length > 0 && (
        <div className="rounded-md border border-border bg-card">
          <div className="rounded-t-md border-b border-border bg-muted px-4 py-3">
            <SectionLabel>used in · {entry.usedIn.length} page{entry.usedIn.length === 1 ? '' : 's'}</SectionLabel>
          </div>
          <ul className="flex flex-col gap-1 p-4 font-mono text-[11.5px] text-muted-foreground">
            {entry.usedIn.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="rounded-md border border-border bg-card">
        <div className="rounded-t-md border-b border-border bg-muted px-4 py-3">
          <SectionLabel>source · {entry.file}</SectionLabel>
        </div>
        <pre className="max-h-[60vh] overflow-auto rounded-b-md bg-muted/40 p-4 font-mono text-[11px] leading-[1.6] text-foreground">
          <code>{code || '(no content)'}</code>
        </pre>
      </div>
    </div>
  )
}
`
