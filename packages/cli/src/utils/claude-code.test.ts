import { describe, it, expect, afterEach, vi } from 'vitest'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'fs'
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

describe('skill bodies — v0.11.4 session-shape gating (both bodies)', () => {
  let projectRoot: string
  afterEach(() => {
    if (projectRoot && existsSync(projectRoot)) rmSync(projectRoot, { recursive: true, force: true })
  })

  function readBoth(): { slashCommand: string; installedSkill: string } {
    projectRoot = mkdtempSync(join(tmpdir(), 'coherent-claude-code-shape-'))
    writeClaudeCommands(projectRoot)
    writeClaudeSkills(projectRoot)
    return {
      slashCommand: readFileSync(join(projectRoot, '.claude', 'commands', 'coherent-chat.md'), 'utf-8'),
      installedSkill: readFileSync(join(projectRoot, '.claude', 'skills', 'coherent-chat', 'SKILL.md'), 'utf-8'),
    }
  }

  // The dogfood log on v0.11.3 (delete-page Profile) showed two visible
  // problems the codex audit traced to skill body being hardcoded for the
  // full add-page flow:
  //   1. `[1/6]` counter wrong for plan-only (only 2 phases needed)
  //   2. Anchor prep errored "missing required artifact" — skill agent
  //      then guessed at runtime what to do.
  // v0.11.4 ships dynamic gating via session-shape.json. These assertions
  // catch any future regression to "everything hardcoded for 6 phases."

  it('both bodies tell the orchestrator to read session-shape.json after plan ingest', () => {
    const { slashCommand, installedSkill } = readBoth()
    expect(slashCommand).toMatch(/session-shape\.json/)
    expect(installedSkill).toMatch(/session-shape\.json/)
  })

  it('both bodies gate steps 3-6 on shape.hasAddPage', () => {
    const { slashCommand, installedSkill } = readBoth()
    for (const body of [slashCommand, installedSkill]) {
      // Anchor + extract-style + components + page each marked with the
      // "only if hasAddPage" gate. Don't be strict about exact prose
      // (other UX wording may evolve) — just that the gate is present
      // for each phase.
      const gates = (body.match(/only if `?shape\.hasAddPage`?/gi) ?? []).length
      expect(gates, 'expected gate on each of anchor / extract-style / components / page').toBeGreaterThanOrEqual(4)
    }
  })

  it('both bodies gate `coherent fix` on shape.needsFix', () => {
    const { slashCommand, installedSkill } = readBoth()
    expect(slashCommand).toMatch(/only if `?shape\.needsFix/i)
    expect(installedSkill).toMatch(/only if `?shape\.needsFix/i)
  })

  it('both bodies describe the plan-only fast path with concrete examples', () => {
    const { slashCommand, installedSkill } = readBoth()
    for (const body of [slashCommand, installedSkill]) {
      expect(body).toMatch(/plan-only/i)
      // The example sequence shape — plan → apply, no anchor / extract /
      // components / page in between. Caught the v0.11.3 dogfood bug.
      expect(body).toMatch(/session start.*plan.*session end/s)
    }
  })

  it('both bodies describe the structured completion signal', () => {
    const { slashCommand, installedSkill } = readBoth()
    for (const body of [slashCommand, installedSkill]) {
      // v0.13.3 Variant E card format: success block + Preview/Undo/Debug
      // commands + failure branch. Don't pin exact text — just that the
      // recipe + the failure branch are both documented.
      expect(body).toMatch(/✅ Applied:/)
      expect(body).toMatch(/Preview · coherent preview/)
      expect(body).toMatch(/Debug.*session/)
      expect(body).toMatch(/❌ Failed:/)
    }
  })

  it('both bodies still document the skip sentinel for components and now anchor', () => {
    const { slashCommand, installedSkill } = readBoth()
    for (const body of [slashCommand, installedSkill]) {
      expect(body).toMatch(/__COHERENT_PHASE_SKIPPED__/)
      // The expanded sentinel cases — anchor was added in v0.11.4.
      expect(body).toMatch(/Anchor.*plan has no/i)
    }
  })

  it('both bodies suppress per-phase progress chatter (v0.13.3)', () => {
    const { slashCommand, installedSkill } = readBoth()
    // The `▸ [N/M]` progress lines were removed in v0.13.3 — the Bash boxes
    // already show what's running, and the final card carries the summary.
    for (const body of [slashCommand, installedSkill]) {
      expect(body).not.toMatch(/▸ \[\d+\/\d+\]/)
      expect(body).toMatch(/Do NOT print intermediate progress lines/)
    }
  })

  it('both bodies document the discoverability hint (v0.13.7)', () => {
    const { slashCommand, installedSkill } = readBoth()
    for (const body of [slashCommand, installedSkill]) {
      // The 📍 hint instruction must be present.
      expect(body).toMatch(/📍/)
      // All 3 classifications mentioned with their templates.
      expect(body).toMatch(/TOP-LEVEL/)
      expect(body).toMatch(/INTERNAL/)
      expect(body).toMatch(/DETAIL/)
      // At least one concrete next-step coherent chat invocation per type.
      expect(body).toMatch(/coherent chat "add .+ to the main nav"/)
      expect(body).toMatch(/coherent chat "add a .+ link to the/)
      expect(body).toMatch(/coherent chat "in .+, make each/)
      // Skip rule when no add-page in applied.
      expect(body).toMatch(/Skip the 📍 line entirely if/)
    }
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

describe('writeClaudeSkills user-customization preservation', () => {
  let projectRoot: string
  afterEach(() => {
    if (projectRoot && existsSync(projectRoot)) {
      rmSync(projectRoot, { recursive: true, force: true })
    }
  })

  it('preserves user-modified coherent-chat/SKILL.md by backing it up', () => {
    projectRoot = mkdtempSync(join(tmpdir(), 'coherent-claude-code-'))
    const dirChat = join(projectRoot, '.claude', 'skills', 'coherent-chat')
    mkdirSync(dirChat, { recursive: true })
    const userContent = '# user customized skill body\n\nWith my custom rules.\n'
    writeFileSync(join(dirChat, 'SKILL.md'), userContent, 'utf-8')

    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    writeClaudeSkills(projectRoot)
    log.mockRestore()

    // Canonical now in place
    const canonical = readFileSync(join(dirChat, 'SKILL.md'), 'utf-8')
    expect(canonical).not.toBe(userContent)
    expect(canonical).toContain('phase_engine_protocol')

    // Backup created under .coherent/backups/skills/
    const backupDir = join(projectRoot, '.coherent', 'backups', 'skills')
    expect(existsSync(backupDir)).toBe(true)
    const backups = readdirSync(backupDir).filter((f: string) => f.startsWith('coherent-chat-SKILL-'))
    expect(backups.length).toBe(1)
    expect(readFileSync(join(backupDir, backups[0]), 'utf-8')).toBe(userContent)
  })

  it('writes lock file recording canonical hashes after first write', () => {
    projectRoot = mkdtempSync(join(tmpdir(), 'coherent-claude-code-'))
    writeClaudeSkills(projectRoot)

    const lockPath = join(projectRoot, '.coherent', 'skills.lock.json')
    expect(existsSync(lockPath)).toBe(true)
    const lock = JSON.parse(readFileSync(lockPath, 'utf-8')) as Record<string, string>
    expect(lock['coherent-chat']).toMatch(/^[a-f0-9]{64}$/)
    expect(lock['frontend-ux']).toMatch(/^[a-f0-9]{64}$/)
  })

  it('does NOT back up an untouched canonical file across re-runs', () => {
    projectRoot = mkdtempSync(join(tmpdir(), 'coherent-claude-code-'))

    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    writeClaudeSkills(projectRoot) // first install — canonical written, lock created
    writeClaudeSkills(projectRoot) // second run — file untouched, no backup
    log.mockRestore()

    const backupDir = join(projectRoot, '.coherent', 'backups', 'skills')
    expect(existsSync(backupDir)).toBe(false)
  })

  it('preserves user customization to frontend-ux/SKILL.md too', () => {
    projectRoot = mkdtempSync(join(tmpdir(), 'coherent-claude-code-'))
    const dirFrontend = join(projectRoot, '.claude', 'skills', 'frontend-ux')
    mkdirSync(dirFrontend, { recursive: true })
    const userContent = '# my custom frontend-ux\n'
    writeFileSync(join(dirFrontend, 'SKILL.md'), userContent, 'utf-8')

    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    writeClaudeSkills(projectRoot)
    log.mockRestore()

    const backupDir = join(projectRoot, '.coherent', 'backups', 'skills')
    expect(existsSync(backupDir)).toBe(true)
    const backups = readdirSync(backupDir).filter((f: string) => f.startsWith('frontend-ux-SKILL-'))
    expect(backups.length).toBe(1)
    expect(readFileSync(join(backupDir, backups[0]), 'utf-8')).toBe(userContent)
  })
})
