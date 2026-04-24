import { describe, it, expect, afterEach, vi } from 'vitest'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { COHERENT_GENERATE_SKILL_BODY, readSkillProtocol, writeClaudeSkills } from './claude-code.js'
import { PHASE_ENGINE_PROTOCOL } from '../phase-engine/phase-registry.js'

describe('writeClaudeSkills', () => {
  let projectRoot: string
  afterEach(() => {
    if (projectRoot && existsSync(projectRoot)) {
      rmSync(projectRoot, { recursive: true, force: true })
    }
  })

  it('writes three skills: coherent-project, frontend-ux, coherent-generate', () => {
    projectRoot = mkdtempSync(join(tmpdir(), 'coherent-claude-code-'))
    writeClaudeSkills(projectRoot)

    const skillsRoot = join(projectRoot, '.claude', 'skills')
    expect(existsSync(join(skillsRoot, 'coherent-project', 'SKILL.md'))).toBe(true)
    expect(existsSync(join(skillsRoot, 'frontend-ux', 'SKILL.md'))).toBe(true)
    expect(existsSync(join(skillsRoot, 'coherent-generate', 'SKILL.md'))).toBe(true)
  })

  it('orchestrator skill markdown has correct frontmatter', () => {
    projectRoot = mkdtempSync(join(tmpdir(), 'coherent-claude-code-'))
    writeClaudeSkills(projectRoot)

    const body = readFileSync(join(projectRoot, '.claude', 'skills', 'coherent-generate', 'SKILL.md'), 'utf-8')
    expect(body.startsWith('---\n')).toBe(true)
    expect(body).toMatch(/^name: coherent-generate$/m)
    expect(body).toMatch(/^description:.*phase-engine.*$/m)
  })

  it('orchestrator skill references all 6 phase-engine CLI invocations', () => {
    projectRoot = mkdtempSync(join(tmpdir(), 'coherent-claude-code-'))
    writeClaudeSkills(projectRoot)

    const body = readFileSync(join(projectRoot, '.claude', 'skills', 'coherent-generate', 'SKILL.md'), 'utf-8')

    // Lifecycle
    expect(body).toMatch(/coherent session start/)
    expect(body).toMatch(/coherent session end/)

    // AI phases — prep + ingest pairs
    for (const phase of ['plan', 'anchor', 'components']) {
      expect(body, phase).toMatch(new RegExp(`coherent _phase prep ${phase}`))
      expect(body, phase).toMatch(new RegExp(`coherent _phase ingest ${phase}`))
    }

    // Page phase uses the page:<id> form
    expect(body).toMatch(/coherent _phase prep page:<pageId>/)
    expect(body).toMatch(/coherent _phase ingest page:<pageId>/)

    // Deterministic phases use `run`
    expect(body).toMatch(/coherent _phase run extract-style/)
    expect(body).toMatch(/coherent _phase run log-run/)
  })

  it('orchestrator skill documents the session flow order', () => {
    projectRoot = mkdtempSync(join(tmpdir(), 'coherent-claude-code-'))
    writeClaudeSkills(projectRoot)

    const body = readFileSync(join(projectRoot, '.claude', 'skills', 'coherent-generate', 'SKILL.md'), 'utf-8')

    const order = ['session start', 'plan', 'anchor', 'extract-style', 'components', 'page', 'log-run', 'session end']
    let lastIndex = -1
    for (const marker of order) {
      const idx = body.indexOf(marker, lastIndex + 1)
      expect(idx, `marker "${marker}" not found after previous`).toBeGreaterThan(lastIndex)
      lastIndex = idx
    }
  })
})

describe('skill-markdown protocol embed (R5)', () => {
  it('declares phase_engine_protocol in frontmatter', () => {
    expect(COHERENT_GENERATE_SKILL_BODY).toMatch(
      new RegExp(`^phase_engine_protocol:\\s*${PHASE_ENGINE_PROTOCOL}\\s*$`, 'm'),
    )
  })

  it('every `coherent _phase` invocation carries --protocol <N>', () => {
    // Strip backtick-fenced lines that document the flag contract (so we
    // only inspect actual bash invocations, not the explanatory prose).
    const invocations = COHERENT_GENERATE_SKILL_BODY.split('\n').filter(line => /^coherent _phase /.test(line.trim()))
    expect(invocations.length, 'expected at least one _phase invocation').toBeGreaterThan(0)

    const missing = invocations.filter(line => !new RegExp(`--protocol\\s+${PHASE_ENGINE_PROTOCOL}\\b`).test(line))
    expect(missing, `invocations without --protocol ${PHASE_ENGINE_PROTOCOL}`).toEqual([])
  })

  it('readSkillProtocol parses a well-formed frontmatter value', () => {
    expect(readSkillProtocol(COHERENT_GENERATE_SKILL_BODY)).toBe(PHASE_ENGINE_PROTOCOL)
  })

  it('readSkillProtocol returns null when frontmatter lacks the key', () => {
    expect(readSkillProtocol('---\nname: anything\n---\nbody')).toBeNull()
  })

  it('readSkillProtocol returns null for non-numeric values', () => {
    expect(readSkillProtocol('---\nphase_engine_protocol: not-a-number\n---\nbody')).toBeNull()
  })
})

describe('writeClaudeSkills refresh notice (R5)', () => {
  let projectRoot: string
  afterEach(() => {
    if (projectRoot && existsSync(projectRoot)) {
      rmSync(projectRoot, { recursive: true, force: true })
    }
  })

  it('logs a refresh notice when existing markdown declares an older protocol', () => {
    projectRoot = mkdtempSync(join(tmpdir(), 'coherent-claude-code-'))
    const dirGenerate = join(projectRoot, '.claude', 'skills', 'coherent-generate')
    mkdirSync(dirGenerate, { recursive: true })
    const older = PHASE_ENGINE_PROTOCOL - 1
    writeFileSync(
      join(dirGenerate, 'SKILL.md'),
      `---\nname: coherent-generate\nphase_engine_protocol: ${older}\n---\n`,
      'utf-8',
    )

    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    writeClaudeSkills(projectRoot)
    const notices = log.mock.calls.map(call => call.join(' ')).filter(msg => /Refreshing coherent-generate/.test(msg))
    log.mockRestore()

    expect(notices.length).toBe(1)
    expect(notices[0]).toContain(`${older} → ${PHASE_ENGINE_PROTOCOL}`)
  })

  it('stays silent when markdown is fresh or missing', () => {
    projectRoot = mkdtempSync(join(tmpdir(), 'coherent-claude-code-'))

    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    writeClaudeSkills(projectRoot) // first write — no existing file
    const firstBatch = log.mock.calls.map(call => call.join(' ')).filter(msg => /Refreshing/.test(msg))
    log.mockClear()

    writeClaudeSkills(projectRoot) // second write — existing file is already current
    const secondBatch = log.mock.calls.map(call => call.join(' ')).filter(msg => /Refreshing/.test(msg))
    log.mockRestore()

    expect(firstBatch).toEqual([])
    expect(secondBatch).toEqual([])
  })
})
