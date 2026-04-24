/**
 * Success Message for coherent init
 *
 * Displays a professional, informative message after project initialization
 * that explains what was created, the methodology, and next steps.
 *
 * Branches on mode so users land on the CTA that fits their setup:
 *  - skill: /coherent-generate in Claude Code (no API key needed)
 *  - api:   coherent chat (uses an Anthropic/OpenAI key)
 *  - both:  show both
 */

import chalk from 'chalk'
import type { DetectedEditor } from './editor-detection.js'

export type SuccessMode = 'skill' | 'api' | 'both'

export interface SuccessMessageOptions {
  mode?: SuccessMode
  detectedEditors?: DetectedEditor[]
  v2TargetEditors?: DetectedEditor[]
}

export function showSuccessMessage(projectPath: string = '.', options: SuccessMessageOptions = {}): void {
  const mode: SuccessMode = options.mode ?? 'api'

  console.log(chalk.magenta('\n✨ Coherent Design Method — Project Initialized\n'))
  console.log(chalk.cyan('📁 Location: ') + chalk.white(projectPath) + '\n')

  console.log(chalk.cyan('🎨 What was created:'))
  console.log(chalk.green('   ✔ Next.js 15 with Tailwind CSS'))
  console.log(chalk.green('   ✔ Design system configuration'))
  console.log(chalk.green('   ✔ Home page ready to customize'))
  console.log(chalk.green('   ✔ Design System viewer (/design-system)'))
  console.log(chalk.green('   ✔ Documentation pages (/design-system/docs)'))
  console.log(chalk.green('   ✔ .cursorrules + CLAUDE.md + .claude/ (AI context — commit to git)\n'))

  if (options.v2TargetEditors && options.v2TargetEditors.length > 0) {
    const names = options.v2TargetEditors.map(e => `.${e === 'claude-code' ? 'claude' : e}`).join(', ')
    console.log(chalk.dim(`   (detected ${names} — native skill adapter for these editors lands in v0.10+)\n`))
  }

  console.log(chalk.cyan('📖 What is Coherent Design Method?'))
  console.log(chalk.gray('   A stateful approach where:'))
  console.log(chalk.gray('   • Components registered once, reused everywhere'))
  console.log(chalk.gray('   • Design tokens cascade automatically'))
  console.log(chalk.gray('   • AI maintains architectural coherence\n'))
  console.log(chalk.gray('   Created by Sergei Kovtun'))
  console.log(chalk.blue('   https://github.com/skovtun/coherent-design-method\n'))

  console.log(chalk.cyan('🚀 Get Started:\n'))

  let step = 1
  const nextStep = () => step++

  if (projectPath !== '.') {
    console.log(chalk.white(`   ${nextStep()}. Navigate to project:`))
    console.log(chalk.yellow('      $ cd ' + projectPath) + '\n')
  }

  console.log(chalk.white(`   ${nextStep()}. Install dependencies:`))
  console.log(chalk.yellow('      $ npm install') + '\n')

  console.log(chalk.white(`   ${nextStep()}. Start dev server:`))
  console.log(chalk.yellow('      $ npm run dev'))
  console.log(chalk.gray('      → Opens http://localhost:3000\n'))

  if (mode === 'skill' || mode === 'both') {
    console.log(chalk.white(`   ${nextStep()}. Generate with Claude Code (no API key needed):`))
    console.log(chalk.yellow('      /coherent-generate "describe your app"'))
    console.log(chalk.gray('      → Uses your Claude subscription — no extra cost.\n'))
  }

  if (mode === 'api' || mode === 'both') {
    console.log(chalk.white(`   ${nextStep()}. Customize with AI (requires API key):`))
    console.log(chalk.yellow('      $ coherent chat "add dashboard with charts"'))
    console.log(chalk.yellow('      $ coherent chat "make buttons green and rounded"\n'))
  }

  console.log(chalk.cyan('💡 How it works:'))
  console.log(chalk.gray('   • Describe what you want in natural language'))
  console.log(chalk.gray('   • AI generates code using registered components'))
  console.log(chalk.gray('   • Changes cascade through your design system\n'))

  console.log(chalk.cyan('❓ Questions or issues?'))
  console.log(chalk.blue('   https://github.com/skovtun/coherent-design-method/issues\n'))

  console.log(chalk.magenta('Happy building! ✨\n'))
}
