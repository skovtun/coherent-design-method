import type { ComponentDefinition } from '@getcoherent/core'

/**
 * shadcn/ui component templates (Coherent ComponentDefinition shape)
 */
const SHADCN_COMPONENTS: Record<string, ComponentDefinition> = {
  button: {
    id: 'button',
    name: 'Button',
    category: 'form',
    source: 'shadcn',
    shadcnComponent: 'button',
    baseClassName:
      'inline-flex items-center justify-center rounded-md font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 disabled:opacity-50 disabled:pointer-events-none',
    variants: [
      { name: 'default', className: 'bg-primary text-primary-foreground shadow-sm hover:opacity-90 active:opacity-80' },
      {
        name: 'secondary',
        className: 'bg-secondary text-secondary-foreground shadow-sm hover:opacity-90 active:opacity-80',
      },
      {
        name: 'outline',
        className:
          'border border-input bg-background shadow-sm hover:bg-accent hover:text-accent-foreground active:bg-accent',
      },
      { name: 'ghost', className: 'hover:bg-accent hover:text-accent-foreground active:bg-accent' },
      { name: 'destructive', className: 'bg-error text-white shadow-sm hover:opacity-90 active:opacity-80' },
      { name: 'link', className: 'text-primary underline-offset-4 hover:underline' },
    ],
    sizes: [
      { name: 'sm', className: 'h-8 px-3 text-xs' },
      { name: 'md', className: 'h-10 px-4 text-sm' },
      { name: 'lg', className: 'h-11 px-8 text-base' },
    ],
    usedInPages: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },

  input: {
    id: 'input',
    name: 'Input',
    category: 'form',
    source: 'shadcn',
    shadcnComponent: 'input',
    baseClassName: 'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm',
    variants: [
      { name: 'default', className: '' },
      { name: 'error', className: 'border-error focus-visible:ring-error' },
    ],
    sizes: [
      { name: 'sm', className: 'h-8 text-xs' },
      { name: 'md', className: 'h-10 text-sm' },
      { name: 'lg', className: 'h-12 text-base' },
    ],
    usedInPages: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },

  textarea: {
    id: 'textarea',
    name: 'Textarea',
    category: 'form',
    source: 'shadcn',
    shadcnComponent: 'textarea',
    baseClassName: 'flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm',
    variants: [
      { name: 'default', className: '' },
      { name: 'error', className: 'border-error focus-visible:ring-error' },
    ],
    sizes: [
      { name: 'sm', className: 'min-h-[60px] text-xs' },
      { name: 'md', className: 'min-h-[80px] text-sm' },
      { name: 'lg', className: 'min-h-[120px] text-base' },
    ],
    usedInPages: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },

  checkbox: {
    id: 'checkbox',
    name: 'Checkbox',
    category: 'form',
    source: 'shadcn',
    shadcnComponent: 'checkbox',
    baseClassName: 'peer h-4 w-4 shrink-0 rounded-sm border border-primary',
    variants: [{ name: 'default', className: '' }],
    sizes: [
      { name: 'sm', className: 'h-3 w-3' },
      { name: 'md', className: 'h-4 w-4' },
      { name: 'lg', className: 'h-5 w-5' },
    ],
    usedInPages: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },

  select: {
    id: 'select',
    name: 'Select',
    category: 'form',
    source: 'shadcn',
    shadcnComponent: 'select',
    baseClassName:
      'flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2',
    variants: [{ name: 'default', className: '' }],
    sizes: [
      { name: 'sm', className: 'h-8 text-xs' },
      { name: 'md', className: 'h-10 text-sm' },
      { name: 'lg', className: 'h-12 text-base' },
    ],
    usedInPages: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },

  dialog: {
    id: 'dialog',
    name: 'Dialog',
    category: 'overlay',
    source: 'shadcn',
    shadcnComponent: 'dialog',
    baseClassName: 'fixed z-50 grid w-full gap-4 border bg-background p-6 shadow-lg',
    variants: [{ name: 'default', className: '' }],
    sizes: [
      { name: 'sm', className: 'max-w-sm' },
      { name: 'md', className: 'max-w-lg' },
      { name: 'lg', className: 'max-w-2xl' },
    ],
    usedInPages: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },

  badge: {
    id: 'badge',
    name: 'Badge',
    category: 'data-display',
    source: 'shadcn',
    shadcnComponent: 'badge',
    baseClassName: 'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold',
    variants: [
      { name: 'default', className: 'border-transparent bg-primary text-primary-foreground' },
      { name: 'secondary', className: 'border-transparent bg-secondary text-secondary-foreground' },
      { name: 'success', className: 'border-transparent bg-success text-white' },
      { name: 'error', className: 'border-transparent bg-error text-white' },
      { name: 'outline', className: 'text-foreground' },
    ],
    sizes: [
      { name: 'sm', className: 'text-xs px-2 py-0.5' },
      { name: 'md', className: 'text-sm px-2.5 py-0.5' },
      { name: 'lg', className: 'text-base px-3 py-1' },
    ],
    usedInPages: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },

  card: {
    id: 'card',
    name: 'Card',
    category: 'layout',
    source: 'shadcn',
    shadcnComponent: 'card',
    baseClassName: 'rounded-lg border bg-background text-foreground shadow-sm',
    variants: [
      { name: 'default', className: '' },
      { name: 'outlined', className: 'border-2' },
      { name: 'elevated', className: 'shadow-lg' },
      { name: 'interactive', className: 'hover:shadow-md transition-shadow cursor-pointer' },
    ],
    sizes: [
      { name: 'sm', className: 'p-3' },
      { name: 'md', className: 'p-6' },
      { name: 'lg', className: 'p-8' },
    ],
    usedInPages: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },

  // Form Components
  label: {
    id: 'label',
    name: 'Label',
    category: 'form',
    source: 'shadcn',
    shadcnComponent: 'label',
    baseClassName: 'text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70',
    variants: [{ name: 'default', className: '' }],
    sizes: [{ name: 'md', className: '' }],
    usedInPages: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },

  'radio-group': {
    id: 'radio-group',
    name: 'RadioGroup',
    category: 'form',
    source: 'shadcn',
    shadcnComponent: 'radio-group',
    baseClassName: 'grid gap-2',
    variants: [{ name: 'default', className: '' }],
    sizes: [
      { name: 'sm', className: 'gap-1' },
      { name: 'md', className: 'gap-2' },
      { name: 'lg', className: 'gap-3' },
    ],
    usedInPages: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },

  switch: {
    id: 'switch',
    name: 'Switch',
    category: 'form',
    source: 'shadcn',
    shadcnComponent: 'switch',
    baseClassName:
      'peer inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors',
    variants: [{ name: 'default', className: '' }],
    sizes: [
      { name: 'sm', className: 'h-5 w-9' },
      { name: 'md', className: 'h-6 w-11' },
      { name: 'lg', className: 'h-7 w-14' },
    ],
    usedInPages: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },

  slider: {
    id: 'slider',
    name: 'Slider',
    category: 'form',
    source: 'shadcn',
    shadcnComponent: 'slider',
    baseClassName: 'relative flex w-full touch-none select-none items-center',
    variants: [{ name: 'default', className: '' }],
    sizes: [
      { name: 'sm', className: 'h-1' },
      { name: 'md', className: 'h-2' },
      { name: 'lg', className: 'h-3' },
    ],
    usedInPages: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },

  // Layout Components
  separator: {
    id: 'separator',
    name: 'Separator',
    category: 'layout',
    source: 'shadcn',
    shadcnComponent: 'separator',
    baseClassName: 'shrink-0 bg-border',
    variants: [
      { name: 'horizontal', className: 'h-[1px] w-full' },
      { name: 'vertical', className: 'h-full w-[1px]' },
    ],
    sizes: [{ name: 'md', className: '' }],
    usedInPages: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },

  accordion: {
    id: 'accordion',
    name: 'Accordion',
    category: 'layout',
    source: 'shadcn',
    shadcnComponent: 'accordion',
    baseClassName: 'w-full',
    variants: [
      { name: 'default', className: '' },
      { name: 'bordered', className: 'border rounded-md' },
    ],
    sizes: [{ name: 'md', className: '' }],
    usedInPages: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },

  tabs: {
    id: 'tabs',
    name: 'Tabs',
    category: 'layout',
    source: 'shadcn',
    shadcnComponent: 'tabs',
    baseClassName: 'w-full',
    variants: [
      { name: 'default', className: '' },
      { name: 'bordered', className: 'border rounded-md p-4' },
    ],
    sizes: [{ name: 'md', className: '' }],
    usedInPages: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },

  collapsible: {
    id: 'collapsible',
    name: 'Collapsible',
    category: 'layout',
    source: 'shadcn',
    shadcnComponent: 'collapsible',
    baseClassName: 'w-full space-y-2',
    variants: [{ name: 'default', className: '' }],
    sizes: [{ name: 'md', className: '' }],
    usedInPages: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },

  // Navigation Components
  'navigation-menu': {
    id: 'navigation-menu',
    name: 'NavigationMenu',
    category: 'navigation',
    source: 'shadcn',
    shadcnComponent: 'navigation-menu',
    baseClassName: 'relative z-10 flex max-w-max flex-1 items-center justify-center',
    variants: [{ name: 'default', className: '' }],
    sizes: [{ name: 'md', className: '' }],
    usedInPages: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },

  menubar: {
    id: 'menubar',
    name: 'Menubar',
    category: 'navigation',
    source: 'shadcn',
    shadcnComponent: 'menubar',
    baseClassName: 'flex h-10 items-center space-x-1 rounded-md border bg-background p-1',
    variants: [{ name: 'default', className: '' }],
    sizes: [
      { name: 'sm', className: 'h-8' },
      { name: 'md', className: 'h-10' },
      { name: 'lg', className: 'h-12' },
    ],
    usedInPages: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },

  breadcrumb: {
    id: 'breadcrumb',
    name: 'Breadcrumb',
    category: 'navigation',
    source: 'shadcn',
    shadcnComponent: 'breadcrumb',
    baseClassName: 'flex flex-wrap items-center gap-1.5 break-words text-sm text-muted-foreground',
    variants: [{ name: 'default', className: '' }],
    sizes: [{ name: 'md', className: '' }],
    usedInPages: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },

  pagination: {
    id: 'pagination',
    name: 'Pagination',
    category: 'navigation',
    source: 'shadcn',
    shadcnComponent: 'pagination',
    baseClassName: 'mx-auto flex w-full justify-center',
    variants: [{ name: 'default', className: '' }],
    sizes: [
      { name: 'sm', className: 'text-xs' },
      { name: 'md', className: 'text-sm' },
      { name: 'lg', className: 'text-base' },
    ],
    usedInPages: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },

  // Data Display
  table: {
    id: 'table',
    name: 'Table',
    category: 'data-display',
    source: 'shadcn',
    shadcnComponent: 'table',
    baseClassName: 'w-full caption-bottom text-sm',
    variants: [
      { name: 'default', className: '' },
      { name: 'striped', className: '[&_tr:nth-child(even)]:bg-muted/50' },
    ],
    sizes: [
      { name: 'sm', className: 'text-xs' },
      { name: 'md', className: 'text-sm' },
      { name: 'lg', className: 'text-base' },
    ],
    usedInPages: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },

  avatar: {
    id: 'avatar',
    name: 'Avatar',
    category: 'data-display',
    source: 'shadcn',
    shadcnComponent: 'avatar',
    baseClassName: 'relative flex shrink-0 overflow-hidden rounded-full',
    variants: [{ name: 'default', className: '' }],
    sizes: [
      { name: 'sm', className: 'h-8 w-8' },
      { name: 'md', className: 'h-10 w-10' },
      { name: 'lg', className: 'h-12 w-12' },
      { name: 'xl', className: 'h-16 w-16' },
    ],
    usedInPages: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },

  progress: {
    id: 'progress',
    name: 'Progress',
    category: 'data-display',
    source: 'shadcn',
    shadcnComponent: 'progress',
    baseClassName: 'relative h-4 w-full overflow-hidden rounded-full bg-secondary',
    variants: [{ name: 'default', className: '' }],
    sizes: [
      { name: 'sm', className: 'h-2' },
      { name: 'md', className: 'h-4' },
      { name: 'lg', className: 'h-6' },
    ],
    usedInPages: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },

  skeleton: {
    id: 'skeleton',
    name: 'Skeleton',
    category: 'data-display',
    source: 'shadcn',
    shadcnComponent: 'skeleton',
    baseClassName: 'animate-pulse rounded-md bg-muted',
    variants: [{ name: 'default', className: '' }],
    sizes: [{ name: 'md', className: '' }],
    usedInPages: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },

  // Overlay Components
  'alert-dialog': {
    id: 'alert-dialog',
    name: 'AlertDialog',
    category: 'overlay',
    source: 'shadcn',
    shadcnComponent: 'alert-dialog',
    baseClassName: 'fixed z-50 grid w-full max-w-lg gap-4 border bg-background p-6 shadow-lg',
    variants: [{ name: 'default', className: '' }],
    sizes: [
      { name: 'sm', className: 'max-w-sm' },
      { name: 'md', className: 'max-w-lg' },
      { name: 'lg', className: 'max-w-2xl' },
    ],
    usedInPages: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },

  sheet: {
    id: 'sheet',
    name: 'Sheet',
    category: 'overlay',
    source: 'shadcn',
    shadcnComponent: 'sheet',
    baseClassName: 'fixed z-50 gap-4 bg-background p-6 shadow-lg transition',
    variants: [
      { name: 'top', className: 'inset-x-0 top-0 border-b' },
      { name: 'bottom', className: 'inset-x-0 bottom-0 border-t' },
      { name: 'left', className: 'inset-y-0 left-0 h-full w-3/4 border-r sm:max-w-sm' },
      { name: 'right', className: 'inset-y-0 right-0 h-full w-3/4 border-l sm:max-w-sm' },
    ],
    sizes: [{ name: 'md', className: '' }],
    usedInPages: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },

  popover: {
    id: 'popover',
    name: 'Popover',
    category: 'overlay',
    source: 'shadcn',
    shadcnComponent: 'popover',
    baseClassName: 'z-50 w-72 rounded-md border bg-popover p-4 text-popover-foreground shadow-md outline-none',
    variants: [{ name: 'default', className: '' }],
    sizes: [
      { name: 'sm', className: 'w-56' },
      { name: 'md', className: 'w-72' },
      { name: 'lg', className: 'w-96' },
    ],
    usedInPages: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },

  tooltip: {
    id: 'tooltip',
    name: 'Tooltip',
    category: 'overlay',
    source: 'shadcn',
    shadcnComponent: 'tooltip',
    baseClassName:
      'z-50 overflow-hidden rounded-md border bg-popover px-3 py-1.5 text-sm text-popover-foreground shadow-md',
    variants: [{ name: 'default', className: '' }],
    sizes: [{ name: 'md', className: '' }],
    usedInPages: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },

  'dropdown-menu': {
    id: 'dropdown-menu',
    name: 'DropdownMenu',
    category: 'overlay',
    source: 'shadcn',
    shadcnComponent: 'dropdown-menu',
    baseClassName:
      'z-50 min-w-[8rem] overflow-hidden rounded-md border bg-popover p-1 text-popover-foreground shadow-md',
    variants: [{ name: 'default', className: '' }],
    sizes: [
      { name: 'sm', className: 'min-w-[6rem]' },
      { name: 'md', className: 'min-w-[8rem]' },
      { name: 'lg', className: 'min-w-[12rem]' },
    ],
    usedInPages: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },

  'context-menu': {
    id: 'context-menu',
    name: 'ContextMenu',
    category: 'overlay',
    source: 'shadcn',
    shadcnComponent: 'context-menu',
    baseClassName:
      'z-50 min-w-[8rem] overflow-hidden rounded-md border bg-popover p-1 text-popover-foreground shadow-md',
    variants: [{ name: 'default', className: '' }],
    sizes: [{ name: 'md', className: '' }],
    usedInPages: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },

  'hover-card': {
    id: 'hover-card',
    name: 'HoverCard',
    category: 'overlay',
    source: 'shadcn',
    shadcnComponent: 'hover-card',
    baseClassName: 'z-50 w-64 rounded-md border bg-popover p-4 text-popover-foreground shadow-md outline-none',
    variants: [{ name: 'default', className: '' }],
    sizes: [
      { name: 'sm', className: 'w-48' },
      { name: 'md', className: 'w-64' },
      { name: 'lg', className: 'w-80' },
    ],
    usedInPages: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },

  // Feedback Components
  alert: {
    id: 'alert',
    name: 'Alert',
    category: 'feedback',
    source: 'shadcn',
    shadcnComponent: 'alert',
    baseClassName: 'relative w-full rounded-lg border p-4',
    variants: [
      { name: 'default', className: 'bg-background text-foreground' },
      { name: 'destructive', className: 'border-destructive/50 text-destructive dark:border-destructive' },
    ],
    sizes: [{ name: 'md', className: '' }],
    usedInPages: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },

  toast: {
    id: 'toast',
    name: 'Toast',
    category: 'feedback',
    source: 'shadcn',
    shadcnComponent: 'toast',
    baseClassName:
      'group pointer-events-auto relative flex w-full items-center justify-between space-x-4 overflow-hidden rounded-md border p-6 pr-8 shadow-lg transition-all',
    variants: [
      { name: 'default', className: '' },
      {
        name: 'destructive',
        className: 'destructive group border-destructive bg-destructive text-destructive-foreground',
      },
    ],
    sizes: [{ name: 'md', className: '' }],
    usedInPages: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },

  // Advanced Components
  calendar: {
    id: 'calendar',
    name: 'Calendar',
    category: 'form',
    source: 'shadcn',
    shadcnComponent: 'calendar',
    baseClassName: 'p-3',
    variants: [{ name: 'default', className: '' }],
    sizes: [{ name: 'md', className: '' }],
    usedInPages: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },

  command: {
    id: 'command',
    name: 'Command',
    category: 'form',
    source: 'shadcn',
    shadcnComponent: 'command',
    baseClassName: 'flex h-full w-full flex-col overflow-hidden rounded-md bg-popover text-popover-foreground',
    variants: [{ name: 'default', className: '' }],
    sizes: [{ name: 'md', className: '' }],
    usedInPages: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },

  combobox: {
    id: 'combobox',
    name: 'Combobox',
    category: 'form',
    source: 'shadcn',
    shadcnComponent: 'combobox',
    baseClassName: 'w-full',
    variants: [{ name: 'default', className: '' }],
    sizes: [{ name: 'md', className: '' }],
    usedInPages: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },

  'aspect-ratio': {
    id: 'aspect-ratio',
    name: 'AspectRatio',
    category: 'layout',
    source: 'shadcn',
    shadcnComponent: 'aspect-ratio',
    baseClassName: 'relative w-full',
    variants: [
      { name: '16/9', className: 'aspect-video' },
      { name: '4/3', className: 'aspect-4/3' },
      { name: '1/1', className: 'aspect-square' },
    ],
    sizes: [{ name: 'md', className: '' }],
    usedInPages: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },

  'scroll-area': {
    id: 'scroll-area',
    name: 'ScrollArea',
    category: 'layout',
    source: 'shadcn',
    shadcnComponent: 'scroll-area',
    baseClassName: 'relative overflow-hidden',
    variants: [{ name: 'default', className: '' }],
    sizes: [{ name: 'md', className: '' }],
    usedInPages: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },

  toggle: {
    id: 'toggle',
    name: 'Toggle',
    category: 'form',
    source: 'shadcn',
    shadcnComponent: 'toggle',
    baseClassName:
      'inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors hover:bg-muted hover:text-muted-foreground focus-visible:outline-none focus-visible:ring-2',
    variants: [
      { name: 'default', className: '' },
      { name: 'outline', className: 'border border-input bg-transparent hover:bg-accent hover:text-accent-foreground' },
    ],
    sizes: [
      { name: 'sm', className: 'h-9 px-2.5' },
      { name: 'md', className: 'h-10 px-3' },
      { name: 'lg', className: 'h-11 px-5' },
    ],
    usedInPages: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },

  'toggle-group': {
    id: 'toggle-group',
    name: 'ToggleGroup',
    category: 'form',
    source: 'shadcn',
    shadcnComponent: 'toggle-group',
    baseClassName: 'flex items-center justify-center gap-1',
    variants: [{ name: 'default', className: '' }],
    sizes: [{ name: 'md', className: '' }],
    usedInPages: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },

  carousel: {
    id: 'carousel',
    name: 'Carousel',
    category: 'data-display',
    source: 'shadcn',
    shadcnComponent: 'carousel',
    baseClassName: 'relative w-full',
    variants: [{ name: 'default', className: '' }],
    sizes: [{ name: 'md', className: '' }],
    usedInPages: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },

  drawer: {
    id: 'drawer',
    name: 'Drawer',
    category: 'overlay',
    source: 'shadcn',
    shadcnComponent: 'drawer',
    baseClassName: 'fixed z-50 gap-4 bg-background p-6 shadow-lg',
    variants: [
      { name: 'bottom', className: 'inset-x-0 bottom-0 border-t' },
      { name: 'left', className: 'inset-y-0 left-0 h-full w-3/4 border-r sm:max-w-sm' },
      { name: 'right', className: 'inset-y-0 right-0 h-full w-3/4 border-l sm:max-w-sm' },
    ],
    sizes: [{ name: 'md', className: '' }],
    usedInPages: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },

  resizable: {
    id: 'resizable',
    name: 'Resizable',
    category: 'layout',
    source: 'shadcn',
    shadcnComponent: 'resizable',
    baseClassName: 'flex h-full w-full',
    variants: [
      { name: 'horizontal', className: 'flex-row' },
      { name: 'vertical', className: 'flex-col' },
    ],
    sizes: [{ name: 'md', className: '' }],
    usedInPages: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },

  sonner: {
    id: 'sonner',
    name: 'Sonner',
    category: 'feedback',
    source: 'shadcn',
    shadcnComponent: 'sonner',
    baseClassName:
      'group pointer-events-auto relative flex w-full items-center justify-between space-x-4 overflow-hidden rounded-md border p-6 pr-8 shadow-lg transition-all',
    variants: [{ name: 'default', className: '' }],
    sizes: [{ name: 'md', className: '' }],
    usedInPages: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
}

/**
 * Check if shadcn component is available
 */
export function isShadcnComponent(name: string): boolean {
  return name.toLowerCase() in SHADCN_COMPONENTS
}

/**
 * Get component definition from shadcn template
 */
export function getShadcnComponent(name: string): ComponentDefinition | null {
  const normalized = name.toLowerCase()
  return SHADCN_COMPONENTS[normalized] ?? null
}

/**
 * Get list of all available shadcn components (cached after first call)
 */
let _shadcnComponentsCache: string[] | null = null
export function listShadcnComponents(): string[] {
  if (!_shadcnComponentsCache) {
    _shadcnComponentsCache = Object.keys(SHADCN_COMPONENTS)
  }
  return _shadcnComponentsCache
}

/**
 * Install component (returns definition; file generation is handled by ComponentGenerator)
 */
export async function installShadcnComponent(name: string, _projectRoot: string): Promise<ComponentDefinition | null> {
  const component = getShadcnComponent(name)

  if (!component) {
    throw new Error(`Component ${name} not found in built-in templates`)
  }

  return component
}
