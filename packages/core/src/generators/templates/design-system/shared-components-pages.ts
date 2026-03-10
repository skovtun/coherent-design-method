/**
 * Design System: Shared Components section (Epic 2).
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

export default function SharedComponentsPage() {
  const [shared, setShared] = useState<SharedEntry[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/design-system/shared-components')
      .then((res) => res.json())
      .then((data) => {
        setShared(data.shared ?? [])
      })
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
        <h1 className="text-2xl font-bold tracking-tight">Shared Components</h1>
        <p className="text-sm text-muted-foreground">
          Reusable layout and section components (Header, Footer, etc.) with unique IDs. Edit via <code className="rounded bg-muted px-1 text-xs">coherent chat</code> by ID or name.
        </p>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading...</p>
      ) : sorted.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          No shared components yet. Create them with{' '}
          <code className="rounded bg-muted px-1">coherent components shared add Header --type layout</code> or by saying &quot;add a page with header and footer&quot; in chat.
        </div>
      ) : (
        <div className="rounded-lg border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="px-4 py-3 text-left font-medium">ID</th>
                <th className="px-4 py-3 text-left font-medium">Name</th>
                <th className="px-4 py-3 text-left font-medium">Type</th>
                <th className="px-4 py-3 text-left font-medium">Used in</th>
                <th className="px-4 py-3 text-left font-medium">Description</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((entry) => (
                <tr key={entry.id} className="border-b last:border-0 hover:bg-muted/30">
                  <td className="px-4 py-3 font-mono text-xs">{entry.id}</td>
                  <td className="px-4 py-3">
                    <Link href={\`/design-system/shared/\${encodeURIComponent(entry.id)}\`} className="font-medium hover:underline">
                      {entry.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{entry.type}</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {entry.usedIn.length === 0 ? '—' : entry.usedIn.length === 1 && entry.usedIn[0] === 'app/layout.tsx' ? 'layout (all pages)' : entry.usedIn.join(', ')}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground max-w-xs truncate">
                    {entry.description ?? '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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

  if (loading) return <p className="text-sm text-muted-foreground">Loading...</p>
  if (!entry) return <p className="text-sm text-muted-foreground">Component not found.</p>

  return (
    <div className="flex flex-col gap-6">
      <div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
          <Link href="/design-system/shared" className="hover:text-foreground">Shared Components</Link>
          <span>/</span>
          <span className="text-foreground font-medium">{entry.name}</span>
        </div>
        <h1 className="text-2xl font-bold tracking-tight">{entry.name}</h1>
        <p className="text-sm text-muted-foreground mt-1">
          <span className="font-mono text-xs">{entry.id}</span> · {entry.type} · {entry.file}
        </p>
        {entry.description && <p className="text-sm text-muted-foreground mt-2">{entry.description}</p>}
      </div>

      {entry.usedIn.length > 0 && (
        <div className="rounded-lg border p-4">
          <h2 className="text-sm font-medium mb-2">Used in</h2>
          <ul className="text-sm text-muted-foreground space-y-1">
            {entry.usedIn.map((f) => (
              <li key={f} className="font-mono text-xs">{f}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="rounded-lg border">
        <h2 className="text-sm font-medium px-4 py-2 border-b bg-muted/30">Source</h2>
        <pre className="p-4 text-xs overflow-auto max-h-[60vh] bg-muted/20">
          <code>{code || '(no content)'}</code>
        </pre>
      </div>
    </div>
  )
}
`
