import { readFileSync } from 'fs'
import { resolve } from 'path'
import type { TscError } from './tsc-error-parser.js'
import type { AIProviderInterface } from './ai-provider.js'
import { safeWrite } from '../commands/fix-validation.js'
import { runTscCheck } from './tsc-autofix.js'

const MAX_AI_FILES = 5

export interface TscAiFixResult {
  fixed: string[]
  failed: TscError[]
}

export async function applyAiFixes(
  errors: TscError[],
  projectRoot: string,
  backups: Map<string, string>,
  aiProvider?: AIProviderInterface,
): Promise<TscAiFixResult> {
  if (!aiProvider?.editPageCode) {
    return { fixed: [], failed: errors }
  }

  const fileErrors = new Map<string, TscError[]>()
  for (const err of errors) {
    const list = fileErrors.get(err.file) || []
    list.push(err)
    fileErrors.set(err.file, list)
  }

  const fixed: string[] = []
  const failed: TscError[] = []
  let filesProcessed = 0

  for (const [file, errs] of fileErrors) {
    filesProcessed++
    if (filesProcessed > MAX_AI_FILES) {
      failed.push(...errs)
      continue
    }

    const absPath = resolve(projectRoot, file)
    let code: string
    try {
      code = readFileSync(absPath, 'utf-8')
    } catch {
      failed.push(...errs)
      continue
    }

    const relatedContext = gatherRelatedContext(errs, projectRoot)
    const errorList = errs.map(e => `Line ${e.line}: [${e.code}] ${e.message}`).join('\n')

    const instruction = [
      'Fix these TypeScript compilation errors:',
      errorList,
      '',
      relatedContext ? `Reference interfaces (DO NOT modify these):\n${relatedContext}` : '',
      '',
      'Rules:',
      '- Fix the data/props to match the expected types',
      '- Do NOT change component interfaces or imports from shared components',
      '- Keep all existing functionality intact',
    ]
      .filter(Boolean)
      .join('\n')

    try {
      const fixedCode = await aiProvider.editPageCode(code, instruction, file)
      if (!fixedCode || fixedCode.length < 50) {
        failed.push(...errs)
        continue
      }

      const { ok } = safeWrite(absPath, fixedCode, projectRoot, backups)
      if (!ok) {
        failed.push(...errs)
        continue
      }

      const afterErrors = runTscCheck(projectRoot).filter(e => e.file === file)
      if (afterErrors.length >= errs.length) {
        const original = backups.get(absPath)
        if (original) safeWrite(absPath, original, projectRoot, backups)
        failed.push(...errs)
      } else {
        fixed.push(file)
        if (afterErrors.length > 0) failed.push(...afterErrors)
      }
    } catch {
      failed.push(...errs)
    }
  }

  return { fixed, failed }
}

function gatherRelatedContext(errors: TscError[], projectRoot: string): string {
  const relatedFiles = new Set<string>()
  for (const err of errors) {
    for (const f of err.relatedFiles) relatedFiles.add(f)
  }

  const parts: string[] = []
  for (const file of relatedFiles) {
    try {
      const content = readFileSync(resolve(projectRoot, file), 'utf-8')
      parts.push(`// --- ${file} ---\n${content}`)
    } catch {
      /* skip unreadable files */
    }
  }
  return parts.join('\n\n')
}
