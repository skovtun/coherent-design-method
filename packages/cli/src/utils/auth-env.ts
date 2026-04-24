import { existsSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'

/**
 * Credentials are project-scoped for v0.9.0 — `coherent auth set-key` writes
 * to `<projectRoot>/.env`, the same file `setupApiKey` uses. No global
 * credentials store yet; users who want "set once" put it in their shell.
 */
export type AuthProvider = 'anthropic' | 'openai'

export interface AuthKeyState {
  envVar: 'ANTHROPIC_API_KEY' | 'OPENAI_API_KEY'
  present: boolean
  /** Where the key came from. `null` when `present === false`. */
  source: 'process-env' | '.env' | null
}

export interface AuthStatus {
  anthropic: AuthKeyState
  openai: AuthKeyState
}

const ENV_VARS: Record<AuthProvider, 'ANTHROPIC_API_KEY' | 'OPENAI_API_KEY'> = {
  anthropic: 'ANTHROPIC_API_KEY',
  openai: 'OPENAI_API_KEY',
}

/**
 * Cheap heuristic for the common key prefixes. `sk-ant-` → Anthropic.
 * Anything else with `sk-` (including `sk-proj-`) → OpenAI.
 *
 * Returns `null` when the key matches neither prefix so the caller can
 * prompt for `--provider` instead of guessing wrong.
 */
export function inferProviderFromKey(key: string): AuthProvider | null {
  const trimmed = key.trim()
  if (trimmed.startsWith('sk-ant-')) return 'anthropic'
  if (trimmed.startsWith('sk-')) return 'openai'
  return null
}

/** Read the stored value from `.env` (regardless of `process.env`). Null if absent. */
export function readEnvFileKey(projectRoot: string, provider: AuthProvider): string | null {
  const envPath = join(projectRoot, '.env')
  if (!existsSync(envPath)) return null
  const envVar = ENV_VARS[provider]
  const contents = readFileSync(envPath, 'utf-8')
  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    const eq = line.indexOf('=')
    if (eq === -1) continue
    const name = line.slice(0, eq).trim()
    if (name === envVar) {
      return line.slice(eq + 1).trim()
    }
  }
  return null
}

/**
 * Write or replace a provider's key in `<projectRoot>/.env`. Preserves every
 * other line in the file; only the single matching `<VAR>=...` line is
 * updated (or appended when absent).
 */
export function writeApiKey(projectRoot: string, provider: AuthProvider, key: string): void {
  const envVar = ENV_VARS[provider]
  const envPath = join(projectRoot, '.env')
  const line = `${envVar}=${key.trim()}`

  const existing = existsSync(envPath) ? readFileSync(envPath, 'utf-8') : ''
  const lines = existing.length > 0 ? existing.split(/\r?\n/) : []

  let replaced = false
  const nextLines = lines.map(raw => {
    const trimmed = raw.trim()
    if (!trimmed || trimmed.startsWith('#')) return raw
    const eq = trimmed.indexOf('=')
    if (eq === -1) return raw
    const name = trimmed.slice(0, eq).trim()
    if (name === envVar) {
      replaced = true
      return line
    }
    return raw
  })

  if (!replaced) {
    // Drop a trailing empty line so we don't double-blank the file.
    if (nextLines.length > 0 && nextLines[nextLines.length - 1] === '') nextLines.pop()
    nextLines.push(line)
  }

  // Single trailing newline — standard Unix file shape.
  const out = nextLines.join('\n') + '\n'
  writeFileSync(envPath, out, 'utf-8')
}

/**
 * Remove a provider's key line from `.env`. Returns true when a line was
 * removed, false when nothing matched (idempotent).
 */
export function removeApiKey(projectRoot: string, provider: AuthProvider): boolean {
  const envVar = ENV_VARS[provider]
  const envPath = join(projectRoot, '.env')
  if (!existsSync(envPath)) return false

  const existing = readFileSync(envPath, 'utf-8')
  const lines = existing.split(/\r?\n/)
  let removed = false
  const nextLines = lines.filter(raw => {
    const trimmed = raw.trim()
    if (!trimmed || trimmed.startsWith('#')) return true
    const eq = trimmed.indexOf('=')
    if (eq === -1) return true
    const name = trimmed.slice(0, eq).trim()
    if (name === envVar) {
      removed = true
      return false
    }
    return true
  })

  if (!removed) return false

  // Preserve trailing newline convention if the original had content.
  const joined = nextLines.join('\n')
  const out = joined.length > 0 && !joined.endsWith('\n') ? joined + '\n' : joined
  writeFileSync(envPath, out, 'utf-8')
  return true
}

/**
 * Report where each provider's key is coming from (process env, .env, or
 * nowhere). `process.env` wins when both exist — matches dotenv's default
 * `override: false` behavior.
 */
export function readAuthStatus(projectRoot: string): AuthStatus {
  const status: AuthStatus = {
    anthropic: { envVar: 'ANTHROPIC_API_KEY', present: false, source: null },
    openai: { envVar: 'OPENAI_API_KEY', present: false, source: null },
  }

  for (const provider of ['anthropic', 'openai'] as const) {
    const envVar = ENV_VARS[provider]
    if (process.env[envVar]) {
      status[provider] = { envVar, present: true, source: 'process-env' }
      continue
    }
    const fileVal = readEnvFileKey(projectRoot, provider)
    if (fileVal && fileVal.length > 0) {
      status[provider] = { envVar, present: true, source: '.env' }
    }
  }
  return status
}
