/**
 * A deliberately restricted YAML-frontmatter reader for `coherent import
 * design`. F14 spec item 6: "Safe YAML — no custom tags/aliases/merge bombs,
 * file-size + depth limits."
 *
 * Rather than pull in a full YAML engine (the repo has zero YAML deps) and then
 * have to fence off its anchor/alias/tag/merge features, we parse a small,
 * safe SUBSET by hand:
 *
 *   - block mappings, nested by indentation (the only shape Stitch frontmatter
 *     uses for `colors:` / `typography:` / `spacing:`),
 *   - scalar leaf values (quoted or bare),
 *   - sequences are SKIPPED as whole subtrees (we never read a list-valued key;
 *     `components:` etc. are ignored, not parsed).
 *
 * Anchors (`&x`), aliases (`*x`), tags (`!x`), and merge keys (`<<:`) are hard
 * REJECTED — with aliases refused outright, alias-expansion bombs (billion
 * laughs / YAML merge bombs) are structurally impossible. Byte, line, and depth
 * caps bound the rest.
 */

const MAX_FRONTMATTER_BYTES = 256 * 1024
const MAX_LINES = 5000
const MAX_DEPTH = 8

export class SafeYamlError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SafeYamlError'
  }
}

export interface Frontmatter {
  data: Record<string, unknown> | null
  body: string
}

/**
 * Split leading `---` frontmatter (if present) from the markdown body. A file
 * with no frontmatter returns `{ data: null, body: content }`.
 */
export function extractFrontmatter(content: string): Frontmatter {
  const normalized = content.replace(/\r\n/g, '\n')
  if (!normalized.startsWith('---\n') && normalized !== '---') {
    return { data: null, body: content }
  }
  // Find the closing fence: a line that is exactly `---` (or `...`) after the opener.
  const afterOpen = normalized.slice(4)
  const closeMatch = afterOpen.match(/\n(?:---|\.\.\.)[ \t]*(?:\n|$)/)
  if (!closeMatch || closeMatch.index === undefined) {
    // Unterminated frontmatter — treat the whole thing as body (be lenient on
    // markdown that merely opens with a horizontal rule).
    return { data: null, body: content }
  }
  const block = afterOpen.slice(0, closeMatch.index)
  const body = afterOpen.slice(closeMatch.index + closeMatch[0].length)
  return { data: parseSafeYaml(block), body }
}

/** Parse a restricted block-mapping YAML string into a plain nested object. */
export function parseSafeYaml(block: string): Record<string, unknown> {
  if (Buffer.byteLength(block, 'utf-8') > MAX_FRONTMATTER_BYTES) {
    throw new SafeYamlError('frontmatter exceeds size limit')
  }
  const lines = block.replace(/\r\n/g, '\n').split('\n')
  if (lines.length > MAX_LINES) {
    throw new SafeYamlError('frontmatter exceeds line limit')
  }

  const root: Record<string, unknown> = {}
  // Stack of open mappings, ordered by indentation. `indent: -1` is the root.
  const stack: Array<{ indent: number; node: Record<string, unknown> }> = [{ indent: -1, node: root }]
  // When inside a skipped sequence, remember its indent so we can tell when it ends.
  let seqIndent: number | null = null

  for (const rawLine of lines) {
    if (rawLine.trim() === '' || rawLine.trimStart().startsWith('#')) continue
    if (/^\t| \t/.test(rawLine) || rawLine.includes('\t')) {
      throw new SafeYamlError('tabs are not allowed in frontmatter indentation')
    }

    const indent = rawLine.length - rawLine.trimStart().length
    const content = rawLine.trimStart()

    // Sequence handling: skip the whole subtree of any list. We never read a
    // list-valued key, so ignoring them keeps arbitrary Stitch files parseable.
    if (seqIndent !== null) {
      if (indent > seqIndent || (indent === seqIndent && content.startsWith('- '))) continue
      seqIndent = null
    }
    if (content === '-' || content.startsWith('- ')) {
      rejectDangerous(content)
      seqIndent = indent
      continue
    }

    rejectDangerous(content)

    const m = content.match(/^([^:#\s][^:]*?):(?:[ \t]+(.*))?$/)
    if (!m) continue // tolerant: ignore lines we don't understand (prose, rules)
    const key = m[1].trim()
    const rawVal = m[2]

    // Pop to the correct parent for this indent.
    while (stack.length > 1 && stack[stack.length - 1].indent >= indent) stack.pop()
    const parent = stack[stack.length - 1].node

    if (rawVal === undefined || rawVal.trim() === '') {
      if (stack.length >= MAX_DEPTH) throw new SafeYamlError('frontmatter nesting too deep')
      const child: Record<string, unknown> = {}
      parent[key] = child
      stack.push({ indent, node: child })
    } else {
      parent[key] = parseScalar(rawVal)
    }
  }

  return root
}

/**
 * Reject the YAML features that enable expansion/injection — but ONLY when they
 * appear as real YAML syntax (an anchor/alias/tag at the START of an unquoted
 * value, or a `<<` merge key). A `!`/`*`/`&`/`<<` INSIDE a quoted scalar or in
 * the middle of a plain value (e.g. `name: "Acme!"`, `title: a << b`) is
 * ordinary text and must be allowed.
 */
function rejectDangerous(content: string): void {
  // A sequence item (`- ...`) carries its value after the dash; inspect that.
  const inspect = content.startsWith('- ') ? content.slice(2).trim() : content
  const colon = inspect.indexOf(':')
  const keyPart = colon >= 0 ? inspect.slice(0, colon).trim() : ''
  const valuePart = colon >= 0 ? inspect.slice(colon + 1).trim() : inspect

  if (keyPart === '<<' || inspect.startsWith('<<:') || inspect.startsWith('<< ')) {
    throw new SafeYamlError('YAML merge keys (<<) are not allowed')
  }
  // Quoted scalars are literal text — never dangerous.
  if (valuePart.startsWith('"') || valuePart.startsWith("'")) return
  // Unquoted value that opens with an anchor (&), alias (*), or tag (!).
  if (/^[&*!]/.test(valuePart)) {
    throw new SafeYamlError('YAML anchors/aliases/tags (& * !) are not allowed')
  }
}

function parseScalar(raw: string): string {
  let s = raw.trim()
  // Quoted scalar — take the quoted content verbatim (allows `#` inside).
  if ((s.startsWith('"') && s.length >= 2) || (s.startsWith("'") && s.length >= 2)) {
    const quote = s[0]
    const end = s.indexOf(quote, 1)
    if (end > 0) {
      const inner = s.slice(1, end)
      return quote === '"' ? inner.replace(/\\"/g, '"').replace(/\\\\/g, '\\') : inner
    }
  }
  // Bare scalar — strip a trailing inline comment (` #...`).
  const hash = s.search(/\s#/)
  if (hash >= 0) s = s.slice(0, hash).trim()
  return s
}
