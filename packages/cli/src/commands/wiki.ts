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
import { scanWiki, buildIndex, retrieve, saveIndex, loadIndex, type WikiEntry } from '../utils/wiki-index.js'

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
  adrDir: string
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
        adrDir: join(dir, 'docs', 'wiki', 'ADR'),
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
    const id = nextPjId(ctx.journalPath)
    const frontmatter = renderFrontmatter({
      id,
      type: 'bug',
      confidence,
      status: 'active',
      date: now,
    })
    appendToFile(ctx.journalPath, `\n${frontmatter}\n### ${id} — ${title}\n\n${body.trim()}\n`)
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

/**
 * Pick the next sequential PJ-NNN id by scanning the journal for existing IDs.
 *
 * Format: three-digit zero-padded. Canonical as of v0.7.20 (ADR-reviewed). Old
 * date-based IDs (`PJ-20260420`) are tolerated during migration but the
 * generator always emits `PJ-NNN`.
 */
function nextPjId(journalPath: string): string {
  if (!existsSync(journalPath)) return 'PJ-001'
  const content = readFileSync(journalPath, 'utf-8')
  let max = 0
  for (const m of content.matchAll(/\bPJ-(\d{1,4})\b/g)) {
    const n = parseInt(m[1], 10)
    if (!Number.isNaN(n) && n > max) max = n
  }
  return `PJ-${String(max + 1).padStart(3, '0')}`
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
      const frontmatter = extractFrontmatterAbove(journal, entry.index ?? 0)
      if (!/\*\*Fix[^:*]*?:?\*\*/i.test(section) && !/fix\s+shipped/i.test(section) && !/fix\s*\(/i.test(section)) {
        issues.push({
          severity: 'info',
          where: `PATTERNS_JOURNAL.md PJ-${id}`,
          message: 'No Fix section found — entry may be incomplete',
        })
      }
      // Evidence may live in frontmatter (`evidence: [...]`) or in body prose.
      // Frontmatter is the canonical place per v0.7.3 schema — check it first.
      const hasFrontmatterEvidence = !!frontmatter?.evidence && !/^\[\s*\]$/.test(frontmatter.evidence.trim())
      const hasBodyEvidence =
        /sha:[0-9a-f]{7,}/i.test(section) || /screenshot:/i.test(section) || /evidence:/i.test(section)
      if (!hasFrontmatterEvidence && !hasBodyEvidence) {
        issues.push({
          severity: 'info',
          where: `PATTERNS_JOURNAL.md PJ-${id}`,
          message: 'No evidence (commit SHA / screenshot) — harder to verify later',
        })
      }

      // W6 confidence check — frontmatter must declare confidence level so
      // future readers know how much to trust the entry.
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

  // 2b. ADR files have required frontmatter fields (id / status / date / confidence).
  // ADRs record architecturally-significant decisions — the schema is how we keep
  // them queryable years later. A missing id breaks retrieval; a missing status
  // makes it unclear whether the decision is still active.
  if (existsSync(ctx.adrDir)) {
    const REQUIRED_ADR_FIELDS = ['id', 'status', 'date', 'confidence'] as const
    for (const f of readdirSync(ctx.adrDir)) {
      if (!f.endsWith('.md') || f.toUpperCase().startsWith('README')) continue
      const full = join(ctx.adrDir, f)
      const content = readFileSync(full, 'utf-8')
      const frontmatter = extractFrontmatterAtTop(content)
      if (!frontmatter) {
        issues.push({
          severity: 'warning',
          where: `ADR/${f}`,
          message: 'Missing YAML frontmatter — ADRs need id/status/date/confidence',
        })
        continue
      }
      for (const field of REQUIRED_ADR_FIELDS) {
        if (!frontmatter[field]) {
          issues.push({
            severity: 'warning',
            where: `ADR/${f}`,
            message: `Frontmatter missing required field: ${field}`,
          })
        }
      }
      if (frontmatter.id && !/^ADR-\d{4}$/.test(frontmatter.id)) {
        issues.push({
          severity: 'warning',
          where: `ADR/${f}`,
          message: `id "${frontmatter.id}" should match ADR-NNNN (four-digit zero-padded)`,
        })
      }
      if (frontmatter.confidence && !VALID_CONFIDENCES.includes(frontmatter.confidence as Confidence)) {
        issues.push({
          severity: 'warning',
          where: `ADR/${f}`,
          message: `Invalid confidence "${frontmatter.confidence}" — must be one of: ${VALID_CONFIDENCES.join(', ')}`,
        })
      }
    }
  }

  // 2c. Version consistency: core pkg == cli pkg == top CHANGELOG entry.
  // When these drift, users get mismatched advertised vs shipped versions.
  // Caught PJ-style incidents before (forgot to bump one package.json).
  issues.push(...auditVersionConsistency(ctx))

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

/**
 * Rebuild the wiki index cache. Runs the scanner, builds the TF-IDF matrix,
 * writes to `.coherent/wiki-index.json`. Used by `coherent wiki search` and
 * (eventually) at chat-time for prompt retrieval.
 */
export async function wikiIndexCommand() {
  const ctx = requireRepoContext()
  console.log(chalk.cyan('\n📇 Rebuilding wiki index...\n'))

  const wikiDir = join(ctx.repoRoot, 'docs', 'wiki')
  const entries = scanWiki({ wikiDir, journalFile: ctx.journalPath })
  if (entries.length === 0) {
    console.log(chalk.yellow('⚠ No entries found. Make sure docs/wiki/ and docs/PATTERNS_JOURNAL.md exist.\n'))
    return
  }
  const index = buildIndex(entries)
  const cachePath = join(ctx.repoRoot, '.coherent', 'wiki-index.json')
  saveIndex(cachePath, index)

  const byType = new Map<string, number>()
  for (const e of entries) byType.set(e.type, (byType.get(e.type) ?? 0) + 1)

  console.log(chalk.green(`✓ Indexed ${entries.length} entries:`))
  for (const [t, n] of byType) console.log(chalk.dim(`  ${t.padEnd(12)} ${n}`))
  console.log(chalk.dim(`\n→ ${relative(ctx.repoRoot, cachePath)}\n`))
}

/**
 * Query the wiki index. Prints top-5 matching entries with score + first
 * 200 chars of content. Useful for "did we already discuss this?" checks.
 */
export async function wikiSearchCommand(query: string, opts: { limit?: string } = {}) {
  const ctx = requireRepoContext()
  const cachePath = join(ctx.repoRoot, '.coherent', 'wiki-index.json')
  let index = loadIndex(cachePath)
  if (!index) {
    console.log(chalk.dim('Index cache missing — building now...\n'))
    const wikiDir = join(ctx.repoRoot, 'docs', 'wiki')
    const entries = scanWiki({ wikiDir, journalFile: ctx.journalPath })
    index = buildIndex(entries)
    saveIndex(cachePath, index)
  }
  const limit = Math.max(1, Math.min(20, parseInt(opts.limit ?? '5', 10) || 5))
  const results = retrieve(index, query, limit)
  if (results.length === 0) {
    console.log(chalk.yellow(`\nNo matches for "${query}".\n`))
    return
  }
  console.log(chalk.cyan(`\n🔍 Top ${results.length} matches for "${query}":\n`))
  for (const { entry, score } of results) {
    const label = entryLabel(entry)
    console.log(`  ${chalk.bold(label)}  ${chalk.dim(`(score ${score.toFixed(3)})`)}`)
    const preview = entry.content.replace(/\s+/g, ' ').trim().slice(0, 200)
    console.log(chalk.dim(`    ${preview}${entry.content.length > 200 ? '…' : ''}`))
    console.log()
  }
}

/**
 * Retrieval quality benchmark. Reads `docs/wiki/BENCH.yaml` (simple hand-rolled
 * YAML parser, no dep) and evaluates precision@1 and @3 over its cases.
 *
 * Exit code: 0 if precision@1 ≥ 0.8, 1 otherwise. Used in CI to catch
 * retrieval regressions (e.g., a ranking change that tanks quality).
 */
export async function wikiBenchCommand() {
  const ctx = requireRepoContext()
  const benchPath = join(ctx.repoRoot, 'docs', 'wiki', 'BENCH.yaml')
  if (!existsSync(benchPath)) {
    console.error(chalk.red('❌ BENCH.yaml not found at docs/wiki/BENCH.yaml'))
    process.exit(1)
  }

  const benchSrc = readFileSync(benchPath, 'utf-8')
  const cases = parseBenchYaml(benchSrc)
  if (cases.length === 0) {
    console.error(chalk.yellow('⚠ No benchmark cases found.'))
    return
  }

  // Rebuild index fresh so benchmark reflects current state.
  const wikiDir = join(ctx.repoRoot, 'docs', 'wiki')
  const entries = scanWiki({ wikiDir, journalFile: ctx.journalPath })
  const index = buildIndex(entries)

  let top1Hits = 0
  let top3Hits = 0
  const misses: Array<{ query: string; expected: string; got: string[] }> = []
  for (const c of cases) {
    const results = retrieve(index, c.query, 3)
    const topIds = results.map(r => r.entry.id)
    if (topIds[0] === c.expected) top1Hits++
    if (topIds.includes(c.expected)) top3Hits++
    else misses.push({ query: c.query, expected: c.expected, got: topIds })
  }

  const p1 = top1Hits / cases.length
  const p3 = top3Hits / cases.length

  console.log(chalk.cyan(`\n📊 Wiki retrieval benchmark (${cases.length} cases):\n`))
  console.log(`  precision@1: ${(p1 * 100).toFixed(1)}%  (${top1Hits}/${cases.length})`)
  console.log(`  precision@3: ${(p3 * 100).toFixed(1)}%  (${top3Hits}/${cases.length})\n`)

  if (misses.length > 0) {
    console.log(chalk.yellow(`Misses (not in top-3):\n`))
    for (const m of misses) {
      console.log(`  ${chalk.bold(m.query)}`)
      console.log(chalk.dim(`    expected: ${m.expected}`))
      console.log(chalk.dim(`    got:      ${m.got.join(', ') || '(none)'}`))
    }
    console.log()
  }

  if (p1 < 0.8) {
    console.log(chalk.red(`❌ precision@1 below 0.8 threshold — retrieval quality regression.`))
    process.exit(1)
  }
  console.log(chalk.green(`✓ Retrieval quality OK.\n`))
}

/**
 * Minimal YAML reader for BENCH.yaml — supports only the simple shape we use:
 * a `cases:` list of `- query: ...\n  expected_top: ...\n  description: ...`
 * dict items. Avoids adding a YAML dep just for this one file.
 */
function parseBenchYaml(src: string): Array<{ query: string; expected: string; description?: string }> {
  const cases: Array<{ query: string; expected: string; description?: string }> = []
  const lines = src.split('\n')
  let current: Partial<{ query: string; expected: string; description: string }> | null = null

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const listStart = line.match(/^\s*-\s+(\w+):\s*(.+?)\s*$/)
    if (listStart) {
      if (current?.query && current.expected) {
        cases.push({ query: current.query, expected: current.expected, description: current.description })
      }
      current = { [listStart[1] === 'expected_top' ? 'expected' : listStart[1]]: unquote(listStart[2]) }
      continue
    }
    const fieldMatch = line.match(/^\s{4,}(\w+):\s*(.+?)\s*$/)
    if (fieldMatch && current) {
      const key = fieldMatch[1] === 'expected_top' ? 'expected' : fieldMatch[1]
      ;(current as any)[key] = unquote(fieldMatch[2])
    }
  }
  if (current?.query && current.expected) {
    cases.push({ query: current.query, expected: current.expected, description: current.description })
  }
  return cases
}

function unquote(s: string): string {
  const t = s.trim()
  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) {
    return t.slice(1, -1)
  }
  return t
}

function entryLabel(e: WikiEntry): string {
  const tag = `[${e.type}]`
  const title = e.title || e.id
  return `${tag} ${e.id} · ${title}`
}

function sliceSectionAt(text: string, start: number): string {
  const nextSection = text.slice(start + 1).search(/\n### /)
  if (nextSection === -1) return text.slice(start)
  return text.slice(start, start + 1 + nextSection)
}

/**
 * Parse a YAML frontmatter block at the top of a file (opening `---` on line 1).
 * Returns null if the file doesn't start with `---`.
 */
export function extractFrontmatterAtTop(text: string): Record<string, string> | null {
  if (!text.startsWith('---\n') && !text.startsWith('---\r\n')) return null
  const rest = text.slice(4)
  const closeIdx = rest.search(/^---\s*$/m)
  if (closeIdx === -1) return null
  const yaml = rest.slice(0, closeIdx).trim()
  const parsed: Record<string, string> = {}
  for (const line of yaml.split('\n')) {
    const m = line.match(/^(\w+)\s*:\s*(.*?)\s*$/)
    if (m) parsed[m[1]] = m[2]
  }
  return parsed
}

export function auditVersionConsistency(ctx: WikiContext): AuditIssue[] {
  const issues: AuditIssue[] = []
  const cliPkgPath = join(ctx.repoRoot, 'packages', 'cli', 'package.json')
  const corePkgPath = join(ctx.repoRoot, 'packages', 'core', 'package.json')
  const changelogPath = join(ctx.repoRoot, 'docs', 'CHANGELOG.md')

  const readPkgVersion = (path: string): string | null => {
    if (!existsSync(path)) return null
    try {
      return JSON.parse(readFileSync(path, 'utf-8')).version ?? null
    } catch {
      return null
    }
  }

  const cliVer = readPkgVersion(cliPkgPath)
  const coreVer = readPkgVersion(corePkgPath)
  if (cliVer && coreVer && cliVer !== coreVer) {
    issues.push({
      severity: 'error',
      where: 'package.json',
      message: `Version mismatch: core=${coreVer} vs cli=${cliVer} — packages publish together, must match`,
    })
  }

  if (existsSync(changelogPath)) {
    const changelog = readFileSync(changelogPath, 'utf-8')
    const topMatch = changelog.match(/^##\s+\[?(\d+\.\d+\.\d+)\]?/m)
    const topVer = topMatch?.[1]
    const pkgVer = cliVer ?? coreVer
    if (topVer && pkgVer && topVer !== pkgVer) {
      issues.push({
        severity: 'warning',
        where: 'CHANGELOG.md',
        message: `Top entry is ${topVer} but package.json is ${pkgVer} — CHANGELOG out of sync`,
      })
    }
  }

  return issues
}

const ADR_FILE_PATTERN = /^(\d{4})-([a-z0-9][a-z0-9-]*)\.md$/
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

/**
 * Scan `adrDir` for existing `NNNN-*.md` files and return the next sequential
 * 4-digit number as a zero-padded string. Returns "0001" for an empty or
 * missing directory. Gaps in numbering (e.g. 0001, 0003) are ignored —
 * we always pick max+1, never fill holes.
 */
export function nextAdrNumber(adrDir: string): string {
  if (!existsSync(adrDir)) return '0001'
  let max = 0
  for (const name of readdirSync(adrDir)) {
    const m = name.match(ADR_FILE_PATTERN)
    if (!m) continue
    const n = parseInt(m[1], 10)
    if (n > max) max = n
  }
  return String(max + 1).padStart(4, '0')
}

function slugToTitle(slug: string): string {
  return slug
    .split('-')
    .map(w => (w.length > 0 ? w[0].toUpperCase() + w.slice(1) : w))
    .join(' ')
}

/**
 * Render an ADR skeleton from the repo's canonical template (see
 * `docs/wiki/ADR/0001-*.md` for the format).
 *
 * Frontmatter starts at `status: proposed` / `confidence: proposed` —
 * the author flips these to `accepted` / `established` when shipping,
 * and fills in `shipped_in: [version]`.
 */
export function renderAdrTemplate(params: { number: string; slug: string; title: string; date: string }): string {
  const { number, title, date } = params
  return `---
id: ADR-${number}
type: adr
status: proposed
date: ${date}
confidence: proposed
shipped_in: []
---

# ADR ${number} — ${title}

**Status:** Proposed
**Date:** ${date}

## Context

<!-- What problem, constraint, or observation forced this decision? Evidence
     (bug IDs, validator fires, user reports) belongs here, not in Decision. -->

## Decision

<!-- Lead with one clear sentence. Details after. Decisions that can't be
     stated in one sentence usually aren't decided yet. -->

## Consequences

<!-- What changes downstream? What breaks? What's the cost we accept? -->

## Why not alternatives

- **Option A:** <!-- why rejected -->
- **Option B:** <!-- why rejected -->

## References

<!-- Related PJ-* bug IDs, ADRs, backlog items, commits, external links. -->
`
}

export async function wikiAdrCreateCommand(slug: string, opts: { title?: string } = {}) {
  const ctx = requireRepoContext()

  if (!SLUG_PATTERN.test(slug)) {
    console.error(chalk.red(`❌ Invalid slug: "${slug}"`))
    console.error(chalk.dim('   Use lowercase kebab-case: e.g. "atmosphere-preset-catalog".'))
    process.exit(1)
  }

  if (existsSync(ctx.adrDir)) {
    for (const name of readdirSync(ctx.adrDir)) {
      const m = name.match(ADR_FILE_PATTERN)
      if (m && m[2] === slug) {
        console.error(chalk.red(`❌ ADR with slug "${slug}" already exists: ${name}`))
        process.exit(1)
      }
    }
  } else {
    // Respect `mkdir -p` semantics: create the directory if missing.
    spawnSync('mkdir', ['-p', ctx.adrDir])
  }

  const number = nextAdrNumber(ctx.adrDir)
  const title = opts.title?.trim() || slugToTitle(slug)
  const date = new Date().toISOString().slice(0, 10)
  const filename = `${number}-${slug}.md`
  const filePath = join(ctx.adrDir, filename)
  const content = renderAdrTemplate({ number, slug, title, date })

  writeFileSync(filePath, content, 'utf8')

  const rel = relative(ctx.repoRoot, filePath)
  console.log(chalk.green(`\n✓ Created ${chalk.bold(`ADR-${number}`)} at ${chalk.cyan(rel)}\n`))
  console.log(chalk.dim(`  Title: ${title}`))
  console.log(chalk.dim(`  Next:  fill in Context → Decision → Consequences → Why-not-alternatives`))
  console.log(chalk.dim(`         flip status to "accepted" when shipped, add shipped_in: [version]\n`))
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
