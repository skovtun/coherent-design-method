const REQUIRED_THEME_TOKENS = [
  '--color-transparent',
  '--color-black',
  '--color-white',
  '--color-sidebar-background',
  '--color-sidebar-foreground',
  '--color-sidebar-primary',
  '--color-sidebar-primary-foreground',
  '--color-sidebar-accent',
  '--color-sidebar-accent-foreground',
  '--color-sidebar-border',
  '--color-sidebar-ring',
  '--color-sidebar-muted',
  '--color-sidebar-muted-foreground',
  '--color-chart-1',
  '--color-chart-2',
  '--color-chart-3',
  '--color-chart-4',
  '--color-chart-5',
  '--radius-xs',
]

const VAR_REFERENCE_RE = /var\(--([^)]+)\)/

export function validateV4GlobalsCss(css: string): string[] {
  const issues: string[] = []

  if (css.includes('@tailwind base') || css.includes('@tailwind components')) {
    issues.push('Stale v3 directive (@tailwind) found in v4 CSS — remove it')
  }

  const themeMatch = css.match(/@theme\s+inline\s*\{([^}]*(?:\{[^}]*\}[^}]*)*)\}/s)
  const themeBlock = themeMatch ? themeMatch[1] : ''

  for (const token of REQUIRED_THEME_TOKENS) {
    if (!themeBlock.includes(token)) {
      issues.push(`Missing @theme token: ${token}`)
    }
  }

  const themeLines = themeBlock.split('\n')
  for (const line of themeLines) {
    const varMatch = line.match(VAR_REFERENCE_RE)
    if (!varMatch) continue
    const referencedVar = `--${varMatch[1]}`
    const definedInRoot = css.includes(`${referencedVar}:`) || css.includes(`${referencedVar} :`)
    if (!definedInRoot) {
      issues.push(`@theme references var(${referencedVar}) but it is not defined in :root/.dark`)
    }
  }

  return issues
}
