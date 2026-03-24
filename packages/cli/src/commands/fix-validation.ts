import { createRequire } from 'module'
import { existsSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'

let cachedTs: typeof import('typescript') | null = null
let cachedProjectRoot: string | null = null

export function isValidTsx(code: string, projectRoot: string, ext: string = '.tsx'): boolean {
  if (ext !== '.tsx' && ext !== '.ts') return true
  const pkgJson = join(projectRoot, 'package.json')
  if (!existsSync(pkgJson)) return true
  try {
    if (!cachedTs || cachedProjectRoot !== projectRoot) {
      const req = createRequire(pkgJson)
      cachedTs = req('typescript') as typeof import('typescript')
      cachedProjectRoot = projectRoot
    }
    const sf = cachedTs.createSourceFile(
      'check.tsx',
      code,
      cachedTs.ScriptTarget.Latest,
      false,
      cachedTs.ScriptKind.TSX,
    )
    const diagnostics = (sf as import('typescript').SourceFile & { parseDiagnostics?: import('typescript').Diagnostic[] })
      .parseDiagnostics
    return !diagnostics || diagnostics.length === 0
  } catch {
    return true
  }
}

export function safeWrite(
  filePath: string,
  newContent: string,
  projectRoot: string,
  backups: Map<string, string>,
): { ok: boolean } {
  if (!backups.has(filePath)) {
    try {
      backups.set(filePath, readFileSync(filePath, 'utf-8'))
    } catch {
      /* new file */
    }
  }
  const ext = filePath.slice(filePath.lastIndexOf('.'))
  writeFileSync(filePath, newContent, 'utf-8')
  if (!isValidTsx(newContent, projectRoot, ext)) {
    const original = backups.get(filePath)
    if (original) writeFileSync(filePath, original, 'utf-8')
    return { ok: false }
  }
  return { ok: true }
}
