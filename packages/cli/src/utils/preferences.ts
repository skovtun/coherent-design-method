/**
 * User Preferences Store — local design preferences that get injected
 * into AI prompts every `coherent chat` run.
 *
 * v0.15.3 — first cut. Codex pre-impl gate (D2026-04-29) recommended
 * building this simpler local store instead of integrating Honcho:
 * Honcho is a hosted memory service with Postgres+pgvector, AGPL
 * server, and privacy concerns (user prompts → hosted). For
 * "remember Sergei prefers minimalist + monochrome" the explicit local
 * file solves 80%+ of the use case with zero infrastructure.
 *
 * Storage: ~/.coherent/preferences.json (user-global, single file).
 * Per-project override deferred to a later release — keeps the v1
 * surface small and the inject-into-prompt path single-source.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { homedir } from 'os'
import { resolve } from 'path'

// Resolved lazily on each call so test overrides flow through. The
// COHERENT_HOME env var lets tests redirect the store to a temp dir
// without monkey-patching `os.homedir()` (Node makes it non-configurable
// so vi.spyOn fails). Production callers never set COHERENT_HOME.
const storeDir = (): string => resolve(process.env.COHERENT_HOME || homedir(), '.coherent')
const storeFile = (): string => resolve(storeDir(), 'preferences.json')

/**
 * v1 schema. Free-form `design` block — keys are conventional but not
 * enforced. Conservative shape to avoid premature coupling. Unknown
 * keys round-trip unchanged (forward compat).
 */
export interface Preferences {
  version: 1
  design?: {
    /** Stylistic descriptors: ["minimalist", "monochrome", "editorial"]. */
    style?: string[]
    /** UI density: "compact" | "comfortable" | "spacious". */
    density?: string
    /** Things to avoid: ["purple gradients", "marketing hero layouts"]. */
    avoid?: string[]
    /** Free-form notes injected verbatim. Use for one-off guidance. */
    notes?: string
    /** Forward-compat: any other design keys round-trip unchanged. */
    [key: string]: unknown
  }
}

const EMPTY: Preferences = { version: 1 }

/**
 * Read preferences from `~/.coherent/preferences.json`. Returns the
 * empty preferences when the file doesn't exist or is unreadable —
 * never throws. AI prompt injection should be a no-op when nothing
 * is configured.
 */
export function readPreferences(): Preferences {
  if (!existsSync(storeFile())) return { ...EMPTY }
  try {
    const raw = readFileSync(storeFile(), 'utf-8')
    const parsed = JSON.parse(raw) as Preferences
    if (typeof parsed !== 'object' || parsed === null) return { ...EMPTY }
    return { ...parsed, version: 1 }
  } catch {
    return { ...EMPTY }
  }
}

/**
 * Write preferences to `~/.coherent/preferences.json`. Creates the
 * `~/.coherent/` directory if missing. Returns `true` on success.
 * Never throws; returns `false` on filesystem failure so callers can
 * print a friendly message instead of crashing the CLI.
 */
export function writePreferences(prefs: Preferences): boolean {
  try {
    mkdirSync(storeDir(), { recursive: true })
    writeFileSync(storeFile(), JSON.stringify(prefs, null, 2) + '\n', 'utf-8')
    return true
  } catch {
    return false
  }
}

/**
 * Result of a write-attempting preferences mutation. v0.15.4 — codex
 * flagged that swallowing `writePreferences()`'s false return makes
 * permission/full-disk failures look successful. Now bubbled to caller.
 */
export interface PreferenceWriteResult {
  prefs: Preferences
  written: boolean
}

/**
 * Set a design preference by dot-path key. Supported paths:
 *   design.style       — comma-separated → array
 *   design.density     — string
 *   design.avoid       — comma-separated → array
 *   design.notes       — string
 *   design.<other>     — string (unknown keys allowed)
 *
 * Empty/whitespace value clears the key. Returns the resulting
 * Preferences and whether the write succeeded.
 */
export function setPreference(key: string, value: string): PreferenceWriteResult {
  const prefs = readPreferences()
  const parts = key.split('.')
  if (parts[0] !== 'design' || parts.length !== 2) {
    // Unsupported key shape — leave prefs unchanged. Caller validates.
    return { prefs, written: false }
  }
  const subKey = parts[1]
  if (!prefs.design) prefs.design = {}
  const cleared = value.trim() === ''
  if (cleared) {
    delete prefs.design[subKey]
  } else if (subKey === 'style' || subKey === 'avoid') {
    // Comma-separated list → array, trimmed, no empties.
    prefs.design[subKey] = value
      .split(',')
      .map(s => s.trim())
      .filter(Boolean)
  } else {
    prefs.design[subKey] = value
  }
  const written = writePreferences(prefs)
  return { prefs, written }
}

/**
 * Clear all preferences (or just one key when supplied). Returns the
 * Preferences and whether the write succeeded.
 */
export function clearPreferences(key?: string): PreferenceWriteResult {
  if (!key) {
    const written = writePreferences({ ...EMPTY })
    return { prefs: { ...EMPTY }, written }
  }
  return setPreference(key, '')
}

/**
 * Render preferences as a markdown block for AI prompt injection.
 * Returns an empty string when no design preferences exist — caller
 * concatenates unconditionally; the empty string contributes nothing.
 *
 * Block is small by design (~50-150 tokens typical). Format is
 * directive-style so the AI treats it as constraints, not flavor text.
 */
export function renderPreferencesBlock(prefs: Preferences): string {
  const d = prefs.design
  if (!d) return ''
  const lines: string[] = []
  if (Array.isArray(d.style) && d.style.length > 0) {
    lines.push(`- Style preference: ${d.style.join(', ')}`)
  }
  if (typeof d.density === 'string' && d.density.trim()) {
    lines.push(`- UI density: ${d.density.trim()}`)
  }
  if (Array.isArray(d.avoid) && d.avoid.length > 0) {
    lines.push(`- Avoid: ${d.avoid.join(', ')}`)
  }
  if (typeof d.notes === 'string' && d.notes.trim()) {
    lines.push(`- Notes: ${d.notes.trim()}`)
  }
  if (lines.length === 0) return ''
  return ['## USER DESIGN PREFERENCES', '', ...lines, ''].join('\n')
}

/** For tests / programmatic callers — exposes the canonical store path. */
export function getPreferencesPath(): string {
  return storeFile()
}
