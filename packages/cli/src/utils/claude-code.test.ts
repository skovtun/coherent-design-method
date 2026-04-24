import { describe, it, expect, afterEach } from 'vitest'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { writeClaudeSkills } from './claude-code.js'

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
