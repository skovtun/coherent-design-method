import chalk from 'chalk'
import { cwd } from 'process'
import {
  inferProviderFromKey,
  readAuthStatus,
  removeApiKey,
  writeApiKey,
  type AuthProvider,
} from '../utils/auth-env.js'

function resolveProvider(explicit: string | undefined, key: string | null): AuthProvider | null {
  if (explicit === 'anthropic' || explicit === 'openai') return explicit
  if (explicit !== undefined) return null
  if (!key) return null
  return inferProviderFromKey(key)
}

export async function authStatusCommand(): Promise<void> {
  const status = readAuthStatus(cwd())
  console.log(chalk.cyan('\n🔑 AI provider credentials\n'))
  for (const provider of ['anthropic', 'openai'] as const) {
    const row = status[provider]
    const label = provider === 'anthropic' ? 'Anthropic (Claude)' : 'OpenAI'
    if (row.present) {
      const src = row.source === 'process-env' ? 'process env' : 'project .env'
      console.log(`  ${chalk.green('●')}  ${label.padEnd(20)} ${chalk.dim(row.envVar)}  ${chalk.dim(`(${src})`)}`)
    } else {
      console.log(
        `  ${chalk.dim('○')}  ${chalk.dim(label.padEnd(20))} ${chalk.dim(row.envVar)}  ${chalk.dim('(unset)')}`,
      )
    }
  }
  if (!status.anthropic.present && !status.openai.present) {
    console.log(chalk.yellow('\nNo AI keys configured.'))
    console.log(chalk.dim('Options:'))
    console.log(chalk.dim('  coherent auth set-key sk-ant-...     # Anthropic Claude'))
    console.log(chalk.dim('  coherent auth set-key sk-proj-...    # OpenAI'))
    console.log(
      chalk.dim('  /coherent-chat "..." in Claude Code           # no key needed if you have a Claude subscription'),
    )
  }
  console.log('')
}

export async function authSetKeyCommand(key: string, options: { provider?: string }): Promise<void> {
  if (!key || key.length < 10) {
    console.error(chalk.red('\n❌ Key looks too short. Usage: coherent auth set-key <your-api-key>\n'))
    process.exit(1)
  }

  const provider = resolveProvider(options.provider, key)
  if (!provider) {
    console.error(chalk.red('\n❌ Could not determine provider from key prefix.\n'))
    console.log(chalk.dim('Pass --provider explicitly:'))
    console.log(chalk.dim('  coherent auth set-key <key> --provider anthropic'))
    console.log(chalk.dim('  coherent auth set-key <key> --provider openai\n'))
    process.exit(1)
  }

  const projectRoot = cwd()
  writeApiKey(projectRoot, provider, key)
  const providerLabel = provider === 'anthropic' ? 'Anthropic (Claude)' : 'OpenAI'
  console.log(chalk.green(`\n✓ ${providerLabel} key saved to .env`))
  console.log(chalk.dim(`  Env var: ${provider === 'anthropic' ? 'ANTHROPIC_API_KEY' : 'OPENAI_API_KEY'}`))
  console.log(chalk.dim('  Next: coherent chat "build a landing page"\n'))
}

export async function authUnsetKeyCommand(options: { provider?: string }): Promise<void> {
  const provider = resolveProvider(options.provider, null)
  if (!provider) {
    console.error(
      chalk.red('\n❌ Specify which provider to unset. Usage: coherent auth unset-key --provider anthropic|openai\n'),
    )
    process.exit(1)
  }
  const projectRoot = cwd()
  const removed = removeApiKey(projectRoot, provider)
  const providerLabel = provider === 'anthropic' ? 'Anthropic (Claude)' : 'OpenAI'
  if (removed) {
    console.log(chalk.green(`\n✓ Removed ${providerLabel} key from .env\n`))
  } else {
    console.log(chalk.yellow(`\n⚠️  No ${providerLabel} key was set in .env — nothing to remove.\n`))
  }
}
