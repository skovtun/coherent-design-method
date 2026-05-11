import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import * as path from 'node:path'
import { clusterCommand } from './cluster.js'
import { SCHEMA_VERSION, type ScanOutput } from '../scan/json-output.js'

const sampleScanOutput: ScanOutput = {
  metadata: {
    schema_version: SCHEMA_VERSION,
    adapter: 'blade',
    scanned_at: '2026-05-11T12:00:00.000Z',
    project_root: '/tmp/test',
    files_scanned: 2,
    duration_ms: 5,
  },
  rows: [
    {
      file: 'a.blade.php',
      line: 1,
      kind: 'inline_classes',
      raw_class_string: 'lb-label',
      surrounding_context: '',
    },
    {
      file: 'b.blade.php',
      line: 1,
      kind: 'inline_classes',
      raw_class_string: 'lb-label',
      surrounding_context: '',
    },
    {
      file: 'c.blade.php',
      line: 3,
      kind: 'raw_button_tag',
      raw_class_string: 'btn primary',
      surrounding_context: '',
    },
  ],
}

describe('coherent cluster', () => {
  let tmpDir: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let exitSpy: any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let errSpy: any

  beforeEach(() => {
    tmpDir = mkdtempSync(path.join(tmpdir(), 'cluster-test-'))
    exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('PROCESS_EXIT')
    }) as never)
    errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true })
    vi.restoreAllMocks()
  })

  it('fails fast in non-TTY without --yes (CI safety gate)', async () => {
    const inputPath = path.join(tmpDir, 'evidence.json')
    writeFileSync(inputPath, JSON.stringify(sampleScanOutput))
    // Force non-TTY by setting stdout.isTTY to false (vitest stdout has no
    // accessor by default, so we install a plain value descriptor).
    const prior = Object.getOwnPropertyDescriptor(process.stdout, 'isTTY')
    Object.defineProperty(process.stdout, 'isTTY', { configurable: true, value: false })
    try {
      await expect(clusterCommand(inputPath, { out: path.join(tmpDir, 'out.md') })).rejects.toThrow('PROCESS_EXIT')
      expect(exitSpy).toHaveBeenCalledWith(1)
      const messages = errSpy.mock.calls.map((c: unknown[]) => String(c[0])).join('\n')
      expect(messages).toMatch(/interactive confirmation or `--yes`/)
    } finally {
      if (prior) Object.defineProperty(process.stdout, 'isTTY', prior)
      else delete (process.stdout as unknown as { isTTY?: boolean }).isTTY
    }
  })

  it('fails when ANTHROPIC_API_KEY is missing (LLM path)', async () => {
    const inputPath = path.join(tmpDir, 'evidence.json')
    writeFileSync(inputPath, JSON.stringify(sampleScanOutput))
    const prior = process.env.ANTHROPIC_API_KEY
    delete process.env.ANTHROPIC_API_KEY
    try {
      await expect(
        clusterCommand(inputPath, { out: path.join(tmpDir, 'out.md'), yes: true, cache: false }),
      ).rejects.toThrow('PROCESS_EXIT')
      const messages = errSpy.mock.calls.map((c: unknown[]) => String(c[0])).join('\n')
      expect(messages).toMatch(/ANTHROPIC_API_KEY/)
    } finally {
      if (prior) process.env.ANTHROPIC_API_KEY = prior
    }
  })

  it('writes COHERENT-DESIGN.md with DRAFT banner on --no-llm', async () => {
    const inputPath = path.join(tmpDir, 'evidence.json')
    const outPath = path.join(tmpDir, 'COHERENT-DESIGN.md')
    writeFileSync(inputPath, JSON.stringify(sampleScanOutput))
    await clusterCommand(inputPath, { out: outPath, llm: false })
    expect(existsSync(outPath)).toBe(true)
    const md = readFileSync(outPath, 'utf8')
    expect(md).toContain('# Coherent Design (DRAFT)')
    expect(md).toContain('DRAFT — auto-generated from code')
    expect(md).toContain('lb-label-cluster-')
  })

  it('errors when evidence file is missing', async () => {
    await expect(
      clusterCommand(path.join(tmpDir, 'nope.json'), {
        llm: false,
        out: path.join(tmpDir, 'out.md'),
      }),
    ).rejects.toThrow('PROCESS_EXIT')
    const messages = errSpy.mock.calls.map((c: unknown[]) => String(c[0])).join('\n')
    expect(messages).toMatch(/cannot read/)
  })

  it('errors when evidence is invalid JSON', async () => {
    const inputPath = path.join(tmpDir, 'bad.json')
    writeFileSync(inputPath, '{ malformed')
    await expect(clusterCommand(inputPath, { llm: false, out: path.join(tmpDir, 'out.md') })).rejects.toThrow(
      'PROCESS_EXIT',
    )
    const messages = errSpy.mock.calls.map((c: unknown[]) => String(c[0])).join('\n')
    expect(messages).toMatch(/not valid JSON/)
  })

  it('errors when evidence does not match ScanOutput schema', async () => {
    const inputPath = path.join(tmpDir, 'wrong-shape.json')
    writeFileSync(inputPath, JSON.stringify({ hello: 'world' }))
    await expect(clusterCommand(inputPath, { llm: false, out: path.join(tmpDir, 'out.md') })).rejects.toThrow(
      'PROCESS_EXIT',
    )
    const messages = errSpy.mock.calls.map((c: unknown[]) => String(c[0])).join('\n')
    expect(messages).toMatch(/does not match ScanOutput schema/)
  })

  it('warns on schema_version mismatch but still writes output', async () => {
    const inputPath = path.join(tmpDir, 'evidence.json')
    const outPath = path.join(tmpDir, 'COHERENT-DESIGN.md')
    const future: ScanOutput = {
      ...sampleScanOutput,
      metadata: { ...sampleScanOutput.metadata, schema_version: '2.0.0' },
    }
    writeFileSync(inputPath, JSON.stringify(future))
    await clusterCommand(inputPath, { llm: false, out: outPath })
    expect(existsSync(outPath)).toBe(true)
    const messages = errSpy.mock.calls.map((c: unknown[]) => String(c[0])).join('\n')
    expect(messages).toMatch(/schema mismatch/)
  })

  it('produces deterministic output (same input → same bytes)', async () => {
    const inputPath = path.join(tmpDir, 'evidence.json')
    const outA = path.join(tmpDir, 'a.md')
    const outB = path.join(tmpDir, 'b.md')
    writeFileSync(inputPath, JSON.stringify(sampleScanOutput))
    await clusterCommand(inputPath, { llm: false, out: outA })
    await clusterCommand(inputPath, { llm: false, out: outB })
    expect(readFileSync(outA, 'utf8')).toBe(readFileSync(outB, 'utf8'))
  })
})
