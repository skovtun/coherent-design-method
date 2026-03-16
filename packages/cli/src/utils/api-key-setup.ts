import prompts from 'prompts'
import fs from 'fs/promises'
import path from 'path'
import chalk from 'chalk'

export interface ApiKeySetupResult {
  provider: 'anthropic' | 'openai' | 'skip'
  apiKey?: string
  saved: boolean
}

/**
 * Interactive API key setup
 */
export async function setupApiKey(projectRoot: string): Promise<ApiKeySetupResult> {
  console.log(chalk.cyan('\n🔑 AI Provider Setup'))
  console.log(chalk.gray('Coherent uses AI to generate and modify your design system.\n'))

  const response = await prompts(
    [
      {
        type: 'select',
        name: 'provider',
        message: 'Choose your AI provider:',
        choices: [
          {
            title: 'Anthropic Claude (recommended)',
            value: 'anthropic',
            description: 'Best for design systems and code generation',
          },
          {
            title: 'OpenAI ChatGPT',
            value: 'openai',
            description: 'Popular alternative',
          },
          {
            title: 'Skip for now',
            value: 'skip',
            description: 'Add API key manually later',
          },
        ],
        initial: 0,
      },
      {
        type: (prev: string) => (prev === 'skip' ? null : 'password'),
        name: 'apiKey',
        message: (_: unknown, values: { provider?: string }) =>
          values?.provider === 'anthropic' ? 'Enter your Anthropic API key:' : 'Enter your OpenAI API key:',
        validate: (value: string) => {
          if (!value || value.length === 0) return 'API key is required'
          if (value.length < 20) return 'API key seems too short'
          return true
        },
      },
    ],
    { onCancel: () => ({ provider: undefined }) },
  )

  if (!response.provider) {
    return { provider: 'skip', saved: false }
  }

  if (response.provider === 'skip') {
    console.log(chalk.yellow('\n⚠️  Skipped API key setup'))
    console.log(chalk.white('Add your API key later by creating .env file:'))
    console.log(chalk.cyan('  echo "ANTHROPIC_API_KEY=sk-..." > .env'))
    console.log(chalk.gray('  Get key: https://console.anthropic.com/\n'))
    return { provider: 'skip', saved: false }
  }

  const envVar = response.provider === 'anthropic' ? 'ANTHROPIC_API_KEY' : 'OPENAI_API_KEY'
  const envPath = path.join(projectRoot, '.env')
  const envContent = `${envVar}=${response.apiKey}\n`

  try {
    await fs.writeFile(envPath, envContent, 'utf-8')
    console.log(chalk.green('\n✓ API key saved to .env'))

    const providerName = response.provider === 'anthropic' ? 'Claude' : 'ChatGPT'
    const getKeyUrl =
      response.provider === 'anthropic' ? 'https://console.anthropic.com/' : 'https://platform.openai.com/'

    console.log(chalk.gray(`  Using: ${providerName}`))
    console.log(chalk.gray(`  Get more keys: ${getKeyUrl}\n`))

    return {
      provider: response.provider,
      apiKey: response.apiKey,
      saved: true,
    }
  } catch (error) {
    console.error(chalk.red(`\n✖ Failed to save API key: ${error}`))
    return { provider: response.provider, saved: false }
  }
}

/**
 * Check if API key exists (from env, not from .env file - dotenv is loaded elsewhere)
 */
export function hasApiKey(): boolean {
  return !!(process.env.ANTHROPIC_API_KEY || process.env.OPENAI_API_KEY)
}

/**
 * Show API key missing warning
 */
export function showApiKeyWarning(): void {
  console.log(chalk.yellow('\n⚠️  No API key detected'))
  console.log(chalk.white('To use AI features, add your API key:'))
  console.log(chalk.cyan('  echo "ANTHROPIC_API_KEY=sk-..." > .env'))
  console.log(chalk.gray('  Get key: https://console.anthropic.com/\n'))
}
