/**
 * Single source of truth for allowed color classes.
 * Generates whitelist from CSS variable output of buildCssVariables().
 */

/** Non-color CSS variables to exclude from the color whitelist */
const NON_COLOR_VARS = new Set(['radius'])

/** Raw Tailwind palette color names (those that take a numeric shade, e.g. blue-500) */
export const RAW_TAILWIND_COLORS = [
  'gray',
  'blue',
  'red',
  'green',
  'yellow',
  'purple',
  'pink',
  'indigo',
  'orange',
  'slate',
  'zinc',
  'stone',
  'neutral',
  'emerald',
  'teal',
  'cyan',
  'sky',
  'violet',
  'fuchsia',
  'rose',
  'amber',
  'lime',
]

/** All Tailwind prefixes that accept color values */
export const COLOR_PREFIXES = [
  'bg',
  'text',
  'border',
  'ring',
  'outline',
  'shadow',
  'from',
  'to',
  'via',
  'divide',
  'placeholder',
  'decoration',
  'caret',
  'fill',
  'stroke',
  'accent',
]

export interface AllowedColorClasses {
  /** Set of all allowed color class names (e.g., "bg-primary", "text-foreground") */
  classes: Set<string>
  /** Compact string for AI constraint injection */
  constraintSnippet: string
  /** Regex matching raw Tailwind color classes (NOT in the whitelist) */
  disallowedPattern: RegExp
}

/**
 * Extract CSS variable names from the output of buildCssVariables().
 * Filters out non-color variables like --radius.
 */
export function extractCssVariableNames(cssString: string): string[] {
  const matches = cssString.matchAll(/--([a-z][a-z0-9-]*)/g)
  const unique = new Set<string>()
  for (const m of matches) {
    if (!NON_COLOR_VARS.has(m[1])) {
      unique.add(m[1])
    }
  }
  return [...unique]
}

/**
 * Generate the complete set of allowed color classes from CSS variable output.
 * @param cssString - Output of buildCssVariables()
 */
export function getAllowedColorClasses(cssString: string): AllowedColorClasses {
  const varNames = extractCssVariableNames(cssString)
  const classes = new Set<string>()

  // Generate all prefix+varName combinations
  for (const varName of varNames) {
    for (const prefix of COLOR_PREFIXES) {
      classes.add(`${prefix}-${varName}`)
    }
  }

  // Special cases: bare "border" (no suffix) is valid in Tailwind
  classes.add('border')

  // Build constraint snippet — compact, grouped by prefix, only bg- and text- for brevity
  const tokens = varNames.join('|')
  const bgClasses = varNames.map(v => `bg-${v}`)
  const textClasses = varNames.map(v => `text-${v}`)
  const constraintSnippet =
    `bg: ${bgClasses.join(', ')}. ` +
    `text: ${textClasses.join(', ')}. ` +
    `border/ring/shadow/fill/stroke: same tokens (${tokens}). ` +
    `Opacity ok (e.g., bg-primary/50).`

  // Build disallowed pattern: matches raw Tailwind colors (color-name + shade number)
  const modifierGroup = `(?:(?:[a-z][a-z0-9-]*:)*)?`
  const prefixGroup = `(?:${COLOR_PREFIXES.join('|')})`
  const colorGroup = `(?:${RAW_TAILWIND_COLORS.join('|')})`
  const disallowedPattern = new RegExp(`\\b${modifierGroup}${prefixGroup}-${colorGroup}-\\d+(?:\\/\\d+)?\\b`)

  return { classes, constraintSnippet, disallowedPattern }
}
