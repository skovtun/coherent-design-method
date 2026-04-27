/**
 * Tests for `coherent session start --quiet` and `coherent session end --quiet`
 * (v0.13.3 skill rail cleanup).
 *
 * --quiet on `start`: stdout = bare UUID + newline. Informational stderr block
 * suppressed. Errors still emit on stderr.
 *
 * --quiet on `end`: stdout = single-line `✔ Session <short> ended (<N> applied)`
 * instead of the multi-line `Applied:` block. Run-record path still written.
 */
import { describe, it, expect, afterEach, vi } from 'vitest'
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { sessionStartCommand, sessionEndCommand } from './session.js'
import { sessionStart } from '../phase-engine/session-lifecycle.js'
import { createMinimalConfig } from '../utils/minimal-config.js'

const MINIMAL_CONFIG = `export const config = ${JSON.stringify(createMinimalConfig('Test'), null, 2)} as const\n`

function setupProject(): string {
  const root = mkdtempSync(join(tmpdir(), 'coherent-session-cmd-'))
  writeFileSync(join(root, 'design-system.config.ts'), MINIMAL_CONFIG)
  return root
}

describe('sessionStartCommand --quiet', () => {
  let projectRoot: string
  afterEach(() => {
    if (projectRoot && existsSync(projectRoot)) rmSync(projectRoot, { recursive: true, force: true })
  })

  it('without --quiet: stdout = UUID, stderr = informational block', async () => {
    projectRoot = setupProject()
    const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
    try {
      await sessionStartCommand({ intent: 'test', _projectRoot: projectRoot, _throwOnError: true })
      const stdoutText = consoleLogSpy.mock.calls.map(c => c.join(' ')).join('\n')
      const stderrText = stderrSpy.mock.calls.map(c => String(c[0])).join('')
      expect(stdoutText).toMatch(/[0-9a-f-]{36}/)
      expect(stderrText).toMatch(/Session .+ started/)
      expect(stderrText).toMatch(/dir:/)
    } finally {
      stdoutSpy.mockRestore()
      consoleLogSpy.mockRestore()
      stderrSpy.mockRestore()
    }
  })

  it('with --quiet: stdout = UUID, stderr is empty (no informational block)', async () => {
    projectRoot = setupProject()
    const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
    try {
      await sessionStartCommand({ intent: 'test', quiet: true, _projectRoot: projectRoot, _throwOnError: true })
      const stdoutText = consoleLogSpy.mock.calls.map(c => c.join(' ')).join('\n')
      const stderrText = stderrSpy.mock.calls.map(c => String(c[0])).join('')
      expect(stdoutText).toMatch(/[0-9a-f-]{36}/)
      expect(stderrText).not.toMatch(/Session .+ started/)
      expect(stderrText).not.toMatch(/dir:/)
    } finally {
      stdoutSpy.mockRestore()
      consoleLogSpy.mockRestore()
      stderrSpy.mockRestore()
    }
  })
})

describe('sessionEndCommand --quiet', () => {
  let projectRoot: string
  afterEach(() => {
    if (projectRoot && existsSync(projectRoot)) rmSync(projectRoot, { recursive: true, force: true })
  })

  it('without --quiet: stdout has Applied: block', async () => {
    projectRoot = setupProject()
    const { uuid } = await sessionStart({ projectRoot })
    const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    try {
      await sessionEndCommand(uuid, { _projectRoot: projectRoot, _throwOnError: true })
      const stdoutText = consoleLogSpy.mock.calls.map(c => c.join(' ')).join('\n')
      expect(stdoutText).toMatch(/✔ Session .+ ended at/)
    } finally {
      consoleLogSpy.mockRestore()
    }
  })

  it('with --quiet: stdout is single-line summary, no Applied: block', async () => {
    projectRoot = setupProject()
    const { uuid } = await sessionStart({ projectRoot })
    const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    try {
      await sessionEndCommand(uuid, { quiet: true, _projectRoot: projectRoot, _throwOnError: true })
      const stdoutText = consoleLogSpy.mock.calls.map(c => c.join(' ')).join('\n')
      expect(stdoutText).toMatch(/✔ Session [0-9a-f]{8} ended \(\d+ applied\)/)
      expect(stdoutText).not.toMatch(/Applied:/)
      expect(stdoutText).not.toMatch(/Run record →/)
    } finally {
      consoleLogSpy.mockRestore()
    }
  })
})
