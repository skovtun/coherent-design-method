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
import { DS_MARKER, impactOf, type ProjectGraph } from './graph.js'
import { tokenRefs } from './raw-values.js'

export { DS_MARKER }

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
  /** URL segment of its page in the viewer: the ID, lowercased. */
  slug: string
  /** Variant groups declared with cva (`variant`, `size`), with their classes. */
  variants?: VariantGroup[]
  /** Project-relative path of `<name>.preview.tsx` next to the component, written by the agent. */
  preview?: string
  /** A real use of it in the app (the JSX element, dedented), with the file it comes from. */
  example?: { code: string; file: string }
  /** Tokens its file references statically (`bg-primary`, `var(--radius)`), not through other components. */
  tokens?: string[]
}

export interface VariantGroup {
  name: string
  options: { value: string; classes: string }[]
  default?: string
}

export interface DsToken {
  /** The custom property, e.g. `--primary`; also its address. */
  name: string
  category: TokenCategory
  value: string
  dark?: string
  file: string
  /** Components whose file references it statically (by ID, else name). */
  usedBy?: string[]
  /**
   * Routes whose render tree has a file that references it statically. Stylesheet
   * rules (`@apply` in the base layer) reach further: a token edit still renders every route.
   */
  routes?: string[]
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

export const DS_ROUTE = '/design-system'
/** Label prefix of the ID-sync edit; not a change to any component's design. */
export const DS_SYNC_REQUEST = 'Sync the design system'
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

const literalText = (e: ts.Expression, sf: ts.SourceFile) =>
  ts.isStringLiteralLike(e) ? e.text : e.getText(sf).replace(/\s+/g, ' ')

const propName = (p: ts.ObjectLiteralElementLike) =>
  p.name && (ts.isIdentifier(p.name) || ts.isStringLiteral(p.name)) ? p.name.text : undefined

/** cva(...) definitions in a file: `buttonVariants` → its variant groups. */
export function cvaDefinitions(file: string, text: string): { name: string; groups: VariantGroup[] }[] {
  if (!text.includes('cva(')) return []
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const out: { name: string; groups: VariantGroup[] }[] = []
  for (const st of sf.statements) {
    if (!ts.isVariableStatement(st)) continue
    for (const d of st.declarationList.declarations) {
      const call = d.initializer
      if (!ts.isIdentifier(d.name) || !call || !ts.isCallExpression(call)) continue
      if (!ts.isIdentifier(call.expression) || call.expression.text !== 'cva') continue
      const cfg = call.arguments[1]
      if (!cfg || !ts.isObjectLiteralExpression(cfg)) continue
      const obj = (key: string) => {
        const p = cfg.properties.find(x => propName(x) === key)
        return p && ts.isPropertyAssignment(p) && ts.isObjectLiteralExpression(p.initializer)
          ? p.initializer
          : undefined
      }
      const defaults = new Map<string, string>()
      for (const p of obj('defaultVariants')?.properties ?? [])
        if (ts.isPropertyAssignment(p) && propName(p)) defaults.set(propName(p)!, literalText(p.initializer, sf))
      const groups: VariantGroup[] = []
      for (const g of obj('variants')?.properties ?? []) {
        if (!ts.isPropertyAssignment(g) || !propName(g) || !ts.isObjectLiteralExpression(g.initializer)) continue
        const options = g.initializer.properties
          .filter(ts.isPropertyAssignment)
          .filter(o => propName(o))
          .map(o => ({ value: propName(o)!, classes: literalText(o.initializer, sf) }))
        groups.push({ name: propName(g)!, options, default: defaults.get(propName(g)!) })
      }
      out.push({ name: d.name.text, groups })
    }
  }
  return out
}

const PREVIEW_RE = /\.preview\.(tsx|jsx)$/
export const previewPathFor = (file: string) => file.replace(/\.(tsx|jsx)$/, '.preview.tsx')
export const isPreviewFile = (file: string) => PREVIEW_RE.test(file)

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
    if ((n.kind !== 'component' && n.kind !== 'ui') || !/\.(tsx|jsx)$/.test(n.id) || isPreviewFile(n.id)) continue
    const routes = impactOf(graph, n.id).routes
    const text = readFileSync(join(graph.root, n.id), 'utf-8')
    const all = componentDecls(n.id, text)
    const cvas = cvaDefinitions(n.id, text)
    const preview = existsSync(join(graph.root, previewPathFor(n.id))) ? previewPathFor(n.id) : undefined
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
        slug: (d.id ?? `${n.id}-${d.name}`).toLowerCase().replace(/[^a-z0-9]+/g, '-'),
        variants: (
          cvas.find(c => c.name.toLowerCase() === `${d.name}variants`.toLowerCase()) ?? (main ? cvas[0] : undefined)
        )?.groups,
        preview: all.length === 1 || main ? preview : undefined,
        example: exampleOf(graph, n.id, d.name),
      })
    }
  }
  components.sort((a, b) => a.file.localeCompare(b.file) || a.name.localeCompare(b.name))

  const tokens = nodes
    .filter(n => n.kind === 'style')
    .flatMap(n => parseTokens(n.id, readFileSync(join(graph.root, n.id), 'utf-8')))
  reach(graph, components, tokens)

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

/** Token → components and routes, from static references in every TSX file of the graph. */
function reach(graph: ProjectGraph, components: DsComponent[], tokens: DsToken[]): void {
  const names = new Set(tokens.map(t => t.name))
  const byToken = new Map<string, { usedBy: Set<string>; routes: Set<string> }>()
  for (const n of Object.values(graph.nodes)) {
    if (!/\.(tsx|jsx)$/.test(n.id) || isPreviewFile(n.id)) continue
    const refs = tokenRefs(n.id, readFileSync(join(graph.root, n.id), 'utf-8'), names)
    if (!refs.length) continue
    const routes = impactOf(graph, n.id).routes
    const own = components.filter(c => c.file === n.id)
    for (const c of own) c.tokens = refs
    for (const r of refs) {
      const e = byToken.get(r) ?? { usedBy: new Set(), routes: new Set() }
      for (const c of own) e.usedBy.add(c.id ?? c.name)
      for (const route of routes) e.routes.add(route)
      byToken.set(r, e)
    }
  }
  for (const t of tokens) {
    const e = byToken.get(t.name)
    if (!e) continue
    t.usedBy = [...e.usedBy].sort()
    t.routes = [...e.routes].sort()
  }
}

const EXAMPLE_MAX_LINES = 30

/**
 * The richest readable use of a component in the app: the JSX element that
 * renders it in a file that imports it (most lines up to EXAMPLE_MAX_LINES,
 * else the shortest), dedented. Real code, so it shows how parts compose.
 */
export function exampleOf(graph: ProjectGraph, file: string, name: string): DsComponent['example'] {
  const found: { code: string; file: string; lines: number }[] = []
  for (const user of graph.importers[file] ?? []) {
    if (!/\.(tsx|jsx)$/.test(user) || isPreviewFile(user)) continue
    const text = readFileSync(join(graph.root, user), 'utf-8')
    if (!text.includes('<' + name)) continue
    const sf = ts.createSourceFile(user, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
    const visit = (node: ts.Node): void => {
      const tag = ts.isJsxElement(node)
        ? node.openingElement.tagName
        : ts.isJsxSelfClosingElement(node)
          ? node.tagName
          : undefined
      if (tag && tag.getText(sf) === name) {
        const start = sf.getLineAndCharacterOfPosition(node.getStart(sf))
        const raw = text.slice(node.getStart(sf) - start.character, node.getEnd()).split('\n')
        const indent = Math.min(...raw.filter(l => l.trim()).map(l => l.length - l.trimStart().length))
        const code = raw.map(l => l.slice(indent)).join('\n')
        found.push({ code, file: user, lines: raw.length })
        return
      }
      ts.forEachChild(node, visit)
    }
    visit(sf)
  }
  if (!found.length) return undefined
  const fits = found.filter(f => f.lines <= EXAMPLE_MAX_LINES).sort((a, b) => b.lines - a.lines)
  const pick = fits[0] ?? [...found].sort((a, b) => a.lines - b.lines)[0]
  const code =
    pick.lines > EXAMPLE_MAX_LINES ? pick.code.split('\n').slice(0, EXAMPLE_MAX_LINES).join('\n') + '\n  …' : pick.code
  return { code, file: pick.file }
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
