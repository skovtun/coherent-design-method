/**
 * `coherent prefs` — User design preferences command.
 *
 * Surfaces the local preferences store (`~/.coherent/preferences.json`)
 * via three subcommands: `set`, `show`, `clear`. The store is read on
 * every `coherent chat` run and injected into the AI prompt as a
 * "USER DESIGN PREFERENCES" block.
 *
 * Codex pre-impl gate (2026-04-29) recommended this simpler local
 * alternative to integrating Honcho — see preferences.ts header.
 */

import chalk from 'chalk'
import {
  clearPreferences,
  getPreferencesPath,
  readPreferences,
  setPreference,
  type Preferences,
} from '../utils/preferences.js'

const SUPPORTED_KEYS = ['design.style', 'design.density', 'design.avoid', 'design.notes']

export async function prefsSetCommand(key: string, value: string): Promise<void> {
  const validShape = /^design\.[a-z][a-z0-9_-]*$/i.test(key)
  if (!validShape) {
    console.log(chalk.yellow(`\n  Unsupported key "${key}". Supported: ${SUPPORTED_KEYS.join(', ')}\n`))
    process.exit(1)
  }
  const after = setPreference(key, value)
  const cleared = value.trim() === ''
  console.log(chalk.green(`\n  ${cleared ? 'Cleared' : 'Set'} ${chalk.bold(key)}${cleared ? '' : ' = ' + value}`))
  console.log(chalk.dim(`  Stored at ${getPreferencesPath()}\n`))
  printPreferences(after)
}

export async function prefsShowCommand(): Promise<void> {
  const prefs = readPreferences()
  console.log(chalk.dim(`\n  Stored at ${getPreferencesPath()}\n`))
  printPreferences(prefs)
}

export async function prefsClearCommand(key?: string): Promise<void> {
  if (key && !/^design\.[a-z][a-z0-9_-]*$/i.test(key)) {
    console.log(chalk.yellow(`\n  Unsupported key "${key}". Supported: ${SUPPORTED_KEYS.join(', ')}\n`))
    process.exit(1)
  }
  const after = clearPreferences(key)
  console.log(chalk.green(`\n  ${key ? `Cleared ${chalk.bold(key)}` : 'Cleared all preferences'}\n`))
  printPreferences(after)
}

function printPreferences(prefs: Preferences): void {
  const d = prefs.design
  if (!d || Object.keys(d).length === 0) {
    console.log(chalk.dim('  (no preferences set)\n'))
    console.log(chalk.dim('  Examples:'))
    console.log(chalk.dim('    coherent prefs set design.style "minimalist, monochrome"'))
    console.log(chalk.dim('    coherent prefs set design.density compact'))
    console.log(chalk.dim('    coherent prefs set design.avoid "purple gradients"\n'))
    return
  }
  const renderEntry = (k: string, v: unknown): void => {
    const value = Array.isArray(v) ? v.join(', ') : String(v)
    console.log(`  ${chalk.dim(k.padEnd(16))}  ${value}`)
  }
  for (const k of SUPPORTED_KEYS.map(s => s.replace(/^design\./, ''))) {
    if (d[k] !== undefined) renderEntry(k, d[k])
  }
  // Forward-compat: print unknown keys too.
  for (const [k, v] of Object.entries(d)) {
    if (!SUPPORTED_KEYS.map(s => s.replace(/^design\./, '')).includes(k)) {
      renderEntry(k, v)
    }
  }
  console.log('')
}
