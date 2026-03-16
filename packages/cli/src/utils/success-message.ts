/**
 * Success Message for coherent init
 *
 * Displays a professional, informative message after project initialization
 * that explains what was created, the methodology, and next steps.
 */

import chalk from 'chalk'

export function showSuccessMessage(projectPath: string = '.'): void {
  const _projectName = projectPath === '.' ? 'current directory' : projectPath

  console.log(chalk.magenta('\n✨ Coherent Design Method — Project Initialized\n'))

  console.log(chalk.cyan('📁 Location: ') + chalk.white(projectPath) + '\n')

  console.log(chalk.cyan('🎨 What was created:'))
  console.log(chalk.green('   ✔ Next.js 15 with Tailwind CSS'))
  console.log(chalk.green('   ✔ Design system configuration'))
  console.log(chalk.green('   ✔ Home page ready to customize'))
  console.log(chalk.green('   ✔ Design System viewer (/design-system)'))
  console.log(chalk.green('   ✔ Documentation pages (/design-system/docs)'))
  console.log(chalk.green('   ✔ .cursorrules + CLAUDE.md + .claude/ (AI context — commit to git)\n'))

  console.log(chalk.cyan('📖 What is Coherent Design Method?'))
  console.log(chalk.gray('   A stateful approach where:'))
  console.log(chalk.gray('   • Components registered once, reused everywhere'))
  console.log(chalk.gray('   • Design tokens cascade automatically'))
  console.log(chalk.gray('   • AI maintains architectural coherence\n'))
  console.log(chalk.gray('   Created by Sergei Kovtun'))
  console.log(chalk.blue('   https://github.com/skovtun/coherent-design-method\n'))

  console.log(chalk.cyan('🚀 Get Started:\n'))

  if (projectPath !== '.') {
    console.log(chalk.white('   1. Navigate to project:'))
    console.log(chalk.yellow('      $ cd ' + projectPath) + '\n')
  }

  console.log(chalk.white('   ' + (projectPath !== '.' ? '2' : '1') + '. Install dependencies:'))
  console.log(chalk.yellow('      $ npm install') + '\n')

  console.log(chalk.white('   ' + (projectPath !== '.' ? '3' : '2') + '. Start dev server:'))
  console.log(chalk.yellow('      $ npm run dev'))
  console.log(chalk.gray('      → Opens http://localhost:3000\n'))

  console.log(chalk.white('   ' + (projectPath !== '.' ? '4' : '3') + '. Customize with AI:'))
  console.log(chalk.yellow('      $ coherent chat "add dashboard with charts"'))
  console.log(chalk.yellow('      $ coherent chat "make buttons green and rounded"\n'))

  console.log(chalk.cyan('💡 How it works:'))
  console.log(chalk.gray('   • Describe what you want in natural language'))
  console.log(chalk.gray('   • AI generates code using registered components'))
  console.log(chalk.gray('   • Changes cascade through your design system\n'))

  console.log(chalk.cyan('❓ Questions or issues?'))
  console.log(chalk.blue('   https://github.com/skovtun/coherent-design-method/issues\n'))

  console.log(chalk.magenta('Happy building! ✨\n'))
}
