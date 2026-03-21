export interface BasePageContent {
  title: string
  description: string
}

export interface DashboardContent extends BasePageContent {
  stats: Array<{
    label: string
    value: string
    change?: string
    icon?: string
  }>
  recentActivity?: Array<{
    title: string
    description: string
    time: string
  }>
}

export interface PricingContent extends BasePageContent {
  tiers: Array<{
    name: string
    price: string
    period?: string
    description: string
    features: string[]
    cta: string
    highlighted?: boolean
  }>
  faq?: Array<{
    question: string
    answer: string
  }>
}

export interface ListingContent extends BasePageContent {
  items: Array<{
    title: string
    description: string
    badge?: string
    icon?: string
    link?: string
  }>
  filters?: string[]
  columns?: 2 | 3 | 4
}

export interface ContactContent extends BasePageContent {
  fields: Array<{
    name: string
    label: string
    type: 'text' | 'email' | 'tel' | 'textarea'
    placeholder: string
    required?: boolean
  }>
  submitLabel: string
  contactInfo?: Array<{
    label: string
    value: string
    icon?: string
  }>
}

export interface SettingsContent extends BasePageContent {
  sections: Array<{
    title: string
    description: string
    fields: Array<{
      name: string
      label: string
      type: 'text' | 'email' | 'toggle' | 'select' | 'password'
      value?: string
      options?: string[]
    }>
  }>
}

export interface LandingContent extends BasePageContent {
  hero: {
    headline: string
    subheadline: string
    primaryCta: string
    secondaryCta?: string
  }
  features: Array<{
    title: string
    description: string
    icon?: string
  }>
  finalCta?: {
    headline: string
    description: string
    buttonText: string
  }
}

export interface BlogContent extends BasePageContent {
  posts: Array<{
    title: string
    excerpt: string
    date: string
    author: string
    slug?: string
  }>
}

export interface ProfileContent extends BasePageContent {
  avatar?: string
  name: string
  email: string
  fields: Array<{ label: string; value: string }>
  connectedAccounts?: Array<{ name: string; connected: boolean }>
  activity?: Array<{ title: string; time: string }>
}

export interface OnboardingContent extends BasePageContent {
  steps: Array<{
    title: string
    description: string
    fields?: Array<{ name: string; label: string; type: string }>
  }>
  totalSteps: number
}

export interface GalleryContent extends BasePageContent {
  images: Array<{
    src: string
    alt: string
    title?: string
  }>
  categories?: string[]
}

export interface FaqContent extends BasePageContent {
  categories?: string[]
  items: Array<{
    question: string
    answer: string
    category?: string
  }>
}

export interface LoginContent extends BasePageContent {
  forgotPasswordRoute?: string
  registerRoute?: string
}

export interface RegisterContent extends BasePageContent {
  loginRoute?: string
}

export interface TeamContent extends BasePageContent {
  members?: Array<{ name: string; role: string; email?: string; avatar?: string }>
}

export interface TasksContent extends BasePageContent {
  tasks?: Array<{ title: string; status: string; assignee?: string; priority?: string }>
}

export interface TaskDetailContent extends BasePageContent {
  taskId?: string
}

export interface ResetPasswordContent extends BasePageContent {
  loginRoute?: string
}

export interface ChangelogContent extends BasePageContent {
  versions: Array<{
    version: string
    date: string
    badge?: string
    entries: Array<{
      type: string
      text: string
    }>
  }>
}

export interface TemplateOptions {
  route: string
  pageName: string
}

export type PageContent =
  | { pageType: 'dashboard'; content: DashboardContent }
  | { pageType: 'pricing'; content: PricingContent }
  | { pageType: 'listing'; content: ListingContent }
  | { pageType: 'contact'; content: ContactContent }
  | { pageType: 'settings'; content: SettingsContent }
  | { pageType: 'landing'; content: LandingContent }
  | { pageType: 'blog'; content: BlogContent }
  | { pageType: 'profile'; content: ProfileContent }
  | { pageType: 'onboarding'; content: OnboardingContent }
  | { pageType: 'gallery'; content: GalleryContent }
  | { pageType: 'faq'; content: FaqContent }
  | { pageType: 'changelog'; content: ChangelogContent }
  | { pageType: 'login'; content: LoginContent }
  | { pageType: 'register'; content: RegisterContent }
  | { pageType: 'team'; content: TeamContent }
  | { pageType: 'tasks'; content: TasksContent }
  | { pageType: 'task-detail'; content: TaskDetailContent }
  | { pageType: 'reset-password'; content: ResetPasswordContent }
