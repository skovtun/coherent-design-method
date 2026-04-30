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
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!id) return
    fetch(\`/api/design-system/shared-components/\${encodeURIComponent(id)}\`)
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then((data) => {
        setEntry(data.entry)
        setCode(data.code ?? '')
      })
      .catch(() => {
        setEntry(null)
        setCode('')
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
        <h1 className="text-[28px] font-medium leading-tight tracking-[-0.02em] text-foreground">
          {entry.name}
        </h1>
        <p className="mt-1 font-mono text-[11.5px] text-muted-foreground/70">
          <span className="text-primary">{entry.id}</span> · {entry.type} · {entry.file}
        </p>
        {entry.description && (
          <p className="mt-2 text-[13px] text-muted-foreground">{entry.description}</p>
        )}
      </div>

      {/* Visual preview — embeds a page that uses the component so users
          can see it rendered in real context. Layout components (Header/
          Footer) appear on any page; widgets show on their host page. */}
      {previewRoute && (
        <div className="rounded-md border border-border bg-card">
          <div className="flex items-center justify-between rounded-t-md border-b border-border bg-muted px-4 py-3">
            <SectionLabel>preview · in context</SectionLabel>
            <a
              href={previewRoute}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 font-mono text-[10.5px] text-muted-foreground/70 transition-colors hover:text-foreground"
            >
              {previewRoute} ↗
            </a>
          </div>
          <div className="relative h-[420px] overflow-hidden rounded-b-md bg-background">
            <iframe
              src={previewRoute}
              title={\`\${entry.name} preview\`}
              className="h-full w-full border-0"
              loading="lazy"
            />
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
