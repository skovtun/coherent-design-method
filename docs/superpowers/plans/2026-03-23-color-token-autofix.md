# Color Token Auto-Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `update-token` modifications work reliably by auto-converting AI-generated color values to `#RRGGBB` hex, improving the prompt, validating token paths, and formatting errors readably.

**Architecture:** Defense in depth — the AI prompt guides correct output, `normalizeRequest` auto-converts invalid formats before validation, `updateToken` validates paths against a whitelist, and Zod error messages are formatted for humans.

**Tech Stack:** TypeScript, Zod, vitest

---

### Task 1: `colorToHex` Utility

**Files:**
- Create: `packages/core/src/utils/color-utils.ts`
- Create: `packages/core/src/utils/color-utils.test.ts`
- Modify: `packages/core/src/index.ts`

- [ ] **Step 1: Write the failing tests**

In `packages/core/src/utils/color-utils.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { colorToHex } from './color-utils.js'

describe('colorToHex', () => {
  it('passes through valid 6-digit hex', () => {
    expect(colorToHex('#4F46E5')).toBe('#4F46E5')
    expect(colorToHex('#ffffff')).toBe('#FFFFFF')
  })

  it('truncates 8-digit hex (drops alpha)', () => {
    expect(colorToHex('#4F46E5CC')).toBe('#4F46E5')
  })

  it('expands 3-digit hex', () => {
    expect(colorToHex('#F0A')).toBe('#FF00AA')
  })

  it('prepends # to bare hex', () => {
    expect(colorToHex('4F46E5')).toBe('#4F46E5')
  })

  it('converts CSS named colors', () => {
    expect(colorToHex('red')).toBe('#FF0000')
    expect(colorToHex('indigo')).toBe('#4B0082')
    expect(colorToHex('coral')).toBe('#FF7F50')
    expect(colorToHex('White')).toBe('#FFFFFF')
  })

  it('converts Tailwind color names', () => {
    expect(colorToHex('indigo-500')).toBe('#6366F1')
    expect(colorToHex('blue-600')).toBe('#2563EB')
    expect(colorToHex('red-500')).toBe('#EF4444')
    expect(colorToHex('zinc-900')).toBe('#18181B')
  })

  it('converts rgb()', () => {
    expect(colorToHex('rgb(79, 70, 229)')).toBe('#4F46E5')
    expect(colorToHex('rgb(255, 0, 0)')).toBe('#FF0000')
  })

  it('converts rgba() (drops alpha)', () => {
    expect(colorToHex('rgba(79, 70, 229, 0.5)')).toBe('#4F46E5')
  })

  it('converts hsl()', () => {
    expect(colorToHex('hsl(0, 100%, 50%)')).toBe('#FF0000')
    expect(colorToHex('hsl(120, 100%, 50%)')).toBe('#00FF00')
    expect(colorToHex('hsl(240, 100%, 50%)')).toBe('#0000FF')
  })

  it('converts hsla() (drops alpha)', () => {
    expect(colorToHex('hsla(0, 100%, 50%, 0.8)')).toBe('#FF0000')
  })

  it('is case-insensitive', () => {
    expect(colorToHex('RED')).toBe('#FF0000')
    expect(colorToHex('Indigo-500')).toBe('#6366F1')
    expect(colorToHex('RGB(255, 0, 0)')).toBe('#FF0000')
    expect(colorToHex('HSL(0, 100%, 50%)')).toBe('#FF0000')
  })

  it('returns null for unrecognized values', () => {
    expect(colorToHex('not-a-color')).toBeNull()
    expect(colorToHex('')).toBeNull()
    expect(colorToHex('primary')).toBeNull()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/core && npx vitest run src/utils/color-utils.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement `colorToHex`**

Create `packages/core/src/utils/color-utils.ts`:

```typescript
const CSS_COLORS: Record<string, string> = {
  aliceblue: '#F0F8FF', antiquewhite: '#FAEBD7', aqua: '#00FFFF', aquamarine: '#7FFFD4',
  azure: '#F0FFFF', beige: '#F5F5DC', bisque: '#FFE4C4', black: '#000000',
  blanchedalmond: '#FFEBCD', blue: '#0000FF', blueviolet: '#8A2BE2', brown: '#A52A2A',
  burlywood: '#DEB887', cadetblue: '#5F9EA0', chartreuse: '#7FFF00', chocolate: '#D2691E',
  coral: '#FF7F50', cornflowerblue: '#6495ED', cornsilk: '#FFF8DC', crimson: '#DC143C',
  cyan: '#00FFFF', darkblue: '#00008B', darkcyan: '#008B8B', darkgoldenrod: '#B8860B',
  darkgray: '#A9A9A9', darkgreen: '#006400', darkgrey: '#A9A9A9', darkkhaki: '#BDB76B',
  darkmagenta: '#8B008B', darkolivegreen: '#556B2F', darkorange: '#FF8C00',
  darkorchid: '#9932CC', darkred: '#8B0000', darksalmon: '#E9967A', darkseagreen: '#8FBC8F',
  darkslateblue: '#483D8B', darkslategray: '#2F4F4F', darkslategrey: '#2F4F4F',
  darkturquoise: '#00CED1', darkviolet: '#9400D3', deeppink: '#FF1493',
  deepskyblue: '#00BFFF', dimgray: '#696969', dimgrey: '#696969', dodgerblue: '#1E90FF',
  firebrick: '#B22222', floralwhite: '#FFFAF0', forestgreen: '#228B22', fuchsia: '#FF00FF',
  gainsboro: '#DCDCDC', ghostwhite: '#F8F8FF', gold: '#FFD700', goldenrod: '#DAA520',
  gray: '#808080', green: '#008000', greenyellow: '#ADFF2F', grey: '#808080',
  honeydew: '#F0FFF0', hotpink: '#FF69B4', indianred: '#CD5C5C', indigo: '#4B0082',
  ivory: '#FFFFF0', khaki: '#F0E68C', lavender: '#E6E6FA', lavenderblush: '#FFF0F5',
  lawngreen: '#7CFC00', lemonchiffon: '#FFFACD', lightblue: '#ADD8E6', lightcoral: '#F08080',
  lightcyan: '#E0FFFF', lightgoldenrodyellow: '#FAFAD2', lightgray: '#D3D3D3',
  lightgreen: '#90EE90', lightgrey: '#D3D3D3', lightpink: '#FFB6C1', lightsalmon: '#FFA07A',
  lightseagreen: '#20B2AA', lightskyblue: '#87CEFA', lightslategray: '#778899',
  lightslategrey: '#778899', lightsteelblue: '#B0C4DE', lightyellow: '#FFFFE0',
  lime: '#00FF00', limegreen: '#32CD32', linen: '#FAF0E6', magenta: '#FF00FF',
  maroon: '#800000', mediumaquamarine: '#66CDAA', mediumblue: '#0000CD',
  mediumorchid: '#BA55D3', mediumpurple: '#9370DB', mediumseagreen: '#3CB371',
  mediumslateblue: '#7B68EE', mediumspringgreen: '#00FA9A', mediumturquoise: '#48D1CC',
  mediumvioletred: '#C71585', midnightblue: '#191970', mintcream: '#F5FFFA',
  mistyrose: '#FFE4E1', moccasin: '#FFE4B5', navajowhite: '#FFDEAD', navy: '#000080',
  oldlace: '#FDF5E6', olive: '#808000', olivedrab: '#6B8E23', orange: '#FFA500',
  orangered: '#FF4500', orchid: '#DA70D6', palegoldenrod: '#EEE8AA', palegreen: '#98FB98',
  paleturquoise: '#AFEEEE', palevioletred: '#DB7093', papayawhip: '#FFEFD5',
  peachpuff: '#FFDAB9', peru: '#CD853F', pink: '#FFC0CB', plum: '#DDA0DD',
  powderblue: '#B0E0E6', purple: '#800080', rebeccapurple: '#663399', red: '#FF0000',
  rosybrown: '#BC8F8F', royalblue: '#4169E1', saddlebrown: '#8B4513', salmon: '#FA8072',
  sandybrown: '#F4A460', seagreen: '#2E8B57', seashell: '#FFF5EE', sienna: '#A0522D',
  silver: '#C0C0C0', skyblue: '#87CEEB', slateblue: '#6A5ACD', slategray: '#708090',
  slategrey: '#708090', snow: '#FFFAFA', springgreen: '#00FF7F', steelblue: '#4682B4',
  tan: '#D2B48C', teal: '#008080', thistle: '#D8BFD8', tomato: '#FF6347',
  turquoise: '#40E0D0', violet: '#EE82EE', wheat: '#F5DEB3', white: '#FFFFFF',
  whitesmoke: '#F5F5F5', yellow: '#FFFF00', yellowgreen: '#9ACD32',
}

const TAILWIND_COLORS: Record<string, string> = {
  'slate-50': '#F8FAFC', 'slate-100': '#F1F5F9', 'slate-200': '#E2E8F0', 'slate-300': '#CBD5E1',
  'slate-400': '#94A3B8', 'slate-500': '#64748B', 'slate-600': '#475569', 'slate-700': '#334155',
  'slate-800': '#1E293B', 'slate-900': '#0F172A', 'slate-950': '#020617',
  'gray-50': '#F9FAFB', 'gray-100': '#F3F4F6', 'gray-200': '#E5E7EB', 'gray-300': '#D1D5DB',
  'gray-400': '#9CA3AF', 'gray-500': '#6B7280', 'gray-600': '#4B5563', 'gray-700': '#374151',
  'gray-800': '#1F2937', 'gray-900': '#111827', 'gray-950': '#030712',
  'zinc-50': '#FAFAFA', 'zinc-100': '#F4F4F5', 'zinc-200': '#E4E4E7', 'zinc-300': '#D4D4D8',
  'zinc-400': '#A1A1AA', 'zinc-500': '#71717A', 'zinc-600': '#52525B', 'zinc-700': '#3F3F46',
  'zinc-800': '#27272A', 'zinc-900': '#18181B', 'zinc-950': '#09090B',
  'neutral-50': '#FAFAFA', 'neutral-100': '#F5F5F5', 'neutral-200': '#E5E5E5', 'neutral-300': '#D4D4D4',
  'neutral-400': '#A3A3A3', 'neutral-500': '#737373', 'neutral-600': '#525252', 'neutral-700': '#404040',
  'neutral-800': '#262626', 'neutral-900': '#171717', 'neutral-950': '#0A0A0A',
  'red-50': '#FEF2F2', 'red-100': '#FEE2E2', 'red-200': '#FECACA', 'red-300': '#FCA5A5',
  'red-400': '#F87171', 'red-500': '#EF4444', 'red-600': '#DC2626', 'red-700': '#B91C1C',
  'red-800': '#991B1B', 'red-900': '#7F1D1D', 'red-950': '#450A0A',
  'orange-50': '#FFF7ED', 'orange-100': '#FFEDD5', 'orange-200': '#FED7AA', 'orange-300': '#FDBA74',
  'orange-400': '#FB923C', 'orange-500': '#F97316', 'orange-600': '#EA580C', 'orange-700': '#C2410C',
  'orange-800': '#9A3412', 'orange-900': '#7C2D12', 'orange-950': '#431407',
  'amber-50': '#FFFBEB', 'amber-100': '#FEF3C7', 'amber-200': '#FDE68A', 'amber-300': '#FCD34D',
  'amber-400': '#FBBF24', 'amber-500': '#F59E0B', 'amber-600': '#D97706', 'amber-700': '#B45309',
  'amber-800': '#92400E', 'amber-900': '#78350F', 'amber-950': '#451A03',
  'yellow-50': '#FEFCE8', 'yellow-100': '#FEF9C3', 'yellow-200': '#FEF08A', 'yellow-300': '#FDE047',
  'yellow-400': '#FACC15', 'yellow-500': '#EAB308', 'yellow-600': '#CA8A04', 'yellow-700': '#A16207',
  'yellow-800': '#854D0E', 'yellow-900': '#713F12', 'yellow-950': '#422006',
  'lime-50': '#F7FEE7', 'lime-100': '#ECFCCB', 'lime-200': '#D9F99D', 'lime-300': '#BEF264',
  'lime-400': '#A3E635', 'lime-500': '#84CC16', 'lime-600': '#65A30D', 'lime-700': '#4D7C0F',
  'lime-800': '#3F6212', 'lime-900': '#365314', 'lime-950': '#1A2E05',
  'green-50': '#F0FDF4', 'green-100': '#DCFCE7', 'green-200': '#BBF7D0', 'green-300': '#86EFAC',
  'green-400': '#4ADE80', 'green-500': '#22C55E', 'green-600': '#16A34A', 'green-700': '#15803D',
  'green-800': '#166534', 'green-900': '#14532D', 'green-950': '#052E16',
  'emerald-50': '#ECFDF5', 'emerald-100': '#D1FAE5', 'emerald-200': '#A7F3D0', 'emerald-300': '#6EE7B7',
  'emerald-400': '#34D399', 'emerald-500': '#10B981', 'emerald-600': '#059669', 'emerald-700': '#047857',
  'emerald-800': '#065F46', 'emerald-900': '#064E3B', 'emerald-950': '#022C22',
  'teal-50': '#F0FDFA', 'teal-100': '#CCFBF1', 'teal-200': '#99F6E4', 'teal-300': '#5EEAD4',
  'teal-400': '#2DD4BF', 'teal-500': '#14B8A6', 'teal-600': '#0D9488', 'teal-700': '#0F766E',
  'teal-800': '#115E59', 'teal-900': '#134E4A', 'teal-950': '#042F2E',
  'cyan-50': '#ECFEFF', 'cyan-100': '#CFFAFE', 'cyan-200': '#A5F3FC', 'cyan-300': '#67E8F9',
  'cyan-400': '#22D3EE', 'cyan-500': '#06B6D4', 'cyan-600': '#0891B2', 'cyan-700': '#0E7490',
  'cyan-800': '#155E75', 'cyan-900': '#164E63', 'cyan-950': '#083344',
  'sky-50': '#F0F9FF', 'sky-100': '#E0F2FE', 'sky-200': '#BAE6FD', 'sky-300': '#7DD3FC',
  'sky-400': '#38BDF8', 'sky-500': '#0EA5E9', 'sky-600': '#0284C7', 'sky-700': '#0369A1',
  'sky-800': '#075985', 'sky-900': '#0C4A6E', 'sky-950': '#082F49',
  'blue-50': '#EFF6FF', 'blue-100': '#DBEAFE', 'blue-200': '#BFDBFE', 'blue-300': '#93C5FD',
  'blue-400': '#60A5FA', 'blue-500': '#3B82F6', 'blue-600': '#2563EB', 'blue-700': '#1D4ED8',
  'blue-800': '#1E40AF', 'blue-900': '#1E3A8A', 'blue-950': '#172554',
  'indigo-50': '#EEF2FF', 'indigo-100': '#E0E7FF', 'indigo-200': '#C7D2FE', 'indigo-300': '#A5B4FC',
  'indigo-400': '#818CF8', 'indigo-500': '#6366F1', 'indigo-600': '#4F46E5', 'indigo-700': '#4338CA',
  'indigo-800': '#3730A3', 'indigo-900': '#312E81', 'indigo-950': '#1E1B4B',
  'violet-50': '#F5F3FF', 'violet-100': '#EDE9FE', 'violet-200': '#DDD6FE', 'violet-300': '#C4B5FD',
  'violet-400': '#A78BFA', 'violet-500': '#8B5CF6', 'violet-600': '#7C3AED', 'violet-700': '#6D28D9',
  'violet-800': '#5B21B6', 'violet-900': '#4C1D95', 'violet-950': '#2E1065',
  'purple-50': '#FAF5FF', 'purple-100': '#F3E8FF', 'purple-200': '#E9D5FF', 'purple-300': '#D8B4FE',
  'purple-400': '#C084FC', 'purple-500': '#A855F7', 'purple-600': '#9333EA', 'purple-700': '#7E22CE',
  'purple-800': '#6B21A8', 'purple-900': '#581C87', 'purple-950': '#3B0764',
  'fuchsia-50': '#FDF4FF', 'fuchsia-100': '#FAE8FF', 'fuchsia-200': '#F5D0FE', 'fuchsia-300': '#F0ABFC',
  'fuchsia-400': '#E879F9', 'fuchsia-500': '#D946EF', 'fuchsia-600': '#C026D3', 'fuchsia-700': '#A21CAF',
  'fuchsia-800': '#86198F', 'fuchsia-900': '#701A75', 'fuchsia-950': '#4A044E',
  'pink-50': '#FDF2F8', 'pink-100': '#FCE7F3', 'pink-200': '#FBCFE8', 'pink-300': '#F9A8D4',
  'pink-400': '#F472B6', 'pink-500': '#EC4899', 'pink-600': '#DB2777', 'pink-700': '#BE185D',
  'pink-800': '#9D174D', 'pink-900': '#831843', 'pink-950': '#500724',
  'rose-50': '#FFF1F2', 'rose-100': '#FFE4E6', 'rose-200': '#FECDD3', 'rose-300': '#FDA4AF',
  'rose-400': '#FB7185', 'rose-500': '#F43F5E', 'rose-600': '#E11D48', 'rose-700': '#BE123C',
  'rose-800': '#9F1239', 'rose-900': '#881337', 'rose-950': '#4C0519',
  'stone-50': '#FAFAF9', 'stone-100': '#F5F5F4', 'stone-200': '#E7E5E4', 'stone-300': '#D6D3D1',
  'stone-400': '#A8A29E', 'stone-500': '#78716C', 'stone-600': '#57534E', 'stone-700': '#44403C',
  'stone-800': '#292524', 'stone-900': '#1C1917', 'stone-950': '#0C0A09',
}

function hslToHex(h: number, s: number, l: number): string {
  s /= 100
  l /= 100
  const a = s * Math.min(l, 1 - l)
  const f = (n: number) => {
    const k = (n + h / 30) % 12
    const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1)
    return Math.round(255 * Math.max(0, Math.min(1, color)))
      .toString(16)
      .padStart(2, '0')
  }
  return `#${f(0)}${f(8)}${f(4)}`.toUpperCase()
}

function componentToHex(c: number): string {
  const clamped = Math.max(0, Math.min(255, Math.round(c)))
  return clamped.toString(16).padStart(2, '0')
}

export function colorToHex(value: string): string | null {
  const v = value.trim()
  if (!v) return null

  // 1. Valid 6-digit hex
  if (/^#[0-9A-F]{6}$/i.test(v)) {
    return v.toUpperCase()
  }

  // 2. 8-digit hex (drop alpha)
  if (/^#[0-9A-F]{8}$/i.test(v)) {
    return v.slice(0, 7).toUpperCase()
  }

  // 3. 3-digit hex → expand
  if (/^#[0-9A-F]{3}$/i.test(v)) {
    const [, r, g, b] = v.split('')
    return `#${r}${r}${g}${g}${b}${b}`.toUpperCase()
  }

  // 4. Bare hex without #
  if (/^[0-9A-F]{6}$/i.test(v)) {
    return `#${v.toUpperCase()}`
  }

  // 5. CSS named color
  const cssHex = CSS_COLORS[v.toLowerCase()]
  if (cssHex) return cssHex

  // 6. Tailwind color name
  const twHex = TAILWIND_COLORS[v.toLowerCase()]
  if (twHex) return twHex

  // 7. rgb() / rgba()
  const rgbMatch = v.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*[\d.]+)?\s*\)$/i)
  if (rgbMatch) {
    const [, r, g, b] = rgbMatch
    return `#${componentToHex(+r)}${componentToHex(+g)}${componentToHex(+b)}`.toUpperCase()
  }

  // 8. hsl() / hsla()
  const hslMatch = v.match(
    /^hsla?\(\s*([\d.]+)\s*,\s*([\d.]+)%\s*,\s*([\d.]+)%(?:\s*,\s*[\d.]+)?\s*\)$/i,
  )
  if (hslMatch) {
    const [, h, s, l] = hslMatch
    return hslToHex(+h, +s, +l)
  }

  return null
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/core && npx vitest run src/utils/color-utils.test.ts`
Expected: ALL PASS

- [ ] **Step 5: Export from core index**

Add to `packages/core/src/index.ts`:

```typescript
export { colorToHex } from './utils/color-utils'
```

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/utils/color-utils.ts packages/core/src/utils/color-utils.test.ts packages/core/src/index.ts
git commit -m "feat(core): add colorToHex utility for CSS/Tailwind/rgb/hsl → hex conversion"
```

---

### Task 2: Token Normalization in `normalizeRequest`

**Files:**
- Modify: `packages/cli/src/commands/chat/request-parser.ts:236`
- Modify: `packages/cli/src/commands/chat/request-parser.test.ts`

- [ ] **Step 1: Write the failing tests**

Add to `packages/cli/src/commands/chat/request-parser.test.ts`:

```typescript
import { normalizeRequest } from './request-parser.js'
import type { DesignSystemConfig, ModificationRequest } from '@getcoherent/core'

const MINIMAL_CONFIG = {
  name: 'Test',
  pages: [],
  components: [],
  tokens: { colors: { light: {}, dark: {} } },
  settings: { appType: 'saas' },
} as unknown as DesignSystemConfig

describe('normalizeRequest — update-token color auto-conversion', () => {
  it('converts CSS color name to hex', () => {
    const req: ModificationRequest = {
      type: 'update-token',
      target: 'colors.light.primary',
      changes: { value: 'indigo' },
    }
    const result = normalizeRequest(req, MINIMAL_CONFIG) as ModificationRequest
    expect(result.changes.value).toBe('#4B0082')
  })

  it('converts Tailwind color name to hex', () => {
    const req: ModificationRequest = {
      type: 'update-token',
      target: 'colors.dark.primary',
      changes: { value: 'indigo-500' },
    }
    const result = normalizeRequest(req, MINIMAL_CONFIG) as ModificationRequest
    expect(result.changes.value).toBe('#6366F1')
  })

  it('passes through valid hex unchanged', () => {
    const req: ModificationRequest = {
      type: 'update-token',
      target: 'colors.light.primary',
      changes: { value: '#4F46E5' },
    }
    const result = normalizeRequest(req, MINIMAL_CONFIG) as ModificationRequest
    expect(result.changes.value).toBe('#4F46E5')
  })

  it('does not convert non-color token paths', () => {
    const req: ModificationRequest = {
      type: 'update-token',
      target: 'spacing.md',
      changes: { value: '1.5rem' },
    }
    const result = normalizeRequest(req, MINIMAL_CONFIG) as ModificationRequest
    expect(result.changes.value).toBe('1.5rem')
  })

  it('leaves unrecognized values untouched for color paths', () => {
    const req: ModificationRequest = {
      type: 'update-token',
      target: 'colors.light.primary',
      changes: { value: 'some-random-string' },
    }
    const result = normalizeRequest(req, MINIMAL_CONFIG) as ModificationRequest
    expect(result.changes.value).toBe('some-random-string')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/cli && npx vitest run src/commands/chat/request-parser.test.ts`
Expected: FAIL — no `update-token` tests found or test assertions fail

- [ ] **Step 3: Add `update-token` case to `normalizeRequest`**

In `packages/cli/src/commands/chat/request-parser.ts`, add inside the `switch (request.type)` block (after the existing cases, before the closing `}`):

```typescript
case 'update-token': {
  if (changes?.value && typeof changes.value === 'string') {
    const isColorPath = request.target.includes('colors.')
    if (isColorPath) {
      const { colorToHex } = await import('@getcoherent/core')
      const hex = colorToHex(changes.value)
      if (hex && hex !== changes.value) {
        return { ...request, changes: { ...changes, value: hex } }
      }
    }
  }
  break
}
```

Note: `normalizeRequest` is currently synchronous. Since the dynamic import is static and only done for module structure, change the function to use a top-level import instead:

At the top of `request-parser.ts`, add:
```typescript
import { colorToHex } from '@getcoherent/core'
```

Then the case body:
```typescript
case 'update-token': {
  if (changes?.value && typeof changes.value === 'string') {
    const isColorPath = request.target.includes('colors.')
    if (isColorPath) {
      const hex = colorToHex(changes.value)
      if (hex && hex !== changes.value) {
        return { ...request, changes: { ...changes, value: hex } }
      }
    }
  }
  break
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/cli && npx vitest run src/commands/chat/request-parser.test.ts`
Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/commands/chat/request-parser.ts packages/cli/src/commands/chat/request-parser.test.ts
git commit -m "feat(cli): auto-convert color values in update-token via normalizeRequest"
```

---

### Task 3: Token Path Validation + Human-Readable Errors

**Files:**
- Modify: `packages/core/src/managers/DesignSystemManager.ts:99-173`
- Modify: `packages/core/src/managers/DesignSystemManager.test.ts`

- [ ] **Step 1: Write the failing tests**

Add to `packages/core/src/managers/DesignSystemManager.test.ts`:

```typescript
import { DesignSystemManager } from './DesignSystemManager.js'
import { writeFileSync, mkdirSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

function createTestDSM(): { dsm: DesignSystemManager; cleanup: () => void } {
  const dir = join(tmpdir(), `dsm-test-${Date.now()}`)
  mkdirSync(dir, { recursive: true })
  const configPath = join(dir, 'design-system.config.ts')
  const config = {
    name: 'Test',
    description: 'Test',
    version: '1.0.0',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    settings: { appType: 'saas', framework: 'next', styling: 'tailwind' },
    tokens: {
      colors: {
        light: {
          primary: '#000000', secondary: '#111111', success: '#22C55E',
          warning: '#F59E0B', error: '#EF4444', info: '#3B82F6',
          background: '#FFFFFF', foreground: '#000000', muted: '#F1F5F9', border: '#E2E8F0',
        },
        dark: {
          primary: '#FFFFFF', secondary: '#EEEEEE', success: '#22C55E',
          warning: '#F59E0B', error: '#EF4444', info: '#3B82F6',
          background: '#000000', foreground: '#FFFFFF', muted: '#1E293B', border: '#334155',
        },
      },
      spacing: { xs: '0.25rem', sm: '0.5rem', md: '1rem', lg: '1.5rem', xl: '2rem', '2xl': '3rem', '3xl': '4rem' },
      radius: { none: '0', sm: '0.25rem', md: '0.5rem', lg: '0.75rem', xl: '1rem', full: '9999px' },
      typography: { fontFamily: { heading: 'Inter', body: 'Inter', mono: 'JetBrains Mono' }, scale: 1.25, baseSize: '1rem' },
    },
    components: [],
    pages: [],
    sharedComponents: [],
    navigation: { type: 'header', items: [] },
  }
  writeFileSync(configPath, `export const config = ${JSON.stringify(config)} as const`)
  const dsm = new DesignSystemManager(configPath)
  return { dsm, cleanup: () => rmSync(dir, { recursive: true, force: true }) }
}

describe('DesignSystemManager.updateToken — path validation', () => {
  it('rejects unknown color fields', async () => {
    const { dsm, cleanup } = createTestDSM()
    await dsm.load()
    const result = await dsm.updateToken('colors.light.indigo', '#4F46E5')
    expect(result.success).toBe(false)
    expect(result.message).toContain('Invalid token path')
    cleanup()
  })

  it('allows valid color paths', async () => {
    const { dsm, cleanup } = createTestDSM()
    await dsm.load()
    const result = await dsm.updateToken('colors.light.primary', '#4F46E5')
    expect(result.success).toBe(true)
    cleanup()
  })

  it('allows valid spacing paths', async () => {
    const { dsm, cleanup } = createTestDSM()
    await dsm.load()
    const result = await dsm.updateToken('spacing.md', '1.5rem')
    expect(result.success).toBe(true)
    cleanup()
  })
})

describe('DesignSystemManager.updateToken — error formatting', () => {
  it('shows human-readable error for invalid hex', async () => {
    const { dsm, cleanup } = createTestDSM()
    await dsm.load()
    const result = await dsm.updateToken('colors.light.primary', 'not-hex')
    expect(result.success).toBe(false)
    expect(result.message).not.toContain('"validation"')
    expect(result.message).not.toContain('"code"')
    expect(result.message).toContain('Must be valid hex color')
    cleanup()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/core && npx vitest run src/managers/DesignSystemManager.test.ts`
Expected: Path validation test FAILS (unknown path accepted), error format test may FAIL (raw JSON shown)

- [ ] **Step 3: Add path whitelist and improve error formatting**

In `packages/core/src/managers/DesignSystemManager.ts`, modify `updateToken`:

Add the path whitelist constant at module level (before the class):

```typescript
import { ZodError } from 'zod'

const VALID_COLOR_FIELDS = ['primary', 'secondary', 'accent', 'success', 'warning', 'error', 'info', 'background', 'foreground', 'muted', 'border']
const VALID_SPACING_FIELDS = ['xs', 'sm', 'md', 'lg', 'xl', '2xl', '3xl']
const VALID_RADIUS_FIELDS = ['none', 'sm', 'md', 'lg', 'xl', 'full']
const VALID_TOKEN_PATHS = new Set([
  ...VALID_COLOR_FIELDS.map(f => `colors.light.${f}`),
  ...VALID_COLOR_FIELDS.map(f => `colors.dark.${f}`),
  ...VALID_SPACING_FIELDS.map(f => `spacing.${f}`),
  ...VALID_RADIUS_FIELDS.map(f => `radius.${f}`),
])
```

Add path validation at the start of `updateToken` (after the null config check):

```typescript
if (!VALID_TOKEN_PATHS.has(path)) {
  return {
    success: false,
    modified: [],
    config: this.config,
    message: `Invalid token path "${path}". Valid paths: ${[...VALID_TOKEN_PATHS].slice(0, 5).join(', ')}...`,
  }
}
```

Replace the error handler (the `catch` block at line ~162) with:

```typescript
} catch (error) {
  if (error instanceof ZodError) {
    const issues = error.issues.map(i => `"${i.path.join('.')}" — ${i.message}`).join('; ')
    return {
      success: false,
      modified: [],
      config: this.config,
      message: `Failed to update token "${path}": ${issues}`,
    }
  }
  if (error instanceof Error) {
    return {
      success: false,
      modified: [],
      config: this.config,
      message: `Failed to update token "${path}": ${error.message}`,
    }
  }
  throw error
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/core && npx vitest run src/managers/DesignSystemManager.test.ts`
Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/managers/DesignSystemManager.ts packages/core/src/managers/DesignSystemManager.test.ts
git commit -m "feat(core): add token path whitelist and human-readable Zod error formatting"
```

---

### Task 4: Prompt Enhancement

**Files:**
- Modify: `packages/cli/src/agents/modifier.ts:234-238, 271`

- [ ] **Step 1: Update `buildModificationPrompt` — add current color tokens**

In `packages/cli/src/agents/modifier.ts`, replace the "Current Design System" section (lines ~234-238):

```typescript
const light = config.tokens.colors.light
const dark = config.tokens.colors.dark

// ... existing return string template ...
// Replace lines 234-238 with:

Current Design System:
- Name: ${config.name}
- App Type: ${config.settings.appType}
- Pages: ${config.pages.map(p => `${p.name} (${p.route})`).join(', ')}
- Components: ${config.components.length} components

Current color tokens (#RRGGBB hex):
  Light theme:
    Brand:   primary=${light.primary}, secondary=${light.secondary}, accent=${light.accent || 'none'}
    Status:  success=${light.success}, warning=${light.warning}, error=${light.error}, info=${light.info}
    Surface: background=${light.background}, foreground=${light.foreground}, muted=${light.muted}, border=${light.border}
  Dark theme:
    Brand:   primary=${dark.primary}, secondary=${dark.secondary}, accent=${dark.accent || 'none'}
    Status:  success=${dark.success}, warning=${dark.warning}, error=${dark.error}, info=${dark.info}
    Surface: background=${dark.background}, foreground=${dark.foreground}, muted=${dark.muted}, border=${dark.border}
```

- [ ] **Step 2: Update `update-token` type description**

Replace line ~271:

From:
```
- "update-token": Change design token (e.g., colors.light.primary)
```

To:
```
- "update-token": Change design token. target: dot-path (e.g. "colors.light.primary"). changes: { "value": "#RRGGBB" }. Color values MUST be 6-digit hex with # prefix (e.g. #4F46E5 for indigo, #DC2626 for red). When changing a color, ALWAYS update BOTH light and dark themes for consistency.
```

- [ ] **Step 3: Verify no linter errors**

Run: `cd packages/cli && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add packages/cli/src/agents/modifier.ts
git commit -m "feat(cli): add color tokens and format requirements to AI modifier prompt"
```

---

### Task 5: `ColorTokenSchema` Error Message Cleanup

**Files:**
- Modify: `packages/core/src/types/design-system.ts:24-41`

- [ ] **Step 1: Add 'Must be valid hex color' to all color fields**

In `packages/core/src/types/design-system.ts`, update `ColorTokenSchema`:

```typescript
export const ColorTokenSchema = z.object({
  primary: z.string().regex(/^#[0-9A-F]{6}$/i, 'Must be valid hex color'),
  secondary: z.string().regex(/^#[0-9A-F]{6}$/i, 'Must be valid hex color'),
  accent: z
    .string()
    .regex(/^#[0-9A-F]{6}$/i, 'Must be valid hex color')
    .optional(),
  success: z.string().regex(/^#[0-9A-F]{6}$/i, 'Must be valid hex color'),
  warning: z.string().regex(/^#[0-9A-F]{6}$/i, 'Must be valid hex color'),
  error: z.string().regex(/^#[0-9A-F]{6}$/i, 'Must be valid hex color'),
  info: z.string().regex(/^#[0-9A-F]{6}$/i, 'Must be valid hex color'),
  background: z.string().regex(/^#[0-9A-F]{6}$/i, 'Must be valid hex color'),
  foreground: z.string().regex(/^#[0-9A-F]{6}$/i, 'Must be valid hex color'),
  muted: z.string().regex(/^#[0-9A-F]{6}$/i, 'Must be valid hex color'),
  border: z.string().regex(/^#[0-9A-F]{6}$/i, 'Must be valid hex color'),
})
```

- [ ] **Step 2: Run all tests**

Run: `pnpm test`
Expected: ALL PASS (no regressions — the regex is the same, only error message strings change)

- [ ] **Step 3: Commit**

```bash
git add packages/core/src/types/design-system.ts
git commit -m "fix(core): add consistent error messages to all ColorTokenSchema fields"
```

---

### Task 6: Final Verification

- [ ] **Step 1: Build all packages**

Run: `pnpm build`
Expected: Success

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: No errors

- [ ] **Step 3: Run all tests**

Run: `pnpm test`
Expected: ALL PASS

- [ ] **Step 4: Final commit (if any remaining changes)**

```bash
git add -A
git commit -m "chore: final cleanup for color token auto-fix feature"
```
