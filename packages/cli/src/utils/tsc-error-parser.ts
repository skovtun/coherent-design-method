export interface TscError {
  file: string
  line: number
  col: number
  code: string
  message: string
  relatedFiles: string[]
}

const ERROR_RE = /^(.+?)\((\d+),(\d+)\): error (TS\d+): (.+)$/

/** Indented location line without `error TSxxxx` (e.g. "'foo' is declared here."). */
const RELATED_LOCATION_RE = /^(.+?)\((\d+),(\d+)\):\s/

export function parseTscOutput(output: string): TscError[] {
  const lines = output.split('\n')
  const errors: TscError[] = []
  const seen = new Set<string>()
  let current: TscError | null = null

  for (const raw of lines) {
    const trimmed = raw.trimStart()
    const match = trimmed.match(ERROR_RE)

    if (match) {
      const [, file, lineStr, colStr, code, msg] = match
      const isRelated = raw.startsWith('  ')

      if (isRelated && current) {
        const cleanFile = file.trim()
        if (!current.relatedFiles.includes(cleanFile)) {
          current.relatedFiles.push(cleanFile)
        }
      } else {
        flushCurrent()
        current = {
          file: file.trim(),
          line: parseInt(lineStr, 10),
          col: parseInt(colStr, 10),
          code,
          message: msg,
          relatedFiles: [],
        }
      }
    } else if (current && raw.startsWith('  ') && raw.trim().length > 0) {
      const locMatch = trimmed.match(RELATED_LOCATION_RE)
      if (locMatch) {
        const cleanFile = locMatch[1].trim()
        if (!current.relatedFiles.includes(cleanFile)) {
          current.relatedFiles.push(cleanFile)
        }
      } else {
        current.message += '\n' + raw.trim()
      }
    }
  }

  flushCurrent()
  return errors

  function flushCurrent() {
    if (!current) return
    const key = `${current.file}:${current.line}:${current.code}`
    if (!seen.has(key)) {
      seen.add(key)
      errors.push(current)
    }
    current = null
  }
}
