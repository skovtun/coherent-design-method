// Load environment variables from .env file
import { config } from 'dotenv'
try {
  config()
} catch (error: any) {
  if (error?.code !== 'ENOENT' && error?.code !== 'ENOTDIR') {
    console.error('Warning: Could not load .env file:', error.message)
  }
}

// v0.13.0 — runtime error trap for uncaught throws + unhandled promise
// rejections that escape from main() or async background tasks (e.g.,
// the auto-update fetch). Without this, a CoherentError thrown post-
// initialization crashed with raw stack trace and lost .fix/.docsUrl.
//
// LIMITATION: registers AFTER static imports below. If a module-init
// throw happens during ESM import resolution (broken bundle chunk,
// missing peer dep, malformed package.json), this handler is not yet
// attached and Node prints raw output. That class of failure pre-dates
// this trap and is unfixable without restructuring the entry into a
// 2-file shim. Adversarial review (2026-04-27) called this out as a
// known scope limitation. Inner try/catch covers the recursive case
// where the dynamic import itself fails.
process.on('uncaughtException', async err => {
  try {
    const { renderCliError } = await import('./utils/render-cli-error.js')
    const { stderr, exitCode } = renderCliError(err, { debug: process.env.COHERENT_DEBUG === '1' })
    process.stderr.write(stderr)
    process.exit(exitCode)
  } catch (rendererErr) {
    process.stderr.write(`Coherent crashed: ${err instanceof Error ? err.message : String(err)}\n`)
    process.stderr.write(
      `Renderer also failed: ${rendererErr instanceof Error ? rendererErr.message : String(rendererErr)}\n`,
    )
    process.exit(1)
  }
})
process.on('unhandledRejection', async reason => {
  try {
    const { renderCliError } = await import('./utils/render-cli-error.js')
    const { stderr, exitCode } = renderCliError(reason, { debug: process.env.COHERENT_DEBUG === '1' })
    process.stderr.write(stderr)
    process.exit(exitCode)
  } catch (rendererErr) {
    process.stderr.write(`Coherent rejected: ${reason instanceof Error ? reason.message : String(reason)}\n`)
    process.stderr.write(
      `Renderer also failed: ${rendererErr instanceof Error ? rendererErr.message : String(rendererErr)}\n`,
    )
    process.exit(1)
  }
})

import { Command } from 'commander'
import { CLI_VERSION } from '@getcoherent/core'
import { initCommand, type InitOptions } from './commands/init.js'
import { authStatusCommand, authSetKeyCommand, authUnsetKeyCommand } from './commands/auth.js'
import { chatCommand } from './commands/chat.js'
import { promptCommand } from './commands/prompt.js'
import { memoryShowCommand, memoryDiffCommand } from './commands/memory.js'
import { previewCommand } from './commands/preview.js'
import { exportCommand } from './commands/export.js'
import { statusCommand } from './commands/status.js'
import { regenerateDocsCommand } from './commands/regenerate-docs.js'
import { reportIssueCommand } from './commands/report-issue.js'
import { journalListCommand, journalAggregateCommand, journalPruneCommand } from './commands/journal.js'
import { baselineCommand } from './commands/baseline.js'
import {
  wikiReflectCommand,
  wikiAuditCommand,
  wikiAdrCreateCommand,
  wikiIndexCommand,
  wikiSearchCommand,
  wikiBenchCommand,
} from './commands/wiki.js'
import { fixCommand } from './commands/fix.js'
import { checkCommand } from './commands/check.js'
import { repairCommand } from './commands/repair.js'
import { doctorCommand } from './commands/doctor.js'
import { rulesCommand } from './commands/rules.js'
import { validateCommand } from './commands/validate.js'
import { auditCommand } from './commands/audit.js'
import { createComponentsCommand } from './commands/components.js'
import { createImportCommand } from './commands/import-cmd.js'
import { dsRegenerateCommand } from './commands/ds.js'
import { updateCommand } from './commands/update.js'
import { undoCommand } from './commands/undo.js'
import { syncCommand } from './commands/sync.js'
import { migrateAction } from './commands/migrate.js'
import { sessionStartCommand, sessionEndCommand } from './commands/session.js'
import { phaseCommand } from './commands/_phase.js'
import { maybePrintUpdateBanner, refreshUpdateCacheAsync } from './utils/update-notifier.js'

const program = new Command()

// `_hidden` is an undocumented Commander flag that keeps a command working
// (`coherent <cmd>` still runs) but removes it from `coherent --help`.
// Use for deprecated aliases, contributor-only workflows, and niche tools.
function hidden(cmd: Command): Command {
  ;(cmd as any)._hidden = true
  return cmd
}

program
  .name('coherent')
  .description(
    'Coherent Design Method — AI-powered design system generator\nby Sergei Kovtun · https://www.linkedin.com/in/sergeikovtun/',
  )
  .version(CLI_VERSION)
  // Update-notifier opt-out (v0.11.2). Suppresses the npm-version-newer
  // banner. Same effect as `COHERENT_NO_UPDATE_CHECK=1`. Per-invocation,
  // not persisted; for permanent opt-out use the env var. Registered at
  // the program level so it's accepted on every subcommand without
  // commander complaining about unknown options. The flag is read out of
  // process.argv by `shouldSkipUpdateCheck`, not via commander's option
  // parsing, since it has to apply BEFORE `program.parse()`.
  .option('--no-update-check', 'Skip the npm version check banner')

// ─── Core workflow commands ─────────────────────────────────────────

program
  .command('init')
  .argument('[name]', 'Project directory name (created if it does not exist)')
  .description('Initialize a new Coherent project')
  .option('--skill-mode', 'Skip API key setup; expect /coherent-chat in Claude Code')
  .option('--api-mode', 'Force API key setup; emit coherent chat CTA')
  .option('--both', 'API key optional; emit CTAs for both skill and chat rails')
  .action((nameArg: string | undefined, opts: InitOptions) => initCommand(nameArg, opts))

// ─── Auth (AI provider credentials) ─────────────────────────────────

const authCmd = new Command('auth').description('Manage AI provider credentials (writes to project .env)')
authCmd.command('status').description('Show which AI keys are configured').action(authStatusCommand)
authCmd
  .command('set-key <key>')
  .description('Save an API key to .env (provider inferred from prefix, or pass --provider)')
  .option('--provider <provider>', 'Force provider: anthropic | openai')
  .action((key: string, opts: { provider?: string }) => authSetKeyCommand(key, opts))
authCmd
  .command('unset-key')
  .description('Remove an AI key from .env')
  .option('--provider <provider>', 'Which key to remove: anthropic | openai (required)')
  .action((opts: { provider?: string }) => authUnsetKeyCommand(opts))
program.addCommand(authCmd)

program
  .command('chat')
  .description('Modify design system via conversation')
  .argument('[message]', 'Modification request')
  .option('--provider <provider>', 'AI provider: claude|openai|auto', 'auto')
  .option('--component <name>', 'Target a specific component by name or CID')
  .option('--page <name>', 'Target a specific page by name, id, or route')
  .option('--token <name>', 'Target a specific design token')
  .option('--new-component <name>', 'Create a new shared component with the given name')
  .option(
    '--type <type>',
    'Component type for --new-component: layout, navigation, data-display, form, feedback, section',
  )
  .option('-i, --interactive', 'Interactive chat mode')
  .option('--dry-run', 'Show what would change without applying')
  .option(
    '--atmosphere <name>',
    'Use a named atmosphere preset (swiss-grid, paper-editorial, neo-brutalist, dark-terminal, obsidian-neon, premium-focused, warm-industrial, solar-saas, wabi-sabi, luxury-editorial). Hard-overrides mood inference.',
  )
  .option('--list-atmospheres', 'List available atmosphere presets and exit')
  .option('--mark-kept', 'Retroactively mark the latest run as kept (you liked the output). Skips generation.')
  .option(
    '--mark-rejected',
    'Retroactively mark the latest run as rejected (you discarded the output). Skips generation.',
  )
  .allowExcessArguments(false)
  .action(chatCommand)

program
  .command('prompt')
  .description('Emit the structured constraint bundle for an intent (no API call — for Claude Code skill mode)')
  .argument('[intent]', 'What you want to generate (e.g., "build a CRM dashboard")')
  .option('--page-type <type>', 'Force page type: marketing | app | auth (default: inferred from intent)')
  .option('--atmosphere <name>', 'Use a named atmosphere preset (see --list-atmospheres)')
  .option('--list-atmospheres', 'List available atmosphere presets and exit')
  .option('--format <format>', 'Output format: markdown | json | plain (default: markdown)', 'markdown')
  .allowExcessArguments(false)
  .action(promptCommand)

const memoryCmd = new Command('memory').description(
  'Inspect per-project design memory (decisions.md + components + recent runs)',
)
memoryCmd
  .command('show')
  .description('Print design memory, shared components, and recent run summaries')
  .action(opts => memoryShowCommand(opts))
memoryCmd
  .command('diff [ref]')
  .description('git diff decisions.md vs <ref> (default: HEAD). Shows how memory changed recently.')
  .action((ref: string | undefined, opts: { _throwOnError?: boolean }) => memoryDiffCommand(ref, opts))
program.addCommand(memoryCmd)

// ─── Session lifecycle (skill-mode rail) ────────────────────────────

const sessionCmd = new Command('session').description(
  'Skill-mode session lifecycle (acquires project lock at start, applies artifacts at end)',
)
sessionCmd
  .command('start')
  .description('Start a new session — prints UUID on stdout, human-readable summary on stderr')
  .option('--intent <message>', 'Raw user intent (persisted as intent.txt)')
  .option('--options <json>', 'JSON object of caller options (persisted as options.json)')
  .option('--quiet', 'Suppress informational stderr (skill rail uses this)')
  .action((opts: { intent?: string; options?: string; quiet?: boolean }) =>
    sessionStartCommand({ intent: opts.intent, optionsJson: opts.options, quiet: opts.quiet }),
  )
sessionCmd
  .command('end <uuid>')
  .description('End a session — applies artifacts, writes run record, releases lock')
  .option('--keep', 'Keep the session dir after ending (for debugging)')
  .option('--quiet', 'Print one-line summary instead of verbose Applied: list (skill rail uses this)')
  .action((uuid: string, opts: { keep?: boolean; quiet?: boolean }) => sessionEndCommand(uuid, opts))
program.addCommand(sessionCmd)

// ─── _phase (hidden, skill-mode rail) ──────────────────────────────

const phaseCmd = new Command('_phase').description(
  'Run a single phase-engine phase (hidden — called by skill-mode orchestrator)',
)
phaseCmd
  .command('prep <name>')
  .description('Build the phase prompt and write it to stdout (AI phases)')
  .requiredOption('--session <uuid>', 'Session UUID from `coherent session start`')
  .option('--protocol <version>', 'Phase-engine protocol version caller was built against')
  .action((name: string, opts: { session: string; protocol?: string }) =>
    phaseCommand('prep', name, { session: opts.session, protocol: opts.protocol }),
  )
phaseCmd
  .command('ingest <name>')
  .description('Read the raw model response from stdin and persist artifacts (AI phases)')
  .requiredOption('--session <uuid>', 'Session UUID from `coherent session start`')
  .option('--protocol <version>', 'Phase-engine protocol version caller was built against')
  .action((name: string, opts: { session: string; protocol?: string }) =>
    phaseCommand('ingest', name, { session: opts.session, protocol: opts.protocol }),
  )
phaseCmd
  .command('run <name>')
  .description('Execute a deterministic phase')
  .requiredOption('--session <uuid>', 'Session UUID from `coherent session start`')
  .option('--protocol <version>', 'Phase-engine protocol version caller was built against')
  .action((name: string, opts: { session: string; protocol?: string }) =>
    phaseCommand('run', name, { session: opts.session, protocol: opts.protocol }),
  )
hidden(phaseCmd)
program.addCommand(phaseCmd)

program.command('preview').description('Launch dev server for preview').action(previewCommand)

program
  .command('check')
  .description('Show all problems: page quality, shared components, internal links')
  .option('--json', 'Output as JSON')
  .option('--pages', 'Only check pages')
  .option('--shared', 'Only check shared components')
  .option('--page <name>', 'Check only one specific page (id, name, or route — fuzzy matched)')
  .action(opts => checkCommand(opts))

program
  .command('fix')
  .description('Auto-fix everything: cache, deps, components, syntax, quality')
  .option('--dry-run', 'Show what would be fixed without writing')
  .option('--no-cache', 'Skip cache clearing')
  .option('--force-cache-clear', 'Clear .next/ even when a dev server is detected running')
  .option('--no-quality', 'Skip quality auto-fixes')
  .option('--verbose', 'Show per-file breakdown (legacy report)')
  .option('--journal', 'Write session summary to .coherent/fix-sessions/ for later review')
  .action(opts => fixCommand(opts))

program
  .command('export')
  .description('Export clean deployable Next.js project (strip Design System overlay)')
  .option('--output <dir>', 'Output directory', './export')
  .option('--no-build', 'Skip running next build in output')
  .option('--keep-ds', 'Keep Design System viewer and config in export')
  .action(opts => exportCommand(opts))

program
  .command('sync')
  .description('Sync Design System with actual code (after manual edits in Cursor/IDE)')
  .option('--dry-run', 'Show what would change without writing')
  .option('--tokens', 'Only extract and update tokens')
  .option('--components', 'Only detect and register components')
  .option('--patterns', 'Only extract style patterns')
  .action(opts => syncCommand(opts))

// ─── Maintenance commands ───────────────────────────────────────────

program.command('rules').description('Regenerate .cursorrules and CLAUDE.md').action(rulesCommand)

program
  .command('update')
  .description('Apply platform updates to project')
  .option('--patch-globals', 'Auto-add missing CSS variables to globals.css')
  .action(opts => updateCommand(opts))

program
  .command('undo')
  .description('Restore project to state before last coherent chat')
  .option('--list', 'List available backups')
  .action(opts => undoCommand(opts))

program
  .command('migrate')
  .description('Upgrade project to use real shadcn/ui components')
  .option('--dry-run', 'Preview changes without applying')
  .option('--yes', 'Skip confirmation prompts')
  .option('--rollback', 'Undo last migration')
  .action(opts => migrateAction(opts))

// ─── Advanced commands (hidden from main help) ──────────────────────

const componentsCmd = createComponentsCommand()
componentsCmd.description('Manage shared components')
program.addCommand(componentsCmd)

const dsCmd = new Command('ds').description('Design System viewer pages')
dsCmd
  .command('regenerate')
  .description('Regenerate all Design System pages from current config')
  .action(dsRegenerateCommand)
program.addCommand(dsCmd)

program.command('status').description('Show current project status').action(statusCommand)

const journalCmd = new Command('journal').description('Review and aggregate captured `coherent fix --journal` sessions')
journalCmd.command('list').description('List all captured fix sessions with summary counts').action(journalListCommand)
journalCmd
  .command('aggregate')
  .description('Rank validators by total recurrence across all sessions')
  .action(journalAggregateCommand)
journalCmd
  .command('prune')
  .description('Delete fix sessions older than --keep-days (default 30)')
  .option('--keep-days <n>', 'Number of days of sessions to keep', '30')
  .option('--dry-run', 'Preview what would be deleted without touching the filesystem')
  .action(journalPruneCommand)
program.addCommand(journalCmd)

program
  .command('report-issue')
  .description('Open a pre-filled GitHub issue with project context (CLI/project versions, page path, pages list)')
  .option('--page <path>', 'Page route where the issue occurs (e.g. /dashboard)')
  .option('--screenshot <path>', 'Screenshot file to reference (user uploads manually after browser opens)')
  .option('--title <text>', 'Issue title (overrides auto-generated title)')
  .option('--body <text>', 'Additional body text prepended to the pre-filled template')
  .option('--no-open', 'Print URL only, do not open the browser')
  .action(reportIssueCommand)

// ─── Hidden: niche/experimental/contributor-only ────────────────────
// Still runnable via `coherent <cmd>`, just removed from `coherent --help`
// so the main CLI surface stays focused on the 15 user-facing commands.

// Figma import — experimental; stays invokable for the curious, but not
// surfaced in help until the feature stabilizes.
const importCmd = new Command('import').description('Import design from Figma or other sources')
const importSpec = createImportCommand()
importSpec.subcommands.forEach(sub => {
  const subCmd = importCmd.command(sub.name).description(sub.description)
  if (sub.name === 'figma') {
    subCmd.argument('<url-or-key>', 'Figma file URL or file key')
    subCmd.option('--token <token>', 'Figma personal access token')
    subCmd.option('--no-pages', 'Skip generating app/**/page.tsx from frames')
    subCmd.option('--dry-run', 'Do not write files; report what would be done')
    subCmd.action((urlOrKey: string, opts: { token?: string; pages?: boolean; dryRun?: boolean }) =>
      sub.action(urlOrKey, opts),
    )
  }
})
hidden(importCmd)
program.addCommand(importCmd)

// Narrower subset of `ds regenerate`. Kept as hidden alias for muscle memory
// from pre-0.7 projects; new users learn `ds regenerate` only.
hidden(
  program
    .command('regenerate-docs')
    .description('Use: coherent ds regenerate (hidden alias — regenerates only the docs subfolder)')
    .action(regenerateDocsCommand),
)

// Structural regression snapshot tool — used by contributors developing the
// platform itself, not by users building apps on top of it.
hidden(
  program
    .command('baseline')
    .description(
      'Structural regression check — fingerprints pages (imports, LOC, validator issues), compares against saved baseline',
    )
    .option('--save', 'Save a new baseline snapshot without comparing')
    .option('--compare', 'Compare against the latest baseline without saving a new one')
    .action(baselineCommand),
)

// Wiki maintenance — only meaningful when running inside the Coherent source
// repo (operates on docs/wiki/*). Hidden for generated projects.
const wikiCmd = new Command('wiki').description(
  'Platform-level LLM wiki maintenance (Coherent source repo only — NOT for generated projects)',
)
wikiCmd
  .command('reflect')
  .description('Open a reflection template in $EDITOR and append filled sections to the wiki')
  .action(wikiReflectCommand)
wikiCmd
  .command('audit')
  .description('Sanity-check wiki structure (missing headers, evidence, markers, cross-refs)')
  .action(wikiAuditCommand)
wikiCmd
  .command('index')
  .description(
    'Rebuild the TF-IDF retrieval index over docs/wiki/ (PATTERNS_JOURNAL, ADRs, MODEL_PROFILE, IDEAS_BACKLOG, RULES_MAP)',
  )
  .action(wikiIndexCommand)
wikiCmd
  .command('search <query...>')
  .description('Semantic-ish search over the wiki (TF-IDF). Returns top matches with score.')
  .option('--limit <n>', 'Max results to show', '5')
  .action((queryParts: string[], opts: { limit?: string }) => wikiSearchCommand(queryParts.join(' '), opts))
wikiCmd
  .command('bench')
  .description('Run retrieval quality benchmark (precision@1 and @3) against docs/wiki/BENCH.yaml')
  .action(wikiBenchCommand)

const adrCmd = new Command('adr').description('Scaffold and manage Architecture Decision Records')
adrCmd
  .command('create <slug>')
  .description('Scaffold a new ADR: next sequential number + skeleton sections under docs/wiki/ADR/')
  .option('--title <title>', 'Override the auto-generated title (otherwise derived from slug)')
  .action((slug: string, opts: { title?: string }) => wikiAdrCreateCommand(slug, opts))
wikiCmd.addCommand(adrCmd)

hidden(wikiCmd)
program.addCommand(wikiCmd)

// ─── Hidden: deprecated aliases (still work, not in help) ───────────

hidden(program.command('repair').description('Use: coherent fix').action(repairCommand))
hidden(program.command('doctor').description('Use: coherent fix').action(doctorCommand))
hidden(program.command('validate').description('Use: coherent check').action(validateCommand))
hidden(
  program
    .command('audit')
    .description('Use: coherent check')
    .option('--json', '')
    .action((opts: { json?: boolean }) => auditCommand(opts)),
)

// Update notice — synchronous cache read + fire-and-forget refresh.
//
// Print BEFORE program.parse() so the banner lands above command output
// (spinner, status text, AI streaming) instead of getting interleaved
// mid-flow. The cache is updated by the previous invocation's
// fire-and-forget refresh, so first run on a fresh install has no banner;
// the second run does. See update-notifier.ts file-level docblock for the
// trade-off rationale.
maybePrintUpdateBanner()
refreshUpdateCacheAsync()

program.parse()
