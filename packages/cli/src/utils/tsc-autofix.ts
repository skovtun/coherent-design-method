import { existsSync, readFileSync } from 'fs'
import { execSync } from 'child_process'
import { resolve } from 'path'
import type { TscError } from './tsc-error-parser.js'
import { parseTscOutput } from './tsc-error-parser.js'
import { safeWrite } from '../commands/fix-validation.js'

export interface TscFixResult {
  fixed: string[]
  remaining: TscError[]
}

export function runTscCheck(projectRoot: string, timeout = 30000): TscError[] {
  const tsconfigPath = resolve(projectRoot, 'tsconfig.json')
  if (!existsSync(tsconfigPath)) return []
  try {
    execSync('npx tsc --noEmit 2>&1', {
      cwd: projectRoot,
      timeout,
      encoding: 'utf-8',
    })
    return []
  } catch (err: unknown) {
    if (err && typeof err === 'object' && 'killed' in err && (err as { killed: boolean }).killed) {
      console.log('  ⚠ TypeScript check timed out — skipping')
      return []
    }
    const e = err as { stdout?: string; stderr?: string }
    const output = (e.stdout || '') + (e.stderr || '')
    return parseTscOutput(output)
  }
}

function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)),
  )
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1])
  return dp[m][n]
}

function maxLevenshtein(fieldName: string): number {
  return Math.max(1, Math.floor(fieldName.length * 0.4))
}

const MISSING_PROP_RE = /Property '(\w+)' is missing in type '\{([^}]*)\}'/
const UNION_RE = /Type 'string' is not assignable to type '((?:"[^"]+"\s*\|\s*)*"[^"]+")'/ 
const MISSING_REQUIRED_RE = /Property '(\w+)' is missing in type .* but required/

function extractFieldsFromCode(code: string, line: number): string[] {
  const lines = code.split('\n')
  const searchRange = lines.slice(Math.max(0, line - 3), line + 3).join(' ')
  const fieldMatches = searchRange.match(/(\w+)\s*:/g)
  if (!fieldMatches) return []
  return fieldMatches.map(m => m.replace(/\s*:$/, ''))
}

export function fixFieldRename(
  code: string,
  error: TscError,
  errorLine?: number,
): { code: string; field: string } | null {
  const match = error.message.match(MISSING_PROP_RE)
  const expectedField = match?.[1] ?? error.message.match(/Property '(\w+)' is missing/)?.[1]
  if (!expectedField) return null

  let typeFields: string[]
  if (match?.[2]) {
    typeFields = match[2]
      .split(';')
      .map(f => f.trim().split(':')[0]?.trim())
      .filter(Boolean)
  } else {
    typeFields = extractFieldsFromCode(code, errorLine ?? error.line)
  }

  let bestMatch: string | null = null
  let bestDist = Infinity

  for (const field of typeFields) {
    if (field === expectedField) continue
    if (field.includes(expectedField) || expectedField.includes(field)) {
      bestMatch = field
      bestDist = 0
      break
    }
    const dist = levenshtein(field.toLowerCase(), expectedField.toLowerCase())
    if (dist <= maxLevenshtein(expectedField) && dist < bestDist) {
      bestDist = dist
      bestMatch = field
    }
  }

  if (!bestMatch) return null

  const targetLine = errorLine ?? error.line
  const lines = code.split('\n')
  const targetIdx = targetLine - 1
  const windowStart = Math.max(0, targetIdx)
  const windowEnd = Math.min(lines.length, targetIdx + 1)

  const fieldRe = new RegExp(`(\\b)${bestMatch}(\\s*:)`, 'g')
  for (let i = windowStart; i < windowEnd; i++) {
    if (fieldRe.test(lines[i])) {
      lines[i] = lines[i].replace(fieldRe, `$1${expectedField}$2`)
    }
    fieldRe.lastIndex = 0
  }

  const newCode = lines.join('\n')
  if (newCode === code) return null
  return { code: newCode, field: `${bestMatch} → ${expectedField}` }
}

export function fixUnionType(code: string, error: TscError): { code: string; fix: string } | null {
  const match = error.message.match(UNION_RE)
  if (!match) return null

  const variants = match[1].match(/"([^"]+)"/g)?.map(v => v.replace(/"/g, ''))
  if (!variants || variants.length === 0) return null

  const lines = code.split('\n')
  const errorLine = lines[error.line - 1]
  if (!errorLine) return null

  for (const variant of variants) {
    const caseInsensitiveRe = new RegExp(`['"]${variant}['"]`, 'i')
    const exactRe = new RegExp(`['"]${variant}['"]`)
    if (caseInsensitiveRe.test(errorLine) && !exactRe.test(errorLine)) {
      lines[error.line - 1] = errorLine.replace(caseInsensitiveRe, `'${variant}'`)
      return { code: lines.join('\n'), fix: `union case: '${variant}'` }
    }
  }

  return null
}

export function fixMissingEventHandler(code: string, error: TscError): { code: string; prop: string } | null {
  const match = error.message.match(MISSING_REQUIRED_RE)
  if (!match) return null

  const propName = match[1]
  if (!propName.startsWith('on') || propName.length < 3) return null
  if (propName[2] !== propName[2].toUpperCase()) return null

  const lines = code.split('\n')
  const errorLine = lines[error.line - 1]
  if (!errorLine) return null

  const closingMatch = errorLine.match(/(\s*\/?>)/)
  if (!closingMatch) return null

  const insertPos = errorLine.lastIndexOf(closingMatch[1])
  lines[error.line - 1] =
    errorLine.slice(0, insertPos) +
    ` ${propName}={() => {}}` +
    errorLine.slice(insertPos)

  return { code: lines.join('\n'), prop: propName }
}

function deduplicateErrors(errors: TscError[]): TscError[] {
  const seen = new Set<string>()
  return errors.filter(e => {
    const key = `${e.file}:${e.line}:${e.code}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

export async function applyDeterministicFixes(
  errors: TscError[],
  projectRoot: string,
  backups: Map<string, string>,
): Promise<TscFixResult> {
  const deduped = deduplicateErrors(errors)
  const fixed: string[] = []
  const remaining: TscError[] = []
  const fileErrors = new Map<string, TscError[]>()

  for (const err of deduped) {
    const list = fileErrors.get(err.file) || []
    list.push(err)
    fileErrors.set(err.file, list)
  }

  for (const [file, errs] of fileErrors) {
    const absPath = resolve(projectRoot, file)
    let code: string
    try {
      code = readFileSync(absPath, 'utf-8')
    } catch {
      remaining.push(...errs)
      continue
    }

    let changed = false

    for (const err of errs) {
      const renameResult = fixFieldRename(code, err, err.line)
      if (renameResult) {
        code = renameResult.code
        changed = true
        continue
      }

      const unionResult = fixUnionType(code, err)
      if (unionResult) {
        code = unionResult.code
        changed = true
        continue
      }

      const handlerResult = fixMissingEventHandler(code, err)
      if (handlerResult) {
        code = handlerResult.code
        changed = true
        continue
      }

      remaining.push(err)
    }

    if (changed) {
      const { ok } = safeWrite(absPath, code, projectRoot, backups)
      if (ok) {
        fixed.push(file)
      } else {
        remaining.push(...errs)
      }
    }
  }

  return { fixed, remaining }
}
