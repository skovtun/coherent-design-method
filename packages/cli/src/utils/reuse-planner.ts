import type { SharedComponentsManifest } from '@getcoherent/core'

export interface ReusePlanEntry {
  component: string
  targetSection: string
  reason: string
  importPath: string
  usageExample: string
}

export interface NewComponentEntry {
  name: string
  reason: string
  suggestedType: string
}

export interface PatternEntry {
  pattern: string
  sourcePages: string[]
  targetSection: string
}

export interface ReusePlan {
  pageName: string
  reuse: ReusePlanEntry[]
  createNew: NewComponentEntry[]
  reusePatterns: PatternEntry[]
}

export interface BuildReusePlanInput {
  pageName: string
  pageType: 'marketing' | 'app' | 'auth'
  sections: string[]
  manifest: SharedComponentsManifest
  existingPageCode: Record<string, string>
  userRequest: string
}

const SECTION_TYPE_MAP: Record<string, string[]> = {
  stats: ['data-display', 'widget'],
  metrics: ['data-display', 'widget'],
  kpi: ['data-display', 'widget'],
  list: ['data-display'],
  table: ['data-display'],
  items: ['data-display'],
  form: ['form'],
  filter: ['form'],
  search: ['form'],
  nav: ['navigation'],
  menu: ['navigation'],
  tabs: ['navigation'],
  card: ['widget', 'data-display'],
  grid: ['widget', 'data-display'],
  chart: ['data-display'],
  graph: ['data-display'],
  alert: ['feedback'],
  toast: ['feedback'],
  banner: ['feedback'],
}

function sectionToComponentTypes(section: string): string[] {
  const lower = section.toLowerCase()
  const types = new Set<string>()
  for (const [keyword, componentTypes] of Object.entries(SECTION_TYPE_MAP)) {
    if (lower.includes(keyword)) {
      componentTypes.forEach(t => types.add(t))
    }
  }
  return [...types]
}

function componentFilenameToImportPath(file: string): string {
  const withoutExt = file.replace(/\.tsx?$/, '')
  return `@/${withoutExt}`
}

export function buildReusePlan(input: BuildReusePlanInput): ReusePlan {
  const { pageName, sections, manifest } = input
  const reuse: ReusePlanEntry[] = []
  const usedComponents = new Set<string>()

  for (const section of sections) {
    const matchingTypes = sectionToComponentTypes(section)
    if (matchingTypes.length === 0) continue

    for (const entry of manifest.shared) {
      if (usedComponents.has(entry.id)) continue
      if (!matchingTypes.includes(entry.type)) continue

      reuse.push({
        component: entry.name,
        targetSection: section,
        reason:
          entry.usedIn.length > 0
            ? `Used on ${entry.usedIn.length} page(s)`
            : `Matches section type (${entry.type})`,
        importPath: componentFilenameToImportPath(entry.file),
        usageExample: entry.usageExample || `<${entry.name} />`,
      })
      usedComponents.add(entry.id)
      break
    }
  }

  const reusePatterns = extractCodePatterns(input.existingPageCode, sections)

  return { pageName, reuse, createNew: [], reusePatterns }
}

function extractCodePatterns(
  existingPageCode: Record<string, string>,
  _sections: string[],
): PatternEntry[] {
  const patterns: PatternEntry[] = []
  const gridPatterns = new Map<string, string[]>()

  for (const [route, code] of Object.entries(existingPageCode)) {
    const gridMatches = code.match(/className="[^"]*grid[^"]*"/g) || []
    for (const match of gridMatches) {
      const cls = match.replace(/className="|"/g, '')
      if (!gridPatterns.has(cls)) gridPatterns.set(cls, [])
      gridPatterns.get(cls)!.push(route)
    }
  }

  for (const [pattern, pages] of gridPatterns) {
    if (pages.length >= 1 && pattern.includes('grid-cols')) {
      patterns.push({
        pattern,
        sourcePages: pages,
        targetSection: 'Layout grid',
      })
    }
  }

  return patterns
}

export function buildReusePlanDirective(plan: ReusePlan): string {
  if (plan.reuse.length === 0 && plan.createNew.length === 0 && plan.reusePatterns.length === 0) {
    return ''
  }

  const lines: string[] = [`COMPONENT REUSE PLAN FOR THIS PAGE:`]

  if (plan.reuse.length > 0) {
    lines.push('', 'MUST USE (import these — do NOT re-implement):')
    for (const r of plan.reuse) {
      lines.push(`  - ${r.component} from ${r.importPath} — for "${r.targetSection}" section`)
      if (r.usageExample) {
        lines.push(`    Example: ${r.usageExample}`)
      }
    }
  }

  if (plan.createNew.length > 0) {
    lines.push('', 'CREATE NEW (no existing match):')
    for (const c of plan.createNew) {
      lines.push(`  - ${c.name} — ${c.reason} (suggest type: ${c.suggestedType})`)
    }
  }

  if (plan.reusePatterns.length > 0) {
    lines.push('', 'LAYOUT PATTERNS (copy from existing pages for visual consistency):')
    for (const p of plan.reusePatterns) {
      lines.push(`  - ${p.targetSection}: className="${p.pattern}"`)
      lines.push(`    (source: ${p.sourcePages.join(', ')})`)
    }
  }

  return lines.join('\n')
}

export interface VerificationResult {
  passed: ReusePlanEntry[]
  missed: ReusePlanEntry[]
  retryDirective?: string
}

export function verifyReusePlan(generatedCode: string, plan: ReusePlan): VerificationResult {
  const passed: ReusePlanEntry[] = []
  const missed: ReusePlanEntry[] = []

  for (const entry of plan.reuse) {
    const isImported =
      generatedCode.includes(entry.importPath) ||
      generatedCode.includes(`{ ${entry.component} }`) ||
      generatedCode.includes(`{ ${entry.component},`)

    if (isImported) {
      passed.push(entry)
    } else {
      missed.push(entry)
    }
  }

  let retryDirective: string | undefined
  if (missed.length > 0) {
    const lines = missed.map(
      m =>
        `CRITICAL: Your previous output failed to import ${m.component} from ${m.importPath}. You MUST import and use this component for the "${m.targetSection}" section. Do NOT re-implement it inline.`,
    )
    retryDirective = lines.join('\n')
  }

  return { passed, missed, retryDirective }
}
