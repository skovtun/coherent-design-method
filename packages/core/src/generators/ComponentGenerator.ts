/**
 * Component Generator
 * 
 * Generates React/TypeScript component code from component definitions.
 * Follows shadcn/ui patterns with variants, sizes, and design tokens.
 */

import type {
  ComponentDefinition,
  DesignSystemConfig,
  DesignTokens,
} from '../types/design-system.js'

export class ComponentGenerator {
  private config: DesignSystemConfig

  constructor(config: DesignSystemConfig) {
    this.config = config
  }

  /**
   * Generate React component code from definition
   */
  async generate(def: ComponentDefinition): Promise<string> {
    const dedicated = this.getDedicatedGenerator(def.id)
    if (dedicated) return dedicated()

    const useVariants = (def.variants?.length ?? 0) > 0 || (def.sizes?.length ?? 0) > 0
    if (def.source === 'shadcn' && def.shadcnComponent) {
      return this.generateShadcnComponent(def)
    }
    if (useVariants) {
      return this.generateShadcnComponent(def)
    }
    return this.generateCustomComponent(def)
  }

  /**
   * Dedicated generators for known component types.
   * These produce correct, self-contained code regardless of config variant classNames.
   */
  private getDedicatedGenerator(id: string): (() => string) | null {
    const map: Record<string, () => string> = {
      button: () => this.generateButton(),
      card: () => this.generateFullCard(),
      switch: () => this.generateSwitch(),
      input: () => this.generateInput(),
      textarea: () => this.generateTextarea(),
      label: () => this.generateLabel(),
      badge: () => this.generateBadge(),
      checkbox: () => this.generateCheckbox(),
      select: () => this.generateSelect(),
      table: () => this.generateFullTable(),
      tabs: () => this.generateFullTabs(),
      separator: () => this.generateSeparator(),
      avatar: () => this.generateFullAvatar(),
      dialog: () => this.generateFullDialog(),
      'alert-dialog': () => this.generateFullAlertDialog(),
      'dropdown-menu': () => this.generateFullDropdownMenu(),
      accordion: () => this.generateFullAccordion(),
    }
    return map[id] ?? null
  }

  /**
   * Generate full shadcn Card compound component (Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter).
   * Single-card components only export Card; this gives the model all subcomponents for richer UI.
   */
  private generateFullCard(): string {
    return `import * as React from 'react'
import { cn } from '@/lib/utils'

const Card = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      'rounded-lg border bg-card text-card-foreground shadow-sm',
      className
    )}
    {...props}
  />
))
Card.displayName = 'Card'

const CardHeader = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn('flex flex-col space-y-1.5 p-6', className)}
    {...props}
  />
))
CardHeader.displayName = 'CardHeader'

const CardTitle = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => (
  <h3
    ref={ref as React.Ref<HTMLHeadingElement>}
    className={cn('font-semibold leading-none tracking-tight', className)}
    {...props}
  />
))
CardTitle.displayName = 'CardTitle'

const CardDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <p
    ref={ref}
    className={cn('text-sm text-muted-foreground', className)}
    {...props}
  />
))
CardDescription.displayName = 'CardDescription'

const CardContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn('p-6 pt-0', className)} {...props} />
))
CardContent.displayName = 'CardContent'

const CardFooter = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn('flex items-center p-6 pt-0', className)}
    {...props}
  />
))
CardFooter.displayName = 'CardFooter'

export { Card, CardHeader, CardFooter, CardTitle, CardDescription, CardContent }
`
  }

  /**
   * Generate full Table compound component (Table, TableHeader, TableBody, TableRow, TableHead, TableCell, TableCaption, TableFooter).
   */
  private generateFullTable(): string {
    return `import * as React from 'react'
import { cn } from '@/lib/utils'

const Table = React.forwardRef<HTMLTableElement, React.HTMLAttributes<HTMLTableElement>>(
  ({ className, ...props }, ref) => (
    <div className="relative w-full overflow-auto">
      <table ref={ref} className={cn('w-full caption-bottom text-sm', className)} {...props} />
    </div>
  )
)
Table.displayName = 'Table'

const TableHeader = React.forwardRef<HTMLTableSectionElement, React.HTMLAttributes<HTMLTableSectionElement>>(
  ({ className, ...props }, ref) => <thead ref={ref} className={cn('[&_tr]:border-b', className)} {...props} />
)
TableHeader.displayName = 'TableHeader'

const TableBody = React.forwardRef<HTMLTableSectionElement, React.HTMLAttributes<HTMLTableSectionElement>>(
  ({ className, ...props }, ref) => <tbody ref={ref} className={cn('[&_tr:last-child]:border-0', className)} {...props} />
)
TableBody.displayName = 'TableBody'

const TableFooter = React.forwardRef<HTMLTableSectionElement, React.HTMLAttributes<HTMLTableSectionElement>>(
  ({ className, ...props }, ref) => <tfoot ref={ref} className={cn('border-t bg-muted/50 font-medium [&>tr]:last:border-b-0', className)} {...props} />
)
TableFooter.displayName = 'TableFooter'

const TableRow = React.forwardRef<HTMLTableRowElement, React.HTMLAttributes<HTMLTableRowElement>>(
  ({ className, ...props }, ref) => (
    <tr ref={ref} className={cn('border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted', className)} {...props} />
  )
)
TableRow.displayName = 'TableRow'

const TableHead = React.forwardRef<HTMLTableCellElement, React.ThHTMLAttributes<HTMLTableCellElement>>(
  ({ className, ...props }, ref) => (
    <th ref={ref} className={cn('h-10 px-2 text-left align-middle font-medium text-muted-foreground [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]', className)} {...props} />
  )
)
TableHead.displayName = 'TableHead'

const TableCell = React.forwardRef<HTMLTableCellElement, React.TdHTMLAttributes<HTMLTableCellElement>>(
  ({ className, ...props }, ref) => (
    <td ref={ref} className={cn('p-2 align-middle [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]', className)} {...props} />
  )
)
TableCell.displayName = 'TableCell'

const TableCaption = React.forwardRef<HTMLTableCaptionElement, React.HTMLAttributes<HTMLTableCaptionElement>>(
  ({ className, ...props }, ref) => <caption ref={ref} className={cn('mt-4 text-sm text-muted-foreground', className)} {...props} />
)
TableCaption.displayName = 'TableCaption'

export { Table, TableHeader, TableBody, TableFooter, TableHead, TableRow, TableCell, TableCaption }
`
  }

  /**
   * Generate full Tabs compound component (Tabs, TabsList, TabsTrigger, TabsContent).
   */
  private generateFullTabs(): string {
    return `'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'

interface TabsProps extends React.HTMLAttributes<HTMLDivElement> {
  defaultValue?: string
  value?: string
  onValueChange?: (value: string) => void
}

const TabsContext = React.createContext<{ value: string; onValueChange: (v: string) => void }>({ value: '', onValueChange: () => {} })

const Tabs = React.forwardRef<HTMLDivElement, TabsProps>(
  ({ defaultValue = '', value, onValueChange, className, children, ...props }, ref) => {
    const [internalValue, setInternalValue] = React.useState(defaultValue)
    const currentValue = value ?? internalValue
    const handleChange = React.useCallback((v: string) => {
      setInternalValue(v)
      onValueChange?.(v)
    }, [onValueChange])
    return (
      <TabsContext.Provider value={{ value: currentValue, onValueChange: handleChange }}>
        <div ref={ref} className={cn('w-full', className)} {...props}>{children}</div>
      </TabsContext.Provider>
    )
  }
)
Tabs.displayName = 'Tabs'

const TabsList = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('inline-flex h-9 items-center justify-center rounded-lg bg-muted p-1 text-muted-foreground', className)} {...props} />
  )
)
TabsList.displayName = 'TabsList'

interface TabsTriggerProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  value: string
}

const TabsTrigger = React.forwardRef<HTMLButtonElement, TabsTriggerProps>(
  ({ className, value, ...props }, ref) => {
    const ctx = React.useContext(TabsContext)
    const isActive = ctx.value === value
    return (
      <button
        ref={ref}
        type="button"
        role="tab"
        aria-selected={isActive}
        onClick={() => ctx.onValueChange(value)}
        className={cn(
          'inline-flex items-center justify-center whitespace-nowrap rounded-md px-3 py-1 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50',
          isActive && 'bg-background text-foreground shadow',
          className
        )}
        {...props}
      />
    )
  }
)
TabsTrigger.displayName = 'TabsTrigger'

interface TabsContentProps extends React.HTMLAttributes<HTMLDivElement> {
  value: string
}

const TabsContent = React.forwardRef<HTMLDivElement, TabsContentProps>(
  ({ className, value, ...props }, ref) => {
    const ctx = React.useContext(TabsContext)
    if (ctx.value !== value) return null
    return (
      <div
        ref={ref}
        role="tabpanel"
        className={cn('mt-2 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2', className)}
        {...props}
      />
    )
  }
)
TabsContent.displayName = 'TabsContent'

export { Tabs, TabsList, TabsTrigger, TabsContent }
`
  }

  /**
   * Generate Separator component.
   */
  private generateSeparator(): string {
    return `import * as React from 'react'
import { cn } from '@/lib/utils'

interface SeparatorProps extends React.HTMLAttributes<HTMLDivElement> {
  orientation?: 'horizontal' | 'vertical'
  decorative?: boolean
}

const Separator = React.forwardRef<HTMLDivElement, SeparatorProps>(
  ({ className, orientation = 'horizontal', decorative = true, ...props }, ref) => (
    <div
      ref={ref}
      role={decorative ? 'none' : 'separator'}
      aria-orientation={!decorative ? orientation : undefined}
      className={cn(
        'shrink-0 bg-border',
        orientation === 'horizontal' ? 'h-[1px] w-full' : 'h-full w-[1px]',
        className
      )}
      {...props}
    />
  )
)
Separator.displayName = 'Separator'

export { Separator }
`
  }

  /**
   * Generate full Avatar compound component (Avatar, AvatarImage, AvatarFallback).
   */
  private generateFullAvatar(): string {
    return `import * as React from 'react'
import { cn } from '@/lib/utils'

const Avatar = React.forwardRef<HTMLSpanElement, React.HTMLAttributes<HTMLSpanElement>>(
  ({ className, ...props }, ref) => (
    <span ref={ref} className={cn('relative flex h-10 w-10 shrink-0 overflow-hidden rounded-full', className)} {...props} />
  )
)
Avatar.displayName = 'Avatar'

const AvatarImage = React.forwardRef<HTMLImageElement, React.ImgHTMLAttributes<HTMLImageElement>>(
  ({ className, ...props }, ref) => (
    <img ref={ref} className={cn('aspect-square h-full w-full', className)} {...props} />
  )
)
AvatarImage.displayName = 'AvatarImage'

const AvatarFallback = React.forwardRef<HTMLSpanElement, React.HTMLAttributes<HTMLSpanElement>>(
  ({ className, ...props }, ref) => (
    <span ref={ref} className={cn('flex h-full w-full items-center justify-center rounded-full bg-muted', className)} {...props} />
  )
)
AvatarFallback.displayName = 'AvatarFallback'

export { Avatar, AvatarImage, AvatarFallback }
`
  }

  /**
   * Generate full Dialog compound component.
   */
  private generateFullDialog(): string {
    return `'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'
import { X } from 'lucide-react'

interface DialogProps {
  open?: boolean
  onOpenChange?: (open: boolean) => void
  children: React.ReactNode
}

const DialogContext = React.createContext<{ open: boolean; onOpenChange: (open: boolean) => void }>({ open: false, onOpenChange: () => {} })

function Dialog({ open: controlledOpen, onOpenChange, children }: DialogProps) {
  const [internalOpen, setInternalOpen] = React.useState(false)
  const isOpen = controlledOpen ?? internalOpen
  const handleChange = React.useCallback((v: boolean) => {
    setInternalOpen(v)
    onOpenChange?.(v)
  }, [onOpenChange])
  return <DialogContext.Provider value={{ open: isOpen, onOpenChange: handleChange }}>{children}</DialogContext.Provider>
}

function DialogTrigger({ children, asChild, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { asChild?: boolean }) {
  const ctx = React.useContext(DialogContext)
  if (asChild && React.isValidElement(children)) {
    return React.cloneElement(children as React.ReactElement<any>, { onClick: () => ctx.onOpenChange(true) })
  }
  return <button type="button" onClick={() => ctx.onOpenChange(true)} {...props}>{children}</button>
}

function DialogPortal({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}

function DialogOverlay({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('fixed inset-0 z-50 bg-black/80', className)} {...props} />
}

const DialogContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, children, ...props }, ref) => {
    const ctx = React.useContext(DialogContext)
    if (!ctx.open) return null
    return (
      <>
        <DialogOverlay onClick={() => ctx.onOpenChange(false)} />
        <div ref={ref} className={cn('fixed left-[50%] top-[50%] z-50 grid w-full max-w-lg translate-x-[-50%] translate-y-[-50%] gap-4 border bg-background p-6 shadow-lg duration-200 sm:rounded-lg', className)} {...props}>
          {children}
          <button type="button" className="absolute right-4 top-4 rounded-sm opacity-70 hover:opacity-100" onClick={() => ctx.onOpenChange(false)}>
            <X className="h-4 w-4" />
          </button>
        </div>
      </>
    )
  }
)
DialogContent.displayName = 'DialogContent'

function DialogHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('flex flex-col space-y-1.5 text-center sm:text-left', className)} {...props} />
}

function DialogFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2', className)} {...props} />
}

function DialogTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h2 className={cn('text-lg font-semibold leading-none tracking-tight', className)} {...props} />
}

function DialogDescription({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn('text-sm text-muted-foreground', className)} {...props} />
}

function DialogClose({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const ctx = React.useContext(DialogContext)
  return <button type="button" onClick={() => ctx.onOpenChange(false)} {...props}>{children}</button>
}

export { Dialog, DialogPortal, DialogOverlay, DialogClose, DialogTrigger, DialogContent, DialogHeader, DialogFooter, DialogTitle, DialogDescription }
`
  }

  /**
   * Generate full AlertDialog compound component.
   */
  private generateFullAlertDialog(): string {
    return `'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'

const AlertDialogContext = React.createContext<{ open: boolean; onOpenChange: (open: boolean) => void }>({ open: false, onOpenChange: () => {} })

function AlertDialog({ open: controlledOpen, onOpenChange, children }: { open?: boolean; onOpenChange?: (open: boolean) => void; children: React.ReactNode }) {
  const [internalOpen, setInternalOpen] = React.useState(false)
  const isOpen = controlledOpen ?? internalOpen
  const handleChange = React.useCallback((v: boolean) => { setInternalOpen(v); onOpenChange?.(v) }, [onOpenChange])
  return <AlertDialogContext.Provider value={{ open: isOpen, onOpenChange: handleChange }}>{children}</AlertDialogContext.Provider>
}

function AlertDialogTrigger({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const ctx = React.useContext(AlertDialogContext)
  return <button type="button" onClick={() => ctx.onOpenChange(true)} {...props}>{children}</button>
}

function AlertDialogPortal({ children }: { children: React.ReactNode }) { return <>{children}</> }

function AlertDialogOverlay({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('fixed inset-0 z-50 bg-black/80', className)} {...props} />
}

const AlertDialogContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, children, ...props }, ref) => {
    const ctx = React.useContext(AlertDialogContext)
    if (!ctx.open) return null
    return (
      <>
        <AlertDialogOverlay />
        <div ref={ref} className={cn('fixed left-[50%] top-[50%] z-50 grid w-full max-w-lg translate-x-[-50%] translate-y-[-50%] gap-4 border bg-background p-6 shadow-lg duration-200 sm:rounded-lg', className)} {...props}>{children}</div>
      </>
    )
  }
)
AlertDialogContent.displayName = 'AlertDialogContent'

function AlertDialogHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('flex flex-col space-y-2 text-center sm:text-left', className)} {...props} />
}

function AlertDialogFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2', className)} {...props} />
}

function AlertDialogTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h2 className={cn('text-lg font-semibold', className)} {...props} />
}

function AlertDialogDescription({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn('text-sm text-muted-foreground', className)} {...props} />
}

function AlertDialogAction({ className, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const ctx = React.useContext(AlertDialogContext)
  return <button type="button" className={cn('inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90', className)} onClick={(e) => { ctx.onOpenChange(false); props.onClick?.(e) }} {...props} />
}

function AlertDialogCancel({ className, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const ctx = React.useContext(AlertDialogContext)
  return <button type="button" className={cn('inline-flex h-10 items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-semibold hover:bg-accent hover:text-accent-foreground', className)} onClick={(e) => { ctx.onOpenChange(false); props.onClick?.(e) }} {...props} />
}

export { AlertDialog, AlertDialogPortal, AlertDialogOverlay, AlertDialogTrigger, AlertDialogContent, AlertDialogHeader, AlertDialogFooter, AlertDialogTitle, AlertDialogDescription, AlertDialogAction, AlertDialogCancel }
`
  }

  /**
   * Generate full DropdownMenu compound component.
   */
  private generateFullDropdownMenu(): string {
    return `'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'

const DropdownMenuContext = React.createContext<{ open: boolean; onOpenChange: (open: boolean) => void; position: { top: number; left: number } }>({ open: false, onOpenChange: () => {}, position: { top: 0, left: 0 } })

function DropdownMenu({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = React.useState(false)
  const [position, setPosition] = React.useState({ top: 0, left: 0 })
  const ctx = React.useMemo(() => ({ open, onOpenChange: setOpen, position }), [open, position])
  return <DropdownMenuContext.Provider value={ctx}>{children}</DropdownMenuContext.Provider>
}

const DropdownMenuTrigger = React.forwardRef<HTMLButtonElement, React.ButtonHTMLAttributes<HTMLButtonElement> & { asChild?: boolean }>(
  ({ children, asChild, ...props }, ref) => {
    const ctx = React.useContext(DropdownMenuContext)
    const handleClick = (e: React.MouseEvent) => {
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
      Object.assign(ctx.position, { top: rect.bottom + 4, left: rect.left })
      ctx.onOpenChange(!ctx.open)
    }
    return <button ref={ref} type="button" onClick={handleClick} {...props}>{children}</button>
  }
)
DropdownMenuTrigger.displayName = 'DropdownMenuTrigger'

function DropdownMenuContent({ className, children, align, sideOffset, ...props }: React.HTMLAttributes<HTMLDivElement> & { align?: string; sideOffset?: number }) {
  const ctx = React.useContext(DropdownMenuContext)
  const ref = React.useRef<HTMLDivElement>(null)
  React.useEffect(() => {
    if (!ctx.open) return
    const handler = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) ctx.onOpenChange(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [ctx.open, ctx])
  if (!ctx.open) return null
  return (
    <div ref={ref} className={cn('z-50 min-w-[8rem] overflow-hidden rounded-md border bg-popover p-1 text-popover-foreground shadow-md', className)} style={{ position: 'fixed', top: ctx.position.top, left: ctx.position.left }} {...props}>{children}</div>
  )
}

function DropdownMenuItem({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  const ctx = React.useContext(DropdownMenuContext)
  return <div role="menuitem" className={cn('relative flex cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-accent hover:text-accent-foreground', className)} onClick={() => ctx.onOpenChange(false)} {...props} />
}

function DropdownMenuSeparator({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('-mx-1 my-1 h-px bg-muted', className)} {...props} />
}

function DropdownMenuLabel({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('px-2 py-1.5 text-sm font-semibold', className)} {...props} />
}

function DropdownMenuGroup({ children }: { children: React.ReactNode }) { return <div role="group">{children}</div> }

function DropdownMenuCheckboxItem({ className, checked, children, ...props }: React.HTMLAttributes<HTMLDivElement> & { checked?: boolean }) {
  return <div role="menuitemcheckbox" aria-checked={checked} className={cn('relative flex cursor-pointer select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm outline-none hover:bg-accent', className)} {...props}><span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">{checked ? '\\u2713' : ''}</span>{children}</div>
}

export { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuCheckboxItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuGroup }
`
  }

  /**
   * Generate full Accordion compound component (Accordion, AccordionItem, AccordionTrigger, AccordionContent).
   */
  private generateFullAccordion(): string {
    return `'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'
import { ChevronDown } from 'lucide-react'

interface AccordionProps extends React.HTMLAttributes<HTMLDivElement> {
  type?: 'single' | 'multiple'
  collapsible?: boolean
  defaultValue?: string | string[]
  value?: string | string[]
  onValueChange?: (value: string | string[]) => void
}

const AccordionContext = React.createContext<{ value: string[]; toggle: (v: string) => void }>({ value: [], toggle: () => {} })

function Accordion({ type = 'single', collapsible = false, defaultValue, value: controlledValue, onValueChange, className, children, ...props }: AccordionProps) {
  const [internalValue, setInternalValue] = React.useState<string[]>(
    Array.isArray(defaultValue) ? defaultValue : defaultValue ? [defaultValue] : []
  )
  const currentValue = controlledValue != null ? (Array.isArray(controlledValue) ? controlledValue : [controlledValue]) : internalValue
  const toggle = React.useCallback((item: string) => {
    setInternalValue(prev => {
      let next: string[]
      if (prev.includes(item)) {
        next = type === 'single' && !collapsible ? prev : prev.filter(v => v !== item)
      } else {
        next = type === 'single' ? [item] : [...prev, item]
      }
      onValueChange?.(type === 'single' ? (next[0] ?? '') : next)
      return next
    })
  }, [type, collapsible, onValueChange])
  return (
    <AccordionContext.Provider value={{ value: currentValue, toggle }}>
      <div className={cn('w-full', className)} {...props}>{children}</div>
    </AccordionContext.Provider>
  )
}

function AccordionItem({ value, className, children, ...props }: React.HTMLAttributes<HTMLDivElement> & { value: string }) {
  return <div className={cn('border-b', className)} data-value={value} {...props}>{children}</div>
}

function AccordionTrigger({ className, children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const ctx = React.useContext(AccordionContext)
  const item = props['aria-controls'] || (props as any)['data-value'] || ''
  const parent = React.useRef<HTMLElement | null>(null)
  const [itemValue, setItemValue] = React.useState('')
  React.useEffect(() => {
    const el = parent.current?.closest('[data-value]')
    if (el) setItemValue(el.getAttribute('data-value') || '')
  }, [])
  const isOpen = ctx.value.includes(itemValue)
  return (
    <h3 className="flex">
      <button ref={(el) => { parent.current = el }} type="button" className={cn('flex flex-1 items-center justify-between py-4 text-sm font-medium transition-all hover:underline [&[data-state=open]>svg]:rotate-180', className)} data-state={isOpen ? 'open' : 'closed'} onClick={() => itemValue && ctx.toggle(itemValue)} {...props}>
        {children}
        <ChevronDown className={cn('h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200', isOpen && 'rotate-180')} />
      </button>
    </h3>
  )
}

function AccordionContent({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  const ctx = React.useContext(AccordionContext)
  const ref = React.useRef<HTMLDivElement>(null)
  const [itemValue, setItemValue] = React.useState('')
  React.useEffect(() => {
    const el = ref.current?.closest('[data-value]')
    if (el) setItemValue(el.getAttribute('data-value') || '')
  }, [])
  const isOpen = ctx.value.includes(itemValue)
  if (!isOpen) return <div ref={ref} />
  return (
    <div ref={ref} className={cn('overflow-hidden text-sm', className)} {...props}>
      <div className="pb-4 pt-0">{children}</div>
    </div>
  )
}

export { Accordion, AccordionItem, AccordionTrigger, AccordionContent }
`
  }

  /**
   * Generate Switch (toggle) component — accessible, with hover/focus states.
   */
  private generateSwitch(): string {
    return `import * as React from 'react'
import { cn } from '@/lib/utils'

export interface SwitchProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'onChange'> {
  checked?: boolean
  defaultChecked?: boolean
  onCheckedChange?: (checked: boolean) => void
  className?: string
}

const Switch = React.forwardRef<HTMLButtonElement, SwitchProps>(
  ({ className, checked, defaultChecked, onCheckedChange, onClick, ...props }, ref) => {
    const [internalChecked, setInternalChecked] = React.useState(defaultChecked ?? false)
    const isControlled = checked !== undefined
    const isOn = isControlled ? checked : internalChecked

    const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
      const next = !isOn
      if (!isControlled) setInternalChecked(next)
      onCheckedChange?.(next)
      onClick?.(e)
    }

    return (
      <button
        type="button"
        role="switch"
        aria-checked={isOn}
        ref={ref}
        onClick={handleClick}
        className={cn(
          'relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
          'disabled:cursor-not-allowed disabled:opacity-50',
          isOn ? 'bg-primary' : 'bg-input',
          className
        )}
        {...props}
      >
        <span
          className={cn(
            'pointer-events-none block size-5 rounded-full bg-background shadow-lg ring-0 transition-transform',
            isOn ? 'translate-x-5' : 'translate-x-0.5'
          )}
        />
      </button>
    )
  }
)
Switch.displayName = 'Switch'

export { Switch }
`
  }

  private generateButton(): string {
    return `import * as React from 'react'
import { cn } from '@/lib/utils'
import { cva, type VariantProps } from 'class-variance-authority'

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground shadow-sm hover:opacity-90 active:opacity-80 transition-opacity',
        secondary: 'bg-secondary text-secondary-foreground shadow-sm hover:opacity-90 active:opacity-80 transition-opacity',
        outline: 'border border-input bg-background shadow-sm hover:bg-muted hover:text-foreground active:bg-muted transition-colors',
        ghost: 'hover:bg-muted hover:text-foreground active:bg-muted transition-colors',
        link: 'text-primary underline-offset-4 hover:underline',
        destructive: 'bg-destructive text-destructive-foreground shadow-sm hover:opacity-90 active:opacity-80 transition-opacity',
      },
      size: {
        sm: 'h-8 rounded-md px-3 text-xs',
        md: 'h-9 px-4 py-2',
        lg: 'h-10 rounded-md px-6',
        icon: 'size-9',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'md',
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => (
    <button
      ref={ref}
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  )
)
Button.displayName = 'Button'

export { Button, buttonVariants }
`
  }

  private generateInput(): string {
    return `import * as React from 'react'
import { cn } from '@/lib/utils'

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => (
    <input
      type={type}
      ref={ref}
      className={cn(
        'flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors',
        'file:border-0 file:bg-transparent file:text-sm file:font-medium',
        'placeholder:text-muted-foreground',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        'disabled:cursor-not-allowed disabled:opacity-50',
        className
      )}
      {...props}
    />
  )
)
Input.displayName = 'Input'

export { Input }
`
  }

  private generateTextarea(): string {
    return `import * as React from 'react'
import { cn } from '@/lib/utils'

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {}

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, ...props }, ref) => (
    <textarea
      ref={ref}
      className={cn(
        'flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm',
        'placeholder:text-muted-foreground',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        'disabled:cursor-not-allowed disabled:opacity-50',
        className
      )}
      {...props}
    />
  )
)
Textarea.displayName = 'Textarea'

export { Textarea }
`
  }

  private generateLabel(): string {
    return `import * as React from 'react'
import { cn } from '@/lib/utils'

export interface LabelProps extends React.LabelHTMLAttributes<HTMLLabelElement> {}

const Label = React.forwardRef<HTMLLabelElement, LabelProps>(
  ({ className, ...props }, ref) => (
    <label
      ref={ref}
      className={cn(
        'text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70',
        className
      )}
      {...props}
    />
  )
)
Label.displayName = 'Label'

export { Label }
`
  }

  private generateBadge(): string {
    return `import * as React from 'react'
import { cn } from '@/lib/utils'
import { cva, type VariantProps } from 'class-variance-authority'

const badgeVariants = cva(
  'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-primary text-primary-foreground',
        secondary: 'border-transparent bg-secondary text-secondary-foreground',
        outline: 'text-foreground',
        destructive: 'border-transparent bg-destructive text-destructive-foreground',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />
}

export { Badge, badgeVariants }
`
  }

  private generateCheckbox(): string {
    return `'use client'
import * as React from 'react'
import { cn } from '@/lib/utils'

export interface CheckboxProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {
  onCheckedChange?: (checked: boolean) => void
}

const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(
  ({ className, onCheckedChange, onChange, ...props }, ref) => (
    <input
      type="checkbox"
      ref={ref}
      className={cn(
        'size-4 shrink-0 rounded-sm border border-primary',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
        'disabled:cursor-not-allowed disabled:opacity-50',
        'accent-primary',
        className
      )}
      onChange={(e) => {
        onChange?.(e)
        onCheckedChange?.(e.target.checked)
      }}
      {...props}
    />
  )
)
Checkbox.displayName = 'Checkbox'

export { Checkbox }
`
  }

  private generateSelect(): string {
    return `import * as React from 'react'
import { cn } from '@/lib/utils'

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {}

const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, children, ...props }, ref) => (
    <select
      ref={ref}
      className={cn(
        'flex h-9 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm',
        'focus:outline-none focus:ring-2 focus:ring-ring',
        'disabled:cursor-not-allowed disabled:opacity-50',
        className
      )}
      {...props}
    >
      {children}
    </select>
  )
)
Select.displayName = 'Select'

const SelectTrigger = Select
const SelectValue = ({ placeholder }: { placeholder?: string }) => <option value="" disabled>{placeholder}</option>
const SelectContent = ({ children }: { children: React.ReactNode }) => <>{children}</>
const SelectItem = ({ value, children }: { value: string; children: React.ReactNode }) => <option value={value}>{children}</option>

export { Select, SelectTrigger, SelectValue, SelectContent, SelectItem }
`
  }

  /**
   * Fallback base styles for components that lack explicit className in config.
   * Ensures generated components always look styled even when AI omits className.
   */
  private getFallbackBaseClassName(def: ComponentDefinition): string {
    if (def.baseClassName && def.baseClassName.trim()) return def.baseClassName
    const fallbacks: Record<string, string> = {
      slider: 'relative flex w-full touch-none select-none items-center',
      tabs: 'inline-flex items-center justify-center rounded-md bg-muted p-1 text-muted-foreground',
      accordion: 'divide-y divide-border rounded-lg border',
      'radio-group': 'grid gap-2',
      tooltip: 'rounded-md border bg-popover px-3 py-1.5 text-sm text-popover-foreground shadow-md',
      separator: 'shrink-0 bg-border',
      progress: 'relative h-2 w-full overflow-hidden rounded-full bg-muted',
      skeleton: 'animate-pulse rounded-md bg-muted',
      avatar: 'relative flex size-10 shrink-0 overflow-hidden rounded-full',
      alert: 'relative w-full rounded-lg border p-4 text-sm',
      dialog: 'fixed inset-0 z-50 flex items-center justify-center',
      'alert-dialog': 'fixed inset-0 z-50 flex items-center justify-center',
      popover: 'z-50 rounded-md border bg-popover p-4 text-popover-foreground shadow-md',
      'dropdown-menu': 'z-50 min-w-[8rem] rounded-md border bg-popover p-1 text-popover-foreground shadow-md',
      toggle: 'inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors hover:bg-muted hover:text-muted-foreground data-[state=on]:bg-accent data-[state=on]:text-accent-foreground',
    }
    return fallbacks[def.id] || 'rounded-md border bg-background p-4 text-sm transition-colors'
  }

  /**
   * Fallback variant styles for components whose variants have empty classNames.
   */
  private getFallbackVariantClassName(def: ComponentDefinition, variantName: string): string {
    const variantFallbacks: Record<string, Record<string, string>> = {
      alert: {
        default: 'bg-background text-foreground',
        destructive: 'border-destructive/50 text-destructive [&>svg]:text-destructive',
        success: 'border-green-500/50 text-green-700 dark:text-green-400',
        warning: 'border-yellow-500/50 text-yellow-700 dark:text-yellow-400',
      },
      toggle: {
        default: 'bg-transparent',
        outline: 'border border-input bg-transparent hover:bg-muted',
      },
    }
    return variantFallbacks[def.id]?.[variantName] || ''
  }

  /**
   * Fallback size styles for components whose sizes have empty classNames.
   */
  private getFallbackSizeClassName(def: ComponentDefinition, sizeName: string): string {
    const sizeFallbacks: Record<string, string> = {
      xs: 'h-7 px-2 text-xs',
      sm: 'h-8 px-3 text-xs',
      md: 'h-9 px-4 py-2 text-sm',
      lg: 'h-10 px-6 text-sm',
      xl: 'h-12 px-8 text-base',
    }
    return sizeFallbacks[sizeName] || sizeFallbacks.md
  }

  /**
   * Generate shadcn/ui-style component
   */
  private generateShadcnComponent(def: ComponentDefinition): string {
    const enriched = this.enrichDefinitionWithFallbacks(def)
    const imports = this.generateImports(enriched)
    const variants = this.generateVariants(enriched)
    const propsInterface = this.generatePropsInterface(enriched)
    const component = this.generateComponentCode(enriched)

    return `${imports}

${variants}

${propsInterface}

${component}
`
  }

  /**
   * Return a copy of the definition with fallback styles injected where classNames are empty.
   */
  private enrichDefinitionWithFallbacks(def: ComponentDefinition): ComponentDefinition {
    const baseClassName = this.getFallbackBaseClassName(def)
    const variants = def.variants.map(v => ({
      ...v,
      className: (v.className && v.className.trim()) ? v.className : this.getFallbackVariantClassName(def, v.name),
    }))
    const sizes = def.sizes.map(s => ({
      ...s,
      className: (s.className && s.className.trim()) ? s.className : this.getFallbackSizeClassName(def, s.name),
    }))
    return { ...def, baseClassName, variants, sizes }
  }

  /**
   * Generate custom component (simpler, without cva).
   * Applies fallback baseClassName if the definition has none.
   */
  private generateCustomComponent(def: ComponentDefinition): string {
    const enriched = { ...def, baseClassName: this.getFallbackBaseClassName(def) }
    const imports = this.generateBasicImports()
    const propsInterface = this.generateBasicPropsInterface(enriched)
    const component = this.generateBasicComponent(enriched)

    return `${imports}

${propsInterface}

${component}
`
  }

  /**
   * Generate imports for shadcn-style component
   */
  private generateImports(def: ComponentDefinition): string {
    const imports = [
      "import * as React from 'react'",
      "import { cn } from '@/lib/utils'",
      "import { cva, type VariantProps } from 'class-variance-authority'",
    ]

    // Add forwardRef if needed (for form elements)
    if (this.isFormElement(def)) {
      imports.push("import { forwardRef } from 'react'")
    }

    return imports.join('\n')
  }

  /**
   * Generate basic imports (without cva)
   */
  private generateBasicImports(): string {
    return "import * as React from 'react'\nimport { cn } from '@/lib/utils'"
  }

  /**
   * Generate variants using cva
   */
  private generateVariants(def: ComponentDefinition): string {
    const baseClasses = this.applyTokens(def.baseClassName, this.config.tokens)
    const variantConfig: Record<string, Record<string, string>> = {}
    const defaultVariants: Record<string, string> = {}

    // Add variant variants
    if (def.variants.length > 0) {
      variantConfig.variant = {}
      def.variants.forEach(variant => {
        const className = this.applyTokens(variant.className, this.config.tokens)
        variantConfig.variant[variant.name] = className
      })

      // Set default variant
      const defaultVariant = def.defaultProps?.variant
      if (defaultVariant && def.variants.some(v => v.name === defaultVariant)) {
        defaultVariants.variant = defaultVariant
      } else if (def.variants.length > 0) {
        defaultVariants.variant = def.variants[0].name
      }
    }

    // Add size variants
    if (def.sizes.length > 0) {
      variantConfig.size = {}
      def.sizes.forEach(size => {
        const className = this.applyTokens(size.className, this.config.tokens)
        variantConfig.size[size.name] = className
      })

      // Set default size
      const defaultSize = def.defaultProps?.size
      if (defaultSize && def.sizes.some(s => s.name === defaultSize)) {
        defaultVariants.size = defaultSize
      } else if (def.sizes.length > 0) {
        defaultVariants.size = def.sizes[0].name
      }
    }

    // Build cva call
    const variantEntries = Object.entries(variantConfig)
      .map(([key, value]) => {
        const valueEntries = Object.entries(value)
          .map(([name, className]) => `        ${name}: '${className}'`)
          .join(',\n')
        return `      ${key}: {\n${valueEntries},\n      }`
      })
      .join(',\n')

    const defaultVariantsString =
      Object.keys(defaultVariants).length > 0
        ? Object.entries(defaultVariants)
            .map(([key, value]) => `      ${key}: '${value}'`)
            .join(',\n')
        : ''

    const componentName = this.toCamelCase(def.name)
    const variantsName = `${componentName}Variants`

    return `const ${variantsName} = cva(
  '${baseClasses}',
  {
    variants: {
${variantEntries}
    },
${defaultVariantsString ? `    defaultVariants: {\n${defaultVariantsString},\n    },` : ''}
  }
)`
  }

  /**
   * Generate props interface
   */
  private generatePropsInterface(def: ComponentDefinition): string {
    const componentName = def.name
    const variantsName = `${this.toCamelCase(def.name)}Variants`
    const htmlElement = this.getHTMLElement(def)

    const extendsList = [`    VariantProps<typeof ${variantsName}>`]

    // Add React props based on element type
    if (htmlElement === 'button') {
      extendsList.push('    React.ButtonHTMLAttributes<HTMLButtonElement>')
    } else if (htmlElement === 'input') {
      extendsList.push('    React.InputHTMLAttributes<HTMLInputElement>')
    } else if (htmlElement === 'div') {
      extendsList.push('    React.HTMLAttributes<HTMLDivElement>')
    } else {
      extendsList.push('    React.HTMLAttributes<HTMLElement>')
    }

    const bodyProps: string[] = ['    className?: string']
    if (def.ariaLabel) {
      bodyProps.push('    "aria-label"?: string')
    }
    if (def.ariaDescribedBy) {
      bodyProps.push('    "aria-describedby"?: string')
    }

    return `export interface ${componentName}Props
  extends ${extendsList.join(',\n    ')} {
${bodyProps.join('\n')}
  }`
  }

  /**
   * Generate basic props interface (without VariantProps)
   */
  private generateBasicPropsInterface(def: ComponentDefinition): string {
    const componentName = def.name
    const htmlElement = this.getHTMLElement(def)

    const extendsList: string[] = []
    if (htmlElement === 'button') {
      extendsList.push('    React.ButtonHTMLAttributes<HTMLButtonElement>')
    } else if (htmlElement === 'input') {
      extendsList.push('    React.InputHTMLAttributes<HTMLInputElement>')
    } else if (htmlElement === 'div') {
      extendsList.push('    React.HTMLAttributes<HTMLDivElement>')
    } else {
      extendsList.push('    React.HTMLAttributes<HTMLElement>')
    }

    const bodyProps: string[] = ['    className?: string']
    if (def.defaultProps) {
      Object.entries(def.defaultProps).forEach(([key, value]) => {
        const type = typeof value === 'string' ? 'string' : typeof value
        bodyProps.push(`    ${key}?: ${type}`)
      })
    }

    return `export interface ${componentName}Props
  extends ${extendsList.join(',\n    ')} {
${bodyProps.join('\n')}
  }`
  }

  /**
   * Generate component code
   */
  private generateComponentCode(def: ComponentDefinition): string {
    const componentName = def.name
    const variantsName = `${this.toCamelCase(def.name)}Variants`
    const htmlElement = this.getHTMLElement(def)
    const isFormElement = this.isFormElement(def)

    // Build props destructuring
    const variantProps = def.variants.length > 0 ? 'variant, ' : ''
    const sizeProps = def.sizes.length > 0 ? 'size, ' : ''
    const propsDestructuring = `{ ${variantProps}${sizeProps}className, ...props }: ${componentName}Props`

    // Build className
    const classNameCall = `cn(${variantsName}({ ${variantProps}${sizeProps} }), className)`

    // Build accessibility attributes
    const ariaAttrs: string[] = []
    if (def.ariaLabel) {
      ariaAttrs.push('aria-label={props["aria-label"] || undefined}')
    }
    if (def.ariaDescribedBy) {
      ariaAttrs.push('aria-describedby={props["aria-describedby"] || undefined}')
    }
    const ariaString = ariaAttrs.length > 0 ? `\n        ${ariaAttrs.join('\n        ')}` : ''

    if (isFormElement) {
      // Use forwardRef for form elements
      return `export const ${componentName} = forwardRef<${this.getHTMLElementType(htmlElement)}, ${componentName}Props>(
  (${propsDestructuring}, ref) => {
    return (
      <${htmlElement}
        ref={ref}
        className={${classNameCall}}${ariaString}
        {...props}
      />
    )
  }
)
${componentName}.displayName = '${componentName}'`
    } else {
      return `export const ${componentName} = (${propsDestructuring}) => {
  return (
    <${htmlElement}
      className={${classNameCall}}${ariaString}
      {...props}
    />
  )
}`
    }
  }

  /**
   * Generate basic component (without variants)
   */
  private generateBasicComponent(def: ComponentDefinition): string {
    const componentName = def.name
    const htmlElement = this.getHTMLElement(def)
    const baseClasses = this.applyTokens(def.baseClassName, this.config.tokens)

    return `export const ${componentName} = ({ className, ...props }: ${componentName}Props) => {
  return (
    <${htmlElement}
      className={cn('${baseClasses}', className)}
      {...props}
    />
  )
}`
  }

  /**
   * Apply design tokens to className string
   */
  private applyTokens(className: string, tokens: DesignTokens): string {
    // Replace token references with actual values
    // For now, tokens are already in Tailwind format (e.g., bg-primary)
    // In future, could expand to replace custom tokens
    return className
  }

  /**
   * Determine HTML element type from component definition
   */
  private getHTMLElement(def: ComponentDefinition): string {
    const id = def.id.toLowerCase()
    const name = def.name.toLowerCase()

    // Prefer component id for form elements (shadcn: button, input, textarea)
    if (id === 'button') return 'button'
    if (id === 'input') return 'input'
    if (id === 'textarea') return 'textarea'

    if (name.includes('button') || name.includes('btn')) {
      return 'button'
    }
    if (name.includes('input') || name.includes('field')) {
      return 'input'
    }
    if (name.includes('textarea')) {
      return 'textarea'
    }
    if (name.includes('link') || name.includes('anchor')) {
      return 'a'
    }
    if (name.includes('heading') || name.includes('title')) {
      return 'h1'
    }
    if (name.includes('paragraph') || name.includes('text')) {
      return 'p'
    }
    if (name.includes('label')) {
      return 'label'
    }

    // Default to div
    return 'div'
  }

  /**
   * Get TypeScript type for HTML element
   */
  private getHTMLElementType(element: string): string {
    const typeMap: Record<string, string> = {
      button: 'HTMLButtonElement',
      input: 'HTMLInputElement',
      textarea: 'HTMLTextAreaElement',
      a: 'HTMLAnchorElement',
      h1: 'HTMLHeadingElement',
      p: 'HTMLParagraphElement',
      label: 'HTMLLabelElement',
      div: 'HTMLDivElement',
    }
    return typeMap[element] || 'HTMLElement'
  }

  /**
   * Check if component is a form element (needs forwardRef)
   */
  private isFormElement(def: ComponentDefinition): boolean {
    const name = def.name.toLowerCase()
    return (
      name.includes('input') ||
      name.includes('button') ||
      name.includes('select') ||
      name.includes('textarea')
    )
  }

  /**
   * Convert PascalCase to camelCase
   */
  private toCamelCase(str: string): string {
    return str.charAt(0).toLowerCase() + str.slice(1)
  }

  /**
   * Update config reference
   */
  updateConfig(newConfig: DesignSystemConfig): void {
    this.config = newConfig
  }
}
