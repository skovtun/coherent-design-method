/**
 * Named atmosphere presets — seed catalog.
 *
 * Ten curated atmospheres spanning the aesthetic spectrum (minimal, editorial,
 * brutalist, dark-technical, warm-organic, saas-bright, luxury-serif).
 *
 * These are **ceiling presets**: structured alternatives to the ad-hoc mood
 * extraction in `extractAtmosphereFromMessage`. A user who says "use the
 * swiss-grid atmosphere" should get a known-good tuple, not best-effort
 * inference.
 *
 * Each preset is a full {@link Atmosphere} value and passes `AtmosphereSchema`.
 *
 * Names inspired by public design movements (Swiss, brutalism, wabi-sabi,
 * editorial, industrial, paper). Not derived from any proprietary source.
 */
import type { Atmosphere } from './plan-generator.js'

export const ATMOSPHERE_PRESETS: Record<string, Atmosphere> = {
  'swiss-grid': {
    moodPhrase: 'Minimal Swiss grid — disciplined typography, generous whitespace, no ornament',
    background: 'minimal-paper',
    heroLayout: 'left-editorial',
    spacing: 'wide',
    accents: 'monochrome',
    fontStyle: 'sans',
    primaryHint: 'zinc',
  },
  'paper-editorial': {
    moodPhrase: 'Print-inspired editorial — tactile paper feel, serif headlines, considered rhythm',
    background: 'warm-stone',
    heroLayout: 'left-editorial',
    spacing: 'wide',
    accents: 'editorial',
    fontStyle: 'serif-headings',
    primaryHint: 'stone',
  },
  'neo-brutalist': {
    moodPhrase: 'Neo-brutalist — thick borders, uncompromising contrast, unapologetic type',
    background: 'minimal-paper',
    heroLayout: 'centered-bold',
    spacing: 'medium',
    accents: 'monochrome',
    fontStyle: 'sans',
    primaryHint: 'zinc',
  },
  'dark-terminal': {
    moodPhrase: 'Terminal mono — monospace labels, dark canvas, code as hero',
    background: 'code-bg',
    heroLayout: 'code-preview',
    spacing: 'tight',
    accents: 'code-mono',
    fontStyle: 'mono-labels',
    primaryHint: 'emerald',
  },
  'obsidian-neon': {
    moodPhrase: 'Obsidian glass with neon pulse — saturated lime against deep ink',
    background: 'dark-zinc',
    heroLayout: 'centered-bold',
    spacing: 'medium',
    accents: 'multi-gradient',
    fontStyle: 'sans',
    primaryHint: 'lime',
  },
  'premium-focused': {
    moodPhrase: 'Premium and focused — Notion meets Linear, tight spacing, monochrome discipline',
    background: 'dark-zinc',
    heroLayout: 'split-text-image',
    spacing: 'tight',
    accents: 'monochrome',
    fontStyle: 'sans',
    primaryHint: 'zinc',
  },
  'warm-industrial': {
    moodPhrase: 'Warm industrial — stone greys, workshop honesty, no saccharine',
    background: 'warm-stone',
    heroLayout: 'split-text-image',
    spacing: 'medium',
    accents: 'warm-soft',
    fontStyle: 'sans',
    primaryHint: 'stone',
  },
  'solar-saas': {
    moodPhrase: 'Solar SaaS — energetic amber accents, approachable optimism',
    background: 'soft-warm',
    heroLayout: 'split-text-image',
    spacing: 'medium',
    accents: 'warm-soft',
    fontStyle: 'sans',
    primaryHint: 'amber',
  },
  'wabi-sabi': {
    moodPhrase: 'Wabi-sabi — earthen palette, organic restraint, beauty in imperfection',
    background: 'warm-stone',
    heroLayout: 'photo-warm',
    spacing: 'wide',
    accents: 'warm-soft',
    fontStyle: 'serif-headings',
    primaryHint: 'stone',
  },
  'luxury-editorial': {
    moodPhrase: 'Luxury editorial — high-end magazine, dramatic negative space, serif gravitas',
    background: 'minimal-paper',
    heroLayout: 'left-editorial',
    spacing: 'wide',
    accents: 'editorial',
    fontStyle: 'serif-headings',
    primaryHint: 'zinc',
  },
}

export type AtmospherePresetName = keyof typeof ATMOSPHERE_PRESETS

export function getAtmospherePreset(name: string): Atmosphere | undefined {
  return ATMOSPHERE_PRESETS[name]
}

export function listAtmospherePresets(): string[] {
  return Object.keys(ATMOSPHERE_PRESETS)
}
