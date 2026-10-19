/**
 * Code-derived project graph — the index the governance layer routes edits on.
 *
 * Source of truth is the code itself: every node, import edge, export and
 * props signature is derived from the TypeScript AST on each build, never from
 * a stored registry that can drift from what the model or the user wrote.
 * Impact is transitive: Page → DashboardShell → KpiGrid → KpiCard means a
 * KpiCard edit reaches that page, and anything a layout pulls in reaches every
 * route under that layout's directory.
 */
import { createHash } from 'crypto'
import { existsSync, readFileSync, readdirSync, statSync } from 'fs'
import { dirname, join, relative, resolve, sep } from 'path'
import ts from 'typescript'

export type NodeKind = 'page' | 'layout' | 'component' | 'ui' | 'lib' | 'style' | 'other'

export interface ExportedSymbol {
  name: string
  /** `props` type text for function components; undefined for non-components. */
  props?: string
}

export interface GraphNode {
  /** Project-relative POSIX path. */
  id: string
  kind: NodeKind
  /** For page/layout: URL path with route groups stripped (`/advertiser/campaigns/[id]`). */
  route?: string
  client: boolean
  exports: ExportedSymbol[]
  /** Resolved project-relative imports (external packages are dropped). */
  imports: string[]
  hash: string
}

export interface ProjectGraph {
  root: string
  appDir: string
  nodes: Record<string, GraphNode>
  /** Reverse edges: file → files that import it directly. */
  importers: Record<string, string[]>
}

export interface Impact {
  /** Every file that transitively depends on the target (target excluded). */
  files: string[]
  /** Page routes whose render tree includes the target. */
  routes: string[]
}

/** First-line marker of the files Coherent generates under `<app>/design-system/`. */
export const DS_MARKER = '@coherent-generated design-system'

/**
 * Coherent's generated design-system viewer is not part of the product: it
 * imports every component, so left in the graph it would make each one look
 * rendered on /design-system and become a target of every edit.
 */
function managedDsDir(root: string, appDir: string): string | null {
  const page = join(root, appDir, 'design-system', 'page.tsx')
  return existsSync(page) && readFileSync(page, 'utf-8').slice(0, 300).includes(DS_MARKER)
    ? `${appDir}/design-system/`
    : null
}

const SOURCE_EXT = /\.(tsx?|jsx?|css)$/
const SKIP_DIRS = new Set(['node_modules', '.next', '.git', 'dist', 'build', 'out', '.coherent', 'public'])

const toPosix = (p: string) => p.split(sep).join('/')

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue
    const full = join(dir, name)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (SOURCE_EXT.test(name) && !/\.(test|spec)\.|\.d\.ts$/.test(name)) out.push(full)
  }
  return out
}

function findAppDir(root: string): string {
  for (const cand of ['src/app', 'app']) if (existsSync(join(root, cand))) return toPosix(cand)
  throw new Error(`No Next.js app directory (app/ or src/app/) under ${root}`)
}

/** `src/app/(dashboard)/advertiser/page.tsx` → `/advertiser`. */
export function routeFromAppPath(rel: string, appDir: string): string {
  const inner = rel
    .slice(appDir.length + 1)
    .split('/')
    .slice(0, -1)
  const segs = inner.filter(s => !(s.startsWith('(') && s.endsWith(')')) && !s.startsWith('@'))
  return '/' + segs.join('/')
}

function classify(rel: string, appDir: string): NodeKind {
  if (rel.endsWith('.css')) return 'style'
  if (rel.startsWith(appDir + '/')) {
    if (/\/page\.(tsx|jsx|ts|js)$/.test(rel)) return 'page'
    if (/\/layout\.(tsx|jsx|ts|js)$/.test(rel)) return 'layout'
  }
  if (/(^|\/)components\/ui\//.test(rel)) return 'ui'
  if (/(^|\/)components\//.test(rel)) return 'component'
  if (/(^|\/)(lib|utils|hooks|data)\//.test(rel)) return 'lib'
  return 'other'
}

function loadCompilerOptions(root: string): ts.CompilerOptions {
  const cfgPath = join(root, 'tsconfig.json')
  if (!existsSync(cfgPath)) return { baseUrl: root, jsx: ts.JsxEmit.ReactJSX }
  const read = ts.readConfigFile(cfgPath, ts.sys.readFile)
  const parsed = ts.parseJsonConfigFileContent(read.config ?? {}, ts.sys, root)
  return parsed.options
}

function resolveImport(spec: string, fromAbs: string, root: string, opts: ts.CompilerOptions): string | null {
  if (spec.endsWith('.css')) {
    let abs: string | null = null
    if (spec.startsWith('.')) abs = resolve(dirname(fromAbs), spec)
    else {
      for (const [pattern, targets] of Object.entries(opts.paths ?? {})) {
        const prefix = pattern.replace(/\*$/, '')
        if (pattern.endsWith('*') && spec.startsWith(prefix) && targets[0]) {
          abs = resolve(
            opts.pathsBasePath ? String(opts.pathsBasePath) : root,
            targets[0].replace(/\*$/, '') + spec.slice(prefix.length),
          )
        }
      }
    }
    return abs && existsSync(abs) ? abs : null
  }
  const res = ts.resolveModuleName(spec, fromAbs, opts, ts.sys).resolvedModule
  if (!res || res.isExternalLibraryImport || res.resolvedFileName.includes('/node_modules/')) return null
  return res.resolvedFileName
}

function propsTextFor(
  fn: ts.FunctionLikeDeclaration | undefined,
  sf: ts.SourceFile,
  localTypes: Map<string, string>,
): string | undefined {
  const param = fn?.parameters[0]
  if (!fn || !param) return fn ? '{}' : undefined
  const ann = param.type?.getText(sf)
  if (!ann) return param.name.getText(sf)
  const base = ann.replace(/^Readonly<(.+)>$/, '$1').trim()
  return localTypes.get(base) ?? ann
}

const isComponentName = (n: string) => /^[A-Z]/.test(n)

function analyzeFile(abs: string, text: string): { client: boolean; specs: string[]; exports: ExportedSymbol[] } {
  if (abs.endsWith('.css')) {
    const specs = [...text.matchAll(/@import\s+(?:url\()?["']([^"']+)["']/g)].map(m => m[1])
    return { client: false, specs: specs.filter(s => s.startsWith('.')), exports: [] }
  }
  const sf = ts.createSourceFile(
    abs,
    text,
    ts.ScriptTarget.Latest,
    true,
    abs.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  )
  const first = sf.statements[0]
  const client =
    !!first &&
    ts.isExpressionStatement(first) &&
    ts.isStringLiteral(first.expression) &&
    first.expression.text === 'use client'

  const specs: string[] = []
  const localTypes = new Map<string, string>()
  const fns = new Map<string, ts.FunctionLikeDeclaration>()
  const exported = new Set<string>()
  let defaultName: string | undefined

  for (const st of sf.statements) {
    if (
      (ts.isImportDeclaration(st) || ts.isExportDeclaration(st)) &&
      st.moduleSpecifier &&
      ts.isStringLiteral(st.moduleSpecifier)
    ) {
      specs.push(st.moduleSpecifier.text)
    }
    if (ts.isExportDeclaration(st) && st.exportClause && ts.isNamedExports(st.exportClause)) {
      for (const el of st.exportClause.elements) exported.add(el.name.text)
    }
    if (ts.isInterfaceDeclaration(st) || ts.isTypeAliasDeclaration(st)) {
      localTypes.set(st.name.text, st.getText(sf).replace(/^export\s+/, ''))
    }
    const isExported = ts.canHaveModifiers(st) && ts.getModifiers(st)?.some(m => m.kind === ts.SyntaxKind.ExportKeyword)
    const isDefault = ts.canHaveModifiers(st) && ts.getModifiers(st)?.some(m => m.kind === ts.SyntaxKind.DefaultKeyword)
    if (ts.isFunctionDeclaration(st)) {
      const name = st.name?.text ?? 'default'
      fns.set(name, st)
      if (isExported) exported.add(isDefault ? `default:${name}` : name)
    }
    if (ts.isVariableStatement(st)) {
      for (const d of st.declarationList.declarations) {
        if (!ts.isIdentifier(d.name)) continue
        let init = d.initializer
        // forwardRef(...) / memo(...) wrappers: look at the inner function.
        while (init && ts.isCallExpression(init) && init.arguments[0]) init = init.arguments[0]
        if (init && (ts.isArrowFunction(init) || ts.isFunctionExpression(init))) fns.set(d.name.text, init)
        if (isExported) exported.add(d.name.text)
      }
    }
    if (ts.isExportAssignment(st) && ts.isIdentifier(st.expression)) defaultName = st.expression.text
  }
  // `export { Button, buttonVariants }` and `export default Foo` refer to local names.
  if (defaultName) exported.add(`default:${defaultName}`)

  const exports: ExportedSymbol[] = []
  for (const raw of exported) {
    const name = raw.startsWith('default:') ? raw.slice(8) : raw
    const label = raw.startsWith('default:') ? `default(${name})` : name
    const fn = fns.get(name)
    exports.push({
      name: label,
      props: isComponentName(name) || raw.startsWith('default:') ? propsTextFor(fn, sf, localTypes) : undefined,
    })
  }
  return { client, specs, exports }
}

export function buildGraph(rootInput: string): ProjectGraph {
  const root = resolve(rootInput)
  const appDir = findAppDir(root)
  const opts = loadCompilerOptions(root)
  const dsDir = managedDsDir(root, appDir)
  const files = walk(root).filter(abs => !dsDir || !toPosix(relative(root, abs)).startsWith(dsDir))
  const nodes: Record<string, GraphNode> = {}
  const importers: Record<string, string[]> = {}

  for (const abs of files) {
    const id = toPosix(relative(root, abs))
    const text = readFileSync(abs, 'utf-8')
    const kind = classify(id, appDir)
    const { client, specs, exports } = analyzeFile(abs, text)
    const imports = [
      ...new Set(
        specs
          .map(s => resolveImport(s, abs, root, opts))
          .filter((p): p is string => !!p && p.startsWith(root + sep))
          .map(p => toPosix(relative(root, p))),
      ),
    ]
    nodes[id] = {
      id,
      kind,
      route: kind === 'page' || kind === 'layout' ? routeFromAppPath(id, appDir) : undefined,
      client,
      exports,
      imports,
      hash: createHash('sha256').update(text).digest('hex').slice(0, 16),
    }
  }
  for (const n of Object.values(nodes)) {
    for (const imp of n.imports) (importers[imp] ??= []).push(n.id)
  }
  return { root, appDir, nodes, importers }
}

/** Directory a layout governs, e.g. `src/app/(dashboard)`. */
const layoutScope = (layoutId: string) => layoutId.slice(0, layoutId.lastIndexOf('/'))

export function impactOf(graph: ProjectGraph, target: string): Impact {
  const seen = new Set<string>()
  const queue = [target]
  while (queue.length) {
    const cur = queue.shift()!
    for (const imp of graph.importers[cur] ?? []) {
      if (!seen.has(imp)) {
        seen.add(imp)
        queue.push(imp)
      }
    }
  }
  seen.delete(target)
  const touched = new Set([...seen, target])
  const routes = new Set<string>()
  for (const n of Object.values(graph.nodes)) {
    if (n.kind !== 'page') continue
    if (touched.has(n.id)) {
      routes.add(n.route!)
      continue
    }
    // A layout above this page that is in the impact set wraps the page.
    for (const id of touched) {
      const ln = graph.nodes[id]
      if (ln?.kind === 'layout' && n.id.startsWith(layoutScope(id) + '/')) {
        routes.add(n.route!)
        break
      }
    }
  }
  return { files: [...seen].sort(), routes: [...routes].sort() }
}

/** Components (kind component|ui) with how many routes each one reaches. */
export function componentReach(graph: ProjectGraph): { id: string; routes: number; directImporters: number }[] {
  return Object.values(graph.nodes)
    .filter(n => n.kind === 'component' || n.kind === 'ui')
    .map(n => ({
      id: n.id,
      routes: impactOf(graph, n.id).routes.length,
      directImporters: (graph.importers[n.id] ?? []).length,
    }))
    .sort((a, b) => b.routes - a.routes || a.id.localeCompare(b.id))
}
