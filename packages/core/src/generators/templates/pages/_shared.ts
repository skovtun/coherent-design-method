/** Design rule constants — DO NOT override */
export const D = {
  pageTitle: 'text-4xl md:text-5xl font-bold tracking-tight leading-[1.1]',
  heroTitle: 'text-5xl md:text-6xl lg:text-7xl font-bold tracking-tight leading-[1.05]',
  sectionTitle: 'text-2xl md:text-3xl font-bold',
  cardTitle: 'text-sm font-semibold',
  cardDesc: 'text-sm text-muted-foreground leading-relaxed',
  metricValue: 'text-2xl font-bold',
  metricSub: 'text-xs text-muted-foreground',
  body: 'text-sm',
  muted: 'text-sm text-muted-foreground leading-relaxed',
  mutedXs: 'text-xs text-muted-foreground',

  pagePadding: 'p-4 lg:p-6',
  sectionGap: 'gap-6 md:gap-8',
  sectionSpacing: 'py-20 md:py-28',
  titleToContent: 'mb-12 md:mb-16',
  pageWrapper: 'flex flex-1 flex-col gap-6 p-4 lg:gap-8 lg:p-6',
  statsGrid: 'grid gap-5 md:grid-cols-2 lg:grid-cols-4',
  grid3: 'grid gap-5 md:grid-cols-3',
  grid2: 'grid gap-6 md:grid-cols-2',
  centeredForm: 'flex min-h-svh flex-col items-center justify-center p-6 md:p-10',
  formContainer: 'w-full max-w-sm',

  card: 'bg-card border border-border/15 rounded-xl hover:border-border/30 transition-colors',
  cardDark: 'bg-zinc-900/50 border border-border/10 rounded-xl backdrop-blur-sm hover:border-border/30 transition-colors',
  icon: 'size-4 text-muted-foreground',
  featureIcon: 'h-5 w-5 text-primary',
  featureIconWrap: 'flex items-center justify-center rounded-lg bg-primary/10 p-2.5',
  statHeader: 'flex flex-row items-center justify-between space-y-0 pb-2',
  listItem: 'flex items-center justify-between py-3 border-b last:border-0',
  fieldGroup: 'space-y-2',
  formGap: 'space-y-4',
  terminalBlock: 'rounded-xl bg-zinc-950 border border-border/10 px-4 py-3 font-mono text-sm text-emerald-400',
  sectionContainer: 'max-w-6xl mx-auto px-4',
  heroSection: 'min-h-[80vh] flex items-center justify-center',
  heroContent: 'flex flex-col items-center text-center gap-8 max-w-3xl',
  footerSection: 'border-t border-border/10 py-10',
} as const

const ICON_MAP: Record<string, string> = {
  DollarSign: 'DollarSign',
  Users: 'Users',
  CreditCard: 'CreditCard',
  Activity: 'Activity',
  Mail: 'Mail',
  Phone: 'Phone',
  MapPin: 'MapPin',
  Check: 'Check',
  ArrowRight: 'ArrowRight',
  Shield: 'Shield',
  Zap: 'Zap',
  Star: 'Star',
  Heart: 'Heart',
  Globe: 'Globe',
  Settings: 'Settings',
  Bell: 'Bell',
  Search: 'Search',
  BarChart3: 'BarChart3',
  TrendingUp: 'TrendingUp',
  Package: 'Package',
  Clock: 'Clock',
  Eye: 'Eye',
  Code: 'Code',
  Palette: 'Palette',
  Layers: 'Layers',
  Layout: 'Layout',
  Smartphone: 'Smartphone',
  Database: 'Database',
  Cloud: 'Cloud',
  Lock: 'Lock',
  AlertTriangle: 'AlertTriangle',
}

export function resolveIcon(name?: string): string {
  if (!name) return 'Activity'
  return ICON_MAP[name] || name
}

export function collectIcons(names: (string | undefined)[]): string[] {
  const unique = [...new Set(names.filter(Boolean).map(resolveIcon))]
  return unique.length > 0 ? unique : ['Activity']
}

export function pascalCase(s: string): string {
  return s
    .replace(/[-_\s]+(.)?/g, (_, c) => (c ? c.toUpperCase() : ''))
    .replace(/^./, (c) => c.toUpperCase())
}
