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

function hexToHsl(hex: string): [number, number, number] {
  const c = hex.replace('#', '')
  const r = parseInt(c.slice(0, 2), 16) / 255
  const g = parseInt(c.slice(2, 4), 16) / 255
  const b = parseInt(c.slice(4, 6), 16) / 255
  const max = Math.max(r, g, b),
    min = Math.min(r, g, b)
  const l = (max + min) / 2
  if (max === min) return [0, 0, l]
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  let h = 0
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6
  else if (max === g) h = ((b - r) / d + 2) / 6
  else h = ((r - g) / d + 4) / 6
  return [h * 360, s, l]
}

function hslToHex(h: number, s: number, l: number): string {
  h = ((h % 360) + 360) % 360
  const a = s * Math.min(l, 1 - l)
  const f = (n: number) => {
    const k = (n + h / 30) % 12
    const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1)
    return Math.round(255 * Math.max(0, Math.min(1, color)))
      .toString(16)
      .padStart(2, '0')
  }
  return `#${f(0)}${f(8)}${f(4)}`
}

function generateChartColors(primary: string, secondary: string): string[] {
  const [h1, s1, l1] = hexToHsl(primary)
  const [h2, s2, l2] = hexToHsl(secondary)
  return [
    primary,
    secondary,
    hslToHex(h1 + 60, s1 * 0.8, l1),
    hslToHex(h2 + 90, s2 * 0.7, l2),
    hslToHex(h1 + 180, s1 * 0.6, l1),
  ]
}

export function buildCssVariables(config: DesignSystemConfig): string {
  const light = config.tokens.colors.light
  const dark = config.tokens.colors.dark
  // Always use muted for accent — AI confuses "accent" (vivid highlight) with shadcn's
  // semantic meaning (subtle hover/active background). Vivid accent breaks ghost buttons,
  // dropdown hovers, and sidebar active states.
  const accentVars = `  --accent: ${light.muted};\n  --accent-foreground: ${light.foreground};\n`
  const accentDarkVars = `  --accent: ${dark.muted};\n  --accent-foreground: ${dark.foreground};\n`

  const sidebarLightVars = `  --sidebar-background: ${light.background};
  --sidebar-foreground: ${light.foreground};
  --sidebar-primary: ${light.primary};
  --sidebar-primary-foreground: ${contrastFg(light.primary)};
  --sidebar-accent: ${light.muted};
  --sidebar-accent-foreground: ${light.foreground};
  --sidebar-border: ${light.border};
  --sidebar-ring: ${light.primary};\n`

  const chartLight = generateChartColors(light.primary, light.secondary)
  const chartDark = generateChartColors(dark.primary, dark.secondary)
  const chartLightVars = chartLight.map((c, i) => `  --chart-${i + 1}: ${c};`).join('\n') + '\n'
  const chartDarkVars = chartDark.map((c, i) => `  --chart-${i + 1}: ${c};`).join('\n') + '\n'

  const sidebarDarkVars = `  --sidebar-background: ${dark.background};
  --sidebar-foreground: ${dark.foreground};
  --sidebar-primary: ${dark.primary};
  --sidebar-primary-foreground: ${contrastFg(dark.primary)};
  --sidebar-accent: ${dark.muted};
  --sidebar-accent-foreground: ${dark.foreground};
  --sidebar-border: ${dark.border};
  --sidebar-ring: ${dark.primary};\n`
  const radius = config.tokens.radius?.md ?? '0.5rem'

  return `:root {
  --radius: ${radius};
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
${accentVars}${sidebarLightVars}${chartLightVars}}
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
${accentDarkVars}${sidebarDarkVars}${chartDarkVars}}
`
}
