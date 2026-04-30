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
 * Returns entry + source + designer-relevant meta extracted from source:
 * - tokens: colors / spacing / typography / radius / shadow / border used
 * - anatomy: icon names, button/link/image counts, structural tags
 * - states: detected useState names (what changes on interaction)
 *
 * Dev-oriented info (LoC, exports, imports, hooks, Props interface)
 * intentionally dropped — this page targets designers, not engineers.
 */
export const SHARED_COMPONENT_DETAIL_API = `import { NextResponse } from 'next/server'
import { readFile } from 'fs/promises'
import { join } from 'path'

interface DesignerMeta {
  tokens: {
    colors: string[]      // ['primary', 'foreground', 'muted-foreground']
    spacing: string[]     // ['p-4', 'gap-3', 'mt-2']
    typography: string[]  // ['text-sm', 'font-medium']
    radius: string[]      // ['rounded-md', 'rounded-full']
    shadow: string[]      // ['shadow-sm']
    border: string[]      // ['border-border']
  }
  anatomy: {
    icons: string[]       // Lucide icon names found in source
    buttons: number       // <button>, <Button>
    links: number         // <a>, <Link>
    images: number        // <img>, <Image>
    structural: string[]  // top-level <nav>, <header>, <section>...
  }
  states: string[]        // useState variable names
}

function uniq(arr: string[]): string[] {
  return [...new Set(arr)].sort()
}

function extractTokens(code: string): DesignerMeta['tokens'] {
  // Pull all className="..." and className={\`...\`} contents.
  const classChunks: string[] = []
  for (const m of code.matchAll(/className\\s*=\\s*\\{?["'\\\`]([^"'\\\`]+)["'\\\`]/g)) {
    classChunks.push(m[1])
  }
  // Also handle className={\\\`...\\\`} with template strings (split first).
  for (const m of code.matchAll(/className\\s*=\\s*\\{[^}]*\\\`([^\\\`]+)\\\`[^}]*\\}/g)) {
    classChunks.push(m[1])
  }
  const classes = classChunks.join(' ').split(/\\s+/).filter(Boolean)

  const colors: string[] = []
  const spacing: string[] = []
  const typography: string[] = []
  const radius: string[] = []
  const shadow: string[] = []
  const border: string[] = []

  // Coherent semantic color names.
  const SEM_COLORS = new Set([
    'primary', 'primary-foreground', 'secondary', 'secondary-foreground',
    'background', 'foreground', 'muted', 'muted-foreground',
    'accent', 'accent-foreground', 'card', 'card-foreground',
    'popover', 'popover-foreground', 'border', 'input', 'ring',
    'success', 'success-foreground', 'warning', 'warning-foreground',
    'error', 'error-foreground', 'info', 'info-foreground',
    'destructive', 'destructive-foreground',
  ])

  for (const cls of classes) {
    // Strip responsive/state prefixes (md:, hover:, dark:, etc.)
    const c = cls.replace(/^(?:[a-z-]+:)+/, '')
    // Colors: bg-X, text-X (color), border-X, ring-X
    const colorMatch = c.match(/^(?:bg|text|border|ring|fill|stroke)-([\\w-]+?)(?:\\/\\d+)?$/)
    if (colorMatch && SEM_COLORS.has(colorMatch[1])) {
      colors.push(colorMatch[1])
      continue
    }
    // Spacing: p-X, m-X, gap-X, space-X-X with px/m[xytrbl] variants
    if (/^(?:p|m|gap|space)[xytrbl]?-/.test(c) || /^space-[xy]-/.test(c)) {
      spacing.push(c)
      continue
    }
    // Typography
    if (/^text-(?:xs|sm|base|lg|xl|\\d+xl|\\[)/.test(c) || /^font-(?:thin|extralight|light|normal|medium|semibold|bold|extrabold|black)$/.test(c) || /^leading-/.test(c) || /^tracking-/.test(c)) {
      typography.push(c)
      continue
    }
    // Radius
    if (/^rounded(?:-|$)/.test(c)) {
      radius.push(c)
      continue
    }
    // Shadow
    if (/^shadow(?:-|$)/.test(c)) {
      shadow.push(c)
      continue
    }
    // Border (width/style)
    if (/^border(?:-(?:[0248]|x|y|t|r|b|l|solid|dashed|dotted))?$/.test(c)) {
      border.push(c)
      continue
    }
  }

  return {
    colors: uniq(colors),
    spacing: uniq(spacing),
    typography: uniq(typography),
    radius: uniq(radius),
    shadow: uniq(shadow),
    border: uniq(border),
  }
}

function extractAnatomy(code: string): DesignerMeta['anatomy'] {
  // Lucide icons — imported from 'lucide-react'.
  const icons: string[] = []
  const lucideMatch = code.match(/from\\s+['"]lucide-react['"]/m)
  if (lucideMatch) {
    const importBlock = code.match(/import\\s*\\{([^}]+)\\}\\s*from\\s+['"]lucide-react['"]/m)
    if (importBlock) {
      for (const ident of importBlock[1].split(',')) {
        const name = ident.trim().split(/\\s+as\\s+/)[0].trim()
        if (name && /^[A-Z]/.test(name)) icons.push(name)
      }
    }
  }

  const buttons = (code.match(/<(?:button|Button)\\b/g) || []).length
  const links = (code.match(/<(?:a|Link)\\b/g) || []).length
  const images = (code.match(/<(?:img|Image)\\b/g) || []).length

  // Top-level structural HTML5 elements
  const structuralTags = ['nav', 'header', 'footer', 'main', 'aside', 'section', 'article', 'form']
  const structural: string[] = []
  for (const tag of structuralTags) {
    const re = new RegExp(\`<\${tag}\\\\b\`, 'g')
    if (re.test(code)) structural.push(tag)
  }

  return { icons: uniq(icons), buttons, links, images, structural }
}

function extractStates(code: string): string[] {
  const states: string[] = []
  for (const m of code.matchAll(/const\\s+\\[(\\w+)\\s*,\\s*set\\w+\\]\\s*=\\s*useState/g)) {
    states.push(m[1])
  }
  return uniq(states)
}

function extractMeta(code: string): DesignerMeta {
  return {
    tokens: extractTokens(code),
    anatomy: extractAnatomy(code),
    states: extractStates(code),
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
