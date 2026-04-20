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
  wiki as a new journal/profile/idea entry.

  - Bug entries → docs/PATTERNS_JOURNAL.md (PJ-NNN)
  - Model behavior → docs/wiki/MODEL_PROFILE.md
  - Ideas → docs/wiki/IDEAS_BACKLOG.md
-->

## Bug observed (PATTERNS_JOURNAL entry)
<!-- Screenshot or transcript ref + root cause + fix applied -->

### What happened


### Root cause


### Fix shipped (or proposed)


### Evidence
<!-- commit SHA, screenshot path, test file -->


---

## Model behavior note (MODEL_PROFILE entry)
<!-- Systematic pattern observed across 2+ chat runs -->


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
    appendToFile(
      ctx.journalPath,
      `\n### PJ-${now.replace(/-/g, '')} · ${extractFirstLine(bugSection)}\n\n${bugSection.trim()}\n`,
    )
    wrote++
    console.log(chalk.green(`✓ Appended bug entry to ${relative(ctx.repoRoot, ctx.journalPath)}`))
  }
  if (modelSection.trim()) {
    appendToFile(ctx.profilePath, `\n### ${now} observation\n\n${modelSection.trim()}\n`)
    wrote++
    console.log(chalk.green(`✓ Appended model note to ${relative(ctx.repoRoot, ctx.profilePath)}`))
  }
  if (ideaSection.trim()) {
    appendToFile(ctx.backlogPath, `\n### ${now} · ${extractFirstLine(ideaSection)}\n\n${ideaSection.trim()}\n`)
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
