/**
 * Schema guard for `coherentReleaseFlags` in published package.json files.
 *
 * Catches the v0.13.0/v0.13.1 incident: update-notifier reads `coherentReleaseFlags`
 * from the registry, but the field was never present in any published tarball
 * because the maintainer step to add it was undocumented and unenforced.
 *
 * This test runs on every CI build. Two guarantees:
 *  1. If the field IS present in either package.json, its shape is valid
 *     (no typos like `breaking_change`, no malformed migrationUrl).
 *  2. The field is consistent across BOTH packages (if one declares breaking,
 *     so must the other — they ship together as a pair).
 */
import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = join(__dirname, '..', '..', '..', '..')
const CLI_PKG = join(REPO_ROOT, 'packages', 'cli', 'package.json')
const CORE_PKG = join(REPO_ROOT, 'packages', 'core', 'package.json')

interface ReleaseFlags {
  breaking?: boolean
  migrationUrl?: string
}

interface PackageJson {
  name: string
  version: string
  coherentReleaseFlags?: ReleaseFlags
}

function readPkg(path: string): PackageJson {
  return JSON.parse(readFileSync(path, 'utf-8')) as PackageJson
}

describe('coherentReleaseFlags schema', () => {
  it('CLI and core package.json files exist (smoke)', () => {
    expect(existsSync(CLI_PKG)).toBe(true)
    expect(existsSync(CORE_PKG)).toBe(true)
  })

  it.each([
    ['cli', CLI_PKG],
    ['core', CORE_PKG],
  ])('%s package.json — coherentReleaseFlags shape valid if present', (_label, path) => {
    const pkg = readPkg(path)
    const flags = pkg.coherentReleaseFlags
    if (flags === undefined) return // not a breaking release — field absent is correct

    expect(flags).toBeTypeOf('object')

    // Allowed keys only
    const allowedKeys = ['breaking', 'migrationUrl']
    for (const key of Object.keys(flags)) {
      expect(allowedKeys, `Unknown coherentReleaseFlags key '${key}' — typo?`).toContain(key)
    }

    if ('breaking' in flags) {
      expect(typeof flags.breaking).toBe('boolean')
    }

    if ('migrationUrl' in flags) {
      expect(typeof flags.migrationUrl).toBe('string')
      expect(flags.migrationUrl).toMatch(/^https:\/\//)
      // Note: full host-allowlist validation lives in update-notifier.ts
      // (consumer side). Off-allowlist URLs are rejected at runtime — this
      // test only catches malformed URLs at publish time.
    }
  })

  it('cli and core agree on breaking-flag state — published as a pair', () => {
    const cli = readPkg(CLI_PKG)
    const core = readPkg(CORE_PKG)

    const cliBreaking = cli.coherentReleaseFlags?.breaking ?? false
    const coreBreaking = core.coherentReleaseFlags?.breaking ?? false

    expect(
      cliBreaking,
      'CLI and core package.json must agree on coherentReleaseFlags.breaking — they ship together as a pair',
    ).toBe(coreBreaking)
  })

  it('cli and core agree on migrationUrl', () => {
    const cli = readPkg(CLI_PKG)
    const core = readPkg(CORE_PKG)

    const cliUrl = cli.coherentReleaseFlags?.migrationUrl
    const coreUrl = core.coherentReleaseFlags?.migrationUrl

    expect(cliUrl).toBe(coreUrl)
  })

  it('versions match between cli and core', () => {
    const cli = readPkg(CLI_PKG)
    const core = readPkg(CORE_PKG)
    expect(cli.version).toBe(core.version)
  })
})
