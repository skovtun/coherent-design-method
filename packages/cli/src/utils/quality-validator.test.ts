/**
 * Unit tests for quality-validator: checkLines, autoFixCode, multi-line comments.
 */

import { describe, it, expect } from 'vitest'
import { validatePageQuality, autoFixCode, checkDesignConsistency, verifyIncrementalEdit } from './quality-validator.js'
import { fixUnescapedLtInJsx } from './self-heal.js'

describe('validatePageQuality', () => {
  it('detects native <button> in JSX', () => {
    const code = `export default function Page() {\n  return <button>Click</button>\n}`
    const issues = validatePageQuality(code)
    expect(issues.some(i => i.type === 'NATIVE_BUTTON')).toBe(true)
  })

  it('does NOT flag <button in single-line comment', () => {
    const code = `export default function Page() {\n  // Use <button> for actions\n  return <div>OK</div>\n}`
    const issues = validatePageQuality(code)
    expect(issues.some(i => i.type === 'NATIVE_BUTTON')).toBe(false)
  })

  it('does NOT flag <button inside a string literal', () => {
    const code = `const hint = "Use <button> component"\nexport default function Page() { return <div>{hint}</div> }`
    const issues = validatePageQuality(code)
    expect(issues.some(i => i.type === 'NATIVE_BUTTON')).toBe(false)
  })

  it('does NOT flag <button inside multi-line comment', () => {
    const code = `/*\n * <button> should not be used directly\n */\nexport default function Page() { return <div>OK</div> }`
    const issues = validatePageQuality(code)
    expect(issues.some(i => i.type === 'NATIVE_BUTTON')).toBe(false)
  })

  it('detects raw color classes', () => {
    const code = `<div className="bg-blue-500 text-sm">Hello</div>`
    const issues = validatePageQuality(code)
    expect(issues.some(i => i.type === 'RAW_COLOR')).toBe(true)
  })

  it('detects text-base usage', () => {
    const code = `<p className="text-base">Text</p>`
    const issues = validatePageQuality(code)
    expect(issues.some(i => i.type === 'TEXT_BASE')).toBe(true)
  })

  it('does not report NO_H1 for auth pages', () => {
    const code = `export default function LoginPage() {
  return (
    <div className="flex min-h-svh items-center justify-center">
      <Card><CardTitle>Sign In</CardTitle></Card>
    </div>
  )
}`
    const issues = validatePageQuality(code, undefined, 'auth')
    expect(issues.find(i => i.type === 'NO_H1')).toBeUndefined()
  })

  it('still reports NO_H1 for app pages without h1', () => {
    const code = `export default function DashboardPage() {
  return <div><p>Dashboard content</p></div>
}`
    const issues = validatePageQuality(code, undefined, 'app')
    expect(issues.find(i => i.type === 'NO_H1')).toBeDefined()
  })

  it('still reports NO_H1 when pageType is omitted (backward compat)', () => {
    const code = `export default function Page() {
  return <div><p>Content</p></div>
}`
    const issues = validatePageQuality(code)
    expect(issues.find(i => i.type === 'NO_H1')).toBeDefined()
  })
})

describe('RAW_COLOR_RE shadow detection', () => {
  it('detects shadow-indigo-500', () => {
    const code = `export default function Page() { return <div className="shadow-indigo-500">x</div> }`
    const issues = validatePageQuality(code)
    expect(issues.some(i => i.type === 'RAW_COLOR')).toBe(true)
  })
})

describe('autoFixCode shadow replacement', () => {
  it('replaces shadow-indigo-500 with shadow-primary', async () => {
    const code = `export default function Page() { return <div className="shadow-indigo-500">x</div> }`
    const { code: fixed } = await autoFixCode(code)
    expect(fixed).toContain('shadow-primary')
    expect(fixed).not.toContain('shadow-indigo')
  })
  it('preserves shadow opacity suffix', async () => {
    const code = `export default function Page() { return <div className="shadow-indigo-500/25">x</div> }`
    const { code: fixed } = await autoFixCode(code)
    expect(fixed).toContain('shadow-primary/25')
  })
})

describe('autoFixCode', () => {
  it('replaces text-base with text-sm in className', async () => {
    const code = `<p className="text-base leading-relaxed">Text</p>`
    const { code: fixed, fixes } = await autoFixCode(code)
    expect(fixed).toContain('text-sm')
    expect(fixed).not.toContain('text-base')
    expect(fixes).toContain('text-base → text-sm')
  })

  it('removes large text from CardTitle', async () => {
    const code = `<CardTitle className="text-lg font-bold">Title</CardTitle>`
    const { code: fixed, fixes } = await autoFixCode(code)
    expect(fixed).not.toContain('text-lg')
    expect(fixes.some(f => f.includes('CardTitle'))).toBe(true)
  })

  it('replaces heavy shadow with shadow-sm', async () => {
    const code = `<div className="shadow-lg rounded-md">Card</div>`
    const { code: fixed, fixes } = await autoFixCode(code)
    expect(fixed).toContain('shadow-sm')
    expect(fixed).not.toContain('shadow-lg')
    expect(fixes).toContain('heavy shadow → shadow-sm')
  })

  it('unescapes literal \\n to real newlines', async () => {
    const code =
      '"use client"\\n\\nimport Link from \'next/link\'\\nexport default function Page() {\\n  return <div>Hi</div>\\n}'
    const { code: fixed, fixes } = await autoFixCode(code)
    expect(fixed).toContain('\n')
    expect(fixed.split('\n').length).toBeGreaterThan(1)
    expect(fixes.some(f => f.includes('newlines'))).toBe(true)
  })

  it('does not unescape \\n when real newlines exist', async () => {
    const code = "'use client'\nconst msg = 'hello\\nworld'\nexport default function Page() { return <div>{msg}</div> }"
    const { code: fixed } = await autoFixCode(code)
    expect(fixed).toContain("'hello\\nworld'")
  })

  it('converts raw <input> to <Input> with import', async () => {
    const code =
      "'use client'\nimport { Button } from '@/components/ui/button'\nexport default function Page() { return <div><input placeholder=\"Name\" /></div> }"
    const { code: fixed, fixes } = await autoFixCode(code)
    expect(fixed).toContain('<Input')
    expect(fixed).not.toMatch(/<input\b/)
    expect(fixed).toContain("from '@/components/ui/input'")
    expect(fixes.some(f => f.includes('<input>'))).toBe(true)
  })

  it('skips hidden inputs', async () => {
    const code = '\'use client\'\nexport default function Page() { return <input type="hidden" name="csrf" /> }'
    const { code: fixed } = await autoFixCode(code)
    expect(fixed).toContain('<input')
  })

  it('does not re-escape < in JS expressions (arrow function + comparison)', async () => {
    const code = `'use client'\nexport default function Page() {\n  const items = data.filter(t => !t.done && new Date(t.due) < new Date()).length\n  return <div>{items}</div>\n}`
    const { code: fixed } = await autoFixCode(code)
    expect(fixed).toContain('< new Date()')
    expect(fixed).not.toContain('&lt;')
  })

  it('still escapes < in actual JSX text content', async () => {
    const code = `'use client'\nexport default function Page() { return <p>Response time: <50ms</p> }`
    const { code: fixed, fixes } = await autoFixCode(code)
    expect(fixed).toContain('&lt;50ms')
    expect(fixes.some(f => f.includes('escaped'))).toBe(true)
  })

  it('does not duplicate aliased lucide icon import', async () => {
    const code = `'use client'\nimport { Settings as SettingsIcon, Save } from "lucide-react"\nexport default function Page() { return <div><SettingsIcon className="size-4" /><Save className="size-4" /></div> }`
    const { code: fixed } = await autoFixCode(code)
    const matches = fixed.match(/SettingsIcon/g) || []
    expect(matches.length).toBe(2)
    expect(fixed).not.toMatch(/SettingsIcon,\s*SettingsIcon/)
    expect(fixed).not.toMatch(/SettingsIcon\s*}\s*from/)
  })

  it('removes existing duplicate lucide import (Settings as SettingsIcon + SettingsIcon)', async () => {
    const code = `'use client'\nimport { User, Bell, Settings as SettingsIcon, Save, Trash2, SettingsIcon } from "lucide-react"\nexport default function Page() { return <div><SettingsIcon className="size-4" /></div> }`
    const { code: fixed, fixes } = await autoFixCode(code)
    expect(fixed).not.toMatch(/SettingsIcon,\s*SettingsIcon/)
    expect(fixed).toContain('Settings as SettingsIcon')
    expect(fixes.some(f => f.includes('duplicate'))).toBe(true)
  })

  it('adds use client when hooks are detected', async () => {
    const code = `import { useState } from 'react'\nexport default function Page() { const [x, setX] = useState(0); return <div>{x}</div> }`
    const { code: fixed, fixes } = await autoFixCode(code)
    expect(fixed.trimStart().startsWith("'use client'")).toBe(true)
    expect(fixes.some(f => f.includes('use client'))).toBe(true)
  })

  it('does NOT add duplicate use client', async () => {
    const code = `'use client'\nimport { useState } from 'react'\nexport default function Page() { const [x, setX] = useState(0); return <div>{x}</div> }`
    const { code: fixed } = await autoFixCode(code)
    const count = (fixed.match(/'use client'/g) || []).length
    expect(count).toBe(1)
  })

  it('cleans up double spaces in className', async () => {
    const code = `<div className="text-sm  leading-relaxed  font-bold">X</div>`
    const { code: fixed } = await autoFixCode(code)
    expect(fixed).not.toContain('  ')
  })

  it('fixes &lt;= in JS code (HTML entity in comparison)', async () => {
    const code = `'use client'\nfunction filter(x: number) { return x &lt;= 200 }`
    const { code: fixed, fixes } = await autoFixCode(code)
    expect(fixed).toContain('x <= 200')
    expect(fixed).not.toContain('&lt;')
    expect(fixes.some(f => f.includes('syntax'))).toBe(true)
  })

  it('fixes &lt; in JS code (budget < 200 pattern)', async () => {
    const code = `'use client'\nconst ok = budget &lt; 200`
    const { code: fixed } = await autoFixCode(code)
    expect(fixed).toContain('budget < 200')
  })

  it('fixes &amp;&amp; in JS code', async () => {
    const code = `'use client'\nconst ok = a &amp;&amp; b`
    const { code: fixed } = await autoFixCode(code)
    expect(fixed).toContain('a && b')
  })

  it('fixes &gt;= in JS code', async () => {
    const code = `'use client'\nconst ok = budget &gt;= 200`
    const { code: fixed } = await autoFixCode(code)
    expect(fixed).toContain('budget >= 200')
  })

  it('replaces /api/placeholder/ URLs with picsum', async () => {
    const code = `'use client'\nconst img = "/api/placeholder/40/40"`
    const { code: fixed, fixes } = await autoFixCode(code)
    expect(fixed).toContain('https://picsum.photos/40/40?random=')
    expect(fixed).not.toContain('/api/placeholder/')
    expect(fixes.some(f => f.includes('placeholder images'))).toBe(true)
  })

  it('replaces /placeholder-avatar-*.jpg with pravatar', async () => {
    const code = `'use client'\nconst img = "/placeholder-avatar-1.jpg"`
    const { code: fixed } = await autoFixCode(code)
    expect(fixed).toContain('https://i.pravatar.cc/150?u=')
    expect(fixed).not.toContain('/placeholder-avatar')
  })

  it('replaces via.placeholder.com URLs with picsum', async () => {
    const code = `'use client'\nconst img = "https://via.placeholder.com/800x400"`
    const { code: fixed } = await autoFixCode(code)
    expect(fixed).toContain('https://picsum.photos/800/400?random=')
  })

  it('replaces /images/*.jpg with picsum', async () => {
    const code = `'use client'\nconst img = "/images/hero-banner.jpg"`
    const { code: fixed } = await autoFixCode(code)
    expect(fixed).toContain('https://picsum.photos/800/400?random=')
    expect(fixed).not.toContain('/images/hero-banner.jpg')
  })

  it('does NOT replace &lt; inside attribute values', async () => {
    const code = 'export default function P() { return <div title="value &lt; 10">text</div> }'
    const { code: fixed } = await autoFixCode(code)
    expect(fixed).toContain('&lt;')
    expect(fixed).not.toContain('title="value < 10"')
  })

  it('strips border classes from TabsTrigger but keeps other classes', async () => {
    const code = `<TabsTrigger value="a" className="flex border border-input">A</TabsTrigger>`
    const { code: fixed, fixes } = await autoFixCode(code)
    expect(fixed).toContain('flex')
    expect(fixed).not.toContain('border-input')
    expect(fixed).not.toContain('"flex border ')
    expect(fixes.some(f => f.includes('TabsTrigger'))).toBe(true)
  })

  it('removes className="-0" junk class from AI output', async () => {
    const code = `<TabsList className="-0 border-0"><TabsTrigger value="a">A</TabsTrigger></TabsList>`
    const { code: fixed, fixes } = await autoFixCode(code)
    expect(fixed).not.toContain('"-0 ')
    expect(fixed).not.toContain(' -0"')
    expect(fixed).not.toContain(' -0 ')
    expect(fixes.some(f => f.includes('junk'))).toBe(true)
  })

  it('removes standalone -0 but keeps border-0', async () => {
    const code = `<div className="flex -0 border-0 p-4">Content</div>`
    const { code: fixed } = await autoFixCode(code)
    expect(fixed).toContain('border-0')
    expect(fixed).not.toMatch(/\s-0[\s"]/)
  })

  it('does not modify TabsTrigger without border classes', async () => {
    const code = `<TabsTrigger value="a" className="flex items-center gap-2">A</TabsTrigger>`
    const { code: fixed } = await autoFixCode(code)
    expect(fixed).toContain('className="flex items-center gap-2"')
  })
})

describe('autoFixCode — native select replacement', () => {
  it('replaces simple native <select> with shadcn Select', async () => {
    const code = `'use client'
import { Button } from '@/components/ui/button'
export default function Page() {
  return (
    <div>
      <select className="border rounded p-2">
        <option value="a">Alpha</option>
        <option value="b">Beta</option>
      </select>
    </div>
  )
}`
    const { code: fixed, fixes } = await autoFixCode(code)
    expect(fixed).not.toContain('<select')
    expect(fixed).not.toContain('<option')
    expect(fixed).toContain('Select')
    expect(fixed).toContain('SelectTrigger')
    expect(fixed).toContain('SelectContent')
    expect(fixed).toContain('SelectItem')
    expect(fixes.some(f => f.includes('select'))).toBe(true)
  })

  it('adds missing sub-imports for composite shadcn components', async () => {
    const code = `import { Select } from '@/components/ui/select'
export function Page() {
  return (
    <Select>
      <SelectTrigger><SelectValue placeholder="Pick" /></SelectTrigger>
      <SelectContent><SelectItem value="a">A</SelectItem></SelectContent>
    </Select>
  )
}`
    const { code: fixed, fixes } = await autoFixCode(code)
    expect(fixed).toContain('SelectTrigger')
    expect(fixed).toContain('SelectValue')
    expect(fixed).toContain('SelectContent')
    expect(fixed).toContain('SelectItem')
    expect(fixed).toMatch(/import\s*\{[^}]*SelectTrigger[^}]*\}\s*from\s*'@\/components\/ui\/select'/)
    expect(fixes.some(f => f.includes('sub-imports'))).toBe(true)
  })

  it('does not duplicate existing sub-imports', async () => {
    const code = `import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from '@/components/ui/select'
export function Page() {
  return <Select><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="a">A</SelectItem></SelectContent></Select>
}`
    const { code: fixed, fixes } = await autoFixCode(code)
    expect(fixes.every(f => !f.includes('sub-imports'))).toBe(true)
    expect(fixed).toBe(code)
  })
})

describe('design system consistency', () => {
  it('warns on hardcoded hex colors', () => {
    const code = 'className="bg-[#FF5733] text-white"'
    const warnings = checkDesignConsistency(code)
    expect(warnings).toContainEqual(expect.objectContaining({ type: 'hardcoded-color' }))
  })

  it('does not warn on CSS variable colors', () => {
    const code = 'className="bg-primary text-foreground"'
    const warnings = checkDesignConsistency(code)
    expect(warnings.filter(w => w.type === 'hardcoded-color')).toHaveLength(0)
  })

  it('warns on arbitrary pixel values in spacing', () => {
    const code = 'className="p-[13px] mt-[47px]"'
    const warnings = checkDesignConsistency(code)
    expect(warnings).toContainEqual(expect.objectContaining({ type: 'arbitrary-spacing' }))
  })
})

describe('autoFixCode — extended color coverage', () => {
  it('replaces red colors with destructive tokens', async () => {
    const code = `'use client'\nexport default function Page() {\n  return <div className="bg-red-500 text-red-100 border-red-600">Error</div>\n}`
    const { code: fixed } = await autoFixCode(code)
    expect(fixed).not.toContain('bg-red-500')
    expect(fixed).not.toContain('text-red-100')
    expect(fixed).not.toContain('border-red-600')
  })

  it('replaces green colors with primary tokens', async () => {
    const code = `'use client'\nexport default function Page() {\n  return <div className="bg-green-500 text-green-600">Success</div>\n}`
    const { code: fixed } = await autoFixCode(code)
    expect(fixed).not.toContain('bg-green-500')
    expect(fixed).not.toContain('text-green-600')
  })

  it('replaces yellow and orange colors', async () => {
    const code = `'use client'\nexport default function Page() {\n  return <div className="bg-yellow-500 text-orange-600">Warning</div>\n}`
    const { code: fixed } = await autoFixCode(code)
    expect(fixed).not.toContain('bg-yellow-500')
    expect(fixed).not.toContain('text-orange-600')
  })

  it('replaces pink, fuchsia, and lime colors', async () => {
    const code = `'use client'\nexport default function Page() {\n  return <div className="bg-pink-500 text-fuchsia-400 border-lime-600">Colorful</div>\n}`
    const { code: fixed } = await autoFixCode(code)
    expect(fixed).not.toContain('bg-pink-500')
    expect(fixed).not.toContain('text-fuchsia-400')
    expect(fixed).not.toContain('border-lime-600')
  })

  it('handles shade 300 and 400 for bg', async () => {
    const code = `'use client'\nexport default function Page() {\n  return <div className="bg-blue-300 bg-emerald-400">Shades</div>\n}`
    const { code: fixed } = await autoFixCode(code)
    expect(fixed).not.toContain('bg-blue-300')
    expect(fixed).not.toContain('bg-emerald-400')
  })

  it('handles opacity modifiers without producing double opacity', async () => {
    const code = `'use client'\nexport default function Page() {\n  return <div className="bg-blue-500/50 text-emerald-600/80 border-red-500/20">Opacity</div>\n}`
    const { code: fixed } = await autoFixCode(code)
    expect(fixed).not.toContain('bg-blue-500/50')
    expect(fixed).not.toContain('text-emerald-600/80')
    expect(fixed).not.toContain('border-red-500/20')
    expect(fixed).not.toMatch(/\/\d+\/\d+/)
  })
})

describe('SKIPPED_HEADING in Card context', () => {
  it('downgrades to info when h3 is inside Card components', () => {
    const code = `
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
export default function Dashboard() {
  return (
    <div className="space-y-6">
      <h1>Dashboard</h1>
      <Card>
        <CardHeader><CardTitle>Active Projects</CardTitle></CardHeader>
        <CardContent><h3>Project Alpha</h3></CardContent>
      </Card>
    </div>
  )
}`
    const issues = validatePageQuality(code)
    const skipped = issues.filter(i => i.type === 'SKIPPED_HEADING')
    expect(skipped.length).toBe(1)
    expect(skipped[0].severity).toBe('info')
  })

  it('keeps warning severity when h3 is NOT inside Card', () => {
    const code = `
export default function Page() {
  return (
    <div className="space-y-6">
      <h1>Title</h1>
      <h3>Subtitle without h2</h3>
    </div>
  )
}`
    const issues = validatePageQuality(code)
    const skipped = issues.filter(i => i.type === 'SKIPPED_HEADING')
    expect(skipped.length).toBe(1)
    expect(skipped[0].severity).toBe('warning')
  })
})

describe('AI output verification for incremental edits', () => {
  it('detects removed imports that are still used', () => {
    const before = `import { Button } from '@/components/ui/button'\nimport { Card } from '@/components/ui/card'\nexport default function Page() { return <Card><Button>Click</Button></Card> }`
    const after = `import { Button } from '@/components/ui/button'\nexport default function Page() { return <Card><Button>Click</Button></Card> }`
    const issues = verifyIncrementalEdit(before, after)
    expect(issues).toContainEqual(expect.objectContaining({ type: 'missing-import', symbol: 'Card' }))
  })

  it('detects missing use client when hooks are present', () => {
    const code = `import { useState } from 'react'\nexport default function Page() { const [x, setX] = useState(0); return <div>{x}</div> }`
    const issues = verifyIncrementalEdit('', code)
    expect(issues).toContainEqual(expect.objectContaining({ type: 'missing-use-client' }))
  })

  it('passes clean incremental edit', () => {
    const before = `'use client'\nimport { Button } from '@/components/ui/button'\nexport default function Page() { return <Button>Old</Button> }`
    const after = `'use client'\nimport { Button } from '@/components/ui/button'\nexport default function Page() { return <Button>New</Button> }`
    const issues = verifyIncrementalEdit(before, after)
    expect(issues).toHaveLength(0)
  })
})

describe('DOM nesting validation', () => {
  it('detects Button inside Link without asChild', () => {
    const code = `
import Link from 'next/link'
import { Button } from '@/components/ui/button'
export default function Page() {
  return <Link href="/foo"><Button>Click</Button></Link>
}`
    const issues = validatePageQuality(code)
    const nesting = issues.filter(i => i.type === 'NESTED_INTERACTIVE')
    expect(nesting.length).toBeGreaterThanOrEqual(1)
    expect(nesting[0].severity).toBe('error')
  })

  it('allows Button with asChild inside Link', () => {
    const code = `
import Link from 'next/link'
import { Button } from '@/components/ui/button'
export default function Page() {
  return <Button asChild><Link href="/foo">Click</Link></Button>
}`
    const issues = validatePageQuality(code)
    const nesting = issues.filter(i => i.type === 'NESTED_INTERACTIVE')
    expect(nesting.length).toBe(0)
  })

  it('detects nested anchor tags', () => {
    const code = `
export default function Page() {
  return <a href="/outer"><div><a href="/inner">Nested</a></div></a>
}`
    const issues = validatePageQuality(code)
    const nesting = issues.filter(i => i.type === 'NESTED_INTERACTIVE')
    expect(nesting.length).toBeGreaterThanOrEqual(1)
  })
})

describe('LINK_MISSING_HREF', () => {
  it('detects <Link> without href', () => {
    const code = '<Link className="inline-flex items-center gap-2"><Plus /> New</Link>'
    const issues = validatePageQuality(code)
    expect(issues.some(i => i.type === 'LINK_MISSING_HREF')).toBe(true)
  })

  it('detects <a> without href', () => {
    const code = '<a className="underline">Click</a>'
    const issues = validatePageQuality(code)
    expect(issues.some(i => i.type === 'LINK_MISSING_HREF')).toBe(true)
  })

  it('does not flag <Link href="/foo">', () => {
    const code = '<Link href="/foo">Go</Link>'
    const issues = validatePageQuality(code)
    expect(issues.some(i => i.type === 'LINK_MISSING_HREF')).toBe(false)
  })

  it('does not flag <Link href={url}>', () => {
    const code = '<Link href={url}>Go</Link>'
    const issues = validatePageQuality(code)
    expect(issues.some(i => i.type === 'LINK_MISSING_HREF')).toBe(false)
  })

  it('does not flag <a href="#">', () => {
    const code = '<a href="#">Link</a>'
    const issues = validatePageQuality(code)
    expect(issues.some(i => i.type === 'LINK_MISSING_HREF')).toBe(false)
  })
})

describe('autoFixCode Link href', () => {
  it('adds href="/" to <Link> without href', async () => {
    const code = '<Link className="inline-flex"><Plus /> New</Link>'
    const { code: fixed } = await autoFixCode(code)
    expect(fixed).toContain('<Link href="/"')
  })

  it('adds href="/" to <a> without href', async () => {
    const code = '<a className="underline">Click</a>'
    const { code: fixed } = await autoFixCode(code)
    expect(fixed).toContain('<a href="/"')
  })

  it('does not modify <Link href="/foo">', async () => {
    const code = '<Link href="/foo" className="text-blue-500">Go</Link>'
    const { code: fixed } = await autoFixCode(code)
    expect(fixed).toContain('href="/foo"')
  })
})

describe('autoFixCode — RAW_COLOR in cn()/clsx()', () => {
  it('replaces raw colors inside cn() calls', async () => {
    const code = `import { cn } from '@/lib/utils'
export default function Page() {
  return <div className={cn("bg-emerald-500 p-4", active && "text-zinc-400")}>Test</div>
}`
    const { code: fixed, fixes } = await autoFixCode(code)
    expect(fixed).not.toContain('bg-emerald-500')
    expect(fixed).toContain('bg-primary')
    expect(fixed).not.toContain('text-zinc-400')
    expect(fixed).toContain('text-muted-foreground')
    expect(fixes).toContain('raw colors → semantic tokens')
  })

  it('replaces raw colors inside clsx() calls', async () => {
    const code = `import clsx from 'clsx'
export default function Page() {
  return <div className={clsx("text-amber-500")}>Test</div>
}`
    const { code: fixed } = await autoFixCode(code)
    expect(fixed).not.toContain('text-amber-500')
  })

  it('replaces raw colors in single-quoted className', async () => {
    const code = `export default function Page() {
  return <div className='bg-red-500 text-white'>Test</div>
}`
    const { code: fixed } = await autoFixCode(code)
    expect(fixed).not.toContain('bg-red-500')
    expect(fixed).toContain('bg-destructive')
  })

  it('replaces raw colors in template literal className', async () => {
    const code =
      'export default function Page() {\n  return <div className={`bg-blue-600 ${active ? "p-4" : ""}`}>Test</div>\n}'
    const { code: fixed } = await autoFixCode(code)
    expect(fixed).not.toContain('bg-blue-600')
    expect(fixed).toContain('bg-primary')
  })

  it('replaces raw colors with hover/focus state prefixes', async () => {
    const code = `export default function Page() {
  return <div className="hover:bg-orange-400 focus:text-amber-500 p-4">Test</div>
}`
    const { code: fixed } = await autoFixCode(code)
    expect(fixed).not.toContain('hover:bg-orange-400')
    expect(fixed).not.toContain('focus:text-amber-500')
    expect(fixed).toContain('hover:bg-primary/20')
    expect(fixed).toContain('focus:text-primary')
  })

  it('replaces ring and gradient raw colors', async () => {
    const code = `export default function Page() {
  return <div className="ring-indigo-500 from-blue-500 to-blue-200">Test</div>
}`
    const { code: fixed } = await autoFixCode(code)
    expect(fixed).not.toContain('ring-indigo-500')
    expect(fixed).not.toContain('from-blue-500')
    expect(fixed).not.toContain('to-blue-200')
    expect(fixed).toContain('ring-primary')
    expect(fixed).toContain('from-primary')
    expect(fixed).toContain('to-primary/20')
  })
})

describe('autoFixCode — escaped closing quotes', () => {
  it('fixes escaped closing quote before }', async () => {
    const code = `export default function Page() {
  const tasks = [
    { id: '1', description: 'Conduct user interviews and analyze current website analytics\\' },
    { id: '2', description: 'Design wireframes\\' },
  ]
  return <div>{tasks.map(t => <p key={t.id}>{t.description}</p>)}</div>
}`
    const { code: fixed, fixes } = await autoFixCode(code)
    expect(fixed).toContain("analytics' }")
    expect(fixed).toContain("wireframes' }")
    expect(fixed).not.toContain("\\'")
    expect(fixes).toContain('fixed escaped closing quotes in strings')
  })

  it('fixes escaped closing quote before ]', async () => {
    const code = `const items = ['first\\', 'second\\']`
    const { code: fixed } = await autoFixCode(code)
    expect(fixed).toContain("'first'")
    expect(fixed).toContain("'second'")
  })

  it('preserves legitimate escaped apostrophes', async () => {
    const code = `const s = 'it\\'s a test'`
    const { code: fixed } = await autoFixCode(code)
    expect(fixed).toContain("\\'s a test")
  })
})

describe('autoFixCode — icon shrink-0', () => {
  it('adds shrink-0 to lucide icon className', async () => {
    const code = `import { Filter } from "lucide-react"
export default function Page() {
  return <Filter className="size-4 text-muted-foreground" />
}`
    const { code: fixed, fixes } = await autoFixCode(code)
    expect(fixed).toContain('shrink-0')
    expect(fixes.some(f => f.includes('shrink-0'))).toBe(true)
  })

  it('does not add shrink-0 if already present', async () => {
    const code = `import { Filter } from "lucide-react"
export default function Page() {
  return <Filter className="size-4 shrink-0 text-muted-foreground" />
}`
    const { code: fixed } = await autoFixCode(code)
    const matches = fixed.match(/shrink-0/g)
    expect(matches?.length).toBe(1)
  })
})

describe('autoFixCode — deduplicate fallback icons', () => {
  it('replaces multiple invalid icons with a single Circle import', async () => {
    const code = `import { ArrowRight, Star, Github, Twitter, Linkedin } from "lucide-react"
export default function Page() {
  return (
    <div>
      <ArrowRight />
      <Star />
      <Github className="size-4" />
      <Twitter className="size-4" />
      <Linkedin className="size-4" />
    </div>
  )
}`
    const { code: fixed, fixes } = await autoFixCode(code)
    const lucideImport = fixed.match(/import\s*\{([^}]+)\}\s*from\s*["']lucide-react["']/)
    expect(lucideImport).toBeTruthy()
    const names = lucideImport![1].split(',').map(s => s.trim())
    expect(names.filter(n => n === 'ExternalLink').length).toBe(1)
    expect(names.filter(n => n === 'MessageCircle').length).toBe(1)
    expect(names.filter(n => n === 'Link2').length).toBe(1)
    expect(fixed).not.toContain('<Github')
    expect(fixed).not.toContain('<Twitter')
    expect(fixed).not.toContain('<Linkedin')
    expect(fixed).toContain('<ExternalLink className="size-4')
    expect(fixes.some(f => f.includes('invalid lucide icons'))).toBe(true)
  })
})

describe('autoFixCode — DOM nesting fix', () => {
  it('adds asChild when Button is inside Link', async () => {
    const code = `import Link from 'next/link'
import { Button } from '@/components/ui/button'
export default function Page() {
  return <Link href="/foo"><Button>Click</Button></Link>
}`
    const { code: fixed, fixes } = await autoFixCode(code)
    expect(fixed).toContain('asChild')
    expect(fixes.some(f => f.includes('DOM nesting') || f.includes('asChild'))).toBe(true)
  })
})

describe('autoFixCode — Button asChild child flex (base-ui compat)', () => {
  it('adds inline-flex to Link inside Button asChild', async () => {
    const code = `import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { ArrowRight } from "lucide-react"
export default function Page() {
  return <Button size="lg" asChild><Link href="/register">Get Started<ArrowRight className="size-4 shrink-0" /></Link></Button>
}`
    const { code: fixed, fixes } = await autoFixCode(code)
    expect(fixed).toContain('inline-flex')
    expect(fixed).toContain('items-center')
    expect(fixes.some(f => f.includes('inline-flex'))).toBe(true)
  })

  it('merges inline-flex with existing className on Link', async () => {
    const code = `import Link from 'next/link'
import { Button } from '@/components/ui/button'
export default function Page() {
  return <Button asChild><Link href="/foo" className="text-sm">Click</Link></Button>
}`
    const { code: fixed } = await autoFixCode(code)
    expect(fixed).toContain('inline-flex')
    expect(fixed).toContain('text-sm')
  })

  it('skips if Link already has inline-flex', async () => {
    const code = `import Link from 'next/link'
import { Button } from '@/components/ui/button'
export default function Page() {
  return <Button asChild><Link href="/foo" className="inline-flex items-center gap-2">Click</Link></Button>
}`
    const { code: fixed } = await autoFixCode(code)
    const count = (fixed.match(/inline-flex/g) || []).length
    expect(count).toBe(1)
  })

  it('handles multiline Button asChild with Link child', async () => {
    const code = `import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { ArrowRight } from "lucide-react"
export default function Page() {
  return (
    <Button size="lg" asChild>
      <Link href="/register">
        Get Started
        <ArrowRight className="size-4 shrink-0" />
      </Link>
    </Button>
  )
}`
    const { code: fixed } = await autoFixCode(code)
    expect(fixed).toContain('inline-flex')
    expect(fixed).toContain('items-center')
  })
})

describe('smart href resolution', () => {
  it('resolves href from linkMap', async () => {
    const code = '<Link>Sign in</Link>'
    const { code: fixed } = await autoFixCode(code, {
      linkMap: { 'Sign in': '/login' },
    })
    expect(fixed).toContain('href="/login"')
  })

  it('resolves href from known routes by page name', async () => {
    const code = '<Link>Dashboard</Link>'
    const { code: fixed } = await autoFixCode(code, {
      knownRoutes: ['/dashboard', '/tasks'],
    })
    expect(fixed).toContain('href="/dashboard"')
  })

  it('strips "Back to" prefix when matching routes', async () => {
    const code = '<Link>Back to Projects</Link>'
    const { code: fixed } = await autoFixCode(code, {
      knownRoutes: ['/projects', '/dashboard'],
    })
    expect(fixed).toContain('href="/projects"')
  })

  it('falls back to / when no context provided', async () => {
    const code = '<Link>Click here</Link>'
    const { code: fixed } = await autoFixCode(code)
    expect(fixed).toContain('href="/"')
  })

  it('falls back to / when no match found in context', async () => {
    const code = '<Link>Something random</Link>'
    const { code: fixed } = await autoFixCode(code, {
      knownRoutes: ['/dashboard'],
    })
    expect(fixed).toContain('href="/"')
  })
})

describe('autoFixCode — template literal className syntax', () => {
  it('fixes misplaced ) in template literal className: `...`})> → `...`}>', async () => {
    const code = `export default function Page() {
  return <div className={\`text-sm \${active ? 'bg-primary' : ''}\`)>Hello</div>
}`
    const { code: fixed } = await autoFixCode(code)
    expect(fixed).toContain('`}>')
    expect(fixed).not.toContain('`)>')
  })
})

describe('validatePageQuality — extended color detection', () => {
  it('detects divide- prefix with raw color', () => {
    const code = '<div className="divide-gray-200 divide-y">content</div>'
    const issues = validatePageQuality(code)
    expect(issues.some(i => i.type === 'RAW_COLOR')).toBe(true)
  })

  it('detects fill- prefix with raw color', () => {
    const code = '<svg><circle className="fill-blue-500" /></svg>'
    const issues = validatePageQuality(code)
    expect(issues.some(i => i.type === 'RAW_COLOR')).toBe(true)
  })

  it('detects stroke- prefix with raw color', () => {
    const code = '<svg><path className="stroke-red-400" /></svg>'
    const issues = validatePageQuality(code)
    expect(issues.some(i => i.type === 'RAW_COLOR')).toBe(true)
  })

  it('detects placeholder- prefix with raw color', () => {
    const code = '<Input className="placeholder-gray-400" />'
    const issues = validatePageQuality(code)
    expect(issues.some(i => i.type === 'RAW_COLOR')).toBe(true)
  })

  it('detects decoration- prefix with raw color', () => {
    const code = '<a className="decoration-blue-500 underline">link</a>'
    const issues = validatePageQuality(code)
    expect(issues.some(i => i.type === 'RAW_COLOR')).toBe(true)
  })

  it('detects caret- prefix with raw color', () => {
    const code = '<Input className="caret-blue-500" />'
    const issues = validatePageQuality(code)
    expect(issues.some(i => i.type === 'RAW_COLOR')).toBe(true)
  })

  it('detects accent- prefix with raw color', () => {
    const code = '<input className="accent-purple-500" type="checkbox" />'
    const issues = validatePageQuality(code)
    expect(issues.some(i => i.type === 'RAW_COLOR')).toBe(true)
  })

  it('detects dark: modifier with raw color', () => {
    const code = '<div className="dark:bg-blue-500">content</div>'
    const issues = validatePageQuality(code)
    expect(issues.some(i => i.type === 'RAW_COLOR')).toBe(true)
  })

  it('detects stacked modifiers like dark:hover: with raw color', () => {
    const code = '<div className="dark:hover:bg-blue-600">content</div>'
    const issues = validatePageQuality(code)
    expect(issues.some(i => i.type === 'RAW_COLOR')).toBe(true)
  })

  it('detects responsive modifier with raw color', () => {
    const code = '<div className="lg:text-gray-500">content</div>'
    const issues = validatePageQuality(code)
    expect(issues.some(i => i.type === 'RAW_COLOR')).toBe(true)
  })

  it('detects bg-white as raw color', () => {
    const code = '<div className="bg-white">content</div>'
    const issues = validatePageQuality(code)
    expect(issues.some(i => i.type === 'RAW_COLOR')).toBe(true)
  })

  it('detects text-black as raw color', () => {
    const code = '<div className="text-black">content</div>'
    const issues = validatePageQuality(code)
    expect(issues.some(i => i.type === 'RAW_COLOR')).toBe(true)
  })

  it('does NOT flag semantic tokens', () => {
    const code = '<div className="bg-primary text-foreground border-border">ok</div>'
    const issues = validatePageQuality(code)
    expect(issues.filter(i => i.type === 'RAW_COLOR')).toHaveLength(0)
  })

  it('does NOT flag semantic tokens with opacity', () => {
    const code = '<div className="bg-primary/50 text-muted-foreground/80">ok</div>'
    const issues = validatePageQuality(code)
    expect(issues.filter(i => i.type === 'RAW_COLOR')).toHaveLength(0)
  })
})

describe('validatePageQuality — inline style color detection', () => {
  it('detects hex color in inline style', () => {
    const code = '<div style={{ backgroundColor: "#f59e0b" }}>content</div>'
    const issues = validatePageQuality(code)
    expect(issues.some(i => i.type === 'inline-style-color')).toBe(true)
  })

  it('detects named color in inline style', () => {
    const code = '<div style={{ color: "orange" }}>content</div>'
    const issues = validatePageQuality(code)
    expect(issues.some(i => i.type === 'inline-style-color')).toBe(true)
  })

  it('detects rgb() in inline style', () => {
    const code = '<div style={{ color: "rgb(255, 0, 0)" }}>content</div>'
    const issues = validatePageQuality(code)
    expect(issues.some(i => i.type === 'inline-style-color')).toBe(true)
  })

  it('does NOT flag non-color inline styles', () => {
    const code = '<div style={{ display: "flex", gap: "1rem" }}>content</div>'
    const issues = validatePageQuality(code)
    expect(issues.filter(i => i.type === 'inline-style-color')).toHaveLength(0)
  })
})

describe('validatePageQuality — arbitrary color values', () => {
  it('detects bg-[#hex] arbitrary value', () => {
    const code = '<div className="bg-[#f59e0b]">content</div>'
    const issues = validatePageQuality(code)
    expect(issues.some(i => i.type === 'arbitrary-color')).toBe(true)
  })

  it('detects text-[rgb(...)] arbitrary value', () => {
    const code = '<div className="text-[rgb(255,0,0)]">content</div>'
    const issues = validatePageQuality(code)
    expect(issues.some(i => i.type === 'arbitrary-color')).toBe(true)
  })

  it('does NOT flag non-color arbitrary values', () => {
    const code = '<div className="w-[200px] h-[calc(100vh-64px)]">content</div>'
    const issues = validatePageQuality(code)
    expect(issues.filter(i => i.type === 'arbitrary-color')).toHaveLength(0)
  })
})

describe('validatePageQuality — SVG color attributes', () => {
  it('detects fill with hex value', () => {
    const code = '<circle fill="#f59e0b" />'
    const issues = validatePageQuality(code)
    expect(issues.some(i => i.type === 'svg-raw-color')).toBe(true)
  })

  it('detects stroke with named color', () => {
    const code = '<path stroke="orange" />'
    const issues = validatePageQuality(code)
    expect(issues.some(i => i.type === 'svg-raw-color')).toBe(true)
  })

  it('allows fill="none"', () => {
    const code = '<path fill="none" />'
    const issues = validatePageQuality(code)
    expect(issues.filter(i => i.type === 'svg-raw-color')).toHaveLength(0)
  })

  it('allows fill="currentColor"', () => {
    const code = '<circle fill="currentColor" />'
    const issues = validatePageQuality(code)
    expect(issues.filter(i => i.type === 'svg-raw-color')).toHaveLength(0)
  })

  it('allows fill="url(...)"', () => {
    const code = '<rect fill="url(#gradient)" />'
    const issues = validatePageQuality(code)
    expect(issues.filter(i => i.type === 'svg-raw-color')).toHaveLength(0)
  })
})

describe('validatePageQuality — color props', () => {
  it('detects hex color prop', () => {
    const code = '<Icon color="#f59e0b" />'
    const issues = validatePageQuality(code)
    expect(issues.some(i => i.type === 'color-prop')).toBe(true)
  })

  it('does NOT flag non-hex color prop', () => {
    const code = '<Icon color="currentColor" />'
    const issues = validatePageQuality(code)
    expect(issues.filter(i => i.type === 'color-prop')).toHaveLength(0)
  })
})

describe('fixUnescapedLtInJsx multiline safety', () => {
  it('does not corrupt multiline JSX tags', () => {
    const code = '>\n<div className="test">'
    const result = fixUnescapedLtInJsx(code)
    expect(result).toContain('<div')
    expect(result).not.toContain('&lt;div')
  })
})
