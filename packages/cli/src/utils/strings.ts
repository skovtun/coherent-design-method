/**
 * Shared string transformation utilities.
 */

export function toKebabCase(str: string): string {
  return str.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase()
}

export function toPascalCase(str: string): string {
  return str
    .replace(/[-_\s]+(.)?/g, (_, c) => (c ? c.toUpperCase() : ''))
    .replace(/^(.)/, (_, c) => c.toUpperCase())
    .replace(/[^a-zA-Z0-9]/g, '')
}

export function toTitleCase(slug: string): string {
  let s = slug.trim()
  if (!s) return 'My App'
  s = s.replace(/^@[^/]+\//, '')
  if (!s) return 'My App'
  const words = s
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .split(/[-_\s]+/)
    .filter(Boolean)
  if (words.length === 0) return 'My App'
  return words
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ')
}
