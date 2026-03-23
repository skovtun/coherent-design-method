export function extractExportedComponentName(code: string): string | null {
  const patterns = [
    /export\s+(?:default\s+)?function\s+([A-Z][a-zA-Z0-9]*)/,
    /export\s+const\s+([A-Z][a-zA-Z0-9]*)\s*[=:]/,
  ]
  for (const pattern of patterns) {
    const match = code.match(pattern)
    if (match) return match[1]
  }
  return null
}

export function extractPropsInterface(code: string): string | null {
  const interfaceMatch = code.match(/(?:interface|type)\s+Props\s*=?\s*\{([^}]*(?:\{[^}]*\}[^}]*)*)\}/)
  if (interfaceMatch) {
    const fields = interfaceMatch[1]
      .split('\n')
      .map(l => l.trim().replace(/;?\s*$/, ''))
      .filter(l => l && !l.startsWith('//'))
    return `{ ${fields.join('; ')} }`
  }

  const inlineMatch = code.match(/\}\s*:\s*(\{[^)]+\})/)
  if (inlineMatch) return inlineMatch[1].replace(/\s+/g, ' ').trim()

  return null
}

export function extractDependencies(code: string): string[] {
  const deps: string[] = []
  const importRegex = /import\s+.*?from\s+['"]([^'"]+)['"]/g
  let match
  while ((match = importRegex.exec(code)) !== null) {
    const source = match[1]
    if (source.startsWith('@/components/ui/')) {
      deps.push(source.replace('@/', ''))
    } else if (!source.startsWith('.') && !source.startsWith('@/')) {
      deps.push(source)
    }
  }
  return [...new Set(deps)]
}

export function extractUsageExample(pageCode: string, componentName: string): string | null {
  const selfClosingRegex = new RegExp(`<${componentName}\\s[^>]*/>`)
  const selfMatch = pageCode.match(selfClosingRegex)
  if (selfMatch) return selfMatch[0]

  const openingRegex = new RegExp(`<${componentName}[\\s>][^]*?</${componentName}>`)
  const openMatch = pageCode.match(openingRegex)
  if (openMatch) {
    const full = openMatch[0]
    return full.length > 200 ? full.slice(0, 200) + '...' : full
  }

  return null
}
