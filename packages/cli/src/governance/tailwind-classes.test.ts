import { mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join, resolve } from 'path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  addedDeadClasses,
  type ClassChecker,
  deadClasses,
  findTailwindEntry,
  loadClassChecker,
} from './tailwind-classes.js'

// A checker over a fixed vocabulary, for the string-selection rules.
const fake = (live: string[], dead: string[]): ClassChecker => ({
  entry: 'app/globals.css',
  isUtility: c => live.includes(c) || dead.includes(c),
  isDead: c => dead.includes(c),
})
const ck = fake(
  ['text-destructive', 'text-muted-foreground', 'bg-warning', 'text-xs', 'inline-flex'],
  ['text-success', 'text-warning-foreground', 'my-threads', 'from-a-to-b'],
)
const values = (src: string) => deadClasses('x.tsx', src, ck).map(d => d.value)

describe('deadClasses: which strings are class lists', () => {
  it('className and class helpers', () => {
    expect(values('const A = () => <span className="inline-flex text-success" />')).toEqual(['text-success'])
    expect(values('const A = () => <span className={cn("text-xs", ok && "text-success")} />')).toEqual(['text-success'])
  })

  it('a class ternary in a variable, including a chained one', () => {
    expect(values('const tone = up ? "text-success" : "text-destructive"')).toEqual(['text-success'])
    expect(values('const t = a ? "text-success" : b ? "text-destructive" : "text-muted-foreground"')).toEqual([
      'text-success',
    ])
  })

  it('a class map and a property named className', () => {
    expect(values('const m = { up: "text-success", down: "text-destructive" }')).toEqual(['text-success'])
    expect(values('const s = { label: "Paused", className: "bg-warning text-warning-foreground" }')).toEqual([
      'text-warning-foreground',
    ])
  })

  it('never data: slugs, ids and tab values that start like a utility', () => {
    expect(values('const tabs = ["overview", "my-threads"]')).toEqual([])
    expect(values('const post = { slug: "from-a-to-b", title: "From A to B", tone: "text-xs" }')).toEqual([])
    expect(values('if (a.slug === "from-a-to-b") go()')).toEqual([])
    expect(values('const one = "text-success"')).toEqual([])
    // Only class-holding names make a class context: not `classification`, `classId`.
    expect(values('const d = { classification: "text-success", classId: "text-success" }')).toEqual([])
    expect(values('const d = { iconClassName: "text-success" }')).toEqual(['text-success'])
  })

  it('skips imports and non-class attributes', () => {
    expect(values('import x from "text-success"\nconst A = () => <a href="text-success" />')).toEqual([])
  })

  it('reports only what an edit adds', () => {
    const before = deadClasses('x.tsx', 'const A = () => <i className="text-success" />', ck)
    const after = deadClasses(
      'x.tsx',
      'const A = () => <i className="text-success" />\nconst B = () => <b className="text-success" />',
      ck,
    )
    expect(addedDeadClasses(before, after).map(d => d.line)).toEqual([2])
  })
})

describe('loadClassChecker against a real Tailwind 4', () => {
  let dir: string
  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'coherent-tw-'))
    writeFileSync(join(dir, 'package.json'), '{"name":"fixture","private":true}')
    symlinkSync(resolve(__dirname, '../../node_modules'), join(dir, 'node_modules'))
    mkdirSync(join(dir, 'app'))
    writeFileSync(
      join(dir, 'app', 'globals.css'),
      '@import "tailwindcss";\n@theme inline { --color-positive: var(--positive); }\n:root { --positive: #10b981; }\n',
    )
  })
  afterAll(() => rmSync(dir, { recursive: true, force: true }))

  it('finds the entry and tells live from dead utilities (pins the unstable API)', async () => {
    expect(findTailwindEntry(dir)).toBe(join(dir, 'app', 'globals.css'))
    const c = await loadClassChecker(dir)
    expect(c).not.toBeNull()
    expect(c!.entry).toBe(join('app', 'globals.css'))
    for (const live of ['text-positive', 'hover:bg-positive/10', 'text-sm', 'w-[180px]', 'bg-blue-500'])
      expect([live, c!.isDead(live)]).toEqual([live, false])
    for (const dead of ['text-success', 'dark:bg-success/10', 'text-nope-foreground'])
      expect([dead, c!.isDead(dead)]).toEqual([dead, true])
    // Not Tailwind's business: custom classes and markers are never utilities.
    expect(c!.isUtility('press')).toBe(false)
    expect(c!.isUtility('group')).toBe(false)
    // A bare word that parses (a cva variant name like `top`) is never dead.
    expect(c!.isDead('top')).toBe(false)
  })

  it('resolves Tailwind from the app folder in a monorepo', async () => {
    const mono = mkdtempSync(join(tmpdir(), 'coherent-tw-mono-'))
    try {
      writeFileSync(join(mono, 'package.json'), '{"name":"mono","private":true}')
      mkdirSync(join(mono, 'apps', 'web', 'app'), { recursive: true })
      writeFileSync(join(mono, 'apps', 'web', 'package.json'), '{"name":"web","private":true}')
      symlinkSync(resolve(__dirname, '../../node_modules'), join(mono, 'apps', 'web', 'node_modules'))
      writeFileSync(join(mono, 'apps', 'web', 'app', 'globals.css'), '@import "tailwindcss";\n')
      const c = await loadClassChecker(mono)
      expect(c?.entry).toBe(join('apps', 'web', 'app', 'globals.css'))
      expect(c?.isDead('text-success')).toBe(true)
    } finally {
      rmSync(mono, { recursive: true, force: true })
    }
  })

  it('returns null without a Tailwind 4 entry', async () => {
    const empty = mkdtempSync(join(tmpdir(), 'coherent-tw-none-'))
    try {
      expect(await loadClassChecker(empty)).toBeNull()
    } finally {
      rmSync(empty, { recursive: true, force: true })
    }
  })
})
