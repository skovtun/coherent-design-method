/**
 * Design Memory — persistent wiki of design decisions
 *
 * Stored at `.coherent/wiki/decisions.md` inside the generated project.
 * Karpathy-style LLM wiki pattern: append-only facts that compound across
 * `coherent chat` invocations so pages generated in separate sessions stay
 * visually coherent without re-deriving decisions from scratch each time.
 *
 * Design:
 *   - Deterministic extraction (no extra AI calls) from generated page code.
 *   - Date-sectioned markdown, grouped by page name.
 *   - Truncated to last N date sections to cap token cost.
 *   - Fed into page-generation prompts as "DESIGN MEMORY" context so future
 *     pages adopt the same container widths, spacing rhythm, palette, etc.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { dirname, resolve } from 'path'

const MEMORY_REL_PATH = '.coherent/wiki/decisions.md'
const DEFAULT_MAX_SECTIONS = 10
const DEFAULT_PROMPT_MAX_LINES = 80

function resolveMemoryPath(projectRoot: string): string {
  return resolve(projectRoot, MEMORY_REL_PATH)
}

function today(): string {
  const d = new Date()
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function readDesignMemory(projectRoot: string): string {
  const path = resolveMemoryPath(projectRoot)
  if (!existsSync(path)) return ''
  try {
    return readFileSync(path, 'utf-8')
  } catch {
    return ''
  }
}

function unique(arr: string[]): string[] {
  return [...new Set(arr)]
}

/**
 * Deterministically pull stable, high-signal design facts out of a page's TSX.
 * Mirrors `extractStyleContext` regexes but emits one fact per line for the
 * persistent log rather than a merged single-line summary.
 */
export function extractDecisionsFromCode(pageCode: string): string[] {
  const decisions: string[] = []

  const containers = unique(pageCode.match(/max-w-\d+xl\s+mx-auto|container\s+max-w-\S+/g) || [])
  if (containers.length > 0) decisions.push(`Container: ${containers[0]}`)

  const spacing = unique(pageCode.match(/py-\d+(?:\s+md:py-\d+)?/g) || [])
  if (spacing.length > 0) decisions.push(`Section spacing: ${spacing.slice(0, 4).join(', ')}`)

  const headings = unique(pageCode.match(/text-(?:\d*xl|lg)\s+font-(?:bold|semibold|medium)/g) || [])
  if (headings.length > 0) decisions.push(`Typography: ${headings.slice(0, 4).join(', ')}`)

  const semanticColors = unique(
    pageCode.match(
      /(?:text|bg|border|ring)-(?:primary|secondary|muted|accent|card|destructive|foreground|background|border|input|ring)[\w/-]*/g,
    ) || [],
  )
  if (semanticColors.length > 0) decisions.push(`Palette: ${semanticColors.slice(0, 10).join(', ')}`)

  const grids = unique(pageCode.match(/grid-cols-\d+(?:\s+(?:md|lg):grid-cols-\d+)*/g) || [])
  if (grids.length > 0) decisions.push(`Grids: ${grids.slice(0, 4).join(', ')}`)

  const gaps = unique(pageCode.match(/\bgap-\d+\b/g) || [])
  if (gaps.length > 0) decisions.push(`Gaps: ${gaps.slice(0, 4).join(', ')}`)

  const sharedImports = unique(
    (pageCode.match(/import\s+\{[^}]+\}\s+from\s+['"]@\/components\/shared\/[^'"]+['"]/g) || []).flatMap(line => {
      const m = line.match(/\{([^}]+)\}/)
      if (!m) return []
      return m[1]
        .split(',')
        .map(s => s.trim())
        .filter(Boolean)
    }),
  )
  if (sharedImports.length > 0) decisions.push(`Shared imports: ${sharedImports.join(', ')}`)

  return decisions
}

/**
 * Append decisions for a page under today's date heading. Creates the file
 * and `.coherent/wiki/` directory as needed. Idempotent per (date, pageName):
 * if the same page appears twice today, its block is replaced, not duplicated.
 */
export function appendDecisions(projectRoot: string, pageName: string, route: string, decisions: string[]): void {
  if (decisions.length === 0) return
  const path = resolveMemoryPath(projectRoot)
  mkdirSync(dirname(path), { recursive: true })

  const current = readDesignMemory(projectRoot)
  const date = today()
  const pageBlock = formatPageBlock(pageName, route, decisions)

  const updated = upsertPageBlock(current, date, pageName, pageBlock)
  writeFileSync(path, updated, 'utf-8')
}

function formatPageBlock(pageName: string, route: string, decisions: string[]): string {
  const header = `### ${pageName} (${route})`
  const bullets = decisions.map(d => `- ${d}`).join('\n')
  return `${header}\n${bullets}`
}

/**
 * Insert or replace a page block inside the given date section, preserving
 * other content. Creates the section if missing. Keeps file well-formed.
 */
export function upsertPageBlock(existing: string, date: string, pageName: string, pageBlock: string): string {
  const header =
    '# Design Decisions\n\n_Auto-maintained by Coherent. Each entry is a fact extracted from generated code._\n'
  let body = existing.startsWith('# Design Decisions') ? existing : `${header}\n`
  if (!body.endsWith('\n')) body += '\n'

  const dateHeading = `## ${date}`
  const sectionRegex = new RegExp(`(^|\\n)${escapeRegex(dateHeading)}\\n([\\s\\S]*?)(?=\\n## \\d{4}-\\d{2}-\\d{2}|$)`)
  const match = body.match(sectionRegex)

  if (!match) {
    const sep = body.endsWith('\n\n') ? '' : '\n'
    return `${body}${sep}${dateHeading}\n\n${pageBlock}\n`
  }

  const sectionBody = match[2]
  const pageHeading = `### ${pageName} (`
  const pageRegex = new RegExp(`### ${escapeRegex(pageName)} \\([^)]*\\)\\n(?:- .*\\n?)+`)
  let newSectionBody: string
  if (pageRegex.test(sectionBody)) {
    newSectionBody = sectionBody.replace(pageRegex, pageBlock.endsWith('\n') ? pageBlock : pageBlock + '\n')
  } else {
    const trimmed = sectionBody.replace(/\n+$/, '')
    newSectionBody = trimmed ? `${trimmed}\n\n${pageBlock}\n` : `\n${pageBlock}\n`
  }

  return body.replace(sectionRegex, (_, pre) => `${pre}${dateHeading}\n${newSectionBody}`).replace(/\n{3,}/g, '\n\n')
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Keep only the most recent N date sections. Older sections are dropped to
 * cap memory growth (and token cost when injected into prompts).
 */
export function truncateMemory(projectRoot: string, maxSections = DEFAULT_MAX_SECTIONS): void {
  const path = resolveMemoryPath(projectRoot)
  if (!existsSync(path)) return
  const current = readDesignMemory(projectRoot)
  const trimmed = trimSections(current, maxSections)
  if (trimmed !== current) writeFileSync(path, trimmed, 'utf-8')
}

export function trimSections(content: string, maxSections: number): string {
  const parts = content.split(/(?=^## \d{4}-\d{2}-\d{2}$)/m)
  const header = parts[0].startsWith('## ') ? '' : parts.shift() || ''
  if (parts.length <= maxSections) return content
  const kept = parts.slice(-maxSections).join('')
  return `${header}${kept}`.replace(/\n{3,}/g, '\n\n')
}

/**
 * Format memory as a prompt block for injection into page-generation calls.
 * Returns '' when empty so callers can drop the section entirely.
 */
export function formatMemoryForPrompt(memory: string, maxLines = DEFAULT_PROMPT_MAX_LINES): string {
  if (!memory.trim()) return ''
  const lines = memory.split('\n')
  const body = lines.length > maxLines ? ['...(older entries trimmed)...', ...lines.slice(-maxLines)] : lines
  return [
    'DESIGN MEMORY (decisions from previously generated pages in this project — match these to stay coherent):',
    body.join('\n').trim(),
    'Maintain the same container width, section-spacing rhythm, palette, and shared-component imports unless the page type genuinely differs. Do not introduce a new accent color or spacing scale without reason.',
  ].join('\n\n')
}
