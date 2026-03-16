export function extractBalancedTag(source: string, tagName: string): string | null {
  const openRe = new RegExp(`<${tagName}\\b`, 'gi')
  const match = openRe.exec(source)
  if (!match) return null

  const startIdx = match.index
  const openTagRe = new RegExp(`<${tagName}\\b`, 'gi')
  const closeTagRe = new RegExp(`</${tagName}>`, 'gi')

  const events: Array<{ pos: number; type: 'open' | 'close'; end: number }> = []
  let m: RegExpExecArray | null
  openTagRe.lastIndex = startIdx
  while ((m = openTagRe.exec(source)) !== null) {
    events.push({ pos: m.index, type: 'open', end: m.index + m[0].length })
  }
  closeTagRe.lastIndex = startIdx
  while ((m = closeTagRe.exec(source)) !== null) {
    events.push({ pos: m.index, type: 'close', end: m.index + m[0].length })
  }
  events.sort((a, b) => a.pos - b.pos)

  let depth = 0
  for (const ev of events) {
    if (ev.pos < startIdx) continue
    if (ev.type === 'open') depth++
    else {
      depth--
      if (depth === 0) return source.slice(startIdx, ev.end)
    }
  }
  return null
}

export function extractRelevantImports(fullSource: string, jsxBlock: string): string[] {
  const importLines: string[] = []
  const importRe = /^import\s+.*from\s+['"][^'"]+['"];?\s*$/gm
  let m: RegExpExecArray | null
  while ((m = importRe.exec(fullSource)) !== null) {
    const line = m[0]
    const namesMatch = line.match(/import\s*\{([^}]+)\}/)
    if (namesMatch) {
      const names = namesMatch[1].split(',').map(n =>
        n
          .trim()
          .split(/\s+as\s+/)
          .pop()!
          .trim(),
      )
      if (names.some(name => jsxBlock.includes(name))) {
        importLines.push(line)
      }
    }
    const defaultMatch = line.match(/import\s+(\w+)\s+from/)
    if (defaultMatch && jsxBlock.includes(defaultMatch[1])) {
      importLines.push(line)
    }
  }
  return [...new Set(importLines)]
}

export function extractStateHooks(fullSource: string, jsxBlock: string): string[] {
  const hooks: string[] = []
  const stateRe = /const\s+\[(\w+),\s*(\w+)\]\s*=\s*useState\b[^)]*\)/g
  let m: RegExpExecArray | null
  while ((m = stateRe.exec(fullSource)) !== null) {
    const [fullMatch, getter, setter] = m
    if (jsxBlock.includes(getter) || jsxBlock.includes(setter)) {
      hooks.push(fullMatch)
    }
  }
  return hooks
}

export function addActiveNavToHeader(code: string): string {
  let result = code

  if (!result.includes('usePathname')) {
    if (result.includes("from 'next/navigation'")) {
      result = result.replace(
        /import\s*\{([^}]+)\}\s*from\s*'next\/navigation'/,
        (_, names) => `import { ${names.trim()}, usePathname } from 'next/navigation'`,
      )
    } else {
      result = result.replace(
        'export function Header()',
        "import { usePathname } from 'next/navigation'\n\nexport function Header()",
      )
    }
  }

  if (!result.includes('const pathname')) {
    result = result.replace(
      /export function Header\(\)\s*\{/,
      'export function Header() {\n  const pathname = usePathname()',
    )
  }

  result = result.replace(
    /<Link\s+href="(\/[^"]*?)"\s+className="([^"]*?)(?:text-foreground|text-muted-foreground(?:\s+hover:text-foreground)?(?:\s+transition-colors)?)([^"]*?)">/g,
    (_, href, before, after) => {
      const base = before.trim()
      const trail = after.trim()
      const staticParts = [base, trail].filter(Boolean).join(' ')
      const space = staticParts ? ' ' : ''
      return `<Link href="${href}" className={\`${staticParts}${space}\${pathname === '${href}' ? 'text-foreground font-medium' : 'text-muted-foreground hover:text-foreground transition-colors'}\`}>`
    },
  )

  return result
}
