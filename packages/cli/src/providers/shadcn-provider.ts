import type { ComponentProvider, ComponentMeta, ComponentAPI, DesignTokens } from '@getcoherent/core'

type Category = ComponentMeta['category']

const COMPONENT_REGISTRY: ComponentMeta[] = [
  // Form
  { id: 'button', name: 'Button', category: 'form', managed: true },
  { id: 'input', name: 'Input', category: 'form', managed: true },
  { id: 'textarea', name: 'Textarea', category: 'form', managed: true },
  { id: 'checkbox', name: 'Checkbox', category: 'form', managed: true },
  { id: 'radio-group', name: 'RadioGroup', category: 'form', managed: true },
  { id: 'select', name: 'Select', category: 'form', managed: true },
  { id: 'switch', name: 'Switch', category: 'form', managed: true },
  { id: 'slider', name: 'Slider', category: 'form', managed: true },
  { id: 'label', name: 'Label', category: 'form', managed: true },
  { id: 'form', name: 'Form', category: 'form', managed: true },
  { id: 'calendar', name: 'Calendar', category: 'form', managed: true },
  { id: 'date-picker', name: 'DatePicker', category: 'form', managed: true },
  { id: 'command', name: 'Command', category: 'form', managed: true },
  { id: 'combobox', name: 'Combobox', category: 'form', managed: true },
  { id: 'toggle', name: 'Toggle', category: 'form', managed: true },
  { id: 'toggle-group', name: 'ToggleGroup', category: 'form', managed: true },
  { id: 'input-otp', name: 'InputOTP', category: 'form', managed: true },

  // Layout
  { id: 'card', name: 'Card', category: 'layout', managed: true },
  { id: 'separator', name: 'Separator', category: 'layout', managed: true },
  { id: 'accordion', name: 'Accordion', category: 'layout', managed: true },
  { id: 'tabs', name: 'Tabs', category: 'layout', managed: true },
  { id: 'collapsible', name: 'Collapsible', category: 'layout', managed: true },
  { id: 'aspect-ratio', name: 'AspectRatio', category: 'layout', managed: true },
  { id: 'scroll-area', name: 'ScrollArea', category: 'layout', managed: true },
  { id: 'resizable', name: 'Resizable', category: 'layout', managed: true },

  // Navigation
  { id: 'navigation-menu', name: 'NavigationMenu', category: 'navigation', managed: true },
  { id: 'menubar', name: 'Menubar', category: 'navigation', managed: true },
  { id: 'breadcrumb', name: 'Breadcrumb', category: 'navigation', managed: true },
  { id: 'pagination', name: 'Pagination', category: 'navigation', managed: true },
  { id: 'sidebar', name: 'Sidebar', category: 'navigation', managed: true },

  // Data Display
  { id: 'table', name: 'Table', category: 'data-display', managed: true },
  { id: 'avatar', name: 'Avatar', category: 'data-display', managed: true },
  { id: 'badge', name: 'Badge', category: 'data-display', managed: true },
  { id: 'progress', name: 'Progress', category: 'data-display', managed: true },
  { id: 'skeleton', name: 'Skeleton', category: 'data-display', managed: true },
  { id: 'carousel', name: 'Carousel', category: 'data-display', managed: true },
  { id: 'chart', name: 'Chart', category: 'data-display', managed: true },

  // Overlay
  { id: 'dialog', name: 'Dialog', category: 'overlay', managed: true },
  { id: 'alert-dialog', name: 'AlertDialog', category: 'overlay', managed: true },
  { id: 'sheet', name: 'Sheet', category: 'overlay', managed: true },
  { id: 'popover', name: 'Popover', category: 'overlay', managed: true },
  { id: 'tooltip', name: 'Tooltip', category: 'overlay', managed: true },
  { id: 'dropdown-menu', name: 'DropdownMenu', category: 'overlay', managed: true },
  { id: 'context-menu', name: 'ContextMenu', category: 'overlay', managed: true },
  { id: 'hover-card', name: 'HoverCard', category: 'overlay', managed: true },
  { id: 'drawer', name: 'Drawer', category: 'overlay', managed: true },

  // Feedback
  { id: 'alert', name: 'Alert', category: 'feedback', managed: true },
  { id: 'toast', name: 'Toast', category: 'feedback', managed: true },
  { id: 'sonner', name: 'Sonner', category: 'feedback', managed: true },

  // Typography
  { id: 'typography', name: 'Typography', category: 'typography', managed: true },
]

const COMPONENT_APIS: Record<string, ComponentAPI> = {
  sidebar: {
    name: 'Sidebar',
    subcomponents: [
      'SidebarProvider', 'Sidebar', 'SidebarContent', 'SidebarHeader', 'SidebarFooter',
      'SidebarGroup', 'SidebarGroupLabel', 'SidebarGroupContent',
      'SidebarMenu', 'SidebarMenuItem', 'SidebarMenuButton', 'SidebarMenuSub',
      'SidebarMenuSubItem', 'SidebarMenuSubButton', 'SidebarMenuAction', 'SidebarMenuBadge',
      'SidebarSeparator', 'SidebarRail', 'SidebarTrigger', 'SidebarInset',
    ],
    importPath: '@/components/ui/sidebar',
    keyProps: {
      side: '"left" | "right"',
      variant: '"sidebar" | "floating" | "inset"',
      collapsible: '"offcanvas" | "icon" | "none"',
    },
    usage: `<SidebarProvider>
  <Sidebar>
    <SidebarContent>
      <SidebarGroup>
        <SidebarGroupLabel>Menu</SidebarGroupLabel>
        <SidebarGroupContent>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton asChild>
                <a href="/dashboard"><Home />Dashboard</a>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>
    </SidebarContent>
  </Sidebar>
  <SidebarInset>{children}</SidebarInset>
</SidebarProvider>`,
    antiPatterns: [
      'NEVER use Button for sidebar navigation — use SidebarMenuButton',
      'NEVER build custom sidebar from div/nav — use the Sidebar component',
      'NEVER use Sheet for mobile sidebar — Sidebar handles responsive behavior automatically',
      'NEVER forget SidebarProvider wrapper — it manages open/close state',
    ],
  },

  dialog: {
    name: 'Dialog',
    subcomponents: [
      'Dialog', 'DialogTrigger', 'DialogContent', 'DialogHeader',
      'DialogFooter', 'DialogTitle', 'DialogDescription', 'DialogClose',
    ],
    importPath: '@/components/ui/dialog',
    keyProps: {
      open: 'boolean',
      onOpenChange: '(open: boolean) => void',
    },
    usage: `<Dialog>
  <DialogTrigger asChild><Button>Open</Button></DialogTrigger>
  <DialogContent>
    <DialogHeader>
      <DialogTitle>Title</DialogTitle>
      <DialogDescription>Description</DialogDescription>
    </DialogHeader>
    <DialogFooter><Button>Save</Button></DialogFooter>
  </DialogContent>
</Dialog>`,
    antiPatterns: [
      'NEVER omit DialogTitle — required for accessibility',
      'NEVER nest interactive elements without asChild on DialogTrigger',
    ],
  },

  sheet: {
    name: 'Sheet',
    subcomponents: [
      'Sheet', 'SheetTrigger', 'SheetContent', 'SheetHeader',
      'SheetFooter', 'SheetTitle', 'SheetDescription', 'SheetClose',
    ],
    importPath: '@/components/ui/sheet',
    keyProps: {
      side: '"top" | "right" | "bottom" | "left"',
    },
    usage: `<Sheet>
  <SheetTrigger asChild><Button variant="outline">Open</Button></SheetTrigger>
  <SheetContent side="right">
    <SheetHeader>
      <SheetTitle>Title</SheetTitle>
      <SheetDescription>Description</SheetDescription>
    </SheetHeader>
  </SheetContent>
</Sheet>`,
    antiPatterns: [
      'NEVER omit SheetTitle — required for accessibility',
      'NEVER use for sidebar navigation — use Sidebar component instead',
    ],
  },

  select: {
    name: 'Select',
    subcomponents: [
      'Select', 'SelectTrigger', 'SelectValue', 'SelectContent',
      'SelectGroup', 'SelectLabel', 'SelectItem', 'SelectSeparator',
    ],
    importPath: '@/components/ui/select',
    keyProps: {
      value: 'string',
      onValueChange: '(value: string) => void',
      defaultValue: 'string',
    },
    usage: `<Select>
  <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
  <SelectContent>
    <SelectItem value="a">Option A</SelectItem>
    <SelectItem value="b">Option B</SelectItem>
  </SelectContent>
</Select>`,
    antiPatterns: [
      'NEVER use native <select> — always use shadcn Select compound component',
      'NEVER put text directly in SelectTrigger — use SelectValue with placeholder',
    ],
  },

  'dropdown-menu': {
    name: 'DropdownMenu',
    subcomponents: [
      'DropdownMenu', 'DropdownMenuTrigger', 'DropdownMenuContent',
      'DropdownMenuItem', 'DropdownMenuCheckboxItem', 'DropdownMenuRadioItem',
      'DropdownMenuLabel', 'DropdownMenuSeparator', 'DropdownMenuGroup',
      'DropdownMenuSub', 'DropdownMenuSubTrigger', 'DropdownMenuSubContent',
      'DropdownMenuRadioGroup', 'DropdownMenuShortcut',
    ],
    importPath: '@/components/ui/dropdown-menu',
    keyProps: {
      'DropdownMenuItem.variant': '"default" | "destructive"',
      asChild: 'boolean (on trigger)',
    },
    usage: `<DropdownMenu>
  <DropdownMenuTrigger asChild><Button variant="ghost">Menu</Button></DropdownMenuTrigger>
  <DropdownMenuContent>
    <DropdownMenuLabel>Actions</DropdownMenuLabel>
    <DropdownMenuSeparator />
    <DropdownMenuItem>Edit</DropdownMenuItem>
    <DropdownMenuItem variant="destructive">Delete</DropdownMenuItem>
  </DropdownMenuContent>
</DropdownMenu>`,
    antiPatterns: [
      'NEVER nest <button> inside DropdownMenuTrigger — use asChild',
      'NEVER use className="text-destructive" on DropdownMenuItem — use variant="destructive"',
    ],
  },

  'navigation-menu': {
    name: 'NavigationMenu',
    subcomponents: [
      'NavigationMenu', 'NavigationMenuList', 'NavigationMenuItem',
      'NavigationMenuTrigger', 'NavigationMenuContent', 'NavigationMenuLink',
      'NavigationMenuIndicator', 'NavigationMenuViewport',
    ],
    importPath: '@/components/ui/navigation-menu',
    keyProps: {},
    usage: `<NavigationMenu>
  <NavigationMenuList>
    <NavigationMenuItem>
      <NavigationMenuLink asChild>
        <a href="/about">About</a>
      </NavigationMenuLink>
    </NavigationMenuItem>
  </NavigationMenuList>
</NavigationMenu>`,
    antiPatterns: [
      'NEVER use for sidebar navigation — use Sidebar component',
      'NEVER use plain <nav> with Button links — use NavigationMenu for top nav',
    ],
  },

  command: {
    name: 'Command',
    subcomponents: [
      'Command', 'CommandInput', 'CommandList', 'CommandEmpty',
      'CommandGroup', 'CommandItem', 'CommandSeparator', 'CommandShortcut',
      'CommandDialog',
    ],
    importPath: '@/components/ui/command',
    keyProps: {},
    usage: `<Command>
  <CommandInput placeholder="Search..." />
  <CommandList>
    <CommandEmpty>No results found.</CommandEmpty>
    <CommandGroup heading="Actions">
      <CommandItem>Search</CommandItem>
    </CommandGroup>
  </CommandList>
</Command>`,
    antiPatterns: [
      'NEVER build custom search palette — use Command/CommandDialog',
    ],
  },

  tabs: {
    name: 'Tabs',
    subcomponents: ['Tabs', 'TabsList', 'TabsTrigger', 'TabsContent'],
    importPath: '@/components/ui/tabs',
    keyProps: {
      defaultValue: 'string',
      orientation: '"horizontal" | "vertical"',
    },
    usage: `<Tabs defaultValue="general">
  <TabsList>
    <TabsTrigger value="general">General</TabsTrigger>
    <TabsTrigger value="billing">Billing</TabsTrigger>
  </TabsList>
  <TabsContent value="general">General settings...</TabsContent>
  <TabsContent value="billing">Billing settings...</TabsContent>
</Tabs>`,
    antiPatterns: [
      'NEVER use Button group for tab switching — use Tabs',
      'NEVER use full Sidebar for in-page nav with <= 5 items — use vertical Tabs',
    ],
  },

  card: {
    name: 'Card',
    subcomponents: ['Card', 'CardHeader', 'CardTitle', 'CardDescription', 'CardContent', 'CardFooter'],
    importPath: '@/components/ui/card',
    keyProps: {},
    usage: `<Card>
  <CardHeader>
    <CardTitle>Title</CardTitle>
    <CardDescription>Description</CardDescription>
  </CardHeader>
  <CardContent>Content</CardContent>
  <CardFooter>Footer</CardFooter>
</Card>`,
    antiPatterns: [],
  },

  table: {
    name: 'Table',
    subcomponents: ['Table', 'TableHeader', 'TableBody', 'TableFooter', 'TableRow', 'TableHead', 'TableCell', 'TableCaption'],
    importPath: '@/components/ui/table',
    keyProps: {},
    usage: `<Table>
  <TableHeader>
    <TableRow><TableHead>Name</TableHead></TableRow>
  </TableHeader>
  <TableBody>
    <TableRow><TableCell>Value</TableCell></TableRow>
  </TableBody>
</Table>`,
    antiPatterns: [
      'NEVER use native <table> — use shadcn Table for consistent styling',
    ],
  },

  accordion: {
    name: 'Accordion',
    subcomponents: ['Accordion', 'AccordionItem', 'AccordionTrigger', 'AccordionContent'],
    importPath: '@/components/ui/accordion',
    keyProps: {
      type: '"single" | "multiple"',
      collapsible: 'boolean',
    },
    usage: `<Accordion type="single" collapsible>
  <AccordionItem value="item-1">
    <AccordionTrigger>Section</AccordionTrigger>
    <AccordionContent>Content</AccordionContent>
  </AccordionItem>
</Accordion>`,
    antiPatterns: [],
  },
}

const componentMetaMap = new Map<string, ComponentMeta>()
for (const meta of COMPONENT_REGISTRY) {
  componentMetaMap.set(meta.id, meta)
}

function basicAPI(id: string, name: string, _category: Category): ComponentAPI {
  return {
    name,
    subcomponents: [name],
    importPath: `@/components/ui/${id}`,
    keyProps: {},
    usage: `<${name} />`,
    antiPatterns: [],
  }
}

export class ShadcnProvider implements ComponentProvider {
  readonly id = 'shadcn'

  async init(_projectRoot: string): Promise<void> {
    // Implemented in Task 2.3
  }

  async install(_name: string, _projectRoot: string): Promise<void> {
    // Implemented in Task 2.2
  }

  list(): ComponentMeta[] {
    return COMPONENT_REGISTRY
  }

  getComponentAPI(name: string): ComponentAPI | null {
    const meta = componentMetaMap.get(name)
    if (!meta) return null

    if (COMPONENT_APIS[name]) return COMPONENT_APIS[name]

    return basicAPI(meta.id, meta.name, meta.category)
  }

  getCssVariables(_tokens: DesignTokens): string {
    // Implemented in Task 3.5
    return ''
  }

  getThemeBlock(_tokens: DesignTokens): string {
    // Implemented in Task 3.5
    return ''
  }
}
