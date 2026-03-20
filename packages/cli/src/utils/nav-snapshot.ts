interface NavItem {
  label: string
  href: string
}

export function takeNavSnapshot(items: NavItem[] | undefined): string {
  if (!items || items.length === 0) return '[]'
  return JSON.stringify(items.map(i => `${i.label}:${i.href}`).sort())
}

export function hasNavChanged(before: string, after: string): boolean {
  return before !== after
}
