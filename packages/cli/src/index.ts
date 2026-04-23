// Load environment variables from .env file
import { config } from 'dotenv'
try {
  config()
} catch (error: any) {
  if (error?.code !== 'ENOENT' && error?.code !== 'ENOTDIR') {
    console.error('Warning: Could not load .env file:', error.message)
  }
}

import { Command } from 'commander'
import { CLI_VERSION } from '@getcoherent/core'
import { initCommand } from './commands/init.js'
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
import { checkForUpdates } from './utils/update-notifier.js'

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

// ─── Core workflow commands ─────────────────────────────────────────

program
  .command('init')
  .argument('[name]', 'Project directory name (created if it does not exist)')
  .description('Initialize a new Coherent project')
  .action(initCommand)

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

program.parse()

checkForUpdates().catch(e => {
  if (process.env.COHERENT_DEBUG === '1') console.error('Update check failed:', e)
})
