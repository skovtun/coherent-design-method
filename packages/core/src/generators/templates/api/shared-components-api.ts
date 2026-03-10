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
 * Returns one shared component entry + its source code.
 */
export const SHARED_COMPONENT_DETAIL_API = `import { NextResponse } from 'next/server'
import { readFile } from 'fs/promises'
import { join } from 'path'

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
    return NextResponse.json({ entry, code })
  } catch (e) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
}
`
