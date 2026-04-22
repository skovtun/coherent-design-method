/**
 * Dynamic component route: reads config at runtime, single [id] route.
 */

export const COMPONENT_DYNAMIC_PAGE = `import { notFound } from 'next/navigation'
import { config } from '../../../../design-system.config'
import ComponentShowcase from './ComponentShowcase'

export default async function ComponentPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  const component = config.components?.find((c: { id: string }) => c.id === id)

  if (!component) {
    notFound()
  }

  return <ComponentShowcase component={component} />
}

export async function generateStaticParams() {
  const components = config.components ?? []
  return components.map((c: { id: string }) => ({
    id: c.id,
  }))
}
`

export const COMPONENT_SHOWCASE_CLIENT = `'use client'
import { useState } from 'react'

interface ComponentShowcaseProps {
  component: any
}

const knownNames: Record<string, string> = {
  button: 'Button',
  input: 'Input',
  label: 'Label',
  select: 'Select',
  switch: 'Switch',
  checkbox: 'Checkbox',
  card: 'Card',
  badge: 'Badge',
  table: 'Table',
  textarea: 'Textarea',
  dialog: 'Dialog',
  'alert-dialog': 'AlertDialog',
  alert: 'Alert',
  progress: 'Progress',
  avatar: 'Avatar',
  separator: 'Separator',
  tabs: 'Tabs',
  accordion: 'Accordion',
  skeleton: 'Skeleton',
  tooltip: 'Tooltip',
  'radio-group': 'RadioGroup',
  slider: 'Slider',
  sheet: 'Sheet',
  'dropdown-menu': 'DropdownMenu',
  'context-menu': 'ContextMenu',
  command: 'Command',
}

const descriptions: Record<string, string> = {
  button: 'Triggers an action or event',
  input: 'Text input field for forms',
  label: 'Accessible label for form controls',
  select: 'Dropdown selection from a list of options',
  switch: 'Toggle between on and off states',
  checkbox: 'Select one or more items from a set',
  card: 'Container for grouped content and actions',
  badge: 'Status indicator or category label',
  table: 'Structured data display in rows and columns',
  textarea: 'Multi-line text input field',
  dialog: 'Modal dialog for focused tasks',
  alert: 'Display important feedback messages',
  progress: 'Show progress of a task',
  avatar: 'Display user or entity image',
  separator: 'Visual divider between content',
  tabs: 'Organize content into switchable panels',
  accordion: 'Collapsible content sections',
  skeleton: 'Placeholder while content loads',
  tooltip: 'Contextual info on hover',
  'radio-group': 'Select one option from a set',
  slider: 'Select a value from a range',
  sheet: 'Slide-out panel from the edge of the screen',
  'dropdown-menu': 'Menu triggered by a button with a list of actions',
  'context-menu': 'Right-click menu with contextual actions',
  command: 'Command palette for searching and executing actions',
}

function displayName(component: any): string {
  return knownNames[component.id] || component.name || component.id
}

function cn(...parts: (string | undefined | false | null)[]) {
  return parts.filter(Boolean).join(' ')
}

function resolveClasses(component: any, variantName?: string, sizeName?: string) {
  const base = component.baseClassName || ''
  const vCls = variantName
    ? component.variants?.find((v: any) => v.name === variantName)?.className || ''
    : component.variants?.[0]?.className || ''
  const sCls = sizeName
    ? component.sizes?.find((s: any) => s.name === sizeName)?.className || ''
    : component.sizes?.[0]?.className || ''
  return cn(base, vCls, sCls)
}

const chevronSvg = <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="opacity-50"><path d="m6 9 6 6 6-6"/></svg>

const buttonStyles: Record<string, string> = {
  default: 'bg-primary text-primary-foreground hover:opacity-90',
  secondary: 'bg-secondary text-secondary-foreground hover:opacity-90',
  outline: 'border border-input bg-background hover:bg-muted',
  ghost: 'hover:bg-muted',
  link: 'text-primary underline-offset-4 hover:underline',
  destructive: 'bg-destructive text-destructive-foreground hover:opacity-90',
}

const buttonSizes: Record<string, string> = {
  xs: 'h-7 px-2 text-xs',
  sm: 'h-8 px-3 text-xs',
  md: 'h-9 px-4 py-2 text-sm',
  lg: 'h-10 px-6 text-sm',
  xl: 'h-11 px-8 text-base',
}

const badgeStyles: Record<string, string> = {
  default: 'border-transparent bg-primary text-primary-foreground',
  secondary: 'border-transparent bg-secondary text-secondary-foreground',
  success: 'border-transparent bg-green-500 text-white',
  error: 'border-transparent bg-red-500 text-white',
  outline: 'text-foreground',
  destructive: 'border-transparent bg-destructive text-destructive-foreground',
}

const badgeSizes: Record<string, string> = {
  xs: 'text-[10px] px-1.5 py-0',
  sm: 'text-xs px-2 py-0.5',
  md: 'text-sm px-2.5 py-0.5',
  lg: 'text-base px-3 py-1',
  xl: 'text-lg px-4 py-1.5',
}

function SwitchPreview() {
  const [on, setOn] = useState(false)
  return (
    <button role="switch" aria-checked={on} onClick={() => setOn(!on)}
      className={cn(
        'relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
        on ? 'bg-primary' : 'bg-input'
      )}>
      <span className={cn('pointer-events-none block size-5 rounded-full bg-background shadow-lg ring-0 transition-transform', on ? 'translate-x-5' : 'translate-x-0')} />
    </button>
  )
}

function CheckboxPreview() {
  const [checked, setChecked] = useState(true)
  return (
    <div className="flex items-center gap-2">
      <button role="checkbox" aria-checked={checked} onClick={() => setChecked(!checked)}
        className={cn(
          'flex size-4 items-center justify-center rounded-sm border transition-colors',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1',
          checked ? 'border-primary bg-primary text-primary-foreground' : 'border-input bg-background hover:bg-muted'
        )}>
        {checked && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5"/></svg>}
      </button>
      <label className="text-sm leading-none cursor-pointer select-none" onClick={() => setChecked(!checked)}>Accept terms</label>
    </div>
  )
}

const selectOptions = ['Option A', 'Option B', 'Option C']

const inputSizes: Record<string, string> = {
  xs: 'h-7 text-xs px-2',
  sm: 'h-8 text-xs px-3',
  md: 'h-9 text-sm px-3',
  lg: 'h-10 text-sm px-3',
  xl: 'h-12 text-base px-4',
}

const selectSizes: Record<string, string> = {
  xs: 'h-7 text-xs px-2',
  sm: 'h-8 text-xs px-3',
  md: 'h-9 text-sm px-3',
  lg: 'h-10 text-sm px-3',
  xl: 'h-12 text-base px-4',
}

const textareaSizes: Record<string, string> = {
  xs: 'min-h-[50px] text-xs px-2 py-1',
  sm: 'min-h-[60px] text-xs px-3 py-1.5',
  md: 'min-h-[80px] text-sm px-3 py-2',
  lg: 'min-h-[120px] text-sm px-3 py-2',
  xl: 'min-h-[160px] text-base px-4 py-3',
}

function SelectPreview({ size }: { size?: string }) {
  const [open, setOpen] = useState(false)
  const [selected, setSelected] = useState('')
  const s = size || 'md'
  const sCls = selectSizes[s] || selectSizes.md
  return (
    <div className="relative w-48">
      <button onClick={() => setOpen(!open)}
        className={cn(
          'flex w-full items-center justify-between rounded-md border border-input bg-background py-2 transition-colors',
          'hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          open && 'ring-2 ring-ring',
          sCls
        )}>
        <span className={selected ? '' : 'text-muted-foreground'}>{selected || 'Select option\u2026'}</span>
        {chevronSvg}
      </button>
      {open && (
        <div className="absolute top-full left-0 z-50 mt-1 w-full rounded-md border bg-popover text-popover-foreground shadow-md animate-in fade-in-0 zoom-in-95">
          <div className="p-1">
            {selectOptions.map(opt => (
              <button key={opt} onClick={() => { setSelected(opt); setOpen(false) }}
                className={cn(
                  'relative flex w-full cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none transition-colors',
                  'hover:bg-muted focus:bg-muted',
                  selected === opt && 'bg-muted font-medium'
                )}>
                {opt}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function SheetPreview({ side }: { side?: string }) {
  const [open, setOpen] = useState(false)
  const s = side || 'right'
  const positionClasses: Record<string, string> = {
    top: 'inset-x-0 top-0 border-b',
    bottom: 'inset-x-0 bottom-0 border-t',
    left: 'inset-y-0 left-0 h-full w-3/4 border-r sm:max-w-sm',
    right: 'inset-y-0 right-0 h-full w-3/4 border-l sm:max-w-sm',
  }
  return (
    <>
      <button onClick={() => setOpen(true)}
        className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 h-9 text-sm font-medium hover:bg-muted transition-colors">
        Open Sheet
      </button>
      {open && (
        <div className="fixed inset-0 z-50" onClick={() => setOpen(false)}>
          <div className="fixed inset-0 bg-black/80" />
          <div className={cn('fixed z-50 gap-4 bg-background p-6 shadow-lg', positionClasses[s] || positionClasses.right)}
            onClick={e => e.stopPropagation()}>
            <div className="flex flex-col space-y-2 mb-4">
              <h3 className="text-lg font-semibold">Sheet Panel</h3>
              <p className="text-sm text-muted-foreground">This is a sheet sliding from the {s}.</p>
            </div>
            <button onClick={() => setOpen(false)}
              className="absolute right-4 top-4 rounded-sm opacity-70 hover:opacity-100 transition-opacity">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
            </button>
          </div>
        </div>
      )}
    </>
  )
}

function DropdownMenuPreview({ size }: { size?: string }) {
  const [open, setOpen] = useState(false)
  const sizeClasses: Record<string, string> = {
    sm: 'min-w-[6rem]',
    md: 'min-w-[8rem]',
    lg: 'min-w-[12rem]',
  }
  const s = size || 'md'
  return (
    <div className="relative">
      <button onClick={() => setOpen(!open)}
        className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 h-9 text-sm font-medium hover:bg-muted transition-colors gap-1">
        Actions {chevronSvg}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className={cn('absolute top-full left-0 z-50 mt-1 rounded-md border bg-popover text-popover-foreground p-1 shadow-md animate-in fade-in-0 zoom-in-95', sizeClasses[s] || sizeClasses.md)}>
            <button onClick={() => setOpen(false)} className="relative flex w-full cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-accent hover:text-accent-foreground transition-colors">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-2"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>
              Edit
            </button>
            <button onClick={() => setOpen(false)} className="relative flex w-full cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-accent hover:text-accent-foreground transition-colors">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-2"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>
              Duplicate
            </button>
            <div className="-mx-1 my-1 h-px bg-border" />
            <button onClick={() => setOpen(false)} className="relative flex w-full cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none text-destructive hover:bg-destructive/10 transition-colors">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-2"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
              Delete
            </button>
          </div>
        </>
      )}
    </div>
  )
}

function ContextMenuPreview() {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null)
  return (
    <div className="relative">
      <div
        onContextMenu={e => { e.preventDefault(); setPos({ x: e.nativeEvent.offsetX, y: e.nativeEvent.offsetY }) }}
        className="flex items-center justify-center w-48 h-24 rounded-lg border-2 border-dashed border-muted-foreground/25 text-sm text-muted-foreground cursor-context-menu select-none hover:border-muted-foreground/40 transition-colors"
      >
        Right-click here
      </div>
      {pos && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setPos(null)} onContextMenu={e => { e.preventDefault(); setPos(null) }} />
          <div style={{ position: 'absolute', top: pos.y, left: pos.x }} className="z-50 min-w-[8rem] rounded-md border bg-popover text-popover-foreground p-1 shadow-md animate-in fade-in-0 zoom-in-95">
            <button onClick={() => setPos(null)} className="relative flex w-full cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-accent hover:text-accent-foreground transition-colors">View</button>
            <button onClick={() => setPos(null)} className="relative flex w-full cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-accent hover:text-accent-foreground transition-colors">Edit</button>
            <div className="-mx-1 my-1 h-px bg-border" />
            <button onClick={() => setPos(null)} className="relative flex w-full cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none text-destructive hover:bg-destructive/10 transition-colors">Delete</button>
          </div>
        </>
      )}
    </div>
  )
}

function CommandPreview() {
  const [query, setQuery] = useState('')
  const items = ['Dashboard', 'Projects', 'Team', 'Settings', 'Profile']
  const filtered = items.filter(i => i.toLowerCase().includes(query.toLowerCase()))
  return (
    <div className="w-72 rounded-lg border bg-popover text-popover-foreground shadow-md">
      <div className="flex items-center border-b px-3 h-10">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-2 shrink-0 opacity-50"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
        <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Type a command\u2026" className="flex h-full w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground" />
      </div>
      <div className="p-1 max-h-48 overflow-y-auto">
        {filtered.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">No results found.</p>
        ) : (
          filtered.map(item => (
            <button key={item} className="relative flex w-full cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-accent hover:text-accent-foreground transition-colors">{item}</button>
          ))
        )}
      </div>
    </div>
  )
}

function TooltipPreview() {
  const [show, setShow] = useState(false)
  return (
    <div className="relative inline-block">
      <button
        onMouseEnter={() => setShow(true)} onMouseLeave={() => setShow(false)}
        className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 h-9 text-sm font-medium hover:bg-muted transition-colors"
      >
        Hover me
      </button>
      {show && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-50 rounded-md bg-primary px-3 py-1.5 text-xs text-primary-foreground shadow-md animate-in fade-in-0 zoom-in-95">
          Tooltip content
          <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-px border-4 border-transparent border-t-primary" />
        </div>
      )}
    </div>
  )
}

function Preview({ component, variant, size }: { component: any; variant?: string; size?: string }) {
  const id = component.id

  if (id === 'button' || component.category === 'action') {
    const v = variant || component.variants?.[0]?.name || 'default'
    const s = size || component.sizes?.[0]?.name || 'md'
    const vStyle = buttonStyles[v] || buttonStyles.default
    const sStyle = buttonSizes[s] || buttonSizes.md
    return (
      <button className={cn(
        'inline-flex items-center justify-center rounded-md font-medium transition-all',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
        'active:scale-[0.98]',
        vStyle, sStyle
      )}>
        {displayName(component)}
      </button>
    )
  }

  if (id === 'switch') return <SwitchPreview />
  if (id === 'checkbox') return <CheckboxPreview />
  if (id === 'select') return <SelectPreview size={size} />

  if (id === 'input') {
    const s = size || component.sizes?.[0]?.name || 'md'
    const iCls = inputSizes[s] || inputSizes.md
    return <input className={cn('flex w-48 rounded-md border border-input bg-background shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring', iCls)} placeholder="Enter text\u2026" />
  }

  if (id === 'textarea') {
    const s = size || component.sizes?.[0]?.name || 'md'
    const tCls = textareaSizes[s] || textareaSizes.md
    return <textarea className={cn('flex w-48 rounded-md border border-input bg-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring', tCls)} placeholder="Message\u2026" rows={3} />
  }

  if (id === 'card') {
    return (
      <div className="w-64 rounded-lg border bg-card text-card-foreground shadow-sm hover:shadow-md transition-shadow">
        <div className="p-4 pb-2"><div className="text-sm font-semibold">Card Title</div></div>
        <div className="px-4 pb-4"><div className="text-xs text-muted-foreground">Card description goes here.</div></div>
      </div>
    )
  }

  if (id === 'separator') {
    return <div className="h-px w-full bg-border" />
  }

  if (id === 'progress') {
    return (
      <div className="relative h-2 w-48 overflow-hidden rounded-full bg-muted">
        <div className="h-full bg-primary rounded-full transition-all" style={{ width: '60%' }} />
      </div>
    )
  }

  if (id === 'avatar') {
    const sizeMap: Record<string, string> = { xs: 'size-6 text-xs', sm: 'size-8 text-xs', md: 'size-10 text-sm', lg: 'size-12 text-base', xl: 'size-14 text-lg' }
    const s = size || 'md'
    return (
      <div className={cn('flex items-center justify-center rounded-full bg-muted font-medium', sizeMap[s] || sizeMap.md)}>
        <span>AV</span>
      </div>
    )
  }

  if (id === 'table') {
    return (
      <div className="w-full max-w-sm rounded-lg border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/50"><tr><th className="p-2 text-left text-xs font-medium text-muted-foreground">Name</th><th className="p-2 text-left text-xs font-medium text-muted-foreground">Status</th></tr></thead>
          <tbody>
            <tr className="border-b hover:bg-muted/50 transition-colors"><td className="p-2">Alice</td><td className="p-2"><span className="inline-flex items-center rounded-full border border-transparent bg-primary text-primary-foreground px-2 py-0.5 text-xs font-medium">Active</span></td></tr>
            <tr className="hover:bg-muted/50 transition-colors"><td className="p-2">Bob</td><td className="p-2"><span className="inline-flex items-center rounded-full bg-muted text-muted-foreground px-2 py-0.5 text-xs font-medium">Inactive</span></td></tr>
          </tbody>
        </table>
      </div>
    )
  }

  if (id === 'label') {
    return <label className="text-sm font-medium leading-none cursor-pointer">Email address</label>
  }

  if (id === 'skeleton') {
    return <div className="h-4 w-48 animate-pulse rounded-md bg-muted" />
  }

  if (id === 'badge') {
    const v = variant || component.variants?.[0]?.name || 'default'
    const s = size || component.sizes?.[0]?.name || 'md'
    const badgeCls = badgeStyles[v] || badgeStyles.default
    const badgeSize = badgeSizes[s] || badgeSizes.md
    return <span className={cn('inline-flex items-center rounded-full border font-semibold transition-colors', badgeCls, badgeSize)}>{v}</span>
  }

  if (id === 'dialog' || id === 'alert-dialog') {
    return (
      <div className="relative inline-block w-72 rounded-lg border border-border bg-card text-card-foreground shadow-lg p-4">
        <div className="text-sm font-semibold mb-1">{displayName(component)}</div>
        <p className="text-xs text-muted-foreground mb-3">Are you sure you want to continue?</p>
        <div className="flex justify-end gap-2">
          <button className="inline-flex items-center justify-center rounded-md border border-input bg-background px-3 h-8 text-xs font-medium hover:bg-muted transition-colors">Cancel</button>
          <button className="inline-flex items-center justify-center rounded-md bg-primary text-primary-foreground px-3 h-8 text-xs font-medium hover:opacity-90 transition-opacity">Confirm</button>
        </div>
      </div>
    )
  }

  if (id === 'sheet') return <SheetPreview side={variant} />
  if (id === 'dropdown-menu') return <DropdownMenuPreview size={size} />
  if (id === 'context-menu') return <ContextMenuPreview />
  if (id === 'command') return <CommandPreview />
  if (id === 'tooltip') return <TooltipPreview />

  const cls = resolveClasses(component, variant, size)
  if (cls) {
    return <div className={cn(cls)}>{displayName(component)}</div>
  }

  return <div className="rounded-lg border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">&lt;{displayName(component)} /&gt;</div>
}

export default function ComponentShowcase({ component }: ComponentShowcaseProps) {
  const [copied, setCopied] = useState(false)
  const name = displayName(component)

  const copyCode = (code: string) => {
    navigator.clipboard.writeText(code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const usageCode = (() => {
    const n = name
    const id = component.id
    if (id === 'button') return \`<\${n} variant="\${component.variants?.[0]?.name || 'default'}">Click me</\${n}>\`
    if (id === 'input') return \`<\${n} placeholder="Enter text…" />\`
    if (id === 'textarea') return \`<\${n} placeholder="Message…" rows={4} />\`
    if (id === 'checkbox') return \`<\${n} id="terms" />\\n<Label htmlFor="terms">Accept terms</Label>\`
    if (id === 'select') return \`<\${n}>\\n  <SelectTrigger>\\n    <SelectValue placeholder="Select…" />\\n  </SelectTrigger>\\n  <SelectContent>\\n    <SelectItem value="a">Option A</SelectItem>\\n    <SelectItem value="b">Option B</SelectItem>\\n  </SelectContent>\\n</\${n}>\`
    if (id === 'switch') return \`<\${n} />\\n<Label>Airplane mode</Label>\`
    if (id === 'badge') return \`<\${n} variant="\${component.variants?.[0]?.name || 'default'}">\${n}</\${n}>\`
    if (id === 'card') return \`<\${n}>\\n  <CardHeader>\\n    <CardTitle>Title</CardTitle>\\n  </CardHeader>\\n  <CardContent>Content</CardContent>\\n</\${n}>\`
    if (id === 'label') return \`<\${n} htmlFor="email">Email</\${n}>\`
    if (id === 'table') return \`<\${n}>\\n  <TableHeader>…</TableHeader>\\n  <TableBody>…</TableBody>\\n</\${n}>\`
    if (id === 'separator') return \`<\${n} />\`
    if (id === 'progress') return \`<\${n} value={60} />\`
    if (id === 'avatar') return \`<\${n}>\\n  <AvatarImage src="/avatar.png" />\\n  <AvatarFallback>AV</AvatarFallback>\\n</\${n}>\`
    if (id === 'sheet') return \`<Sheet>\\n  <SheetTrigger asChild>\\n    <Button variant="outline">Open</Button>\\n  </SheetTrigger>\\n  <SheetContent>\\n    <SheetHeader>\\n      <SheetTitle>Title</SheetTitle>\\n      <SheetDescription>Description</SheetDescription>\\n    </SheetHeader>\\n  </SheetContent>\\n</Sheet>\`
    if (id === 'dropdown-menu') return \`<DropdownMenu>\\n  <DropdownMenuTrigger asChild>\\n    <Button variant="outline">Open</Button>\\n  </DropdownMenuTrigger>\\n  <DropdownMenuContent>\\n    <DropdownMenuItem>Action</DropdownMenuItem>\\n  </DropdownMenuContent>\\n</DropdownMenu>\`
    if (id === 'context-menu') return \`<ContextMenu>\\n  <ContextMenuTrigger>Right click</ContextMenuTrigger>\\n  <ContextMenuContent>\\n    <ContextMenuItem>Action</ContextMenuItem>\\n  </ContextMenuContent>\\n</ContextMenu>\`
    if (id === 'command') return \`<Command>\\n  <CommandInput placeholder="Type a command..." />\\n  <CommandList>\\n    <CommandEmpty>No results.</CommandEmpty>\\n    <CommandGroup heading="Suggestions">\\n      <CommandItem>Calendar</CommandItem>\\n    </CommandGroup>\\n  </CommandList>\\n</Command>\`
    return \`<\${n} />\`
  })()

  return (
    <div className="flex flex-col gap-8">
      <div>
        <div className="mb-2 flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground/70">
          <span className="h-1.5 w-1.5 rounded-[2px] bg-primary" />
          components · {component.category || 'component'}
        </div>
        <h1 className="text-[28px] font-medium leading-tight tracking-[-0.02em] text-foreground">
          {name}
        </h1>
        <p className="mt-1 text-[13.5px] text-muted-foreground">
          {descriptions[component.id] || \`\${name} component\`}
        </p>
      </div>

      <div className="overflow-hidden rounded-md border border-border bg-card">
        <div className="border-b border-border bg-muted px-4 py-3">
          <div className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground/70">
            <span className="h-1.5 w-1.5 rounded-[2px] bg-primary" />
            preview
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-4 p-6">
          <Preview component={component} />
        </div>
      </div>

      {component.variants && component.variants.length > 0 && (
        <div className="overflow-hidden rounded-md border border-border bg-card">
          <div className="border-b border-border bg-muted px-4 py-3">
            <div className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground/70">
              <span className="h-1.5 w-1.5 rounded-[2px] bg-primary" />
              variants
            </div>
          </div>
          <div className="divide-y divide-border">
            {component.variants.map((v: any) => (
              <div key={v.name} className="flex items-center justify-between p-4">
                <div className="flex items-center gap-4 min-w-0">
                  <div className="shrink-0"><Preview component={component} variant={v.name} /></div>
                  <div className="min-w-0">
                    <div className="font-mono text-[12px] font-medium text-foreground">{v.name}</div>
                    {v.className && <code className="font-mono text-[10.5px] text-muted-foreground/70 break-all">{v.className}</code>}
                  </div>
                </div>
                <code className="hidden font-mono text-[10.5px] text-muted-foreground/70 md:block shrink-0 ml-4">variant=&quot;{v.name}&quot;</code>
              </div>
            ))}
          </div>
        </div>
      )}

      {component.sizes && component.sizes.length > 0 && (
        <div className="overflow-hidden rounded-md border border-border bg-card">
          <div className="border-b border-border bg-muted px-4 py-3">
            <div className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground/70">
              <span className="h-1.5 w-1.5 rounded-[2px] bg-primary" />
              sizes
            </div>
          </div>
          <div className="divide-y divide-border">
            {component.sizes.map((s: any) => (
              <div key={s.name} className="flex items-center justify-between p-4">
                <div className="flex items-center gap-4 min-w-0">
                  <div className="shrink-0"><Preview component={component} size={s.name} /></div>
                  <div className="min-w-0">
                    <div className="font-mono text-[12px] font-medium text-foreground">{s.name}</div>
                    {s.className && <code className="font-mono text-[10.5px] text-muted-foreground/70 break-all">{s.className}</code>}
                  </div>
                </div>
                <code className="hidden font-mono text-[10.5px] text-muted-foreground/70 md:block shrink-0 ml-4">size=&quot;{s.name}&quot;</code>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="overflow-hidden rounded-md border border-border bg-card">
        <div className="flex items-center justify-between border-b border-border bg-muted px-4 py-3">
          <div className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground/70">
            <span className="h-1.5 w-1.5 rounded-[2px] bg-primary" />
            usage
          </div>
          <button
            onClick={() => copyCode(usageCode)}
            className="font-mono text-[10.5px] text-muted-foreground/70 transition-colors hover:text-primary"
          >
            {copied ? 'copied' : 'copy'}
          </button>
        </div>
        <pre className="overflow-x-auto p-4 font-mono text-[12px] leading-[1.6] text-foreground"><code>{usageCode}</code></pre>
      </div>

      <div className="overflow-hidden rounded-md border border-border bg-card">
        <div className="border-b border-border bg-muted px-4 py-3">
          <div className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground/70">
            <span className="h-1.5 w-1.5 rounded-[2px] bg-primary" />
            props
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="border-b border-border">
              <tr className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground/70">
                <th className="px-4 py-2 text-left font-normal">prop</th>
                <th className="px-4 py-2 text-left font-normal">type</th>
                <th className="px-4 py-2 text-left font-normal">default</th>
              </tr>
            </thead>
            <tbody>
              {component.variants && component.variants.length > 0 && (
                <tr className="border-b border-border font-mono text-[12px]">
                  <td className="px-4 py-2 text-foreground">variant</td>
                  <td className="px-4 py-2 text-muted-foreground">{component.variants.map((v: any) => \`"\${v.name}"\`).join(' | ')}</td>
                  <td className="px-4 py-2 text-muted-foreground">&quot;{component.variants[0].name}&quot;</td>
                </tr>
              )}
              {component.sizes && component.sizes.length > 0 && (
                <tr className="border-b border-border font-mono text-[12px]">
                  <td className="px-4 py-2 text-foreground">size</td>
                  <td className="px-4 py-2 text-muted-foreground">{component.sizes.map((s: any) => \`"\${s.name}"\`).join(' | ')}</td>
                  <td className="px-4 py-2 text-muted-foreground">&quot;{component.sizes[0].name}&quot;</td>
                </tr>
              )}
              <tr className="font-mono text-[12px]">
                <td className="px-4 py-2 text-foreground">className</td>
                <td className="px-4 py-2 text-muted-foreground">string</td>
                <td className="px-4 py-2 text-muted-foreground">undefined</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
`
