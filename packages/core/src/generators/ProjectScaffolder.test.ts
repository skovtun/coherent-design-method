import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { ProjectScaffolder } from './ProjectScaffolder.js'
import { EXAMPLE_MULTIPAGE_CONFIG } from '../types/design-system.js'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import * as path from 'node:path'

describe('ProjectScaffolder.generateGlobalsCss', () => {
  let tmpDir: string
  let scaffolder: ProjectScaffolder

  beforeEach(() => {
    tmpDir = mkdtempSync(path.join(tmpdir(), 'scaffolder-'))
    scaffolder = new ProjectScaffolder(EXAMPLE_MULTIPAGE_CONFIG, tmpDir)
  })

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true })
  })

  it('includes sidebar CSS variables', async () => {
    await scaffolder.generateGlobalsCss()
    const css = readFileSync(path.join(tmpDir, 'app', 'globals.css'), 'utf-8')

    expect(css).toContain('--sidebar-background:')
    expect(css).toContain('--sidebar-foreground:')
    expect(css).toContain('--sidebar-primary:')
    expect(css).toContain('--sidebar-accent:')
    expect(css).toContain('--sidebar-border:')
    expect(css).toContain('--sidebar-ring:')
  })

  it('includes chart CSS variables', async () => {
    await scaffolder.generateGlobalsCss()
    const css = readFileSync(path.join(tmpDir, 'app', 'globals.css'), 'utf-8')

    for (let i = 1; i <= 5; i++) {
      expect(css).toContain(`--chart-${i}:`)
    }
  })
})
