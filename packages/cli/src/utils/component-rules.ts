import type { QualityIssue } from './types.js'

interface ComponentRule {
  id: string
  component: string
  detect: (code: string) => QualityIssue[]
  fix: (code: string) => { code: string; applied: boolean; description: string }
}

/**
 * Extract the props region of a JSX element starting at `<Component`.
 * Tracks nesting of {}, template literals, and strings to find the real closing `>`.
 * Returns the substring from the opening `<` up to and including `>`.
 */
function extractJsxElementProps(code: string, openTagStart: number): string | null {
  let i = openTagStart
  if (code[i] !== '<') return null
  i++

  let braceDepth = 0
  let inSingleQuote = false
  let inDoubleQuote = false
  let inTemplateLiteral = false
  let escaped = false

  while (i < code.length) {
    const ch = code[i]

    if (escaped) {
      escaped = false
      i++
      continue
    }
    if (ch === '\\' && (inSingleQuote || inDoubleQuote || inTemplateLiteral)) {
      escaped = true
      i++
      continue
    }

    if (!inDoubleQuote && !inTemplateLiteral && ch === "'" && braceDepth > 0) {
      inSingleQuote = !inSingleQuote
    } else if (!inSingleQuote && !inTemplateLiteral && ch === '"') {
      inDoubleQuote = !inDoubleQuote
    } else if (!inSingleQuote && !inDoubleQuote && ch === '`') {
      inTemplateLiteral = !inTemplateLiteral
    }

    if (!inSingleQuote && !inDoubleQuote && !inTemplateLiteral) {
      if (ch === '{') braceDepth++
      else if (ch === '}') braceDepth--
      else if (ch === '>' && braceDepth === 0) {
        return code.slice(openTagStart, i + 1)
      }
    }

    i++
  }

  return null
}

const NAV_STYLE_SIGNAL = /text-muted-foreground/

const buttonMissingGhostVariant: ComponentRule = {
  id: 'button-missing-ghost-variant',
  component: 'Button',

  detect(code: string): QualityIssue[] {
    const issues: QualityIssue[] = []
    const buttonRe = /<Button\s/g
    let match: RegExpExecArray | null

    while ((match = buttonRe.exec(code)) !== null) {
      const props = extractJsxElementProps(code, match.index)
      if (!props) continue

      if (/\bvariant\s*=/.test(props)) continue
      if (!NAV_STYLE_SIGNAL.test(props)) continue

      const line = code.slice(0, match.index).split('\n').length
      issues.push({
        line,
        type: 'BUTTON_MISSING_VARIANT',
        message: '<Button> with navigation-style classes (text-muted-foreground) but no variant — add variant="ghost"',
        severity: 'error',
      })
    }

    return issues
  },

  fix(code: string): { code: string; applied: boolean; description: string } {
    let result = code
    let applied = false
    const buttonRe = /<Button\s/g
    let match: RegExpExecArray | null
    let offset = 0

    while ((match = buttonRe.exec(code)) !== null) {
      const adjustedIndex = match.index + offset
      const props = extractJsxElementProps(result, adjustedIndex)
      if (!props) continue

      if (/\bvariant\s*=/.test(props)) continue
      if (!NAV_STYLE_SIGNAL.test(props)) continue

      const insertPos = adjustedIndex + '<Button'.length
      const insertion = '\n' + getIndent(result, adjustedIndex) + '  variant="ghost"'
      result = result.slice(0, insertPos) + insertion + result.slice(insertPos)
      offset += insertion.length
      applied = true
    }

    return {
      code: result,
      applied,
      description: 'added variant="ghost" to Button with nav-style classes',
    }
  },
}

function getIndent(code: string, pos: number): string {
  const lineStart = code.lastIndexOf('\n', pos)
  const lineContent = code.slice(lineStart + 1, pos)
  const indentMatch = lineContent.match(/^(\s*)/)
  return indentMatch ? indentMatch[1] : ''
}

const rules: ComponentRule[] = [buttonMissingGhostVariant]

export function detectComponentIssues(code: string): QualityIssue[] {
  const issues: QualityIssue[] = []
  for (const rule of rules) {
    issues.push(...rule.detect(code))
  }
  return issues
}

export function applyComponentRules(code: string): { code: string; fixes: string[] } {
  const fixes: string[] = []
  let result = code

  for (const rule of rules) {
    const { code: fixed, applied, description } = rule.fix(result)
    if (applied) {
      result = fixed
      fixes.push(description)
    }
  }

  return { code: result, fixes }
}
