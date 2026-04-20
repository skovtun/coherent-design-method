/**
 * Wiki Index — TF-IDF retrieval over the platform-level LLM wiki.
 *
 * Why TF-IDF (not embeddings, yet): shipping embedding retrieval requires a
 * library choice (Xenova local = ~100MB model download, OpenAI API = external
 * dependency + cost per retrieval). TF-IDF gets us ~80% of the value with zero
 * dependencies, works offline, testable in CI, instant first-run.
 *
 * Embedding upgrade path: `WikiRetriever` exposes a `score(entry, query)`
 * method we can swap in v0.8.x without changing callers.
 *
 * What gets indexed:
 *   - docs/PATTERNS_JOURNAL.md — each PJ-NNN entry as a separate document
 *   - docs/wiki/ADR/*.md — each ADR as one document
 *   - docs/wiki/MODEL_PROFILE.md — split by ### section
 *   - docs/wiki/IDEAS_BACKLOG.md — split by ### section
 *   - docs/wiki/RULES_MAP.md — the hand-maintained rows
 *
 * Index is cached at `.coherent/wiki-index.json` (at the repo root when
 * building the wiki, and can be embedded in the published package so user
 * projects can retrieve too).
 */

import { existsSync, readFileSync, readdirSync, statSync, writeFileSync, mkdirSync } from 'fs'
import { dirname, join, relative } from 'path'

export interface WikiEntry {
  id: string
  source: string // file path relative to repo root
  type: 'bug' | 'adr' | 'model-note' | 'idea' | 'rule' | 'pattern'
  title: string
  content: string
  frontmatter: Record<string, string>
}

export interface ScoredEntry {
  entry: WikiEntry
  score: number
}

// Lightweight English stopwords. Keep this small — too many removes real signal
// (e.g., "not" matters in rules like "not destructive action").
const STOPWORDS = new Set([
  'a',
  'an',
  'and',
  'are',
  'as',
  'at',
  'be',
  'by',
  'for',
  'from',
  'has',
  'he',
  'in',
  'is',
  'it',
  'its',
  'of',
  'on',
  'that',
  'the',
  'to',
  'was',
  'will',
  'with',
  'or',
  'but',
  'if',
  'then',
  'this',
  'these',
  'those',
  'so',
  'do',
  'does',
  'did',
  'have',
  'had',
  'been',
  'being',
  'can',
  'could',
  'should',
  'would',
  'may',
  'might',
  'must',
  'shall',
  'i',
  'you',
  'we',
  'they',
  'them',
  'our',
  'your',
  'their',
  'his',
  'her',
  'what',
  'when',
  'where',
  'who',
  'how',
])

/**
 * Tokenize text into lowercase word tokens suitable for TF-IDF.
 *
 * Preserves code identifiers (bg-primary, CardHeader) since those are the
 * signal-carrying tokens in this corpus. Splits on word boundaries otherwise.
 * Drops stopwords and very short tokens.
 */
export function tokenize(text: string): string[] {
  const raw =
    text
      .toLowerCase()
      .replace(/[`*_#>]/g, ' ') // strip markdown noise
      .match(/[a-z0-9]+(?:-[a-z0-9]+)*/g) ?? []
  const tokens: string[] = []
  for (const t of raw) {
    if (t.length < 2) continue
    if (STOPWORDS.has(t)) continue
    tokens.push(t)
  }
  return tokens
}

export interface IndexOptions {
  wikiDir: string
  journalFile: string
}

/**
 * Scan the wiki and produce an array of WikiEntry documents.
 * Each PATTERNS_JOURNAL entry, ADR, MODEL_PROFILE observation, and IDEAS_BACKLOG
 * item becomes its own entry.
 */
export function scanWiki(opts: IndexOptions): WikiEntry[] {
  const entries: WikiEntry[] = []

  // 1. PATTERNS_JOURNAL — split by ### PJ-NNN heading.
  if (existsSync(opts.journalFile)) {
    const content = readFileSync(opts.journalFile, 'utf-8')
    entries.push(...splitByHeading(content, opts.journalFile, 'bug', /###\s+(PJ-\S+)\s*[·—-]\s*(.+)/))
  }

  // 2. Wiki folder — each top-level .md file (ADR, MODEL_PROFILE, IDEAS_BACKLOG, RULES_MAP).
  if (existsSync(opts.wikiDir)) {
    walkMarkdown(opts.wikiDir, file => {
      const content = readFileSync(file, 'utf-8')
      const rel = relative(dirname(opts.wikiDir), file)

      if (rel.includes('ADR/')) {
        // One entry per ADR file.
        const title = extractFirstHeading(content) || rel
        entries.push({
          id: rel.replace(/\.md$/, ''),
          source: rel,
          type: 'adr',
          title,
          content,
          frontmatter: {},
        })
        return
      }

      // Otherwise split by ### headings (non-code).
      const type: WikiEntry['type'] = rel.includes('MODEL_PROFILE')
        ? 'model-note'
        : rel.includes('IDEAS_BACKLOG')
          ? 'idea'
          : 'rule'
      entries.push(...splitByHeading(content, file, type, /###\s+(.+)/))
    })
  }

  return entries
}

function walkMarkdown(dir: string, cb: (file: string) => void) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    const s = statSync(full)
    if (s.isDirectory()) walkMarkdown(full, cb)
    else if (name.endsWith('.md')) cb(full)
  }
}

function extractFirstHeading(content: string): string {
  const m = content.match(/^#\s+(.+)$/m)
  return m?.[1] ?? ''
}

function splitByHeading(content: string, file: string, type: WikiEntry['type'], headingRe: RegExp): WikiEntry[] {
  const entries: WikiEntry[] = []
  const lines = content.split('\n')
  let current: { heading: RegExpMatchArray | null; lines: string[]; frontmatter: Record<string, string> } | null = null
  let pendingFrontmatter: Record<string, string> = {}
  let inFrontmatter = false
  let inCodeFence = false
  let fmLines: string[] = []

  const flush = () => {
    if (!current) return
    const h = current.heading
    if (!h) return
    const body = current.lines.join('\n').trim()
    const id = h[1] || h[0]
    const title = (h[2] || h[1] || '').trim()
    entries.push({
      id,
      source: file,
      type,
      title,
      content: body,
      frontmatter: current.frontmatter,
    })
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    // Track code fences so we don't mistake YAML inside ```yaml blocks for
    // real frontmatter or headings.
    if (/^\s*```/.test(line)) {
      inCodeFence = !inCodeFence
      if (current) current.lines.push(line)
      continue
    }
    if (inCodeFence) {
      if (current) current.lines.push(line)
      continue
    }

    // YAML frontmatter blocks immediately above headings. Distinguish from
    // markdown horizontal rules (also `---`) by peeking at the next line:
    // real frontmatter opens with `key: value` on the next line.
    if (line.trim() === '---') {
      if (!inFrontmatter) {
        const next = lines[i + 1]?.trim() ?? ''
        const looksLikeYaml = /^\w+\s*:\s*.+$/.test(next)
        if (looksLikeYaml) {
          inFrontmatter = true
          fmLines = []
        }
        // else: treat as horizontal rule — skip without changing state
        continue
      } else {
        inFrontmatter = false
        const parsed: Record<string, string> = {}
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

/** TF-IDF vector for fast retrieval. Map token → weight. */
export interface TfIdfVector {
  tokens: Map<string, number>
  magnitude: number // L2 norm for cosine similarity
}

export interface BuiltIndex {
  entries: WikiEntry[]
  vectors: TfIdfVector[]
  idf: Map<string, number>
  builtAt: string
}

/**
 * Build a TF-IDF matrix over the wiki entries. Each entry becomes a sparse
 * vector indexed by token. `idf` is the inverse-document-frequency weight
 * applied at query time.
 */
export function buildIndex(entries: WikiEntry[]): BuiltIndex {
  const N = entries.length || 1
  const docFreq = new Map<string, number>()
  const termLists: string[][] = []

  for (const e of entries) {
    const tokens = tokenize(e.title + ' ' + e.content)
    termLists.push(tokens)
    const unique = new Set(tokens)
    for (const t of unique) docFreq.set(t, (docFreq.get(t) ?? 0) + 1)
  }

  const idf = new Map<string, number>()
  for (const [t, df] of docFreq) {
    idf.set(t, Math.log((N + 1) / (df + 1)) + 1) // smoothed IDF
  }

  const vectors: TfIdfVector[] = []
  for (const tokens of termLists) {
    const termFreq = new Map<string, number>()
    for (const t of tokens) termFreq.set(t, (termFreq.get(t) ?? 0) + 1)
    const weighted = new Map<string, number>()
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

/**
 * Cosine similarity between query and each entry. Returns top-K entries sorted
 * by descending score. Ties broken by entry id for determinism.
 */
export function retrieve(index: BuiltIndex, query: string, topK = 5): ScoredEntry[] {
  const queryTokens = tokenize(query)
  if (queryTokens.length === 0) return []

  const qTermFreq = new Map<string, number>()
  for (const t of queryTokens) qTermFreq.set(t, (qTermFreq.get(t) ?? 0) + 1)
  const qVec = new Map<string, number>()
  let qSumSq = 0
  for (const [t, tf] of qTermFreq) {
    const w = tf * (index.idf.get(t) ?? 1)
    qVec.set(t, w)
    qSumSq += w * w
  }
  const qMag = Math.sqrt(qSumSq) || 1

  const scores: ScoredEntry[] = []
  for (let i = 0; i < index.entries.length; i++) {
    const eVec = index.vectors[i]
    let dot = 0
    for (const [t, qw] of qVec) {
      const ew = eVec.tokens.get(t)
      if (ew) dot += qw * ew
    }
    const score = dot / (qMag * eVec.magnitude)
    if (score > 0) scores.push({ entry: index.entries[i], score })
  }
  scores.sort((a, b) => b.score - a.score || a.entry.id.localeCompare(b.entry.id))
  return scores.slice(0, topK)
}

/**
 * Serialise index to a JSON file. Loaded at chat-time for retrieval without
 * re-scanning the filesystem. Cache key is built-at timestamp; wiki changes
 * require a rebuild via `coherent wiki index`.
 */
export function saveIndex(path: string, index: BuiltIndex): void {
  const serialized = {
    builtAt: index.builtAt,
    entries: index.entries,
    vectors: index.vectors.map(v => ({
      tokens: [...v.tokens.entries()],
      magnitude: v.magnitude,
    })),
    idf: [...index.idf.entries()],
  }
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, JSON.stringify(serialized), 'utf-8')
}

export function loadIndex(path: string): BuiltIndex | null {
  if (!existsSync(path)) return null
  try {
    const raw = JSON.parse(readFileSync(path, 'utf-8'))
    return {
      builtAt: raw.builtAt,
      entries: raw.entries,
      vectors: raw.vectors.map((v: { tokens: [string, number][]; magnitude: number }) => ({
        tokens: new Map(v.tokens),
        magnitude: v.magnitude,
      })),
      idf: new Map(raw.idf),
    }
  } catch {
    return null
  }
}
