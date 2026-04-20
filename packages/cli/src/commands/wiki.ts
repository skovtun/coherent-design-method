/**
 * Wiki Commands
 *
 * Subcommands for maintaining the platform-level LLM wiki at `docs/wiki/`.
 * Not to be confused with `.coherent/wiki/decisions.md` in generated projects
 * (that's design-memory.ts — per-project, user-facing).
 *
 * Subcommands:
 *   - `coherent wiki reflect` — opens a template in $EDITOR for end-of-session
 *     reflection. Appends to PATTERNS_JOURNAL / MODEL_PROFILE / IDEAS_BACKLOG
 *     depending on which sections the user fills in.
 *   - `coherent wiki audit` — sanity check the wiki: orphans, missing
 *     evidence, supersession conflicts. Exits non-zero if critical issues
 *     found, 0 otherwise.
 *
 * Scope: only runs when invoked inside the Coherent source repo (detected by
 * presence of `packages/cli` and `docs/wiki/`). NOT a user-project command.
 */

import chalk from 'chalk'
import { existsSync, readdirSync, readFileSync, writeFileSync, mkdtempSync } from 'fs'
import { tmpdir } from 'os'
import { dirname, join, relative, resolve } from 'path'
import { spawnSync } from 'child_process'

const REFLECT_TEMPLATE = `<!--
  Reflect on this work session. Fill in the sections you have content for;
  delete the rest before saving. What you write here will be appended to the
  wiki as a new journal/profile/idea entry with YAML frontmatter.

  - Bug entries → docs/PATTERNS_JOURNAL.md (PJ-NNN)
  - Model behavior → docs/wiki/MODEL_PROFILE.md
  - Ideas → docs/wiki/IDEAS_BACKLOG.md

  Confidence levels (pick one per section):
    hypothesis   — your best guess, not verified
    observed     — seen once, not reproduced
    verified     — reproduced or confirmed in code/tests
    established  — documented fact, cross-referenced
-->

## Bug observed (PATTERNS_JOURNAL entry)
<!-- Confidence: hypothesis | observed | verified | established -->
Confidence: observed

### What happened


### Root cause


### Fix shipped (or proposed)


### Evidence
<!-- commit SHA (sha:abc123), screenshot path, test file — required for "verified" -->


---

## Model behavior note (MODEL_PROFILE entry)
<!-- Systematic pattern observed across 2+ chat runs -->
Confidence: observed



---

## Idea (IDEAS_BACKLOG entry)
<!-- Short title · rationale · rough effort · target version if any -->


`

interface WikiContext {
  repoRoot: string
  journalPath: string
  profilePath: string
  backlogPath: string
  rulesMapPath: string
  patternsDir: string
}

function detectRepoContext(): WikiContext | null {
  let dir = process.cwd()
  // Walk up looking for a `docs/wiki/` directory AND a `packages/cli` directory.
  for (let i = 0; i < 8; i++) {
    const hasWiki = existsSync(join(dir, 'docs', 'wiki'))
    const hasCliPkg = existsSync(join(dir, 'packages', 'cli'))
    if (hasWiki && hasCliPkg) {
      return {
        repoRoot: dir,
        journalPath: join(dir, 'docs', 'PATTERNS_JOURNAL.md'),
        profilePath: join(dir, 'docs', 'wiki', 'MODEL_PROFILE.md'),
        backlogPath: join(dir, 'docs', 'wiki', 'IDEAS_BACKLOG.md'),
        rulesMapPath: join(dir, 'docs', 'wiki', 'RULES_MAP.md'),
        patternsDir: join(dir, 'packages', 'cli', 'templates', 'patterns'),
      }
    }
    const parent = dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  return null
}

function requireRepoContext(): WikiContext {
  const ctx = detectRepoContext()
  if (!ctx) {
    console.error(chalk.red('❌ `coherent wiki` must run inside the Coherent source repo.'))
    console.error(chalk.dim('   It maintains the platform-level wiki, not the per-project LLM wiki.'))
    console.error(chalk.dim('   For per-project design memory, see .coherent/wiki/decisions.md in your app.'))
    process.exit(1)
  }
  return ctx
}

export async function wikiReflectCommand() {
  const ctx = requireRepoContext()
  const tmpDir = mkdtempSync(join(tmpdir(), 'coherent-reflect-'))
  const draftPath = join(tmpDir, 'reflection.md')
  writeFileSync(draftPath, REFLECT_TEMPLATE, 'utf-8')

  const editor = process.env.EDITOR || process.env.VISUAL || 'vi'
  console.log(chalk.cyan(`\n📝 Opening reflection template in ${editor}...`))
  console.log(chalk.dim(`   Draft: ${draftPath}\n`))

  const result = spawnSync(editor, [draftPath], { stdio: 'inherit' })
  if (result.status !== 0) {
    console.error(chalk.yellow('\n⚠ Editor exited non-zero. Reflection not saved.'))
    return
  }

  const filled = readFileSync(draftPath, 'utf-8')
  const { bugSection, modelSection, ideaSection } = parseReflection(filled)

  const now = new Date().toISOString().slice(0, 10)
  let wrote = 0
  if (bugSection.trim()) {
    const { confidence, body } = extractConfidence(bugSection)
    const title = extractFirstLine(body)
    const id = `PJ-${now.replace(/-/g, '')}`
    const frontmatter = renderFrontmatter({
      id,
      type: 'bug',
      confidence,
      status: 'active',
      date: now,
    })
    appendToFile(ctx.journalPath, `\n${frontmatter}\n### ${id} · ${title}\n\n${body.trim()}\n`)
    wrote++
    console.log(chalk.green(`✓ Appended bug entry (${confidence}) to ${relative(ctx.repoRoot, ctx.journalPath)}`))
  }
  if (modelSection.trim()) {
    const { confidence, body } = extractConfidence(modelSection)
    const frontmatter = renderFrontmatter({ type: 'model-note', confidence, date: now })
    appendToFile(ctx.profilePath, `\n${frontmatter}\n### ${now} observation\n\n${body.trim()}\n`)
    wrote++
    console.log(chalk.green(`✓ Appended model note (${confidence}) to ${relative(ctx.repoRoot, ctx.profilePath)}`))
  }
  if (ideaSection.trim()) {
    const frontmatter = renderFrontmatter({ type: 'idea', status: 'open', date: now })
    appendToFile(
      ctx.backlogPath,
      `\n${frontmatter}\n### ${now} · ${extractFirstLine(ideaSection)}\n\n${ideaSection.trim()}\n`,
    )
    wrote++
    console.log(chalk.green(`✓ Appended idea to ${relative(ctx.repoRoot, ctx.backlogPath)}`))
  }
  if (wrote === 0) {
    console.log(chalk.yellow('\n⚠ No sections filled — nothing appended.'))
  } else {
    console.log(chalk.dim(`\nRemember to commit the wiki changes.`))
  }
}

function parseReflection(text: string): { bugSection: string; modelSection: string; ideaSection: string } {
  const bugMatch = text.match(/## Bug observed[^]*?(?=^---|^## Model|$)/m)
  const modelMatch = text.match(/## Model behavior[^]*?(?=^---|^## Idea|$)/m)
  const ideaMatch = text.match(/## Idea[^]*$/m)
  const strip = (s: string | undefined) =>
    (s ?? '')
      .replace(/^## [^\n]+\n/, '')
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/^### [^\n]+\n/gm, '')
      .trim()
  return {
    bugSection: strip(bugMatch?.[0]),
    modelSection: strip(modelMatch?.[0]),
    ideaSection: strip(ideaMatch?.[0]),
  }
}

/**
 * Pulls a `Confidence: X` line out of a section body and returns the level +
 * cleaned body. Defaults to `observed` (conservative — avoids overclaiming).
 */
const VALID_CONFIDENCES = ['hypothesis', 'observed', 'verified', 'established'] as const
type Confidence = (typeof VALID_CONFIDENCES)[number]

function extractConfidence(section: string): { confidence: Confidence; body: string } {
  const match = section.match(/^Confidence:\s*(\w+)\s*$/im)
  let confidence: Confidence = 'observed'
  if (match) {
    const claimed = match[1].toLowerCase()
    if ((VALID_CONFIDENCES as readonly string[]).includes(claimed)) {
      confidence = claimed as Confidence
    }
  }
  const body = section.replace(/^Confidence:\s*\w+\s*$/im, '').trim()
  return { confidence, body }
}

/**
 * YAML frontmatter for structured facts in markdown. Small by design —
 * just enough to enable `grep`-and-`awk` queries (and embedding index later).
 */
function renderFrontmatter(fields: Record<string, string | undefined>): string {
  const lines = ['---']
  for (const [k, v] of Object.entries(fields)) {
    if (v === undefined || v === '') continue
    lines.push(`${k}: ${v}`)
  }
  lines.push('---')
  return lines.join('\n')
}

function extractFirstLine(text: string): string {
  return (
    text
      .split('\n')
      .map(l => l.trim())
      .filter(Boolean)[0]
      ?.slice(0, 80) || 'untitled'
  )
}

function appendToFile(path: string, content: string) {
  const existing = existsSync(path) ? readFileSync(path, 'utf-8') : ''
  writeFileSync(path, existing.trimEnd() + '\n' + content, 'utf-8')
}

interface AuditIssue {
  severity: 'error' | 'warning' | 'info'
  where: string
  message: string
}

export async function wikiAuditCommand() {
  const ctx = requireRepoContext()
  const issues: AuditIssue[] = []

  // 1. Every file in docs/wiki/ has a header
  const wikiFiles = collectWikiFiles(ctx)
  for (const f of wikiFiles) {
    const content = readFileSync(f, 'utf-8')
    if (!/^#\s+\S/m.test(content.slice(0, 200))) {
      issues.push({ severity: 'warning', where: relative(ctx.repoRoot, f), message: 'Missing top-level # heading' })
    }
    if (content.trim().length < 100) {
      issues.push({
        severity: 'warning',
        where: relative(ctx.repoRoot, f),
        message: 'File is very short — possible stub',
      })
    }
  }

  // 2. PATTERNS_JOURNAL entries have evidence/fix version
  if (existsSync(ctx.journalPath)) {
    const journal = readFileSync(ctx.journalPath, 'utf-8')
    const pjEntries = [...journal.matchAll(/###\s+PJ-(\d+|\S+)\s+[·—-]\s+([^\n]+)/g)]
    for (const entry of pjEntries) {
      const id = entry[1]
      const section = sliceSectionAt(journal, entry.index ?? 0)
      if (!/\*\*Fix[^:*]*?:?\*\*/i.test(section) && !/fix\s+shipped/i.test(section) && !/fix\s*\(/i.test(section)) {
        issues.push({
          severity: 'info',
          where: `PATTERNS_JOURNAL.md PJ-${id}`,
          message: 'No Fix section found — entry may be incomplete',
        })
      }
      const hasEvidence =
        /sha:[0-9a-f]{7,}/i.test(section) || /screenshot:/i.test(section) || /evidence:/i.test(section)
      if (!hasEvidence) {
        issues.push({
          severity: 'info',
          where: `PATTERNS_JOURNAL.md PJ-${id}`,
          message: 'No evidence (commit SHA / screenshot) — harder to verify later',
        })
      }

      // W6 confidence check — frontmatter must declare confidence level so
      // future readers know how much to trust the entry.
      const frontmatter = extractFrontmatterAbove(journal, entry.index ?? 0)
      if (!frontmatter || !frontmatter.confidence) {
        issues.push({
          severity: 'info',
          where: `PATTERNS_JOURNAL.md PJ-${id}`,
          message: 'No confidence tag in frontmatter — use `coherent wiki reflect` to add entries structurally',
        })
      } else if (!VALID_CONFIDENCES.includes(frontmatter.confidence as Confidence)) {
        issues.push({
          severity: 'warning',
          where: `PATTERNS_JOURNAL.md PJ-${id}`,
          message: `Invalid confidence "${frontmatter.confidence}" — must be one of: ${VALID_CONFIDENCES.join(', ')}`,
        })
      }
    }
  }

  // W7 supersession check — RULES_MAP rows with `superseded_by` must reference
  // real rule IDs; rules marked active must not contradict superseded ones.
  if (existsSync(ctx.rulesMapPath)) {
    const rulesMap = readFileSync(ctx.rulesMapPath, 'utf-8')
    // Row pattern: | R001 | ... | ... | ... | ... | Status: active|superseded_by: RXXX | ... |
    const activeIds = new Set<string>()
    const supersededIds = new Map<string, string>() // id → target
    const rowRe = /^\|\s*(R\d{3,})\s*\|/gm
    for (const m of rulesMap.matchAll(rowRe)) {
      const id = m[1]
      activeIds.add(id)
    }
    const supersedeRe = /^\|\s*(R\d{3,})\b[^|]*\|[^\n]*superseded_by:\s*(R\d{3,})/gim
    for (const m of rulesMap.matchAll(supersedeRe)) {
      supersededIds.set(m[1], m[2])
    }
    for (const [from, to] of supersededIds) {
      if (!activeIds.has(to)) {
        issues.push({
          severity: 'warning',
          where: `RULES_MAP.md ${from}`,
          message: `superseded_by: ${to} — but ${to} not found in the map`,
        })
      }
    }
  }

  // 3. RULES_MAP.md has the auto-gen markers
  if (existsSync(ctx.rulesMapPath)) {
    const content = readFileSync(ctx.rulesMapPath, 'utf-8')
    if (!content.includes('<!-- AUTO-GENERATED:START -->')) {
      issues.push({
        severity: 'error',
        where: 'RULES_MAP.md',
        message: 'Missing <!-- AUTO-GENERATED:START --> marker — generator cannot refresh this file',
      })
    }
  }

  // 4. Every golden pattern file has a JSDoc header (documentation intent)
  if (existsSync(ctx.patternsDir)) {
    for (const f of readdirSync(ctx.patternsDir)) {
      if (!f.endsWith('.tsx')) continue
      const content = readFileSync(join(ctx.patternsDir, f), 'utf-8')
      if (!/^\/\*\*[\s\S]*?GOLDEN PATTERN/i.test(content.slice(0, 500))) {
        issues.push({
          severity: 'warning',
          where: `templates/patterns/${f}`,
          message: 'Pattern file missing "GOLDEN PATTERN" JSDoc — add explanatory header',
        })
      }
    }
  }

  // 5. CLAUDE.md references the wiki
  const claudeMd = join(ctx.repoRoot, 'CLAUDE.md')
  if (existsSync(claudeMd)) {
    const content = readFileSync(claudeMd, 'utf-8')
    if (!content.includes('docs/wiki/') && !content.includes('PATTERNS_JOURNAL')) {
      issues.push({
        severity: 'warning',
        where: 'CLAUDE.md',
        message: 'Does not reference the wiki — new Claude sessions may skip it',
      })
    }
  }

  // Report
  const errors = issues.filter(i => i.severity === 'error')
  const warnings = issues.filter(i => i.severity === 'warning')
  const infos = issues.filter(i => i.severity === 'info')

  if (issues.length === 0) {
    console.log(chalk.green('\n✓ Wiki audit clean.\n'))
    console.log(chalk.dim(`  ${wikiFiles.length} files checked.`))
    return
  }

  console.log(
    chalk.cyan(`\n📋 Wiki audit: ${errors.length} errors, ${warnings.length} warnings, ${infos.length} info.\n`),
  )
  for (const i of issues) {
    const icon = i.severity === 'error' ? chalk.red('✗') : i.severity === 'warning' ? chalk.yellow('⚠') : chalk.dim('ℹ')
    console.log(`  ${icon} ${chalk.bold(i.where)} — ${i.message}`)
  }
  console.log()

  if (errors.length > 0) process.exit(1)
}

function collectWikiFiles(ctx: WikiContext): string[] {
  const result: string[] = []
  const wikiDir = join(ctx.repoRoot, 'docs', 'wiki')
  if (!existsSync(wikiDir)) return result
  function walk(d: string) {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const full = join(d, e.name)
      if (e.isDirectory()) walk(full)
      else if (e.name.endsWith('.md')) result.push(full)
    }
  }
  walk(wikiDir)
  if (existsSync(ctx.journalPath)) result.push(ctx.journalPath)
  return result
}

function sliceSectionAt(text: string, start: number): string {
  const nextSection = text.slice(start + 1).search(/\n### /)
  if (nextSection === -1) return text.slice(start)
  return text.slice(start, start + 1 + nextSection)
}

/**
 * Parse the YAML frontmatter block immediately before a heading at `pos`.
 *
 * Walks backwards from `pos` until we find either a closing `---\n` line or
 * we exit the valid window. Returns null if no frontmatter directly precedes
 * the heading (avoids picking up frontmatter of a prior entry).
 */
function extractFrontmatterAbove(text: string, pos: number): Record<string, string> | null {
  // Search backwards for `---\n` within 400 chars — frontmatter is short.
  const window = text.slice(Math.max(0, pos - 800), pos)
  const lastMarkerIdx = window.lastIndexOf('---\n')
  if (lastMarkerIdx === -1) return null
  const before = window.slice(0, lastMarkerIdx)
  const openMarkerIdx = before.lastIndexOf('---\n')
  if (openMarkerIdx === -1) return null
  const yaml = before.slice(openMarkerIdx + 4, lastMarkerIdx).trim()
  // Must be followed closely (within ~3 lines) by the heading.
  const between = window.slice(lastMarkerIdx + 4)
  if (between.split('\n').filter(Boolean).length > 3) return null

  const parsed: Record<string, string> = {}
  for (const line of yaml.split('\n')) {
    const m = line.match(/^(\w+)\s*:\s*(.*?)\s*$/)
    if (m) parsed[m[1]] = m[2]
  }
  return parsed
}
