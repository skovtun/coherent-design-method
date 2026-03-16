/**
 * Build CSS variables string for :root and .dark (design tokens).
 * Used in layout inline style to avoid Next.js build CSS pipeline bug (SyntaxError 51:12).
 */

import type { DesignSystemConfig } from '../types/design-system.js'

function contrastFg(hex: string): string {
  const c = hex.replace('#', '')
  const r = parseInt(c.slice(0, 2), 16)
  const g = parseInt(c.slice(2, 4), 16)
  const b = parseInt(c.slice(4, 6), 16)
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255
  return lum > 0.5 ? '#09090b' : '#fafafa'
}

function blendColors(hex1: string, hex2: string, ratio: number): string {
  const parse = (h: string) => {
    const c = h.replace('#', '')
    return [parseInt(c.slice(0, 2), 16), parseInt(c.slice(2, 4), 16), parseInt(c.slice(4, 6), 16)]
  }
  const [r1, g1, b1] = parse(hex1)
  const [r2, g2, b2] = parse(hex2)
  const blend = (a: number, b: number) => Math.round(a + (b - a) * ratio)
  const toHex = (n: number) => n.toString(16).padStart(2, '0')
  return `#${toHex(blend(r1, r2))}${toHex(blend(g1, g2))}${toHex(blend(b1, b2))}`
}

export function buildCssVariables(config: DesignSystemConfig): string {
  const light = config.tokens.colors.light
  const dark = config.tokens.colors.dark
  const accentVars = light.accent ? `  --accent: ${light.accent};\n  --accent-foreground: ${light.foreground};\n` : ''
  const accentDarkVars = dark.accent ? `  --accent: ${dark.accent};\n  --accent-foreground: ${dark.foreground};\n` : ''
  return `:root {
  --background: ${light.background};
  --foreground: ${light.foreground};
  --primary: ${light.primary};
  --primary-foreground: ${contrastFg(light.primary)};
  --secondary: ${light.secondary};
  --secondary-foreground: ${contrastFg(light.secondary)};
  --muted: ${light.muted};
  --muted-foreground: ${blendColors(light.foreground, light.background, 0.45)};
  --destructive: ${light.error};
  --destructive-foreground: ${contrastFg(light.error)};
  --border: ${light.border};
  --input: ${light.border};
  --ring: ${light.primary};
  --card: ${light.background};
  --card-foreground: ${light.foreground};
  --popover: ${light.background};
  --popover-foreground: ${light.foreground};
  --success: ${light.success};
  --warning: ${light.warning};
  --error: ${light.error};
  --info: ${light.info || light.primary};
${accentVars}}
.dark {
  --background: ${dark.background};
  --foreground: ${dark.foreground};
  --primary: ${dark.primary};
  --primary-foreground: ${contrastFg(dark.primary)};
  --secondary: ${dark.secondary};
  --secondary-foreground: ${contrastFg(dark.secondary)};
  --muted: ${dark.muted};
  --muted-foreground: ${blendColors(dark.foreground, dark.background, 0.45)};
  --destructive: ${dark.error};
  --destructive-foreground: ${contrastFg(dark.error)};
  --border: ${dark.border};
  --input: ${dark.border};
  --ring: ${dark.primary};
  --card: ${dark.background};
  --card-foreground: ${dark.foreground};
  --popover: ${dark.background};
  --popover-foreground: ${dark.foreground};
  --success: ${dark.success};
  --warning: ${dark.warning};
  --error: ${dark.error};
  --info: ${dark.info || dark.primary};
${accentDarkVars}}
`
}
