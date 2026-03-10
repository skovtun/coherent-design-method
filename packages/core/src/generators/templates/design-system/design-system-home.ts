/**
 * Design System home page template (placeholders: {{COMPONENTS_JSON}}, {{TOKENS_JSON}})
 */
export const DESIGN_SYSTEM_HOME = `'use client'
import Link from 'next/link'

const knownNames: Record<string, string> = {
  button: 'Button', input: 'Input', label: 'Label', select: 'Select',
  switch: 'Switch', checkbox: 'Checkbox', card: 'Card', badge: 'Badge',
  table: 'Table', textarea: 'Textarea', dialog: 'Dialog',
  'alert-dialog': 'AlertDialog', separator: 'Separator', progress: 'Progress',
  avatar: 'Avatar', tabs: 'Tabs', accordion: 'Accordion', skeleton: 'Skeleton',
  tooltip: 'Tooltip', 'radio-group': 'RadioGroup', slider: 'Slider',
}

export default function DesignSystemPage() {
  const components = {{COMPONENTS_JSON}}
  const tokens = {{TOKENS_JSON}}
  
  const colorCount = tokens?.colors?.light ? Object.keys(tokens.colors.light).length : 0
  const spacingCount = tokens?.spacing ? Object.keys(tokens.spacing).length : 0
  
  return (
    <div className="space-y-12">
      {/* Header */}
      <div>
        <h1 className="text-4xl font-bold tracking-tight">Design System</h1>
        <p className="mt-2 text-muted-foreground">
          Interactive component library and design tokens
        </p>
      </div>
      
      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="rounded-lg border p-6">
          <div className="text-2xl font-bold">{components.length}</div>
          <div className="text-sm text-muted-foreground">Components</div>
        </div>
        <div className="rounded-lg border p-6">
          <div className="text-2xl font-bold">{colorCount}</div>
          <div className="text-sm text-muted-foreground">Color Tokens</div>
        </div>
        <div className="rounded-lg border p-6">
          <div className="text-2xl font-bold">{spacingCount}</div>
          <div className="text-sm text-muted-foreground">Spacing Tokens</div>
        </div>
      </div>
      
      {/* Components Grid */}
      <div>
        <h2 className="text-2xl font-bold mb-4">Components</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {components.map((comp) => (
            <Link
              key={comp.id}
              href={\`/design-system/components/\${comp.id}\`}
              className="block rounded-lg border p-4 hover:border-primary transition-colors"
            >
              <div className="font-medium">{knownNames[comp.id] || comp.name}</div>
              <div className="text-sm text-muted-foreground mt-1">
                {comp.variants?.length ?? 0} variants · {comp.sizes?.length ?? 0} sizes
              </div>
              <div className="text-xs text-muted-foreground mt-2">
                {comp.category}
              </div>
            </Link>
          ))}
        </div>
      </div>
      
      {/* Quick Links */}
      <div>
        <h2 className="text-2xl font-bold mb-4">Quick Links</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Link
            href="/design-system/tokens/colors"
            className="block rounded-lg border p-6 hover:border-primary transition-colors"
          >
            <div className="font-medium">Color Tokens</div>
            <div className="text-sm text-muted-foreground mt-1">
              View all color variables
            </div>
          </Link>
          <Link
            href="/design-system/docs"
            className="block rounded-lg border p-6 hover:border-primary transition-colors"
          >
            <div className="font-medium">Documentation</div>
            <div className="text-sm text-muted-foreground mt-1">
              Component usage and best practices
            </div>
          </Link>
        </div>
      </div>
    </div>
  )
}
`
