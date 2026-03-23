import { describe, it, expect } from 'vitest'
import {
  extractPropsInterface,
  extractExportedComponentName,
  extractDependencies,
  extractUsageExample,
} from './component-extractor.js'

describe('extractExportedComponentName', () => {
  it('extracts name from export function', () => {
    const code = `export function StatsCard({ icon, value }: Props) { return <div /> }`
    expect(extractExportedComponentName(code)).toBe('StatsCard')
  })

  it('extracts name from export const arrow', () => {
    const code = `export const DataTable = ({ columns }: Props) => { return <table /> }`
    expect(extractExportedComponentName(code)).toBe('DataTable')
  })

  it('extracts name from export default function', () => {
    const code = `export default function FilterToolbar() { return <div /> }`
    expect(extractExportedComponentName(code)).toBe('FilterToolbar')
  })

  it('returns null for no export', () => {
    expect(extractExportedComponentName('const x = 1')).toBeNull()
  })
})

describe('extractPropsInterface', () => {
  it('extracts interface Props', () => {
    const code = `interface Props {\n  icon: LucideIcon\n  value: string\n  label: string\n}\nexport function StatsCard(props: Props) {}`
    expect(extractPropsInterface(code)).toBe('{ icon: LucideIcon; value: string; label: string }')
  })

  it('extracts type Props', () => {
    const code = `type Props = {\n  columns: Column[]\n  data: Row[]\n}\nexport function DataTable(props: Props) {}`
    expect(extractPropsInterface(code)).toBe('{ columns: Column[]; data: Row[] }')
  })

  it('extracts inline destructured props', () => {
    const code = `export function StatsCard({ icon, value, label }: { icon: LucideIcon; value: string; label: string }) {}`
    expect(extractPropsInterface(code)).toBe('{ icon: LucideIcon; value: string; label: string }')
  })

  it('returns null when no props found', () => {
    expect(extractPropsInterface('export function App() {}')).toBeNull()
  })
})

describe('extractDependencies', () => {
  it('extracts package imports', () => {
    const code = `import { Users } from 'lucide-react'\nimport { Card } from '@/components/ui/card'\nimport { cn } from '@/lib/utils'`
    const deps = extractDependencies(code)
    expect(deps).toContain('lucide-react')
    expect(deps).toContain('components/ui/card')
    expect(deps).not.toContain('@/lib/utils')
  })
})

describe('extractUsageExample', () => {
  it('extracts first JSX usage of component', () => {
    const pageCode = `import { StatsCard } from '@/components/shared/stats-card'\nexport default function Dashboard() {\n  return <div>\n    <StatsCard icon={Users} value="1,234" label="Total Users" />\n    <StatsCard icon={Mail} value="56" label="Messages" />\n  </div>\n}`
    const usage = extractUsageExample(pageCode, 'StatsCard')
    expect(usage).toContain('<StatsCard')
    expect(usage).toContain('icon={Users}')
  })

  it('returns null when component not used', () => {
    expect(extractUsageExample('<div>hello</div>', 'StatsCard')).toBeNull()
  })
})
