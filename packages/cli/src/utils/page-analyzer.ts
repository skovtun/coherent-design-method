/**
 * Page Analyzer
 *
 * Extracts structured metadata from generated page code using regex/string analysis.
 * No AI calls, no AST parser — pure string matching, ~1ms per page.
 */

import type { PageAnalysis } from '@coherent/core'

const FORM_COMPONENTS = new Set(['Input', 'Textarea', 'Label', 'Select', 'Checkbox', 'Switch'])

const VISUAL_WORDS = /\b(grid lines?|glow|radial|gradient|blur|shadow|overlay|animation|particles?|dots?|vertical|horizontal|decorat|behind|background|divider|spacer|wrapper|container|inner|outer|absolute|relative|translate|opacity|z-index|transition)\b/i

/**
 * Analyze generated page code and return structured metadata.
 */
export function analyzePageCode(code: string): NonNullable<PageAnalysis> {
  return {
    sections: extractSections(code),
    componentUsage: extractComponentUsage(code),
    iconCount: extractIconCount(code),
    layoutPattern: inferLayoutPattern(code),
    hasForm: detectFormUsage(code),
    analyzedAt: new Date().toISOString(),
  }
}

function extractSections(code: string): Array<{ name: string; order: number }> {
  const sections: Array<{ name: string; order: number }> = []
  const seen = new Set<string>()

  // Only pick up JSX comments that look like section labels:
  // {/* Hero Section */}, {/* Footer */}, {/* About */}, etc.
  // Skip decorative/implementation comments like {/* Full-page vertical grid lines */}
  const commentRe = /\{\/\*\s*(.+?)\s*\*\/\}/g
  let m
  while ((m = commentRe.exec(code)) !== null) {
    const raw = m[1].trim()
    const name = raw
      .replace(/[─━—–]+/g, '')  // strip decorative dashes (em-dash, horizontal lines)
      .replace(/\s*section\s*$/i, '')
      .replace(/^section\s*:\s*/i, '')
      .trim()
    if (!name || name.length <= 1 || name.length >= 40) continue
    if (seen.has(name.toLowerCase())) continue
    const wordCount = name.split(/\s+/).length
    if (wordCount > 5) continue
    if (/[{}()=<>;:`"']/.test(name)) continue
    if (/^[a-z]/.test(name) && wordCount > 2) continue
    if (VISUAL_WORDS.test(name)) continue
    seen.add(name.toLowerCase())
    sections.push({ name, order: sections.length })
  }

  if (sections.length === 0) {
    const sectionTagRe = /<section[^>]*>[\s\S]*?<h[12][^>]*>\s*([^<]+)/g
    while ((m = sectionTagRe.exec(code)) !== null) {
      const name = m[1].trim()
      if (name && name.length > 1 && name.length < 40 && !seen.has(name.toLowerCase())) {
        seen.add(name.toLowerCase())
        sections.push({ name, order: sections.length })
      }
    }
  }

  return sections
}

function extractComponentUsage(code: string): Record<string, number> {
  const usage: Record<string, number> = {}
  const importRe = /import\s*\{([^}]+)\}\s*from\s*['"]@\/components\/ui\/[^'"]+['"]/g
  const importedComponents: string[] = []

  let m
  while ((m = importRe.exec(code)) !== null) {
    const names = m[1].split(',').map(s => s.trim()).filter(Boolean)
    importedComponents.push(...names)
  }

  for (const comp of importedComponents) {
    const re = new RegExp(`<${comp}[\\s/>]`, 'g')
    const matches = code.match(re)
    usage[comp] = matches ? matches.length : 0
  }

  return usage
}

function extractIconCount(code: string): number {
  const m = code.match(/import\s*\{([^}]+)\}\s*from\s*['"]lucide-react['"]/)
  if (!m) return 0
  return m[1].split(',').map(s => s.trim()).filter(Boolean).length
}

function inferLayoutPattern(code: string): string {
  const funcBodyMatch = code.match(/return\s*\(\s*(<[^]*)/s)
  const topLevel = funcBodyMatch ? funcBodyMatch[1].slice(0, 500) : code.slice(0, 800)

  if (/grid-cols|grid\s+md:grid-cols|grid\s+lg:grid-cols/.test(topLevel)) return 'grid'
  if (/sidebar|aside/.test(topLevel)) return 'sidebar'
  if (/max-w-\d|mx-auto|container/.test(topLevel)) return 'centered'
  if (/min-h-screen|min-h-svh/.test(topLevel)) return 'full-width'
  return 'unknown'
}

function detectFormUsage(code: string): boolean {
  const importRe = /import\s*\{([^}]+)\}\s*from\s*['"]@\/components\/ui\/[^'"]+['"]/g
  let m
  while ((m = importRe.exec(code)) !== null) {
    const names = m[1].split(',').map(s => s.trim())
    if (names.some(n => FORM_COMPONENTS.has(n))) return true
  }
  return false
}

/**
 * Build a concise one-line summary of page analysis for AI prompts.
 */
export function summarizePageAnalysis(
  pageName: string,
  route: string,
  analysis: NonNullable<PageAnalysis>
): string {
  const parts: string[] = [`${pageName} (${route})`]

  if (analysis.sections && analysis.sections.length > 0) {
    parts.push(`sections: ${analysis.sections.map(s => s.name).join(', ')}`)
  }

  if (analysis.componentUsage) {
    const entries = Object.entries(analysis.componentUsage).filter(([, c]) => c > 0)
    if (entries.length > 0) {
      parts.push(`uses: ${entries.map(([n, c]) => `${n}(${c})`).join(', ')}`)
    }
  }

  if (analysis.layoutPattern && analysis.layoutPattern !== 'unknown') {
    parts.push(`layout: ${analysis.layoutPattern}`)
  }

  if (analysis.hasForm) parts.push('has-form')

  return `- ${parts.join('. ')}`
}
