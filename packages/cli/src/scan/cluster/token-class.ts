/**
 * Token-nature classifier for the labeler (F13.2).
 *
 * WHY spread alone failed. The #120 `high_spread` flag (occurrences +
 * distinct_files) forced a general name on ANY widespread cluster. But two of
 * the eval hard cases are BOTH widespread:
 *   - text-grey_light_text (47 uses / 25 files) → wants general "Subtle Text"
 *   - container mx-auto px-5 … (23 uses / 23 files) → wants specific "Breadcrumb Nav"
 * high_spread can't tell them apart, and would have REGRESSED the breadcrumb
 * recipe to a generic name — a hard-case failure.
 *
 * The real signal is the TOKEN NATURE, not the spread:
 *   - a bare styling utility (a color / weight / size / spacing class, or a few
 *     of them) has a general visual ROLE regardless of where it is used → name
 *     that role, never the observed page/element ("Subtle Text", not
 *     "Breadcrumb Separator"). This holds even in a single file.
 *   - a structural recipe (grid/flex template, sticky/absolute positioning, a
 *     container+layout combo) or a semantic component class (lb-*, mk-*,
 *     x-slot) forms a specific pattern → a specific name is correct.
 *
 * This classifier is deterministic and validated offline against all 28 pilot
 * eval clusters. It replaces `high_spread` as the flag handed to the labeler.
 */

/** Max tokens for a cluster to still read as a "small styling utility". */
export const MAX_GENERIC_UTILITY_TOKENS = 5

type TokenClass = 'visual' | 'structural' | 'semantic' | 'junk'

// Bare styling utilities: color, weight, size, spacing, simple display. These
// have a general visual role independent of context.
const VISUAL_EXACT = new Set([
  'block',
  'inline',
  'inline-block',
  'hidden',
  'italic',
  'underline',
  'uppercase',
  'lowercase',
  'capitalize',
  'truncate',
  'antialiased',
  'tabular-nums',
  'border', // plain border width/style — a visual edge, not a layout
])
const VISUAL_PREFIXES = [
  'text-',
  'font-',
  'leading-',
  'tracking-',
  'bg-',
  'rounded-',
  'shadow-',
  'opacity-',
  'ring-',
  'decoration-',
  'whitespace-',
  'break-',
  // self spacing (margin / padding on the element itself)
  'm-',
  'mt-',
  'mb-',
  'ml-',
  'mr-',
  'mx-',
  'my-',
  'p-',
  'pt-',
  'pb-',
  'pl-',
  'pr-',
  'px-',
  'py-',
]

// Layout-defining tokens: these make the cluster a structural recipe.
const STRUCTURAL_EXACT = new Set([
  'flex',
  'inline-flex',
  'grid',
  'inline-grid',
  'container',
  'absolute',
  'relative',
  'fixed',
  'sticky',
  'static',
  'grow',
  'shrink',
  'flex-wrap',
  'flex-nowrap',
])
const STRUCTURAL_PREFIXES = [
  'grid-',
  'col-',
  'row-',
  'gap-',
  'space-x-',
  'space-y-',
  'justify-',
  'items-',
  'content-',
  'self-',
  'place-',
  'order-',
  'basis-',
  'flex-',
  'top-',
  'bottom-',
  'left-',
  'right-',
  'inset-',
  'z-',
  'aspect-',
  'columns-',
  'float-',
  'object-',
  'overflow-',
  'w-',
  'h-',
  'min-',
  'max-',
  'divide-',
]

/** Strip Tailwind variant prefixes: `lg:hover:px-4` → `px-4`. */
export function stripVariants(token: string): string {
  const i = token.lastIndexOf(':')
  return i === -1 ? token : token.slice(i + 1)
}

function classifyToken(raw: string): TokenClass {
  // Parsed @class / interpolation fragments — never a clean utility.
  if (/[={}$"'>]/.test(raw) || raw.includes('=>') || raw === '[' || raw === ']') return 'junk'
  const t = stripVariants(raw)
  if (!t) return 'junk'
  if (VISUAL_EXACT.has(t)) return 'visual'
  if (STRUCTURAL_EXACT.has(t)) return 'structural'
  if (STRUCTURAL_PREFIXES.some(p => t.startsWith(p))) return 'structural'
  if (VISUAL_PREFIXES.some(p => t.startsWith(p))) return 'visual'
  // Anything left that doesn't look like a Tailwind utility is a semantic /
  // component class: lb-label, mk-btn, x-slot, x-badge, a bare `label`.
  return 'semantic'
}

/**
 * True when the cluster is a small set of bare styling utilities — name its
 * general visual role, never the observed context. False when it contains a
 * structural recipe or a semantic component class — a specific name is right.
 */
export function isGenericUtility(tokens: string[]): boolean {
  if (tokens.length === 0 || tokens.length > MAX_GENERIC_UTILITY_TOKENS) return false
  return tokens.every(t => classifyToken(t) === 'visual')
}
