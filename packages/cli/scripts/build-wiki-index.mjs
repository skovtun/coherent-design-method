#!/usr/bin/env node
/**
 * Build the wiki retrieval index and bundle it with the CLI package.
 *
 * Self-contained — duplicates the scanner/index-builder logic from
 * `src/utils/wiki-index.ts` so it can run before the TypeScript compile
 * step, or independently.
 *
 * Runs as part of `npm run build` (postbuild hook). The resulting JSON is
 * loaded at chat time via `loadIndex()` for retrieval injection into the
 * LLM prompt.
 *
 * Output: `packages/cli/dist/wiki-index.json` (bundled with published package).
 */

import { existsSync, readFileSync, readdirSync, statSync, mkdirSync, writeFileSync } from 'fs'
import { dirname, join, relative, resolve } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(__dirname, '../../..')

const STOPWORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'for', 'from', 'has', 'he',
  'in', 'is', 'it', 'its', 'of', 'on', 'that', 'the', 'to', 'was', 'will',
  'with', 'or', 'but', 'if', 'then', 'this', 'these', 'those', 'so', 'do',
  'does', 'did', 'have', 'had', 'been', 'being', 'can', 'could', 'should',
  'would', 'may', 'might', 'must', 'shall', 'i', 'you', 'we', 'they', 'them',
  'our', 'your', 'their', 'his', 'her', 'what', 'when', 'where', 'who', 'how',
])

function tokenize(text) {
  const raw = text.toLowerCase().replace(/[`*_#>]/g, ' ').match(/[a-z0-9]+(?:-[a-z0-9]+)*/g) ?? []
  const tokens = []
  for (const t of raw) {
    if (t.length < 2) continue
    if (STOPWORDS.has(t)) continue
    tokens.push(t)
  }
  return tokens
}

function walkMarkdown(dir, cb) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    const s = statSync(full)
    if (s.isDirectory()) walkMarkdown(full, cb)
    else if (name.endsWith('.md')) cb(full)
  }
}

function extractFirstHeading(content) {
  const m = content.match(/^#\s+(.+)$/m)
  return m?.[1] ?? ''
}

function splitByHeading(content, file, type, headingRe) {
  const entries = []
  const lines = content.split('\n')
  let current = null
  let pendingFrontmatter = {}
  let inFrontmatter = false
  let inCodeFence = false
  let fmLines = []

  const flush = () => {
    if (!current) return
    const h = current.heading
    if (!h) return
    const body = current.lines.join('\n').trim()
    const id = h[1] || h[0]
    const title = (h[2] || h[1] || '').trim()
    entries.push({ id, source: file, type, title, content: body, frontmatter: current.frontmatter })
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    // Track code fences — YAML inside ```yaml blocks is documentation,
    // not real frontmatter.
    if (/^\s*```/.test(line)) {
      inCodeFence = !inCodeFence
      if (current) current.lines.push(line)
      continue
    }
    if (inCodeFence) {
      if (current) current.lines.push(line)
      continue
    }
    if (line.trim() === '---') {
      if (!inFrontmatter) {
        const next = lines[i + 1]?.trim() ?? ''
        const looksLikeYaml = /^\w+\s*:\s*.+$/.test(next)
        if (looksLikeYaml) {
          inFrontmatter = true
          fmLines = []
        }
        continue
      } else {
        inFrontmatter = false
        const parsed = {}
        for (const fl of fmLines) {
          const m = fl.match(/^(\w+)\s*:\s*(.*?)\s*$/)
          if (m) parsed[m[1]] = m[2]
        }
        pendingFrontmatter = parsed
      }
      continue
    }
    if (inFrontmatter) {
      fmLines.push(line)
      continue
    }
    const headingMatch = line.match(headingRe)
    if (headingMatch) {
      flush()
      current = { heading: headingMatch, lines: [], frontmatter: pendingFrontmatter }
      pendingFrontmatter = {}
      continue
    }
    if (current) current.lines.push(line)
  }
  flush()
  return entries
}

function scanWiki(wikiDir, journalFile) {
  const entries = []
  if (existsSync(journalFile)) {
    const content = readFileSync(journalFile, 'utf-8')
    entries.push(...splitByHeading(content, journalFile, 'bug', /###\s+(PJ-\S+)\s*[·—-]\s*(.+)/))
  }
  if (existsSync(wikiDir)) {
    walkMarkdown(wikiDir, file => {
      const content = readFileSync(file, 'utf-8')
      const rel = relative(dirname(wikiDir), file)
      if (rel.includes('ADR/')) {
        const title = extractFirstHeading(content) || rel
        entries.push({ id: rel.replace(/\.md$/, ''), source: rel, type: 'adr', title, content, frontmatter: {} })
        return
      }
      const type = rel.includes('MODEL_PROFILE') ? 'model-note' : rel.includes('IDEAS_BACKLOG') ? 'idea' : 'rule'
      entries.push(...splitByHeading(content, file, type, /###\s+(.+)/))
    })
  }
  return entries
}

function buildIndex(entries) {
  const N = entries.length || 1
  const docFreq = new Map()
  const termLists = []

  for (const e of entries) {
    const tokens = tokenize(e.title + ' ' + e.content)
    termLists.push(tokens)
    const unique = new Set(tokens)
    for (const t of unique) docFreq.set(t, (docFreq.get(t) ?? 0) + 1)
  }

  const idf = new Map()
  for (const [t, df] of docFreq) idf.set(t, Math.log((N + 1) / (df + 1)) + 1)

  const vectors = []
  for (const tokens of termLists) {
    const termFreq = new Map()
    for (const t of tokens) termFreq.set(t, (termFreq.get(t) ?? 0) + 1)
    const weighted = new Map()
    let sumSq = 0
    for (const [t, tf] of termFreq) {
      const w = tf * (idf.get(t) ?? 1)
      weighted.set(t, w)
      sumSq += w * w
    }
    vectors.push({ tokens: weighted, magnitude: Math.sqrt(sumSq) || 1 })
  }

  return { entries, vectors, idf, builtAt: new Date().toISOString() }
}

function saveIndex(path, index) {
  const serialized = {
    builtAt: index.builtAt,
    entries: index.entries,
    vectors: index.vectors.map(v => ({ tokens: [...v.tokens.entries()], magnitude: v.magnitude })),
    idf: [...index.idf.entries()],
  }
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, JSON.stringify(serialized), 'utf-8')
}

const wikiDir = join(repoRoot, 'docs', 'wiki')
const journalFile = join(repoRoot, 'docs', 'PATTERNS_JOURNAL.md')
const entries = scanWiki(wikiDir, journalFile)

if (entries.length === 0) {
  console.log('[wiki] No entries found — skipping index build.')
  process.exit(0)
}

const index = buildIndex(entries)
const outPath = join(__dirname, '..', 'dist', 'wiki-index.json')
saveIndex(outPath, index)

console.log(`[wiki] Indexed ${entries.length} entries → dist/wiki-index.json (${(JSON.stringify(index).length / 1024).toFixed(1)}KB)`)
