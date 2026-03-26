export interface MockDataIssue {
  line: number
  column: number
  message: string
  fixable: boolean
  replacement?: { start: number; end: number; text: string }
}

function generateRecentIsoDate(offsetHours: number = 0): string {
  const d = new Date()
  d.setHours(d.getHours() - offsetHours)
  return d.toISOString()
}

function getLineAndCol(code: string, index: number): { line: number; column: number } {
  const lines = code.slice(0, index).split('\n')
  return { line: lines.length, column: (lines[lines.length - 1]?.length ?? 0) + 1 }
}

export function validateMockData(code: string): MockDataIssue[] {
  const issues: MockDataIssue[] = []
  let offset = 0

  const dateCtorRe = /new Date\(["']([^"']+)["']\)/g
  let m: RegExpExecArray | null
  while ((m = dateCtorRe.exec(code)) !== null) {
    const dateStr = m[1]
    if (isNaN(new Date(dateStr).getTime())) {
      const { line, column } = getLineAndCol(code, m.index)
      const valueStart = m.index + m[0].indexOf(dateStr)
      const valueEnd = valueStart + dateStr.length
      issues.push({
        line,
        column,
        message: `Invalid Date: new Date("${dateStr}") will throw at runtime`,
        fixable: true,
        replacement: {
          start: valueStart,
          end: valueEnd,
          text: generateRecentIsoDate(offset++),
        },
      })
    }
  }

  const mockFieldRe =
    /(?:timestamp|date|createdAt|updatedAt|time|startDate|endDate|dueDate)\s*:\s*["']((?:\d+\s+(?:hours?|minutes?|days?|weeks?|months?|years?)\s+ago)|yesterday|today|last\s+\w+|just\s+now|recently)["']/gi
  while ((m = mockFieldRe.exec(code)) !== null) {
    const dateStr = m[1]
    const { line, column } = getLineAndCol(code, m.index)
    const fullMatch = m[0]
    const valueStart = m.index + fullMatch.indexOf(dateStr)
    const valueEnd = valueStart + dateStr.length
    issues.push({
      line,
      column,
      message: `Mock data "${dateStr}" is a display string, not a valid Date — use ISO 8601`,
      fixable: true,
      replacement: {
        start: valueStart,
        end: valueEnd,
        text: generateRecentIsoDate(offset++),
      },
    })
  }

  return issues
}

export function applyMockDataFixes(code: string, issues: MockDataIssue[]): string {
  const fixable = issues
    .filter(i => i.fixable && i.replacement)
    .sort((a, b) => b.replacement!.start - a.replacement!.start)
  let result = code
  for (const issue of fixable) {
    const r = issue.replacement!
    result = result.slice(0, r.start) + r.text + result.slice(r.end)
  }
  return result
}
