import { describe, it, expect, afterEach, vi } from 'vitest'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { COHERENT_CHAT_SKILL_BODY, readSkillProtocol, writeClaudeCommands, writeClaudeSkills } from './claude-code.js'
import { PHASE_ENGINE_PROTOCOL } from '../phase-engine/phase-registry.js'

describe('writeClaudeSkills', () => {
  let projectRoot: string
  afterEach(() => {
    if (projectRoot && existsSync(projectRoot)) {
      rmSync(projectRoot, { recursive: true, force: true })
    }
  })

  it('writes two skills: frontend-ux, coherent-chat', () => {
    projectRoot = mkdtempSync(join(tmpdir(), 'coherent-claude-code-'))
    writeClaudeSkills(projectRoot)

    const skillsRoot = join(projectRoot, '.claude', 'skills')
    expect(existsSync(join(skillsRoot, 'frontend-ux', 'SKILL.md'))).toBe(true)
    expect(existsSync(join(skillsRoot, 'coherent-chat', 'SKILL.md'))).toBe(true)
    // Legacy skills must be cleaned up on refresh.
    expect(existsSync(join(skillsRoot, 'coherent-project'))).toBe(false)
    expect(existsSync(join(skillsRoot, 'coherent-generate'))).toBe(false)
  })

  it('orchestrator skill markdown has correct frontmatter', () => {
    projectRoot = mkdtempSync(join(tmpdir(), 'coherent-claude-code-'))
    writeClaudeSkills(projectRoot)

    const body = readFileSync(join(projectRoot, '.claude', 'skills', 'coherent-chat', 'SKILL.md'), 'utf-8')
    expect(body.startsWith('---\n')).toBe(true)
    expect(body).toMatch(/^name: coherent-chat$/m)
    expect(body).toMatch(/^description:.*Coherent Design Method.*$/m)
  })

  it('orchestrator skill references all 6 phase-engine CLI invocations', () => {
    projectRoot = mkdtempSync(join(tmpdir(), 'coherent-claude-code-'))
    writeClaudeSkills(projectRoot)

    const body = readFileSync(join(projectRoot, '.claude', 'skills', 'coherent-chat', 'SKILL.md'), 'utf-8')

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
    // log-run is NOT called by the skill rail — session end composes the
    // run-record internally (codex R2 P1 #6). Keep it out of the skill
    // markdown so users don't hit "missing run-record.json".
    expect(body).not.toMatch(/coherent _phase run log-run/)
  })

  it('orchestrator skill documents the session flow order', () => {
    projectRoot = mkdtempSync(join(tmpdir(), 'coherent-claude-code-'))
    writeClaudeSkills(projectRoot)

    const body = readFileSync(join(projectRoot, '.claude', 'skills', 'coherent-chat', 'SKILL.md'), 'utf-8')

    const order = ['session start', 'plan', 'anchor', 'extract-style', 'components', 'page', 'session end']
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
    expect(COHERENT_CHAT_SKILL_BODY).toMatch(
      new RegExp(`^phase_engine_protocol:\\s*${PHASE_ENGINE_PROTOCOL}\\s*$`, 'm'),
    )
  })

  it('every `coherent _phase` invocation carries --protocol <N>', () => {
    // Strip backtick-fenced lines that document the flag contract (so we
    // only inspect actual bash invocations, not the explanatory prose).
    const invocations = COHERENT_CHAT_SKILL_BODY.split('\n').filter(line => /^coherent _phase /.test(line.trim()))
    expect(invocations.length, 'expected at least one _phase invocation').toBeGreaterThan(0)

    const missing = invocations.filter(line => !new RegExp(`--protocol\\s+${PHASE_ENGINE_PROTOCOL}\\b`).test(line))
    expect(missing, `invocations without --protocol ${PHASE_ENGINE_PROTOCOL}`).toEqual([])
  })

  it('readSkillProtocol parses a well-formed frontmatter value', () => {
    expect(readSkillProtocol(COHERENT_CHAT_SKILL_BODY)).toBe(PHASE_ENGINE_PROTOCOL)
  })

  it('readSkillProtocol returns null when frontmatter lacks the key', () => {
    expect(readSkillProtocol('---\nname: anything\n---\nbody')).toBeNull()
  })

  it('readSkillProtocol returns null for non-numeric values', () => {
    expect(readSkillProtocol('---\nphase_engine_protocol: not-a-number\n---\nbody')).toBeNull()
  })
})

describe('slash command coherent-chat (codex R3 P1 #7)', () => {
  let projectRoot: string
  afterEach(() => {
    if (projectRoot && existsSync(projectRoot)) {
      rmSync(projectRoot, { recursive: true, force: true })
    }
  })

  function readCommand(): string {
    projectRoot = mkdtempSync(join(tmpdir(), 'coherent-claude-code-'))
    writeClaudeCommands(projectRoot)
    return readFileSync(join(projectRoot, '.claude', 'commands', 'coherent-chat.md'), 'utf-8')
  }

  it('drives the new phase-engine rail, not the legacy `coherent prompt` flow', () => {
    const body = readCommand()
    // Legacy flow anchors absent.
    expect(body).not.toMatch(/coherent prompt/)
    // New-rail anchors present.
    expect(body).toMatch(/coherent session start/)
    expect(body).toMatch(/coherent session end/)
    expect(body).toMatch(/coherent _phase prep plan/)
    expect(body).toMatch(/coherent _phase run extract-style/)
  })

  it('allowed-tools grant the new-rail CLI subcommands', () => {
    const body = readCommand()
    // Single broad `coherent *` pattern covers `coherent session`,
    // `coherent _phase`, `coherent check`, `coherent fix` — and most
    // importantly, also matches when Claude Code occasionally chains a
    // pipe or redirection. Earlier per-subcommand patterns gated every
    // step behind a "Do you want to proceed?" prompt because the matcher
    // takes the full command string literally.
    expect(body).toMatch(/allowed-tools:.*Bash\(coherent \*\)/)
    // No longer needs direct Write for TSX files — session end does that.
    // Still grants Read (for session/plan.json inspection) and Write (for
    // response-file piping) — both retained.
    expect(body).toMatch(/allowed-tools:.*Read/)
    expect(body).toMatch(/allowed-tools:.*Write/)
  })

  it('every `coherent _phase` call carries --protocol <N>', () => {
    const body = readCommand()
    const invocations = body.split('\n').filter(line => /^coherent _phase /.test(line.trim()))
    expect(invocations.length).toBeGreaterThan(0)
    const missing = invocations.filter(line => !new RegExp(`--protocol\\s+${PHASE_ENGINE_PROTOCOL}\\b`).test(line))
    expect(missing, `invocations without --protocol ${PHASE_ENGINE_PROTOCOL}`).toEqual([])
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
    const dirChat = join(projectRoot, '.claude', 'skills', 'coherent-chat')
    mkdirSync(dirChat, { recursive: true })
    const older = PHASE_ENGINE_PROTOCOL - 1
    writeFileSync(
      join(dirChat, 'SKILL.md'),
      `---\nname: coherent-chat\nphase_engine_protocol: ${older}\n---\n`,
      'utf-8',
    )

    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    writeClaudeSkills(projectRoot)
    const notices = log.mock.calls.map(call => call.join(' ')).filter(msg => /Refreshing coherent-chat/.test(msg))
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

  it('cleans up legacy coherent-project and coherent-generate skill directories', () => {
    projectRoot = mkdtempSync(join(tmpdir(), 'coherent-claude-code-'))
    const skillsRoot = join(projectRoot, '.claude', 'skills')
    mkdirSync(join(skillsRoot, 'coherent-project'), { recursive: true })
    writeFileSync(join(skillsRoot, 'coherent-project', 'SKILL.md'), 'stale', 'utf-8')
    mkdirSync(join(skillsRoot, 'coherent-generate'), { recursive: true })
    writeFileSync(join(skillsRoot, 'coherent-generate', 'SKILL.md'), 'stale', 'utf-8')
    mkdirSync(join(projectRoot, '.claude', 'commands'), { recursive: true })
    writeFileSync(join(projectRoot, '.claude', 'commands', 'coherent-generate.md'), 'stale', 'utf-8')

    writeClaudeSkills(projectRoot)

    expect(existsSync(join(skillsRoot, 'coherent-project'))).toBe(false)
    expect(existsSync(join(skillsRoot, 'coherent-generate'))).toBe(false)
    expect(existsSync(join(projectRoot, '.claude', 'commands', 'coherent-generate.md'))).toBe(false)
  })
})
