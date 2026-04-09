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
import { previewCommand } from './commands/preview.js'
import { exportCommand } from './commands/export.js'
import { statusCommand } from './commands/status.js'
import { regenerateDocsCommand } from './commands/regenerate-docs.js'
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
  .action(chatCommand)

program.command('preview').description('Launch dev server for preview').action(previewCommand)

program
  .command('check')
  .description('Show all problems: page quality, shared components, internal links')
  .option('--json', 'Output as JSON')
  .option('--pages', 'Only check pages')
  .option('--shared', 'Only check shared components')
  .action(opts => checkCommand(opts))

program
  .command('fix')
  .description('Auto-fix everything: cache, deps, components, syntax, quality')
  .option('--dry-run', 'Show what would be fixed without writing')
  .option('--no-cache', 'Skip cache clearing')
  .option('--no-quality', 'Skip quality auto-fixes')
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
program.addCommand(importCmd)

const dsCmd = new Command('ds').description('Design System viewer pages')
dsCmd
  .command('regenerate')
  .description('Regenerate all Design System pages from current config')
  .action(dsRegenerateCommand)
program.addCommand(dsCmd)

program.command('status').description('Show current project status').action(statusCommand)

program.command('regenerate-docs').description('Regenerate documentation pages').action(regenerateDocsCommand)

// ─── Deprecated aliases (hidden from help, still work) ──────────────

function hidden(cmd: Command): Command {
  ;(cmd as any)._hidden = true
  return cmd
}

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
