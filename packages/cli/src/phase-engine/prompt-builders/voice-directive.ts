/**
 * Voice Directive — render `config.voice` as a prompt block.
 *
 * v0.16.0 (Rollur borrow #1). Parallel to atmosphere directive (visual)
 * but for COPY: tone, copywriting rules, banned words, CTA style,
 * transparency rules. Injected between CORE_CONSTRAINTS and design-quality
 * blocks in the modification prompt — close enough to constraints to be
 * treated as rules, not flavor text.
 *
 * Empty config produces empty string — caller concatenates unconditionally,
 * the empty string contributes nothing to the prompt or token budget.
 */

import type { VoiceProfile } from '@getcoherent/core'

export function renderVoiceDirective(voice: VoiceProfile | undefined): string {
  if (!voice) return ''
  const lines: string[] = []
  if (voice.tone && voice.tone.trim()) {
    lines.push(`- Tone: ${voice.tone.trim()}`)
  }
  if (voice.ctaStyle && voice.ctaStyle.trim()) {
    lines.push(`- CTA style: ${voice.ctaStyle.trim()}`)
  }
  if (Array.isArray(voice.copyRules) && voice.copyRules.length > 0) {
    lines.push('- Copywriting rules (follow verbatim):')
    for (const rule of voice.copyRules) {
      const trimmed = rule.trim()
      if (trimmed) lines.push(`  • ${trimmed}`)
    }
  }
  if (Array.isArray(voice.transparencyRules) && voice.transparencyRules.length > 0) {
    lines.push('- Transparency / trust:')
    for (const rule of voice.transparencyRules) {
      const trimmed = rule.trim()
      if (trimmed) lines.push(`  • ${trimmed}`)
    }
  }
  if (Array.isArray(voice.avoidWords) && voice.avoidWords.length > 0) {
    // Hard ban — phrased so the AI treats it as a validator, not a hint.
    const wordList = voice.avoidWords
      .map(w => w.trim())
      .filter(Boolean)
      .map(w => `"${w}"`)
      .join(', ')
    if (wordList) {
      lines.push(`- Banned words/phrases (do NOT generate): ${wordList}`)
    }
  }
  if (lines.length === 0) return ''
  return ['## VOICE DIRECTIVE', '', ...lines, ''].join('\n')
}
