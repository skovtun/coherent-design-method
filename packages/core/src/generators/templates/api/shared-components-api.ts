/**
 * API route: GET /api/design-system/shared-components
 * Returns coherent.components.json manifest (Epic 2).
 */
export const SHARED_COMPONENTS_API = `import { NextResponse } from 'next/server'
import { readFile } from 'fs/promises'
import { join } from 'path'

export async function GET() {
  try {
    const path = join(process.cwd(), 'coherent.components.json')
    const raw = await readFile(path, 'utf-8')
    const data = JSON.parse(raw)
    return NextResponse.json(data)
  } catch {
    return NextResponse.json({ shared: [], nextId: 1 })
  }
}
`

/**
 * API route: GET /api/design-system/shared-components/[id]
 * Returns one shared component entry + source code + extracted meta:
 * - linesOfCode, isClient, hasUseClient
 * - exports list (default + named)
 * - imports grouped (ui, hooks, internal, third-party)
 * - hooks used (useState, useEffect, custom)
 * - props interface (if found in source)
 */
export const SHARED_COMPONENT_DETAIL_API = `import { NextResponse } from 'next/server'
import { readFile } from 'fs/promises'
import { join } from 'path'

interface ImportGroup {
  ui: string[]      // @/components/ui/*
  internal: string[] // @/* and ./*
  third: string[]    // bare specifiers
}

interface SourceMeta {
  linesOfCode: number
  isClient: boolean
  exports: { name: string; kind: 'default' | 'named' }[]
  imports: ImportGroup
  hooks: string[]
  propsInterface: { name: string; body: string } | null
}

function extractMeta(code: string): SourceMeta {
  const lines = code.split('\\n')
  const linesOfCode = lines.filter(l => l.trim() && !l.trim().startsWith('//')).length

  const isClient = /^['"]use client['"];?\\s*$/m.test(code.split('\\n').slice(0, 5).join('\\n'))

  // Exports
  const exports: { name: string; kind: 'default' | 'named' }[] = []
  const defaultExport = code.match(/^export default (?:function\\s+(\\w+)|class\\s+(\\w+)|(\\w+))/m)
  if (defaultExport) {
    exports.push({ name: defaultExport[1] || defaultExport[2] || defaultExport[3] || 'default', kind: 'default' })
  }
  const namedExports = Array.from(code.matchAll(/^export (?:const|function|class|interface|type)\\s+(\\w+)/gm))
  for (const m of namedExports) {
    if (!exports.some(e => e.name === m[1])) {
      exports.push({ name: m[1], kind: 'named' })
    }
  }

  // Imports
  const ui: string[] = []
  const internal: string[] = []
  const third: string[] = []
  const importRe = /^import\\s+(?:[\\w*\\s{},]+\\s+from\\s+)?['"]([^'"]+)['"]/gm
  for (const m of code.matchAll(importRe)) {
    const path = m[1]
    if (path.startsWith('@/components/ui/')) ui.push(path.replace('@/components/ui/', ''))
    else if (path.startsWith('@/') || path.startsWith('./') || path.startsWith('../')) internal.push(path)
    else third.push(path)
  }

  // Hooks (built-in + custom — anything matching use[A-Z])
  const hookSet = new Set<string>()
  for (const m of code.matchAll(/\\b(use[A-Z]\\w+)\\(/g)) {
    hookSet.add(m[1])
  }
  const hooks = Array.from(hookSet).sort()

  // Props interface — first interface or type ending with Props
  let propsInterface: { name: string; body: string } | null = null
  const ifaceMatch = code.match(/(?:interface|type)\\s+(\\w*Props)\\s*=?\\s*\\{([\\s\\S]*?)\\n\\}/m)
  if (ifaceMatch) {
    propsInterface = { name: ifaceMatch[1], body: ifaceMatch[2].trim() }
  }

  return {
    linesOfCode,
    isClient,
    exports,
    imports: { ui: [...new Set(ui)].sort(), internal: [...new Set(internal)].sort(), third: [...new Set(third)].sort() },
    hooks,
    propsInterface,
  }
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const manifestPath = join(process.cwd(), 'coherent.components.json')
    const raw = await readFile(manifestPath, 'utf-8')
    const manifest = JSON.parse(raw)
    const entry = manifest.shared?.find((e: { id: string }) => e.id === id)
    if (!entry) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    const codePath = join(process.cwd(), entry.file)
    const code = await readFile(codePath, 'utf-8')
    const meta = extractMeta(code)
    return NextResponse.json({ entry, code, meta })
  } catch (e) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
}
`
