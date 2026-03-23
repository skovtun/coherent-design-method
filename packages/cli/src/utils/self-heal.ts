/**
 * Self-healing: deps check, required packages, syntax sanitization.
 * Used by preview, repair, chat, init.
 */

import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { readdir, readFile } from 'fs/promises'
import { execSync } from 'child_process'

export const COHERENT_REQUIRED_PACKAGES = [
  'lucide-react',
  'class-variance-authority',
  'clsx',
  'tailwind-merge',
  '@radix-ui/react-slot',
] as const

const IMPORT_FROM_REGEX = /from\s+['"]([^'"]+)['"]/g

const NODE_BUILTINS = new Set([
  'assert',
  'async_hooks',
  'buffer',
  'child_process',
  'cluster',
  'console',
  'constants',
  'crypto',
  'dgram',
  'diagnostics_channel',
  'dns',
  'domain',
  'events',
  'fs',
  'http',
  'http2',
  'https',
  'inspector',
  'module',
  'net',
  'os',
  'path',
  'perf_hooks',
  'process',
  'punycode',
  'querystring',
  'readline',
  'repl',
  'stream',
  'string_decoder',
  'sys',
  'test',
  'timers',
  'tls',
  'trace_events',
  'tty',
  'url',
  'util',
  'v8',
  'vm',
  'wasi',
  'worker_threads',
  'zlib',
  'fs/promises',
  'path/posix',
  'path/win32',
  'stream/promises',
  'stream/web',
  'timers/promises',
  'util/types',
])

/** Extract top-level npm package names from code (skips relative, @/, next, and Node builtins). */
export function extractNpmPackagesFromCode(code: string): Set<string> {
  if (typeof code !== 'string') return new Set()
  const pkgs = new Set<string>()
  let m: RegExpExecArray | null
  IMPORT_FROM_REGEX.lastIndex = 0
  while ((m = IMPORT_FROM_REGEX.exec(code)) !== null) {
    const spec = m[1]
    if (spec.startsWith('.') || spec.startsWith('/') || spec.startsWith('@/') || spec === 'next') continue
    if (spec.startsWith('node:') || NODE_BUILTINS.has(spec)) continue
    const pkg = spec.startsWith('@') ? spec.split('/').slice(0, 2).join('/') : spec.split('/')[0]
    if (pkg && !NODE_BUILTINS.has(pkg)) pkgs.add(pkg)
  }
  return pkgs
}

export function getInstalledPackages(projectRoot: string): Set<string> {
  const pkgPath = join(projectRoot, 'package.json')
  if (!existsSync(pkgPath)) return new Set()
  try {
    const json = JSON.parse(readFileSync(pkgPath, 'utf-8'))
    const deps = { ...(json.dependencies ?? {}), ...(json.devDependencies ?? {}) }
    return new Set(Object.keys(deps))
  } catch (e) {
    if (process.env.COHERENT_DEBUG === '1') console.error('Failed to read package.json:', e)
    return new Set()
  }
}

/** Recursively collect imported package names from code files under dir. */
async function collectImportedPackages(dir: string, extensions: Set<string>): Promise<Set<string>> {
  const packages = new Set<string>()
  if (!existsSync(dir)) return packages

  async function walk(d: string): Promise<void> {
    let entries
    try {
      entries = await readdir(d, { withFileTypes: true })
    } catch {
      return
    }
    for (const e of entries) {
      const full = join(d, e.name)
      if (e.isDirectory() && !e.name.startsWith('.') && e.name !== 'node_modules') {
        await walk(full)
        continue
      }
      if (!e.isFile()) continue
      const ext = e.name.replace(/^.*\./, '')
      if (!extensions.has(ext)) continue
      const content = await readFile(full, 'utf-8').catch(() => '')
      extractNpmPackagesFromCode(content).forEach(p => packages.add(p))
    }
  }
  await walk(dir)
  return packages
}

/**
 * Returns list of packages that should be installed: required + imported in code under dirs,
 * minus already installed.
 */
export async function findMissingPackages(
  projectRoot: string,
  dirs: string[] = ['app', 'components'],
): Promise<string[]> {
  const installed = getInstalledPackages(projectRoot)
  const required = new Set(COHERENT_REQUIRED_PACKAGES)
  const imported = new Set<string>()
  const extensions = new Set(['ts', 'tsx', 'js', 'jsx'])
  for (const d of dirs) {
    const abs = join(projectRoot, d)
    const pkgs = await collectImportedPackages(abs, extensions)
    pkgs.forEach(p => imported.add(p))
  }
  const needed = new Set([...required, ...imported])
  return [...needed].filter(p => !installed.has(p)).sort()
}

/**
 * From a single code string, return packages that are imported but not in project's package.json.
 */
export function findMissingPackagesInCode(code: string, projectRoot: string): string[] {
  const installed = getInstalledPackages(projectRoot)
  const required = new Set(COHERENT_REQUIRED_PACKAGES)
  const fromCode = extractNpmPackagesFromCode(code)
  const needed = new Set([...required, ...fromCode])
  return [...needed].filter(p => !installed.has(p)).sort()
}

const SAFE_PKG_NAME = /^(@[a-z0-9._-]+\/)?[a-z0-9._-]+$/

export function installPackages(projectRoot: string, packages: string[]): Promise<boolean> {
  if (packages.length === 0) return Promise.resolve(true)
  const safe = packages.filter(p => SAFE_PKG_NAME.test(p))
  if (safe.length === 0) return Promise.resolve(true)
  return new Promise(resolve => {
    try {
      const hasPnpm = existsSync(join(projectRoot, 'pnpm-lock.yaml'))
      if (hasPnpm) {
        execSync(`pnpm add ${safe.join(' ')}`, { cwd: projectRoot, stdio: 'pipe' })
      } else {
        execSync(`npm install --legacy-peer-deps ${safe.join(' ')}`, {
          cwd: projectRoot,
          stdio: 'pipe',
        })
      }
      resolve(true)
    } catch (e) {
      if (process.env.COHERENT_DEBUG === '1') console.error('Failed to install packages:', e)
      resolve(false)
    }
  })
}

// --- Syntax helpers (used by preview, repair, chat) ---

const CLIENT_HOOKS =
  /\b(useState|useEffect|useRef|useContext|useReducer|useCallback|useMemo|useId|useTransition|useDeferredValue)\s*\(/
const CLIENT_EVENTS =
  /\b(onClick|onChange|onSubmit|onBlur|onFocus|onKeyDown|onKeyUp|onMouseEnter|onMouseLeave|onScroll|onInput)\s*[={]/

function stripMetadataFromCode(code: string): string {
  const match = code.match(/\bexport\s+const\s+metadata\s*:\s*Metadata\s*=\s*\{/)
  if (!match) return code
  const start = code.indexOf(match[0])
  const open = code.indexOf('{', start)
  if (open === -1) return code
  let depth = 1
  let i = open + 1
  while (i < code.length && depth > 0) {
    const c = code[i]
    if (c === '{') depth++
    else if (c === '}') depth--
    i++
  }
  const end = i
  const tail = code.slice(end)
  const semicolon = tail.match(/^\s*;/)
  const removeEnd = semicolon ? end + (semicolon.index! + semicolon[0].length) : end
  return (code.slice(0, start) + code.slice(removeEnd)).replace(/\n{3,}/g, '\n\n').trim()
}

/** Ensure "use client" when hooks or event handlers are used; strip metadata when client. */
export function ensureUseClientIfNeeded(code: string): string {
  const trimmed = code.trimStart()
  const hasUseClient = trimmed.startsWith("'use client'") || trimmed.startsWith('"use client"')
  const needsUseClient = CLIENT_HOOKS.test(code) || CLIENT_EVENTS.test(code)
  let out = code
  if (hasUseClient || needsUseClient) {
    out = stripMetadataFromCode(out)
    if (needsUseClient && !hasUseClient) out = `'use client'\n\n${out}`
  }
  return out
}

/** Escape apostrophes in metadata title/description single-quoted strings.
 *  Also fixes AI-generated strings where \' escapes the closing quote. */
export function sanitizeMetadataStrings(code: string): string {
  // Step 1a: fix \' before }, ], or , (AI escapes closing quote in object/array literals)
  let out = code.replace(/\\'(\s*[}\],])/g, "'$1")
  // Step 1b: fix \' at end-of-line (catch-all)
  out = out.replace(/(:\s*'.+)\\'(\s*)$/gm, "$1'$2")
  // Step 2: escape internal apostrophes in metadata strings
  for (const key of ['description', 'title']) {
    const re = new RegExp(`\\b${key}:\\s*'((?:[^'\\\\]|'(?![,}]))*)'`, 'gs')
    out = out.replace(re, (_, inner) => `${key}: '${inner.replace(/'/g, "\\'")}'`)
  }
  return out
}

/** Fix single-quoted strings where AI escapes the closing quote: 'text.\' → 'text.' */
export function fixEscapedClosingQuotes(code: string): string {
  let out = code.replace(/\\'(\s*[}\],])/g, "'$1")
  out = out.replace(/(:\s*'.+)\\'(\s*)$/gm, "$1'$2")
  return out
}

/** Fix unescaped < in JSX text content (AI generates e.g. "<50ms" as literal text, invalid JSX).
 *  Must NOT touch valid JSX: <Component, </Component>, <>, {expression} */
export function fixUnescapedLtInJsx(code: string): string {
  const isJsExpr = (text: string) => /[().;=&|!?]/.test(text)
  let out = code
  out = out.replace(/>([^<{}\n]*)<(\d)/g, (m, text, d) => (isJsExpr(text) ? m : `>${text}&lt;${d}`))
  out = out.replace(/>([^<{}\n]*)<([^/a-zA-Z!{>\n])/g, (m, text, ch) => (isJsExpr(text) ? m : `>${text}&lt;${ch}`))
  return out
}
