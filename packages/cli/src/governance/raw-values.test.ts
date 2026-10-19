import { describe, it, expect } from 'vitest'
import { addedRawValues, classifyClass, rawValues } from './raw-values.js'

describe('classifyClass', () => {
  it('flags literals, not tokens, theme scale or layout sizes', () => {
    const cases: [string, string | null][] = [
      ['bg-[#3b82f6]', 'color'],
      ['hover:text-[rgb(0,0,0)]', 'color'],
      ['text-blue-500/80', 'color'],
      ['md:!border-zinc-200', 'color'],
      ['text-[15px]', 'type'],
      ['text-[length:var(--size)]', null],
      ['-mt-[3px]', 'spacing'],
      ['rounded-[10px]', 'radius'],
      ['rounded-[inherit]', null],
      ['shadow-[0_1px_2px_rgba(0,0,0,.1)]', 'shadow'],
      ['bg-[var(--brand)]', null],
      ['bg-primary', null],
      ['p-4', null],
      ['rounded-lg', null],
      ['w-[280px]', null],
      ['text-white', null],
    ]
    for (const [cls, kind] of cases) expect([cls, classifyClass(cls)]).toEqual([cls, kind])
  })
})

describe('rawValues', () => {
  it('reads classes, class helpers, style colours and svg colours; ignores other strings', () => {
    const src = `import { cva } from 'class-variance-authority'
const v = cva('rounded-[6px]', { variants: { tone: { loud: 'bg-red-500' } } })
const label = 'text-[13px] is just a string'
export function A({ on }: { on: boolean }) {
  return (
    <div className={cn('p-4', on && 'text-[13px]', { 'bg-[#fff]': on })} style={{ color: '#111', width: 300 }}>
      <svg fill="#4285F4" stroke="currentColor" />
    </div>
  )
}
`
    expect(rawValues('a.tsx', src).map(v => [v.line, v.kind, v.value])).toEqual([
      [2, 'radius', 'rounded-[6px]'],
      [2, 'color', 'bg-red-500'],
      [6, 'type', 'text-[13px]'],
      [6, 'color', 'bg-[#fff]'],
      [6, 'color', 'color: #111'],
      [7, 'color', 'fill="#4285F4"'],
    ])
  })

  it('counts only what an edit adds', () => {
    const before = rawValues('a.tsx', `export const A = () => <p className="text-[13px]" />\n`)
    const after = rawValues(
      'a.tsx',
      `export const A = () => <><p className="text-[13px]" /><p className="text-[13px] bg-[#000]" /></>\n`,
    )
    expect(addedRawValues(before, after).map(v => v.value)).toEqual(['text-[13px]', 'bg-[#000]'])
  })
})
