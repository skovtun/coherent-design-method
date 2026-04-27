/**
 * Update-notifier — synchronous cached banner + async background refresh.
 *
 * Two phases per invocation:
 *
 *   1. {@link maybePrintUpdateBanner} — synchronous, fast, called BEFORE
 *      `program.parse()` so the banner lands above the command's own
 *      output instead of getting interleaved with spinners. Reads the
 *      24h disk cache, prints if a newer version is recorded, returns
 *      immediately. No network, no awaiting.
 *
 *   2. {@link refreshUpdateCacheAsync} — fire-and-forget, called from the
 *      same site. Hits npm registry only when the cache is stale, writes
 *      the result to disk for the NEXT invocation to pick up. The current
 *      command keeps running uninterrupted; the network round-trip never
 *      blocks user-facing output.
 *
 * Why this shape: the v0.11.0 → v0.11.1 hotfix made the banner load-bearing
 * (users on v0.11.0 hit a multi-turn nav-items P1 they don't know about).
 * The pre-v0.11.2 implementation called `checkForUpdates()` AFTER
 * `program.parse()`, which printed the banner mid-command — useful as a
 * notice but visually disruptive. The split here puts the banner where
 * the user actually sees it: at the top, before the spinner starts.
 *
 * Skip rules — the caller decides via {@link shouldSkipUpdateCheck}:
 *
 *   - `_phase` subcommands run inside the skill rail. Their stdout is a
 *     contract (JSON or fenced TSX) consumed by Claude Code; a banner
 *     would corrupt the contract and break ingestion.
 *   - `--version` / `-V` is itself a version question. The banner would
 *     duplicate what the user just asked for.
 *   - `--help` / `-h` is short-lived help text. A banner there is noise.
 *   - `COHERENT_NO_UPDATE_CHECK=1` is an explicit opt-out for CI / sandbox
 *     environments where the npm round-trip is undesirable.
 *   - `--no-update-check` is a per-invocation override.
 *
 * Both functions never throw — failures are logged under
 * `COHERENT_DEBUG=1` and otherwise silent.
 */

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'
import chalk from 'chalk'
import { CLI_VERSION } from '@getcoherent/core'

const DEBUG = process.env.COHERENT_DEBUG === '1'
const PACKAGE_NAME = '@getcoherent/cli'
const CACHE_DIR = join(homedir(), '.coherent')
const CACHE_FILE = join(CACHE_DIR, 'update-check.json')
const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000 // 24 hours

/**
 * Domain allowlist for `coherentReleaseFlags.migrationUrl`. Anyone with
 * write access to the npm registry record could otherwise inject a
 * phishing link the CLI tells users to visit. Only URLs starting with
 * one of these prefixes are surfaced; anything else is silently dropped
 * to a generic "see CHANGELOG" message.
 *
 * v0.13.0 — added per adversarial review (2026-04-27) finding S6:
 * supply-chain attack surface in registry-sourced URL field.
 */
const TRUSTED_MIGRATION_URL_PREFIXES = [
  'https://github.com/skovtun/coherent-design-method/',
  'https://getcoherent.design/',
] as const

interface CacheData {
  latest: string
  checkedAt: number
  /**
   * If set, banner is suppressed when `latest === dismissedFor`. Cleared
   * automatically when a newer version appears so future bumps are not
   * silenced. Reserved for future "don't tell me again about this version"
   * UX; currently always undefined.
   */
  dismissedFor?: string
  /**
   * v0.13.0+ — flagged when the published package metadata contains
   * `coherentReleaseFlags.breaking: true`. Triggers louder banner format
   * with migration URL.
   */
  breaking?: boolean
  /**
   * Domain-allowlisted migration URL from `coherentReleaseFlags.migrationUrl`.
   * Allowed prefixes pinned in `TRUSTED_MIGRATION_URL_PREFIXES`. Any URL
   * outside the allowlist is silently dropped to prevent supply-chain
   * phishing.
   */
  migrationUrl?: string
}

function readCache(): CacheData | null {
  try {
    if (!existsSync(CACHE_FILE)) return null
    const raw = readFileSync(CACHE_FILE, 'utf-8')
    return JSON.parse(raw) as CacheData
  } catch (e) {
    if (DEBUG) console.error('Failed to read update cache:', e)
    return null
  }
}

function writeCache(data: CacheData): void {
  try {
    if (!existsSync(CACHE_DIR)) mkdirSync(CACHE_DIR, { recursive: true })
    // v0.13.0 — atomic write to defeat the parallel-invocation race that
    // pre-v0.13.0 corrupted the cache when two `coherent` commands ran
    // concurrently. writeFileSync(tmp) + renameSync(tmp, final) is
    // atomic on POSIX (rename(2) is a single inode swap). Adversarial
    // review (2026-04-27) finding S5.
    const tmpFile = `${CACHE_FILE}.tmp.${process.pid}.${Date.now()}`
    writeFileSync(tmpFile, JSON.stringify(data), 'utf-8')
    renameSync(tmpFile, CACHE_FILE)
  } catch (e) {
    if (DEBUG) console.error('Failed to write update cache:', e)
  }
}

/**
 * Validate a migration URL against the trusted-domain allowlist.
 * Returns the URL if valid, undefined if rejected. Adversarial review
 * S6 — anyone who compromises npm could inject phishing URLs into
 * package metadata. Pin allowed prefixes hard.
 */
function validateMigrationUrl(url: unknown): string | undefined {
  if (typeof url !== 'string') return undefined
  if (TRUSTED_MIGRATION_URL_PREFIXES.some(prefix => url.startsWith(prefix))) {
    return url
  }
  if (DEBUG) console.error(`Rejected migrationUrl outside allowlist: ${url}`)
  return undefined
}

interface FetchedMetadata {
  version: string
  breaking?: boolean
  migrationUrl?: string
}

async function fetchLatestVersion(): Promise<FetchedMetadata | null> {
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 3000)
    // v0.13.0 — fetch /latest manifest (NOT /full package metadata) to
    // get the version PLUS coherentReleaseFlags. This is GET (was already
    // GET pre-v0.13.0; adversarial review S2 was incorrect on HEAD usage).
    // Bytes are tiny (~1KB).
    const res = await fetch(`https://registry.npmjs.org/${PACKAGE_NAME}/latest`, {
      signal: controller.signal,
    })
    clearTimeout(timeout)
    if (!res.ok) return null
    const data = (await res.json()) as {
      version?: string
      coherentReleaseFlags?: { breaking?: boolean; migrationUrl?: string }
    }
    if (!data.version) return null
    const flags = data.coherentReleaseFlags
    return {
      version: data.version,
      breaking: flags?.breaking === true ? true : undefined,
      migrationUrl: validateMigrationUrl(flags?.migrationUrl),
    }
  } catch (e) {
    if (DEBUG) console.error('Failed to fetch latest version:', e)
    return null
  }
}

/**
 * Strict semver-ish "is `latest` newer than `current`" comparison.
 *
 * Numeric major.minor.patch only. Prerelease tags / suffixes are
 * conservatively treated as "not newer" so a `0.11.1-rc.1` machine never
 * gets flagged against `0.11.0` (which would be a downgrade prompt).
 *
 * Exported for tests + so callers can reuse the same comparison logic.
 */
export function isNewer(latest: string, current: string): boolean {
  const isPlainSemver = /^\d+\.\d+\.\d+$/
  if (!isPlainSemver.test(latest) || !isPlainSemver.test(current)) return false

  const parse = (v: string) => v.split('.').map(Number)
  const [lMaj, lMin, lPatch] = parse(latest)
  const [cMaj, cMin, cPatch] = parse(current)
  if (lMaj !== cMaj) return lMaj > cMaj
  if (lMin !== cMin) return lMin > cMin
  return lPatch > cPatch
}

/**
 * Inspect process.argv (or a custom arg list, for tests) and decide
 * whether the update-check subsystem should fire at all.
 *
 * Skip rules — see file-level doc-block for the rationale on each.
 */
export function shouldSkipUpdateCheck(argv: readonly string[] = process.argv.slice(2)): boolean {
  if (process.env.COHERENT_NO_UPDATE_CHECK === '1') return true
  if (argv.includes('--no-update-check')) return true

  const first = argv[0]
  if (!first) return false
  // Internal skill-rail subcommand — stdout is a contract, no banner.
  if (first === '_phase') return true
  // Version / help — already answers a meta question, no banner.
  if (first === '--version' || first === '-V') return true
  if (first === '--help' || first === '-h') return true

  return false
}

/**
 * Synchronous fast path. Prints the banner if the disk cache says a newer
 * version exists. Never hits the network. Never throws. Safe to call
 * before `program.parse()` so the banner lands above command output.
 *
 * Returns true if a banner was printed (handy for tests and for the
 * caller deciding whether to insert spacing before the next output).
 */
export function maybePrintUpdateBanner(): boolean {
  try {
    if (shouldSkipUpdateCheck()) return false
    const cached = readCache()
    if (!cached) return false
    if (cached.dismissedFor && cached.dismissedFor === cached.latest) return false
    if (!isNewer(cached.latest, CLI_VERSION)) return false
    printUpdateNotice(cached.latest, cached.breaking, cached.migrationUrl)
    return true
  } catch (e) {
    if (DEBUG) console.error('maybePrintUpdateBanner failed:', e)
    return false
  }
}

/**
 * Fire-and-forget background refresh. If the cache is older than the TTL,
 * hit the npm registry, store the result for next invocation. Returns
 * immediately; the actual fetch resolves on its own and never blocks the
 * caller.
 *
 * The first invocation in a new install has no cache → triggers a refresh
 * → next invocation has fresh data. The first banner appears on the
 * SECOND command, not the first. That trade-off is intentional: never
 * block the user's first command on the network.
 */
export function refreshUpdateCacheAsync(): void {
  try {
    if (shouldSkipUpdateCheck()) return
    const cached = readCache()
    const now = Date.now()
    if (cached && now - cached.checkedAt < CHECK_INTERVAL_MS) {
      // Cache fresh — nothing to do. Banner (if any) was already printed
      // by maybePrintUpdateBanner above; we just don't refire the
      // network call.
      return
    }
    // Fire and forget. Promise rejects → silent (DEBUG-only log).
    fetchLatestVersion()
      .then(metadata => {
        if (!metadata) return
        writeCache({
          latest: metadata.version,
          checkedAt: now,
          breaking: metadata.breaking,
          migrationUrl: metadata.migrationUrl,
        })
      })
      .catch(e => {
        if (DEBUG) console.error('refreshUpdateCacheAsync fetch failed:', e)
      })
  } catch (e) {
    if (DEBUG) console.error('refreshUpdateCacheAsync failed:', e)
  }
}

/**
 * Legacy combined entry point — kept exported for backward-compat with
 * `index.ts` and any external scripts that imported it. Internally it
 * just calls the two split functions; the banner prints synchronously
 * from cache, the refresh fires async. Equivalent to the pre-v0.11.2
 * `checkForUpdates` for callers that don't care about ordering.
 */
export async function checkForUpdates(): Promise<void> {
  maybePrintUpdateBanner()
  refreshUpdateCacheAsync()
}

/**
 * Banner output. Two formats based on `coherentReleaseFlags.breaking`:
 *
 * - Non-breaking (default): single-line yellow notice, dim secondary line
 *   with the npm update command. Same as pre-v0.13.0.
 * - Breaking: two-line bold-yellow warning with migration URL when
 *   provided (or generic CHANGELOG link otherwise).
 *
 * Output goes to stderr when stdout is non-TTY (CI logs, redirected
 * output, automation pipes) so the notice is visible to dashboards
 * without polluting the structured-stdout contract that scripts may
 * parse. When stdout IS a TTY, output goes to stdout where the user
 * sees it inline above command output.
 *
 * Adversarial review (2026-04-27) finding C1 / C4: pre-v0.13.0 banner
 * went to stdout unconditionally — broke CI scripts parsing stdout AND
 * was invisible in CI dashboards that capture stderr separately.
 */
function printUpdateNotice(latest: string, breaking?: boolean, migrationUrl?: string): void {
  const isTty = process.stdout.isTTY ?? false

  let notice: string
  if (breaking) {
    const migrationLine = migrationUrl
      ? `Migration: ${migrationUrl}`
      : `See CHANGELOG: https://github.com/skovtun/coherent-design-method/blob/main/docs/CHANGELOG.md`
    notice =
      chalk.bold.yellow(`\n  ⚠  Update available with BREAKING changes: v${CLI_VERSION} → v${latest}`) +
      chalk.yellow(`\n     ${migrationLine}`) +
      chalk.dim(`\n     Run: npm update -g ${PACKAGE_NAME}\n`)
  } else {
    notice =
      chalk.yellow(`\n  ⬆  Update available: v${CLI_VERSION} → v${latest}`) +
      chalk.dim(`\n     Run: npm update -g ${PACKAGE_NAME}\n`)
  }

  // TTY → stdout (user sees inline above command output, current behavior).
  // Non-TTY (CI, piped, redirected) → stderr (visible in dashboards but
  // doesn't pollute the structured-stdout contract scripts may parse).
  if (isTty) {
    console.log(notice)
  } else {
    process.stderr.write(notice + '\n')
  }
}

/** Test-only helpers. Not part of the public API; the named exports above are. */
export const __test__ = {
  CACHE_DIR,
  CACHE_FILE,
  CHECK_INTERVAL_MS,
  readCache,
  writeCache,
  fetchLatestVersion,
}
