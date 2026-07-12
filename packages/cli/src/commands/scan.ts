/**
 * `coherent scan` — Tool 2 (brownfield audit). Phase B-1 of the pilot
 * per the Tool 2 pilot PLAN.md.
 *
 * v0 (B-1): Blade-only L1 grep extraction. NO LLM, NO clustering, NO
 * COHERENT-DESIGN.md generation. Just walk → extract → emit JSON
 * evidence. LLM clustering lands in Phase B-2 only if the Evidence
 * Gate passes (≥80% catch / ≤30% FP / <30s on a 152-file pilot Blade app).
 *
 * Output sink: writes to <out> path (default `B1-EVIDENCE.json` in
 * CWD) and prints a one-line summary to stderr. Errors via
 * CoherentError so the global error renderer formats them.
 */

import chalk from 'chalk'
import { readFileSync, writeFileSync } from 'fs'
import { resolve } from 'path'
import { walk } from '../scan/walk.js'
import { bladeAdapter } from '../scan/adapters/blade.js'
import { serializeScan, SCHEMA_VERSION, type ScanOutput } from '../scan/json-output.js'
import type { EvidenceRow } from '../scan/adapters/types.js'

export interface ScanOptions {
  out?: string
  adapter?: string
  json?: boolean
}

export async function scanCommand(targetDir: string | undefined, opts: ScanOptions = {}): Promise<void> {
  const root = resolve(targetDir ?? process.cwd())
  const adapterName = opts.adapter ?? 'blade'

  if (adapterName !== 'blade') {
    console.error(chalk.red(`✗ Adapter "${adapterName}" not implemented. B-1 ships blade only.`))
    process.exit(1)
  }

  const started = Date.now()
  const files = walk(root, {
    extensions: bladeAdapter.filePatterns,
    excludes: new Set(bladeAdapter.excludes),
  })

  if (files.length === 0) {
    console.error(chalk.yellow(`⚠ No ${bladeAdapter.filePatterns.join('|')} files under ${root}`))
    process.exit(1)
  }

  const rows: EvidenceRow[] = []
  for (const file of files) {
    let contents: string
    try {
      contents = readFileSync(file, 'utf8')
    } catch {
      continue
    }
    const relative = file.startsWith(root + '/') ? file.slice(root.length + 1) : file
    rows.push(...bladeAdapter.extract(relative, contents))
  }

  const duration = Date.now() - started

  const output: ScanOutput = {
    metadata: {
      schema_version: SCHEMA_VERSION,
      adapter: adapterName,
      scanned_at: new Date().toISOString(),
      project_root: root,
      files_scanned: files.length,
      duration_ms: duration,
    },
    rows,
  }

  const json = serializeScan(output)

  if (opts.json && !opts.out) {
    process.stdout.write(json + '\n')
  } else {
    const outPath = resolve(opts.out ?? 'B1-EVIDENCE.json')
    writeFileSync(outPath, json + '\n', 'utf8')
    console.error(
      chalk.green(`✓ scan: ${files.length} files, ${rows.length} evidence rows, ${duration}ms → ${outPath}`),
    )
  }
}
