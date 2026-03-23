interface NavItem {
  label: string
  href: string
}

export function takeNavSnapshot(items: NavItem[] | undefined, navType?: string): string {
  const prefix = navType ? `type:${navType}|` : ''
  if (!items || items.length === 0) return `${prefix}[]`
  return `${prefix}${JSON.stringify(items.map(i => `${i.label}:${i.href}`).sort())}`
}

export function hasNavChanged(before: string, after: string): boolean {
  return before !== after
}
