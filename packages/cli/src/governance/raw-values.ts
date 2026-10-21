/**
 * Hardcoded design values in TSX (ADR-0013 slice 2): colours, type sizes,
 * spacing, radius and shadow written as literals instead of tokens.
 *
 * Read from the TypeScript AST, only where styling lives: `className`, class
 * helpers (`cn`, `clsx`, `cva`, `twMerge`, `tv`, `classNames`), `style={{…}}`
 * and SVG `fill`/`stroke`. Theme utilities (`p-4`, `rounded-lg`, `text-sm`,
 * `bg-primary`) are tokens; anything through `var(--…)` is a token. Layout
 * dimensions (`w-[280px]`, `top-[3px]`) are not flagged: fixed sizes are
 * legitimate. Verification reports only values an edit adds (warnings).
 */
import ts from 'typescript'

export type RawKind = 'color' | 'type' | 'spacing' | 'radius' | 'shadow'

export interface RawValue {
  kind: RawKind
  /** The class or literal as written (`bg-[#3b82f6]`, `text-blue-500`, `color: #fff`). */
  value: string
  line: number
}

const CLASS_HELPERS = new Set(['cn', 'clsx', 'cva', 'twMerge', 'tv', 'classNames', 'cx'])
const COLOR_PREFIX =
  /^(bg|text|border(-[xytrbls])?|ring|ring-offset|outline|fill|stroke|from|via|to|divide|shadow|accent|caret|decoration|placeholder)$/
const PALETTE =
  /^(bg|text|border(-[xytrbls])?|ring|ring-offset|outline|fill|stroke|from|via|to|divide|shadow|accent|caret|decoration|placeholder)-(slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d{2,3}(\/\d+)?$/
const COLOR_LITERAL = /^(#[0-9a-f]{3,8}|(rgb|rgba|hsl|hsla|oklch|oklab|lab|lch|hwb|color-mix)\(.*\))$/i
const LENGTH = /^-?\d*\.?\d+(px|rem|em|pt|%)?$/
const SPACING = /^(p|px|py|pt|pr|pb|pl|ps|pe|m|mx|my|mt|mr|mb|ml|ms|me|gap|gap-x|gap-y|space-x|space-y)$/
const STYLE_COLOR = new Set([
  'color',
  'background',
  'backgroundColor',
  'borderColor',
  'outlineColor',
  'fill',
  'stroke',
  'caretColor',
])
const STYLE_KIND: Record<string, RawKind> = { fontSize: 'type', borderRadius: 'radius', boxShadow: 'shadow' }

/** The utility a class applies, without variants (`md:hover:`), `!` or a leading `-`. */
function utility(cls: string): string {
  let depth = 0
  let start = 0
  for (let i = 0; i < cls.length; i++) {
    if (cls[i] === '[') depth++
    else if (cls[i] === ']') depth--
    else if (cls[i] === ':' && depth === 0) start = i + 1
  }
  return cls.slice(start).replace(/^!/, '').replace(/!$/, '').replace(/^-/, '')
}

export function classifyClass(cls: string): RawKind | null {
  const u = utility(cls)
  if (PALETTE.test(u)) return 'color'
  const m = u.match(/^([a-z-]+?)-\[(.+)\](\/\d+)?$/)
  if (!m) return null
  const [, prefix, raw] = m
  const value = raw.replace(/_/g, ' ')
  if (/var\(--/.test(value)) return null
  const hinted = value.match(/^(color|length|size|number):(.+)$/)
  const v = hinted ? hinted[2] : value
  if (COLOR_PREFIX.test(prefix) && (COLOR_LITERAL.test(v) || hinted?.[1] === 'color')) return 'color'
  if (prefix === 'text' && (LENGTH.test(v) || hinted?.[1] === 'length')) return 'type'
  if ((prefix === 'leading' || prefix === 'tracking') && LENGTH.test(v)) return 'type'
  if (SPACING.test(prefix) && LENGTH.test(v)) return 'spacing'
  if (/^rounded(-[a-z]+)?$/.test(prefix) && LENGTH.test(v)) return 'radius'
  if (prefix === 'shadow' && !COLOR_LITERAL.test(v)) return 'shadow'
  return null
}

const isStringy = (n: ts.Node): n is ts.StringLiteral | ts.NoSubstitutionTemplateLiteral | ts.TemplateLiteralLikeNode =>
  ts.isStringLiteral(n) ||
  ts.isNoSubstitutionTemplateLiteral(n) ||
  n.kind === ts.SyntaxKind.TemplateHead ||
  n.kind === ts.SyntaxKind.TemplateMiddle ||
  n.kind === ts.SyntaxKind.TemplateTail

const calleeName = (e: ts.Expression): string | undefined =>
  ts.isIdentifier(e) ? e.text : ts.isPropertyAccessExpression(e) ? e.name.text : undefined

/**
 * Every class written where styling lives (`className`/`class`, class helpers),
 * with its line, and every other styling attribute (`style`, `fill`, `stroke`).
 */
function walkStyling(
  sf: ts.SourceFile,
  onClass: (cls: string, node: ts.Node) => void,
  onAttr?: (name: string, attr: ts.JsxAttribute) => void,
): void {
  // Every string inside a class context: the attribute's expression or the helper's arguments.
  const classStrings = (node: ts.Node) => {
    const visit = (n: ts.Node): void => {
      if (isStringy(n)) {
        for (const cls of (n as { text: string }).text.split(/\s+/).filter(Boolean)) onClass(cls, n)
        return
      }
      // Object keys in cva/clsx configs are variant names or class keys; values are visited.
      if (ts.isPropertyAssignment(n)) {
        if (ts.isStringLiteral(n.name) && ts.isCallExpression(n.parent.parent)) visit(n.name)
        visit(n.initializer)
        return
      }
      ts.forEachChild(n, visit)
    }
    visit(node)
  }

  const visit = (node: ts.Node): void => {
    if (ts.isJsxAttribute(node) && node.initializer) {
      const name = node.name.getText(sf)
      if (name === 'className' || name === 'class') return classStrings(node.initializer)
      if (onAttr && (name === 'style' || name === 'fill' || name === 'stroke')) return onAttr(name, node)
    }
    if (ts.isCallExpression(node) && CLASS_HELPERS.has(calleeName(node.expression) ?? '')) {
      for (const a of node.arguments) classStrings(a)
      return
    }
    ts.forEachChild(node, visit)
  }
  visit(sf)
}

const parse = (file: string, text: string) =>
  ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)

export function rawValues(file: string, text: string): RawValue[] {
  if (!/\.(tsx|jsx)$/.test(file)) return []
  const sf = parse(file, text)
  const out: RawValue[] = []
  const lineOf = (n: ts.Node) => sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1

  walkStyling(
    sf,
    (cls, n) => {
      const kind = classifyClass(cls)
      if (kind) out.push({ kind, value: cls, line: lineOf(n) })
    },
    (name, node) => {
      if (name === 'style' && ts.isJsxExpression(node.initializer!) && node.initializer.expression) {
        const obj = node.initializer.expression
        if (ts.isObjectLiteralExpression(obj))
          for (const p of obj.properties) {
            if (
              !ts.isPropertyAssignment(p) ||
              !(ts.isStringLiteral(p.initializer) || ts.isNumericLiteral(p.initializer))
            )
              continue
            const key = p.name.getText(sf).replace(/['"]/g, '')
            const v = p.initializer.text
            const kind = STYLE_COLOR.has(key) && COLOR_LITERAL.test(v.trim()) ? 'color' : STYLE_KIND[key]
            if (kind && !/var\(--/.test(v)) out.push({ kind, value: `${key}: ${v}`, line: lineOf(p) })
          }
        return
      }
      if ((name === 'fill' || name === 'stroke') && ts.isStringLiteral(node.initializer!)) {
        const v = node.initializer.text.trim()
        if (COLOR_LITERAL.test(v)) out.push({ kind: 'color', value: `${name}="${v}"`, line: lineOf(node) })
      }
    },
  )
  return out
}

const RADIUS_UTILITY = /^rounded(-(?:[trblse]|tl|tr|br|bl|ss|se|es|ee))?(?:-(xs|sm|md|lg|xl|2xl|3xl|4xl))?$/

/**
 * Tokens a file references statically (ADR-0013 slice 3): theme utilities
 * named after a token (`bg-primary` → `--primary`, `rounded-lg` → `--radius`,
 * `font-sans` → `--font-sans`, `shadow-card` → `--shadow-card`) and `var(--x)`
 * anywhere in the file. Static references only: a class built at runtime or a
 * stylesheet rule (`@apply` in the base layer) is not seen.
 */
export function tokenRefs(file: string, text: string, tokens: ReadonlySet<string>): string[] {
  if (!/\.(tsx|jsx)$/.test(file)) return []
  const out = new Set<string>()
  const hit = (...names: string[]) => {
    const n = names.find(x => tokens.has(x))
    if (n) out.add(n)
  }
  for (const m of text.matchAll(/var\((--[a-zA-Z0-9-]+)/g)) hit(m[1], m[1].replace(/^--color-/, '--'))
  walkStyling(parse(file, text), cls => {
    const u = utility(cls).replace(/\/\d+$/, '')
    const short = u.match(/^[a-z-]+-\((--[a-zA-Z0-9-]+)\)$/)
    if (short) return hit(short[1])
    const r = u.match(RADIUS_UTILITY)
    if (r) return r[2] ? hit(`--radius-${r[2]}`, '--radius') : hit('--radius')
    if (!/^[a-z][a-z0-9-]*$/.test(u)) return
    // `border-t-border`, `ring-offset-background`: try every split, prefix first.
    for (let i = u.indexOf('-'); i > 0; i = u.indexOf('-', i + 1)) {
      const prefix = u.slice(0, i)
      const name = u.slice(i + 1)
      // text-* is a colour or a size: try both.
      if (COLOR_PREFIX.test(prefix)) hit(`--${name}`, `--color-${name}`)
      if (prefix === 'text') hit(`--text-${name}`)
      else if (prefix === 'font') hit(`--font-${name}`)
      else if (prefix === 'leading' || prefix === 'tracking') hit(`--${prefix}-${name}`)
      else if (prefix === 'rounded') hit(`--radius-${name}`)
      if (prefix === 'shadow') hit(`--shadow-${name}`)
    }
  })
  return [...out].sort()
}

/**
 * Values in `after` beyond those already in `before` (per kind+value, so an
 * edit that keeps or moves a value within the file adds nothing). Moving a value
 * into another file counts there: honest for a warning.
 */
export function addedRawValues(before: RawValue[], after: RawValue[]): RawValue[] {
  const left = new Map<string, number>()
  for (const v of before) left.set(v.kind + ' ' + v.value, (left.get(v.kind + ' ' + v.value) ?? 0) + 1)
  return after.filter(v => {
    const k = v.kind + ' ' + v.value
    const n = left.get(k) ?? 0
    if (n > 0) {
      left.set(k, n - 1)
      return false
    }
    return true
  })
}

const HINT: Record<RawKind, string> = {
  color: 'use a colour token (bg-primary, text-muted-foreground…) or add one',
  type: 'use the type scale (text-sm, text-lg…) or a font-size token',
  spacing: 'use the spacing scale (p-4, gap-6…)',
  radius: 'use the radius scale (rounded-md, rounded-lg…) or --radius',
  shadow: 'use the shadow scale (shadow-sm…) or a shadow token',
}

export const rawValueWarning = (file: string, v: RawValue) => `${file}:${v.line} ${v.value} — ${HINT[v.kind]}`
