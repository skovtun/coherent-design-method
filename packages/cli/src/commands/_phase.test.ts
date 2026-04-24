import { describe, it, expect, afterEach } from 'vitest'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { phaseCommand } from './_phase.js'
import { sessionStart } from '../phase-engine/session-lifecycle.js'
import { PHASE_ENGINE_PROTOCOL } from '../phase-engine/phase-registry.js'

const MINIMAL_CONFIG = `export const config = {
  meta: { name: 'Test', version: '0.1.0' },
  tokens: { color: {}, typography: {}, spacing: {} },
  components: [],
} as const
`

function setupProject(): string {
  const root = mkdtempSync(join(tmpdir(), 'coherent-phase-cmd-'))
  writeFileSync(join(root, 'design-system.config.ts'), MINIMAL_CONFIG)
  return root
}

describe('phaseCommand', () => {
  let projectRoot: string
  afterEach(() => {
    if (projectRoot && existsSync(projectRoot)) {
      rmSync(projectRoot, { recursive: true, force: true })
    }
  })

  it('prep writes the phase prompt via _writeStdout', async () => {
    projectRoot = setupProject()
    const { uuid } = await sessionStart({ projectRoot })

    // Seed log-run input (deterministic phase in registry but we're testing prep
    // on an AI phase, so use plan which needs plan-input.json).
    const planInput = {
      message: 'build a CRM dashboard',
      config: {
        name: 'Test',
        navigation: { type: 'header' },
        pages: [],
      },
    }
    writeFileSync(join(projectRoot, '.coherent', 'session', uuid, 'plan-input.json'), JSON.stringify(planInput))

    let captured = ''
    await phaseCommand('prep', 'plan', {
      session: uuid,
      _projectRoot: projectRoot,
      _writeStdout: chunk => {
        captured += chunk
      },
      _throwOnError: true,
    })
    expect(captured.length).toBeGreaterThan(0)
    expect(captured).toContain('build a CRM dashboard')
  })

  it('ingest parses stdin and writes phase artifacts', async () => {
    projectRoot = setupProject()
    const { uuid } = await sessionStart({ projectRoot })
    const sessionDir = join(projectRoot, '.coherent', 'session', uuid)

    // Minimal valid plan response.
    const planResponse = JSON.stringify({
      navigation: { type: 'sidebar' },
      requests: [
        { type: 'add-page', changes: { name: 'Home', id: 'home', route: '/' } },
        { type: 'add-page', changes: { name: 'Pricing', id: 'pricing', route: '/pricing' } },
      ],
    })

    // plan-input.json must exist because ingest reads it to derive appName
    // from the user's original message. Mirror the prep test's shape.
    writeFileSync(
      join(sessionDir, 'plan-input.json'),
      JSON.stringify({
        message: 'build CRM',
        config: { name: 'Test', navigation: { type: 'header' }, pages: [] },
      }),
    )

    await phaseCommand('ingest', 'plan', {
      session: uuid,
      _projectRoot: projectRoot,
      _stdin: planResponse,
      _throwOnError: true,
    })

    expect(existsSync(join(sessionDir, 'plan.json'))).toBe(true)
    const plan = JSON.parse(readFileSync(join(sessionDir, 'plan.json'), 'utf-8'))
    expect(plan.navigationType).toBe('sidebar')
    expect(plan.pageNames).toHaveLength(2)
  })

  it('run executes a deterministic phase', async () => {
    projectRoot = setupProject()
    const { uuid } = await sessionStart({ projectRoot })
    const sessionDir = join(projectRoot, '.coherent', 'session', uuid)

    // extract-style reads an anchor artifact. Seed a minimal one.
    writeFileSync(
      join(sessionDir, 'anchor.json'),
      JSON.stringify({
        pageId: 'home',
        pageCode: 'export default function Home() { return <div className="bg-primary">hi</div> }',
      }),
    )

    await phaseCommand('run', 'extract-style', {
      session: uuid,
      _projectRoot: projectRoot,
      _throwOnError: true,
    })

    // extract-style writes style.json or similar — check any new artifact landed.
    const afterFiles = require('fs').readdirSync(sessionDir)
    expect(afterFiles.some((f: string) => f.startsWith('style'))).toBe(true)
  })

  it('rejects `run` on an AI phase with a helpful message', async () => {
    projectRoot = setupProject()
    const { uuid } = await sessionStart({ projectRoot })
    await expect(
      phaseCommand('run', 'plan', { session: uuid, _projectRoot: projectRoot, _throwOnError: true }),
    ).rejects.toThrow(/use `coherent _phase prep plan`/)
  })

  it('rejects `prep` on a deterministic phase', async () => {
    projectRoot = setupProject()
    const { uuid } = await sessionStart({ projectRoot })
    await expect(
      phaseCommand('prep', 'extract-style', {
        session: uuid,
        _projectRoot: projectRoot,
        _throwOnError: true,
      }),
    ).rejects.toThrow(/use `coherent _phase run extract-style`/)
  })

  it('rejects mismatched --protocol', async () => {
    projectRoot = setupProject()
    const { uuid } = await sessionStart({ projectRoot })
    await expect(
      phaseCommand('prep', 'plan', {
        session: uuid,
        protocol: String(PHASE_ENGINE_PROTOCOL + 99),
        _projectRoot: projectRoot,
        _throwOnError: true,
      }),
    ).rejects.toThrow(/Protocol mismatch/)
  })

  it('accepts matching --protocol', async () => {
    projectRoot = setupProject()
    const { uuid } = await sessionStart({ projectRoot })
    writeFileSync(
      join(projectRoot, '.coherent', 'session', uuid, 'plan-input.json'),
      JSON.stringify({ message: 'x', config: { name: 'Test', navigation: { type: 'header' }, pages: [] } }),
    )
    let captured = ''
    await phaseCommand('prep', 'plan', {
      session: uuid,
      protocol: String(PHASE_ENGINE_PROTOCOL),
      _projectRoot: projectRoot,
      _writeStdout: c => {
        captured += c
      },
      _throwOnError: true,
    })
    expect(captured.length).toBeGreaterThan(0)
  })

  it('rejects missing --session', async () => {
    projectRoot = setupProject()
    await expect(phaseCommand('prep', 'plan', { _projectRoot: projectRoot, _throwOnError: true })).rejects.toThrow(
      /--session <uuid> is required/,
    )
  })

  it('rejects unknown session uuid', async () => {
    projectRoot = setupProject()
    await expect(
      phaseCommand('prep', 'plan', {
        session: 'no-such-uuid',
        _projectRoot: projectRoot,
        _throwOnError: true,
      }),
    ).rejects.toThrow(/Session no-such-uuid not found/)
  })

  it('rejects unknown phase name', async () => {
    projectRoot = setupProject()
    const { uuid } = await sessionStart({ projectRoot })
    await expect(
      phaseCommand('prep', 'nope', { session: uuid, _projectRoot: projectRoot, _throwOnError: true }),
    ).rejects.toThrow(/Unknown phase/)
  })

  it('ingest rejects empty stdin', async () => {
    projectRoot = setupProject()
    const { uuid } = await sessionStart({ projectRoot })
    await expect(
      phaseCommand('ingest', 'plan', {
        session: uuid,
        _projectRoot: projectRoot,
        _stdin: '',
        _throwOnError: true,
      }),
    ).rejects.toThrow(/empty stdin/)
  })
})
