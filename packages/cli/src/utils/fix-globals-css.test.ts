import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, writeFileSync, readFileSync, mkdirSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { fixGlobalsCss } from './fix-globals-css.js'

function makeProject(tmpDir: string, opts: { v4?: boolean; withInlineStyle?: boolean }) {
  mkdirSync(join(tmpDir, 'app'), { recursive: true })

  if (opts.v4) {
    writeFileSync(
      join(tmpDir, 'package.json'),
      JSON.stringify({
        dependencies: { '@tailwindcss/postcss': '^4.0.0' },
      }),
    )
    writeFileSync(join(tmpDir, 'app', 'globals.css'), '@import "tailwindcss";\n')
  } else {
    writeFileSync(
      join(tmpDir, 'package.json'),
      JSON.stringify({
        devDependencies: { tailwindcss: '^3.4.0' },
      }),
    )
    writeFileSync(join(tmpDir, 'app', 'globals.css'), ':root { --primary: blue; }\n')
  }

  let layoutCode = `import './globals.css'\nexport default function RootLayout({ children }: { children: React.ReactNode }) {\n  return <html lang="en"><body>{children}</body></html>\n}`
  if (opts.withInlineStyle) {
    layoutCode = `import './globals.css'\nexport default function RootLayout({ children }: { children: React.ReactNode }) {\n  return <html lang="en">\n      <head>\n        <style dangerouslySetInnerHTML={{ __html: ":root { --primary: #3B82F6; --ring: #3B82F6; }" }} />\n      </head>\n      <body>{children}</body></html>\n}`
  }
  writeFileSync(join(tmpDir, 'app', 'layout.tsx'), layoutCode)
}

const minConfig = {
  tokens: {
    colors: {
      light: {
        primary: '#10B981',
        secondary: '#8B5CF6',
        accent: '#10B981',
        success: '#10B981',
        warning: '#F59E0B',
        error: '#EF4444',
        info: '#3B82F6',
        background: '#FFFFFF',
        foreground: '#111827',
        muted: '#F3F4F6',
        border: '#E5E7EB',
      },
      dark: {
        primary: '#34D399',
        secondary: '#A78BFA',
        accent: '#34D399',
        success: '#34D399',
        warning: '#FBBF24',
        error: '#F87171',
        info: '#60A5FA',
        background: '#111827',
        foreground: '#F9FAFB',
        muted: '#1F2937',
        border: '#374151',
      },
    },
    spacing: {
      xs: '0.25rem',
      sm: '0.5rem',
      md: '1rem',
      lg: '1.5rem',
      xl: '2rem',
      '2xl': '3rem',
      '3xl': '4rem',
    },
    radius: {
      none: '0',
      sm: '0.25rem',
      md: '0.5rem',
      lg: '0.75rem',
      xl: '1rem',
      full: '9999px',
    },
  },
} as any

describe('fixGlobalsCss', () => {
  let tmpDir: string
  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'fix-css-'))
  })
  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true })
  })

  it('v4: removes stale inline style from layout.tsx', () => {
    makeProject(tmpDir, { v4: true, withInlineStyle: true })
    fixGlobalsCss(tmpDir, minConfig)
    const layout = readFileSync(join(tmpDir, 'app', 'layout.tsx'), 'utf-8')
    expect(layout).not.toContain('dangerouslySetInnerHTML')
    expect(layout).not.toContain('#3B82F6')
  })

  it('v3: updates existing inline style with new colors', () => {
    makeProject(tmpDir, { v4: false, withInlineStyle: true })
    fixGlobalsCss(tmpDir, minConfig)
    const layout = readFileSync(join(tmpDir, 'app', 'layout.tsx'), 'utf-8')
    expect(layout).toContain('dangerouslySetInnerHTML')
    expect(layout).toContain('#10B981')
    expect(layout).not.toContain('--primary: #3B82F6')
    expect(layout).not.toContain('--ring: #3B82F6')
  })

  it('v4: no-op when no inline style exists', () => {
    makeProject(tmpDir, { v4: true, withInlineStyle: false })
    fixGlobalsCss(tmpDir, minConfig)
    const layout = readFileSync(join(tmpDir, 'app', 'layout.tsx'), 'utf-8')
    expect(layout).not.toContain('dangerouslySetInnerHTML')
  })
})
