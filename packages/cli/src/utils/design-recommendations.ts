import { existsSync, readFileSync, readdirSync, statSync } from 'fs'
import { resolve } from 'path'

interface Recommendation {
  category: string
  severity: 'critical' | 'important' | 'suggestion'
  title: string
  detail: string
  fix?: string
}

function findPageFiles(dir: string): string[] {
  const results: string[] = []
  try {
    for (const entry of readdirSync(dir)) {
      if (entry.startsWith('.') || entry === 'node_modules' || entry === 'design-system') continue
      const full = resolve(dir, entry)
      if (statSync(full).isDirectory()) results.push(...findPageFiles(full))
      else if (entry === 'page.tsx') results.push(full)
    }
  } catch {
    /* ignore */
  }
  return results
}

export function generateDesignRecommendations(projectRoot: string): string {
  const recs: Recommendation[] = []
  const appDir = resolve(projectRoot, 'app')
  if (!existsSync(appDir)) return ''

  const pages = findPageFiles(appDir)
  const pageContents = pages.map(p => ({
    path: p.replace(projectRoot + '/', ''),
    code: readFileSync(p, 'utf-8'),
  }))

  // 1. Color system — raw Tailwind colors
  const rawColorPages = pageContents.filter(p =>
    /(?:bg|text|border)-(gray|blue|red|green|yellow|purple|pink|indigo|orange|slate|zinc)-\d+/.test(p.code),
  )
  if (rawColorPages.length > 0) {
    recs.push({
      category: 'Color System',
      severity: 'critical',
      title: `${rawColorPages.length} page(s) use raw Tailwind colors instead of design tokens`,
      detail: `Pages: ${rawColorPages.map(p => p.path).join(', ')}. Raw colors (bg-gray-100, text-blue-500) break theme switching and dark mode.`,
      fix: 'coherent fix',
    })
  }

  // 2. Empty states — lists/tables without fallback
  const noEmptyState = pageContents.filter(
    p =>
      /\.map\(|\.filter\(|<Table|<DataTable/.test(p.code) &&
      !/no.*found|empty|no\s+\w+\s+yet|nothing.*here/i.test(p.code),
  )
  if (noEmptyState.length > 0) {
    recs.push({
      category: 'Empty States',
      severity: 'important',
      title: `${noEmptyState.length} page(s) show data without empty-state fallback`,
      detail: 'When data is empty, users see a blank area instead of a helpful message with a call to action.',
      fix: `coherent chat "add empty states to all list and table pages"`,
    })
  }

  // 3. Layout variety — detect identical stat-card + table pattern
  const statTablePages = pageContents.filter(p => /StatCard|stat-card/.test(p.code) && /<Table|DataTable/.test(p.code))
  if (statTablePages.length >= 3) {
    recs.push({
      category: 'Layout Variety',
      severity: 'suggestion',
      title: `${statTablePages.length} pages repeat the same stats + table layout`,
      detail:
        'Varying page layouts (split view, kanban, timeline, cards) creates visual interest and helps users distinguish pages faster.',
    })
  }

  // 4. Component reuse — shared components vs inline patterns
  let sharedCount = 0
  try {
    const manifest = JSON.parse(readFileSync(resolve(projectRoot, 'coherent.components.json'), 'utf-8'))
    sharedCount = manifest.shared?.length || 0
  } catch {
    /* no manifest */
  }
  const totalComponentImports = pageContents.reduce(
    (sum, p) => sum + (p.code.match(/@\/components\/shared\//g) || []).length,
    0,
  )
  if (sharedCount > 0 && totalComponentImports < sharedCount) {
    recs.push({
      category: 'Component Reuse',
      severity: 'suggestion',
      title: `${sharedCount - totalComponentImports} shared component(s) may be underutilized`,
      detail:
        'Shared components ensure consistency. Check if any pages duplicate patterns that a shared component already handles.',
      fix: 'coherent check',
    })
  }

  // 5. Spacing consistency — mixed gap patterns
  const allGaps = new Set<string>()
  for (const p of pageContents) {
    const gaps = p.code.match(/gap-\d+/g) || []
    gaps.forEach(g => allGaps.add(g))
  }
  if (allGaps.size > 5) {
    recs.push({
      category: 'Spacing Consistency',
      severity: 'suggestion',
      title: `${allGaps.size} different gap values used across pages`,
      detail: `Found: ${[...allGaps].sort().join(', ')}. A tighter spacing scale (gap-2, gap-4, gap-6) creates more visual rhythm.`,
    })
  }

  // 6. Typography hierarchy — heading levels
  const h1Pages = pageContents.filter(p => (p.code.match(/<h1|text-2xl font-bold/g) || []).length > 1)
  if (h1Pages.length > 0) {
    recs.push({
      category: 'Typography',
      severity: 'important',
      title: `${h1Pages.length} page(s) have multiple large headings`,
      detail:
        'Each page should have one dominant heading (text-2xl font-bold). Multiple large headings flatten the visual hierarchy.',
    })
  }

  // 7. Dark mode — check globals.css has .dark block
  const globalsPath = resolve(projectRoot, 'app', 'globals.css')
  if (existsSync(globalsPath)) {
    const globals = readFileSync(globalsPath, 'utf-8')
    if (!globals.includes('.dark')) {
      recs.push({
        category: 'Dark Mode',
        severity: 'critical',
        title: 'No dark mode tokens defined',
        detail: 'globals.css is missing a .dark {} block. Dark mode toggle will show broken colors.',
        fix: 'coherent fix',
      })
    }
  }

  // 8. Interaction states — buttons without hover/disabled
  const bareButtons = pageContents.filter(p => p.code.includes('<button') && !p.code.includes('<Button'))
  if (bareButtons.length > 0) {
    recs.push({
      category: 'Interaction Design',
      severity: 'important',
      title: `${bareButtons.length} page(s) use raw <button> instead of shadcn Button`,
      detail:
        'Raw buttons lack consistent hover, focus, and disabled states. shadcn Button provides these automatically.',
      fix: 'coherent fix',
    })
  }

  // 9. Responsive — pages without any breakpoint
  const noBreakpoint = pageContents.filter(p => !/md:|lg:|sm:/.test(p.code) && p.code.length > 500)
  if (noBreakpoint.length > 0) {
    recs.push({
      category: 'Responsive Design',
      severity: 'important',
      title: `${noBreakpoint.length} page(s) have no responsive breakpoints`,
      detail: `Pages: ${noBreakpoint.map(p => p.path.split('/').slice(-2, -1)[0] || 'root').join(', ')}. These pages may break on tablet/mobile.`,
      fix: `coherent chat "add responsive breakpoints to all pages"`,
    })
  }

  // 10. Accessibility — images without alt
  const noAlt = pageContents.filter(p => /<img\b(?![^>]*\balt\b)/.test(p.code))
  if (noAlt.length > 0) {
    recs.push({
      category: 'Accessibility',
      severity: 'critical',
      title: `${noAlt.length} page(s) have images without alt text`,
      detail: 'Screen readers cannot describe these images. Add descriptive alt text or alt="" for decorative images.',
      fix: 'coherent fix',
    })
  }

  if (recs.length === 0) {
    return `# Design Recommendations

✅ No design issues detected. Your project follows all recommended patterns.

Run \`coherent check\` for a detailed quality report.
`
  }

  // Sort: critical → important → suggestion
  const order = { critical: 0, important: 1, suggestion: 2 }
  recs.sort((a, b) => order[a.severity] - order[b.severity])

  const icon = { critical: '🔴', important: '🟡', suggestion: '💡' }
  const grouped = new Map<string, Recommendation[]>()
  for (const r of recs) {
    const list = grouped.get(r.category) || []
    list.push(r)
    grouped.set(r.category, list)
  }

  let md = `# Design Recommendations\n\n`
  md += `${recs.length} recommendation(s) based on project analysis.\n\n`

  for (const [category, items] of grouped) {
    md += `## ${category}\n\n`
    for (const item of items) {
      md += `${icon[item.severity]} **${item.title}**\n\n`
      md += `${item.detail}\n\n`
      if (item.fix) md += `Fix: \`${item.fix}\`\n\n`
    }
  }

  md += `---\n\nGenerated by \`coherent check\`. Re-run to update.\n`
  return md
}
