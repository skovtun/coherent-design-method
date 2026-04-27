/**
 * update-notifier — unit tests for the v0.11.2 split (synchronous-cache
 * banner + async-refresh).
 *
 * Coverage:
 *   - isNewer semver comparison (incl. prerelease conservatism).
 *   - shouldSkipUpdateCheck argv + env detection.
 *   - maybePrintUpdateBanner reads cache, prints when newer, no network.
 *   - dismissedFor field suppresses banner for the named version.
 *   - Bad cache file is treated as "no cache" (silent recovery).
 *
 * The async refresh path that hits the npm registry is NOT exercised
 * here — it would couple the test suite to network availability. That
 * codepath is small (one fetch + writeCache) and is best-effort by
 * design; failures are silently swallowed.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { CLI_VERSION } from '@getcoherent/core'
import { isNewer, shouldSkipUpdateCheck, maybePrintUpdateBanner, __test__ } from './update-notifier.js'

describe('isNewer', () => {
  it('returns true when latest > current (patch)', () => {
    expect(isNewer('0.11.1', '0.11.0')).toBe(true)
  })

  it('returns true when latest > current (minor)', () => {
    expect(isNewer('0.12.0', '0.11.5')).toBe(true)
  })

  it('returns true when latest > current (major)', () => {
    expect(isNewer('1.0.0', '0.99.99')).toBe(true)
  })

  it('returns false when versions are equal', () => {
    expect(isNewer('0.11.1', '0.11.1')).toBe(false)
  })

  it('returns false when current > latest', () => {
    expect(isNewer('0.11.0', '0.11.1')).toBe(false)
  })

  it('treats prerelease tags as "not newer" (conservative)', () => {
    // A user on a 0.11.1-rc.1 build should never see "downgrade to 0.11.0"
    // or "upgrade to 0.11.1" prompts driven by sloppy comparison. Plain
    // numeric semver only — anything else returns false.
    expect(isNewer('0.11.1-rc.1', '0.11.0')).toBe(false)
    expect(isNewer('0.11.0', '0.11.1-rc.1')).toBe(false)
  })

  it('returns false on malformed inputs', () => {
    expect(isNewer('foo', '0.11.0')).toBe(false)
    expect(isNewer('0.11.0', 'bar')).toBe(false)
    expect(isNewer('', '')).toBe(false)
  })
})

describe('shouldSkipUpdateCheck', () => {
  const originalEnv = process.env.COHERENT_NO_UPDATE_CHECK

  afterEach(() => {
    if (originalEnv === undefined) delete process.env.COHERENT_NO_UPDATE_CHECK
    else process.env.COHERENT_NO_UPDATE_CHECK = originalEnv
  })

  it('skips when COHERENT_NO_UPDATE_CHECK=1 env is set', () => {
    process.env.COHERENT_NO_UPDATE_CHECK = '1'
    expect(shouldSkipUpdateCheck(['chat', 'hello'])).toBe(true)
  })

  it('skips when --no-update-check flag is in argv', () => {
    delete process.env.COHERENT_NO_UPDATE_CHECK
    expect(shouldSkipUpdateCheck(['chat', '--no-update-check'])).toBe(true)
  })

  it('skips for the _phase internal subcommand', () => {
    delete process.env.COHERENT_NO_UPDATE_CHECK
    // _phase output is a stdout contract consumed by Claude Code; a
    // banner would corrupt JSON / fenced-tsx ingestion.
    expect(shouldSkipUpdateCheck(['_phase', 'prep', 'plan'])).toBe(true)
  })

  it('skips for --version / -V', () => {
    delete process.env.COHERENT_NO_UPDATE_CHECK
    expect(shouldSkipUpdateCheck(['--version'])).toBe(true)
    expect(shouldSkipUpdateCheck(['-V'])).toBe(true)
  })

  it('skips for --help / -h', () => {
    delete process.env.COHERENT_NO_UPDATE_CHECK
    expect(shouldSkipUpdateCheck(['--help'])).toBe(true)
    expect(shouldSkipUpdateCheck(['-h'])).toBe(true)
  })

  it('does NOT skip for normal user-facing commands', () => {
    delete process.env.COHERENT_NO_UPDATE_CHECK
    expect(shouldSkipUpdateCheck(['chat', 'hello'])).toBe(false)
    expect(shouldSkipUpdateCheck(['init'])).toBe(false)
    expect(shouldSkipUpdateCheck(['update'])).toBe(false)
    expect(shouldSkipUpdateCheck(['fix'])).toBe(false)
    expect(shouldSkipUpdateCheck(['preview'])).toBe(false)
  })

  it('does NOT skip on an empty argv (interactive shell, no command)', () => {
    delete process.env.COHERENT_NO_UPDATE_CHECK
    expect(shouldSkipUpdateCheck([])).toBe(false)
  })
})

describe('maybePrintUpdateBanner', () => {
  let tmpHome: string
  let originalHome: string | undefined
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let consoleSpy: any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let stderrSpy: any

  beforeEach(() => {
    // Redirect HOMEDIR via the cache-dir paths we exposed in __test__.
    // The real homedir() lookup happens at module-load time (constant
    // CACHE_DIR), so we manipulate the cache file directly via __test__
    // helpers instead of monkey-patching homedir.
    tmpHome = mkdtempSync(join(tmpdir(), 'coherent-update-notifier-'))
    originalHome = process.env.HOME
    // v0.13.0 — banner goes to console.log on TTY, process.stderr.write
    // on non-TTY. Spy both so tests work regardless of test runner's
    // stdout TTY state.
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined)
    stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
  })

  afterEach(() => {
    if (originalHome === undefined) delete process.env.HOME
    else process.env.HOME = originalHome
    consoleSpy.mockRestore()
    stderrSpy.mockRestore()
    rmSync(tmpHome, { recursive: true, force: true })
    // Wipe the real cache file we may have written into ~/.coherent — the
    // module's CACHE_DIR was resolved against process.env.HOME at load
    // time, so __test__.CACHE_FILE points at the user's actual home dir
    // unless the test redirects via __test__.writeCache below.
    try {
      rmSync(__test__.CACHE_FILE, { force: true })
    } catch {
      /* ignore */
    }
  })

  it('returns false when no cache file exists', () => {
    // Pre-condition: ensure cache file is absent.
    try {
      rmSync(__test__.CACHE_FILE, { force: true })
    } catch {
      /* ignore */
    }
    expect(maybePrintUpdateBanner()).toBe(false)
    expect(consoleSpy).not.toHaveBeenCalled()
  })

  it('returns false + does not print when cached version is current', () => {
    __test__.writeCache({ latest: CLI_VERSION, checkedAt: Date.now() })
    expect(maybePrintUpdateBanner()).toBe(false)
    expect(consoleSpy).not.toHaveBeenCalled()
  })

  it('prints + returns true when cached version is newer than CLI_VERSION', () => {
    // Synthesize a "newer" version regardless of what CLI_VERSION
    // happens to be at test time. Bump the major to be safe.
    const parts = CLI_VERSION.split('.').map(Number)
    const fakeNewer = `${(parts[0] || 0) + 1}.0.0`
    __test__.writeCache({ latest: fakeNewer, checkedAt: Date.now() })

    const printed = maybePrintUpdateBanner()
    expect(printed).toBe(true)
    // v0.13.0 — banner goes to console.log on TTY, process.stderr.write on
    // non-TTY. Either spy must have been called once. Test runner's TTY
    // state varies across vitest configurations, so accept either route.
    const consoleCall = consoleSpy.mock.calls[0]?.[0] as string | undefined
    const stderrCall = stderrSpy.mock.calls[0]?.[0] as string | undefined
    const banner = consoleCall ?? stderrCall ?? ''
    expect(banner).toContain('Update available')
    expect(banner).toContain(`v${CLI_VERSION}`)
    expect(banner).toContain(`v${fakeNewer}`)
    expect(banner).toContain('npm update -g @getcoherent/cli')
  })

  it('prints LOUDER banner with migration URL when breaking flag set', () => {
    const parts = CLI_VERSION.split('.').map(Number)
    const fakeNewer = `${(parts[0] || 0) + 1}.0.0`
    __test__.writeCache({
      latest: fakeNewer,
      checkedAt: Date.now(),
      breaking: true,
      migrationUrl: 'https://github.com/skovtun/coherent-design-method/blob/main/docs/MIGRATION-v1.md',
    })
    const printed = maybePrintUpdateBanner()
    expect(printed).toBe(true)
    const consoleCall = consoleSpy.mock.calls[0]?.[0] as string | undefined
    const stderrCall = stderrSpy.mock.calls[0]?.[0] as string | undefined
    const banner = consoleCall ?? stderrCall ?? ''
    expect(banner).toContain('BREAKING')
    expect(banner).toContain('Migration:')
    expect(banner).toContain('skovtun/coherent-design-method')
  })

  it('falls back to generic CHANGELOG link when migrationUrl is rejected by allowlist', () => {
    const parts = CLI_VERSION.split('.').map(Number)
    const fakeNewer = `${(parts[0] || 0) + 1}.0.0`
    // Cache as if a malicious registry record set a phishing URL.
    // validateMigrationUrl runs at fetch time before write — but we
    // simulate the post-fetch state by writing already-validated URL.
    // For this test we directly write an undefined migrationUrl,
    // representing a record where the URL was rejected at validation.
    __test__.writeCache({
      latest: fakeNewer,
      checkedAt: Date.now(),
      breaking: true,
      migrationUrl: undefined,
    })
    const printed = maybePrintUpdateBanner()
    expect(printed).toBe(true)
    const consoleCall = consoleSpy.mock.calls[0]?.[0] as string | undefined
    const stderrCall = stderrSpy.mock.calls[0]?.[0] as string | undefined
    const banner = consoleCall ?? stderrCall ?? ''
    expect(banner).toContain('BREAKING')
    expect(banner).toContain('See CHANGELOG')
    expect(banner).toContain('blob/main/docs/CHANGELOG.md')
  })

  it('respects the dismissedFor field — no banner for that exact version', () => {
    const parts = CLI_VERSION.split('.').map(Number)
    const fakeNewer = `${(parts[0] || 0) + 1}.0.0`
    __test__.writeCache({
      latest: fakeNewer,
      checkedAt: Date.now(),
      dismissedFor: fakeNewer,
    })
    expect(maybePrintUpdateBanner()).toBe(false)
    expect(consoleSpy).not.toHaveBeenCalled()
  })

  it('treats malformed cache JSON as "no cache" — never throws', () => {
    // Manually write garbage to the cache file.
    try {
      mkdirSync(__test__.CACHE_DIR, { recursive: true })
    } catch {
      /* ignore */
    }
    writeFileSync(__test__.CACHE_FILE, '{ this is not json', 'utf-8')
    expect(() => maybePrintUpdateBanner()).not.toThrow()
    expect(consoleSpy).not.toHaveBeenCalled()
  })

  it('skips entirely when shouldSkipUpdateCheck returns true', () => {
    // Set the env opt-out → should never read cache, never print.
    const originalNoCheck = process.env.COHERENT_NO_UPDATE_CHECK
    process.env.COHERENT_NO_UPDATE_CHECK = '1'
    try {
      const parts = CLI_VERSION.split('.').map(Number)
      const fakeNewer = `${(parts[0] || 0) + 1}.0.0`
      __test__.writeCache({ latest: fakeNewer, checkedAt: Date.now() })
      expect(maybePrintUpdateBanner()).toBe(false)
      expect(consoleSpy).not.toHaveBeenCalled()
    } finally {
      if (originalNoCheck === undefined) delete process.env.COHERENT_NO_UPDATE_CHECK
      else process.env.COHERENT_NO_UPDATE_CHECK = originalNoCheck
    }
  })
})
