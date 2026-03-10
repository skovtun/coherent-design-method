/**
 * API route: GET /api/design-system/changes
 * Returns recent changes log from .coherent/recent-changes.json
 */
export const DESIGN_SYSTEM_CHANGES_API = `import { NextResponse } from 'next/server'
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'

export async function GET() {
  try {
    const path = join(process.cwd(), '.coherent', 'recent-changes.json')
    if (!existsSync(path)) {
      return NextResponse.json([])
    }
    const data = JSON.parse(readFileSync(path, 'utf-8'))
    return NextResponse.json(Array.isArray(data) ? data : [])
  } catch {
    return NextResponse.json([])
  }
}
`
