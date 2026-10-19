/**
 * Design system derived from code (ADR-0013, slice 1).
 *
 * Identity lives in the source: an exported component carries a leading
 * `@coherent-id CID-NNN` comment, so renames, moves and edits keep the ID and
 * nothing has to be merged across branches. Everything else (kind, props,
 * routes, tokens) is recomputed from the code each time; there is no stored
 * registry to drift.
 *
 * The `/design-system` page is generated from this model and regenerated
 * inside every edit that touches components or tokens, so it is built and
 * verified with the edit and undone with it.
 */
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import ts from 'typescript'
import { impactOf, type ProjectGraph } from './graph.js'

export type ComponentKind = 'ui' | 'shared' | 'block'
export type TokenCategory = 'color' | 'font' | 'size' | 'space' | 'radius' | 'shadow' | 'other'

export interface DsComponent {
  id?: string
  name: string
  file: string
  /** ui: a primitive in components/ui; shared: rendered by 2+ routes; block: by 0-1. */
  kind: ComponentKind
  props?: string
  routes: string[]
  /** Other exports of a primitive's file (`SelectItem` of `Select`): addressed through the primitive's ID. */
  parts?: string[]
}

export interface DsToken {
  /** The custom property, e.g. `--primary`; also its address. */
  name: string
  category: TokenCategory
  value: string
  dark?: string
  file: string
}

export interface DesignSystem {
  components: DsComponent[]
  tokens: DsToken[]
  /** IDs carried by more than one component. */
  duplicates: { id: string; components: string[] }[]
  nextId: string
  /** Project-relative path of the generated page, when it exists and is Coherent's. */
  page: string | null
  route: string
}

export const DS_MARKER = '@coherent-generated design-system'
export const DS_ROUTE = '/design-system'
const ID_RE = /@coherent-id\s+(CID-\d+)/i

export const dsPagePath = (appDir: string) => `${appDir}/design-system/page.tsx`

/** The generated page exists and is ours (a user's own /design-system is never touched). */
export function managedPage(root: string, appDir: string): string | null {
  const p = dsPagePath(appDir)
  const abs = join(root, p)
  if (!existsSync(abs)) return null
  return readFileSync(abs, 'utf-8').slice(0, 300).includes(DS_MARKER) ? p : null
}

export interface ComponentDecl {
  name: string
  id?: string
  /** Offset where an ID comment goes: the start of the declaring statement, after its comments. */
  insertAt: number
}

const isComponentName = (n: string) => /^[A-Z]/.test(n)

function unwrapFn(init: ts.Expression | undefined): boolean {
  let e = init
  // forwardRef(...) / memo(...) wrappers
  while (e && ts.isCallExpression(e) && e.arguments[0]) e = e.arguments[0]
  return !!e && (ts.isArrowFunction(e) || ts.isFunctionExpression(e))
}

/** Exported React components in a file, with the ID each one carries. */
export function componentDecls(file: string, text: string): ComponentDecl[] {
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const local = new Map<string, ts.Statement>()
  const exported = new Set<string>()
  const hasMod = (st: ts.Statement, k: ts.SyntaxKind) =>
    ts.canHaveModifiers(st) && !!ts.getModifiers(st)?.some(m => m.kind === k)

  for (const st of sf.statements) {
    const isExported = hasMod(st, ts.SyntaxKind.ExportKeyword)
    if (ts.isFunctionDeclaration(st) && st.name && st.body) {
      local.set(st.name.text, st)
      if (isExported) exported.add(st.name.text)
    } else if (ts.isVariableStatement(st)) {
      for (const d of st.declarationList.declarations) {
        if (ts.isIdentifier(d.name) && unwrapFn(d.initializer)) {
          local.set(d.name.text, st)
          if (isExported) exported.add(d.name.text)
        }
      }
    } else if (
      ts.isExportDeclaration(st) &&
      !st.moduleSpecifier &&
      st.exportClause &&
      ts.isNamedExports(st.exportClause)
    ) {
      for (const el of st.exportClause.elements) exported.add((el.propertyName ?? el.name).text)
    } else if (ts.isExportAssignment(st) && ts.isIdentifier(st.expression)) {
      exported.add(st.expression.text)
    }
  }

  const out: ComponentDecl[] = []
  const seen = new Set<ts.Statement>()
  for (const name of exported) {
    const st = local.get(name)
    if (!st || !isComponentName(name) || seen.has(st)) continue
    seen.add(st)
    const comments = (ts.getLeadingCommentRanges(text, st.pos) ?? []).map(r => text.slice(r.pos, r.end)).join('\n')
    out.push({ name, id: comments.match(ID_RE)?.[1]?.toUpperCase(), insertAt: st.getStart(sf) })
  }
  return out.sort((a, b) => a.insertAt - b.insertAt)
}

function categoryOf(name: string): TokenCategory {
  const n = name.replace(/^--/, '')
  if (/^radius/.test(n)) return 'radius'
  if (/^shadow/.test(n)) return 'shadow'
  if (/^font-(sans|serif|mono|display|heading|body)|^font$|^font-family/.test(n)) return 'font'
  if (/^(text-|font-size|leading|tracking)/.test(n)) return 'size'
  if (/^(spacing|space)/.test(n)) return 'space'
  if (
    /^(color-|background|foreground|card|popover|primary|secondary|muted|accent|destructive|border|input|ring|chart|sidebar|success|warning|info)/.test(
      n,
    )
  )
    return 'color'
  return 'other'
}

/** `selector { --a: 1; }` blocks, with nested braces skipped; comments stripped first. */
function cssBlocks(css: string): { selector: string; body: string }[] {
  const text = css.replace(/\/\*[\s\S]*?\*\//g, '')
  const out: { selector: string; body: string }[] = []
  const re = /(:root|\.dark|@theme(?:\s+inline)?)\s*\{/g
  let m: RegExpExecArray | null
  while ((m = re.exec(text))) {
    let depth = 1
    let i = re.lastIndex
    for (; i < text.length && depth; i++) {
      if (text[i] === '{') depth++
      else if (text[i] === '}') depth--
    }
    out.push({ selector: m[1].startsWith('@theme') ? '@theme' : m[1], body: text.slice(re.lastIndex, i - 1) })
  }
  return out
}

const decls = (body: string) =>
  [...body.matchAll(/(--[a-zA-Z0-9-]+)\s*:\s*([^;{}]+);/g)].map(m => [m[1], m[2].trim().replace(/\s+/g, ' ')] as const)

/** Tokens: custom properties of `:root` (value) and `.dark` (dark value), plus `@theme` values that are not aliases of them. */
export function parseTokens(file: string, css: string): DsToken[] {
  const blocks = cssBlocks(css)
  const tokens = new Map<string, DsToken>()
  for (const b of blocks.filter(b => b.selector === ':root'))
    for (const [name, value] of decls(b.body)) tokens.set(name, { name, category: categoryOf(name), value, file })
  for (const b of blocks.filter(b => b.selector === '.dark'))
    for (const [name, value] of decls(b.body)) {
      const t = tokens.get(name)
      if (t) t.dark = value
      else tokens.set(name, { name, category: categoryOf(name), value: '', dark: value, file })
    }
  const own = new Set(tokens.keys())
  for (const b of blocks.filter(b => b.selector === '@theme'))
    for (const [name, value] of decls(b.body)) {
      // `--color-primary: var(--primary)` and `calc(var(--radius) - 4px)` restate tokens above.
      const refs = [...value.matchAll(/var\((--[a-zA-Z0-9-]+)/g)].map(r => r[1])
      if (refs.some(r => own.has(r)) || tokens.has(name)) continue
      tokens.set(name, { name, category: categoryOf(name), value, file })
    }
  return [...tokens.values()]
}

const formatId = (n: number) => `CID-${String(n).padStart(3, '0')}`

/** The export a primitive file is named after (`alert-dialog.tsx` → AlertDialog), else its first. */
function primaryDecl(file: string, decls: ComponentDecl[]): ComponentDecl | undefined {
  const base = file.slice(file.lastIndexOf('/') + 1).replace(/\.[jt]sx$/, '')
  const pascal = base
    .split(/[-_]/)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join('')
  return decls.find(d => d.name === pascal) ?? decls[0]
}

export function buildDesignSystem(graph: ProjectGraph): DesignSystem {
  const nodes = Object.values(graph.nodes)
  const components: DsComponent[] = []
  for (const n of nodes) {
    if ((n.kind !== 'component' && n.kind !== 'ui') || !/\.(tsx|jsx)$/.test(n.id)) continue
    const routes = impactOf(graph, n.id).routes
    const all = componentDecls(n.id, readFileSync(join(graph.root, n.id), 'utf-8'))
    // A primitive is one design-system entry: `select.tsx` is Select, its other exports are parts.
    const main = n.kind === 'ui' ? primaryDecl(n.id, all) : undefined
    for (const d of main ? [main] : all) {
      components.push({
        id: d.id,
        name: d.name,
        file: n.id,
        kind: n.kind === 'ui' ? 'ui' : routes.length >= 2 ? 'shared' : 'block',
        props: n.exports.find(e => e.name === d.name || e.name === `default(${d.name})`)?.props,
        routes,
        ...(main ? { parts: all.filter(x => x !== main).map(x => x.name) } : {}),
      })
    }
  }
  components.sort((a, b) => a.file.localeCompare(b.file) || a.name.localeCompare(b.name))

  const tokens = nodes
    .filter(n => n.kind === 'style')
    .flatMap(n => parseTokens(n.id, readFileSync(join(graph.root, n.id), 'utf-8')))

  const byId = new Map<string, string[]>()
  for (const c of components) if (c.id) byId.set(c.id, [...(byId.get(c.id) ?? []), `${c.name} (${c.file})`])
  const max = Math.max(0, ...components.map(c => Number(c.id?.slice(4) ?? 0)))
  return {
    components,
    tokens,
    duplicates: [...byId].filter(([, cs]) => cs.length > 1).map(([id, cs]) => ({ id, components: cs })),
    nextId: formatId(max + 1),
    page: managedPage(graph.root, graph.appDir),
    route: DS_ROUTE,
  }
}

/** The next `count` free IDs. */
export function freeIds(ds: DesignSystem, count: number): string[] {
  const start = Number(ds.nextId.slice(4))
  return Array.from({ length: count }, (_, i) => formatId(start + i))
}

export type ResolvedTarget = { type: 'component'; component: DsComponent } | { type: 'token'; token: DsToken }

/** Exact addressing only: `CID-007`, `@KpiCard` / `KpiCard`, `--radius`. A mutation never goes to a guess. */
export function resolveTarget(ds: DesignSystem, target: string): ResolvedTarget {
  const t = target.trim()
  if (/^CID-\d+$/i.test(t)) {
    const hits = ds.components.filter(c => c.id === t.toUpperCase())
    if (!hits.length) throw new Error(`No component carries ${t.toUpperCase()}. Call coherent_inventory for the IDs.`)
    if (hits.length > 1)
      throw new Error(`${t.toUpperCase()} is on several components: ${hits.map(h => h.file).join(', ')}`)
    return { type: 'component', component: hits[0] }
  }
  if (t.startsWith('--')) {
    const token = ds.tokens.find(k => k.name === t)
    if (!token) throw new Error(`No token ${t} in the stylesheets.`)
    return { type: 'token', token }
  }
  const name = t.replace(/^@/, '').toLowerCase()
  let hits = ds.components.filter(c => c.name.toLowerCase() === name)
  if (!hits.length) hits = ds.components.filter(c => c.parts?.some(p => p.toLowerCase() === name))
  if (hits.length === 1) return { type: 'component', component: hits[0] }
  if (hits.length > 1)
    throw new Error(
      `"${t}" matches several components; use the ID: ${hits.map(h => `${h.id ?? '(no ID)'} ${h.file}`).join(', ')}`,
    )
  const token = ds.tokens.find(k => k.name === `--${name}`)
  if (token) return { type: 'token', token }
  throw new Error(`Nothing named "${t}". Address a component by ID (CID-007) or exact name, a token by --name.`)
}

/** Insert ID comments into a file's unannotated components; returns the new text and the IDs given. */
export function annotate(
  file: string,
  text: string,
  ids: string[],
  /** Annotate only these components (a primitive's parts share its ID). */
  only?: string[],
): { text: string; assigned: { name: string; id: string }[] } {
  const missing = componentDecls(file, text).filter(d => !d.id && (!only || only.includes(d.name)))
  const assigned = missing.map((d, i) => ({ name: d.name, id: ids[i] }))
  let out = text
  for (let i = missing.length - 1; i >= 0; i--) {
    const at = missing[i].insertAt
    out = out.slice(0, at) + `/** @coherent-id ${ids[i]} */\n` + out.slice(at)
  }
  return { text: out, assigned }
}

export interface SyncPlan {
  /** file → new content */
  annotations: Map<string, string>
  assigned: { id: string; name: string; file: string }[]
  page: string
  pageExists: boolean
}

export function planSync(graph: ProjectGraph): SyncPlan {
  const ds = buildDesignSystem(graph)
  const page = dsPagePath(graph.appDir)
  const pageExists = existsSync(join(graph.root, page))
  if (pageExists && !ds.page)
    throw new Error(
      `${page} exists and is not Coherent's design-system page; move it to keep it, Coherent will not overwrite it.`,
    )
  const todo = [...new Set(ds.components.filter(c => !c.id).map(c => c.file))].sort()
  let ids = freeIds(ds, ds.components.filter(c => !c.id).length)
  const annotations = new Map<string, string>()
  const assigned: SyncPlan['assigned'] = []
  for (const file of todo) {
    const only = ds.components.filter(c => c.file === file && !c.id).map(c => c.name)
    const r = annotate(file, readFileSync(join(graph.root, file), 'utf-8'), ids, only)
    ids = ids.slice(r.assigned.length)
    annotations.set(file, r.text)
    assigned.push(...r.assigned.map(a => ({ ...a, file })))
  }
  return { annotations, assigned, page, pageExists }
}

const KIND_LABEL: Record<ComponentKind, string> = { ui: 'Primitive', shared: 'Shared', block: 'Block' }
const CATEGORY_ORDER: TokenCategory[] = ['color', 'font', 'size', 'space', 'radius', 'shadow', 'other']

/** The generated `/design-system` page. Uses theme utilities only, no arbitrary values. */
export function renderDesignSystemPage(ds: DesignSystem): string {
  const tokens = CATEGORY_ORDER.flatMap(cat =>
    ds.tokens
      .filter(t => t.category === cat)
      .map(t => ({ name: t.name, category: t.category, value: t.value, dark: t.dark ?? null })),
  )
  const components = ds.components.map(c => ({
    id: c.id ?? null,
    name: c.name,
    kind: KIND_LABEL[c.kind],
    file: c.file,
    props: c.props ? c.props.replace(/\s+/g, ' ').slice(0, 160) : null,
    parts: c.parts ?? [],
    routes: c.routes,
  }))
  return `// ${DS_MARKER}: written by Coherent from the code on every edit that touches components or tokens. Do not edit by hand.
import Link from 'next/link'

const tokens: { name: string; category: string; value: string; dark: string | null }[] = ${JSON.stringify(tokens, null, 2)}

const components: {
  id: string | null
  name: string
  kind: string
  file: string
  props: string | null
  parts: string[]
  routes: string[]
}[] = ${JSON.stringify(components, null, 2)}

const categories = ['color', 'font', 'size', 'space', 'radius', 'shadow', 'other']

function Swatch({ name, category }: { name: string; category: string }) {
  const v = \`var(\${name})\`
  if (category === 'color') return <span className="size-8 shrink-0 rounded-md border" style={{ background: v }} />
  if (category === 'radius') return <span className="size-8 shrink-0 border bg-muted" style={{ borderRadius: v }} />
  if (category === 'shadow') return <span className="size-8 shrink-0 rounded-md bg-background" style={{ boxShadow: v }} />
  if (category === 'font') return <span className="w-8 shrink-0 text-lg" style={{ fontFamily: v }}>Aa</span>
  return <span className="size-8 shrink-0" />
}

export const metadata = { title: 'Design system' }

export default function DesignSystemPage() {
  return (
    <main className="mx-auto max-w-6xl space-y-16 px-6 py-12">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">Design system</h1>
        <p className="text-muted-foreground">
          {components.length} components and {tokens.length} tokens, read from the code. Change any of them by
          address: &quot;CID-007: rounder corners&quot;, &quot;--primary: warmer&quot;.
        </p>
      </header>

      <section className="space-y-8">
        <h2 className="text-xl font-semibold">Tokens</h2>
        {categories
          .filter(c => tokens.some(t => t.category === c))
          .map(c => (
            <div key={c} className="space-y-3">
              <h3 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">{c}</h3>
              <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {tokens
                  .filter(t => t.category === c)
                  .map(t => (
                    <li key={t.name} className="flex items-center gap-3 rounded-lg border p-3">
                      <Swatch name={t.name} category={t.category} />
                      <div className="min-w-0">
                        <div className="truncate font-mono text-sm">{t.name}</div>
                        <div className="truncate text-xs text-muted-foreground">
                          {t.value}
                          {t.dark ? \` · dark \${t.dark}\` : ''}
                        </div>
                      </div>
                    </li>
                  ))}
              </ul>
            </div>
          ))}
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold">Components</h2>
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-left text-sm">
            <thead className="bg-muted text-muted-foreground">
              <tr>
                <th className="px-4 py-2 font-medium">ID</th>
                <th className="px-4 py-2 font-medium">Component</th>
                <th className="px-4 py-2 font-medium">Kind</th>
                <th className="px-4 py-2 font-medium">Used on</th>
              </tr>
            </thead>
            <tbody>
              {components.map(c => (
                <tr key={\`\${c.file}:\${c.name}\`} className="border-t align-top">
                  <td className="whitespace-nowrap px-4 py-3 font-mono">{c.id ?? '—'}</td>
                  <td className="px-4 py-3">
                    <div className="font-medium">{c.name}</div>
                    <div className="font-mono text-xs text-muted-foreground">{c.file}</div>
                    {c.props ? <div className="mt-1 font-mono text-xs text-muted-foreground">{c.props}</div> : null}
                    {c.parts.length ? (
                      <div className="mt-1 text-xs text-muted-foreground">Parts: {c.parts.join(', ')}</div>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{c.kind}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-2">
                      {c.routes.length ? (
                        c.routes.map(r =>
                          r.includes('[') ? (
                            <span key={r} className="font-mono text-xs text-muted-foreground">
                              {r}
                            </span>
                          ) : (
                            <Link key={r} href={r} className="font-mono text-xs underline underline-offset-4">
                              {r}
                            </Link>
                          ),
                        )
                      ) : (
                        <span className="text-xs text-muted-foreground">not on a page yet</span>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  )
}
`
}
