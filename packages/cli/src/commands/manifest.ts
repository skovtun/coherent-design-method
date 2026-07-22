/**
 * `coherent manifest [--out <file>]` — emit the machine-readable DESIGN CONTRACT
 * for AI agents (the "agent-ready" surface, à la Meta astryx / the agent-contract
 * strategy). One command → a single JSON document so an agent has a CONTRACT
 * instead of guessing:
 *
 *   - tokens        — the design system in W3C DTCG format (project only).
 *   - designContract — page types, the available design identities (atmospheres),
 *                      and how to fetch the full tiered constraint bundle.
 *   - components    — available shadcn primitives + the project's shared registry.
 *   - cli           — a self-description of the CLI's commands/flags, so an agent
 *                     can DRIVE `coherent` without scraping `--help`.
 *
 * Works outside a project (emits the static contract: atmospheres + cli +
 * available primitives); inside a project it adds tokens + the shared registry.
 * Defaults to stdout (agent-friendly); `--out <file>` writes a file.
 */
import type { Command } from 'commander'
import { resolve, relative } from 'path'
import chalk from 'chalk'
import { CLI_VERSION, DesignSystemManager, loadManifest } from '@getcoherent/core'
import { findConfig } from '../utils/find-config.js'
import { writeFile } from '../utils/files.js'
import { buildDtcgTokens } from '../export-tokens/generate.js'
import { getComponentProvider } from '../providers/index.js'
import { ATMOSPHERE_PRESETS } from './chat/atmosphere-presets.js'

export interface ManifestOptions {
  out?: string
}

/** Self-description of the CLI's command tree (astryx's `manifest --json` idea). */
function describeCli(cmd?: Command): unknown {
  const program = cmd?.parent
  if (!program) return null
  const opt = (o: { flags: string; description?: string }) => ({
    flags: o.flags,
    description: o.description || undefined,
  })
  return {
    name: 'coherent',
    version: CLI_VERSION,
    commands: program.commands
      .filter(c => c.name() !== '_phase') // internal
      .map(c => ({
        name: c.name(),
        description: c.description() || undefined,
        options: (c.options ?? []).map(opt),
        subcommands: (c.commands ?? []).map(s => ({ name: s.name(), description: s.description() || undefined })),
      })),
  }
}

/**
 * Build the design-contract manifest object. Shared by `coherent manifest`
 * (CLI) and the `coherent_manifest` MCP tool. `cmd` supplies the CLI's own
 * command tree for the self-description section; omit it (MCP) and `cli` is
 * null. Works in or out of a project — inside one it adds tokens + the shared
 * registry. No console output.
 */
export async function buildManifestDoc(cmd?: Command): Promise<Record<string, unknown>> {
  const project = findConfig()

  const atmospheres = Object.entries(ATMOSPHERE_PRESETS).map(([name, a]) => ({ name, description: a.moodPhrase }))

  const doc: Record<string, unknown> = {
    $schema: 'https://getcoherent.design/schema/coherent-manifest-v1.json',
    coherentVersion: CLI_VERSION,
    generatedFor: null,
    designContract: {
      pageTypes: ['marketing', 'app', 'auth'],
      atmospheres,
      constraintBundle: {
        description:
          'Coherent injects a tiered design-constraint system (design-thinking, core constraints, per-page-type quality, visual depth, interaction patterns, keyword-matched contextual rules) BEFORE the AI writes code. Fetch the full bundle per intent:',
        queryVia: 'coherent prompt --format json "<intent>" --page-type <marketing|app|auth> [--atmosphere <name>]',
      },
    },
    cli: describeCli(cmd),
  }

  if (project) {
    const dsm = new DesignSystemManager(project.configPath)
    await dsm.load()
    const config = dsm.getConfig()
    doc.generatedFor = config.name ?? null
    doc.tokens = JSON.parse(buildDtcgTokens(config)) // DTCG design tokens
    let shared: unknown[] = []
    try {
      const m = await loadManifest(project.root)
      shared = m.shared
    } catch {
      /* no shared manifest yet */
    }
    doc.components = {
      shadcnAvailable: getComponentProvider().listNames(project.root),
      shared, // CID-XXX registry: { id, name, type, usedIn }
    }
  } else {
    doc.components = { shadcnAvailable: getComponentProvider().listNames() }
  }

  return doc
}

export async function manifestCommand(opts: ManifestOptions = {}, cmd?: Command): Promise<void> {
  const doc = await buildManifestDoc(cmd)
  const json = JSON.stringify(doc, null, 2) + '\n'
  if (opts.out) {
    const out = resolve(opts.out)
    await writeFile(out, json)
    console.error(chalk.green(`✓ Wrote design-contract manifest → ${relative(process.cwd(), out) || out}`))
  } else {
    // stdout so agents / pipes get clean JSON (status/errors go to stderr).
    console.log(json)
  }
}
