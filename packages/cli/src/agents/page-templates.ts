/**
 * Page Templates
 *
 * Expands minimal page requests (e.g. "add dashboard page") into
 * detailed section descriptions for full-featured pages.
 */

export const PAGE_TEMPLATES: Record<string, { description: string; sections: string[]; components: string[] }> = {
  dashboard: {
    description: 'Dashboard page with KPI stats grid and recent activity',
    sections: [
      'Page header: h1 "Dashboard" with className="text-2xl font-bold tracking-tight" and a p with className="text-sm text-muted-foreground" subtitle like "Overview of your key metrics and recent activity"',
      '4 stat cards in a grid (className="grid gap-4 md:grid-cols-2 lg:grid-cols-4"). Each card uses Card > CardHeader(className="flex flex-row items-center justify-between space-y-0 pb-2") > CardTitle(className="text-sm font-medium") + lucide icon(className="size-4 text-muted-foreground") ; CardContent > metric value(className="text-2xl font-bold") + change text(className="text-xs text-muted-foreground"). Stats: Total Revenue ($45,231.89, +20.1%), Active Users (2,350, +180 since last hour), Sales (12,234, +19% from last month), Active Now (573, +201 since last hour)',
      'Recent activity Card with CardHeader > CardTitle "Recent Activity" (text-sm font-medium) + CardDescription (text-sm text-muted-foreground). CardContent with a list of 5 activity items, each with title (text-sm font-medium), description (text-sm text-muted-foreground), and time (text-sm text-muted-foreground). Use flex items-center justify-between for each row.',
    ],
    components: ['Card', 'CardHeader', 'CardTitle', 'CardDescription', 'CardContent'],
  },

  login: {
    description: 'Login page with centered card form',
    sections: [
      'Centered layout: outer div className="flex min-h-svh flex-col items-center justify-center p-6 md:p-10". Inner div className="w-full max-w-sm".',
      'Card with CardHeader: CardTitle "Sign in" (text-2xl font-bold), CardDescription "Enter your credentials to access your account" (text-sm text-muted-foreground).',
      'CardContent with form: email Input (type="email", placeholder="you@example.com"), password Input (type="password"), a "Forgot password?" link (text-sm text-muted-foreground hover:text-foreground), and a Button "Sign in" (w-full).',
      'CardFooter: text "Don\'t have an account?" with a Sign up link. All text is text-sm text-muted-foreground.',
      'This page uses "use client" (has useState for form state). Do NOT include export const metadata.',
    ],
    components: [
      'Card',
      'CardHeader',
      'CardTitle',
      'CardDescription',
      'CardContent',
      'CardFooter',
      'Button',
      'Input',
      'Label',
    ],
  },

  register: {
    description: 'Registration page with centered card form',
    sections: [
      'Centered layout: outer div className="flex min-h-svh flex-col items-center justify-center p-6 md:p-10". Inner div className="w-full max-w-sm".',
      'Card with CardHeader: CardTitle "Create an account" (text-2xl font-bold), CardDescription "Enter your details to get started" (text-sm text-muted-foreground).',
      'CardContent with form: name Input, email Input (type="email"), password Input (type="password"), confirm password Input (type="password"), and a Button "Create account" (w-full).',
      'CardFooter: text "Already have an account?" with a Sign in link. All text is text-sm text-muted-foreground.',
      'This page uses "use client" (has useState for form state). Do NOT include export const metadata.',
    ],
    components: [
      'Card',
      'CardHeader',
      'CardTitle',
      'CardDescription',
      'CardContent',
      'CardFooter',
      'Button',
      'Input',
      'Label',
    ],
  },

  pricing: {
    description: 'Pricing page with tier comparison cards',
    sections: [
      'Page header: h1 "Pricing Plans" className="text-2xl font-bold tracking-tight" + p "Choose the perfect plan for your needs" className="text-sm text-muted-foreground"',
      '3 pricing Cards in grid (className="grid gap-4 md:grid-cols-3"). Each Card: CardHeader > CardTitle(text-sm font-medium) for tier name + CardDescription for price (text-2xl font-bold) + period (/month in text-sm text-muted-foreground). CardContent > feature list with checkmark icons (size-4 text-muted-foreground) and text-sm text. CardFooter > Button (w-full). Tiers: Starter ($0/mo, 5 features), Pro ($29/mo, highlighted with bg-primary text-primary-foreground badge, 8 features), Enterprise ($99/mo, 10 features)',
      'FAQ section below with 4 questions/answers, each as a div with question (text-sm font-medium) and answer (text-sm text-muted-foreground)',
    ],
    components: ['Card', 'CardHeader', 'CardTitle', 'CardDescription', 'CardContent', 'CardFooter', 'Button', 'Badge'],
  },

  about: {
    description: 'About page with team and values',
    sections: [
      'Page header: h1 "About Us" className="text-2xl font-bold tracking-tight" + mission statement p className="text-sm text-muted-foreground"',
      'Team section: heading "Our Team" (text-sm font-medium uppercase tracking-wide text-muted-foreground) + grid gap-4 md:grid-cols-3 with 3-4 team member Cards. Each Card: avatar placeholder (bg-muted/50 rounded-full size-12), name (text-sm font-medium), role (text-sm text-muted-foreground)',
      'Values section: 3-4 value Cards in grid, each with icon (size-4 text-muted-foreground), title (text-sm font-medium), description (text-sm text-muted-foreground)',
    ],
    components: ['Card', 'CardHeader', 'CardTitle', 'CardContent'],
  },

  contact: {
    description: 'Contact page with form',
    sections: [
      'Page header: h1 "Get in Touch" className="text-2xl font-bold tracking-tight" + p className="text-sm text-muted-foreground"',
      'Two-column layout: grid gap-6 lg:grid-cols-2. Left: Card with form — Label+Input for name, email, subject; Label+Textarea for message; Button "Send Message" (w-full). Right: contact info with 3 items (email, phone, address), each with icon (size-4 text-muted-foreground) + label (text-sm font-medium) + value (text-sm text-muted-foreground).',
      'This page uses "use client" (has useState for form state). Do NOT include export const metadata.',
    ],
    components: ['Card', 'CardHeader', 'CardTitle', 'CardContent', 'Button', 'Input', 'Textarea', 'Label'],
  },

  landing: {
    description: 'Landing page with hero, features, and CTA',
    sections: [
      'Hero section: centered text, h1 "Build better products, faster" className="text-2xl font-bold tracking-tight md:text-3xl" + p className="text-sm text-muted-foreground" + two Buttons (primary and secondary/outline). Centered with text-center and max-w-2xl mx-auto.',
      'Features section: grid gap-4 md:grid-cols-3 with 3 feature Cards. Each: icon (size-4 text-muted-foreground), title (text-sm font-medium), description (text-sm text-muted-foreground).',
      'CTA section: bg-muted rounded-xl p-6 md:p-10 with centered text and Button.',
    ],
    components: ['Card', 'CardHeader', 'CardTitle', 'CardContent', 'Button'],
  },

  services: {
    description: 'Services page with filterable grid',
    sections: [
      'Page header: h1 "Services" className="text-2xl font-bold tracking-tight" + p "What we offer" className="text-sm text-muted-foreground"',
      'Filter row: flex gap-2 with Badge-style filter buttons (text-sm). Active filter: bg-primary text-primary-foreground. Inactive: bg-muted text-muted-foreground hover:bg-muted/80.',
      '6 service Cards in grid gap-4 md:grid-cols-2 lg:grid-cols-3. Each Card: CardHeader > CardTitle(text-sm font-medium) + icon(size-4 text-muted-foreground). CardContent > description(text-sm text-muted-foreground). Real service names: Web Design, Mobile Development, SEO Optimization, Cloud Infrastructure, Data Analytics, UI/UX Research.',
    ],
    components: ['Card', 'CardHeader', 'CardTitle', 'CardContent', 'Badge', 'Button'],
  },

  settings: {
    description: 'Settings page with grouped form sections',
    sections: [
      'Page header: h1 "Settings" className="text-2xl font-bold tracking-tight" + p className="text-sm text-muted-foreground"',
      'Sections in flex flex-col gap-6: Profile Card (name, email inputs), Notifications Card (toggle checkboxes), Danger Zone Card (destructive button to delete account). Each Card with CardHeader(CardTitle text-sm font-medium + CardDescription text-sm text-muted-foreground) and CardContent with form fields.',
      'This page uses "use client" (has useState). Do NOT include export const metadata.',
    ],
    components: [
      'Card',
      'CardHeader',
      'CardTitle',
      'CardDescription',
      'CardContent',
      'Button',
      'Input',
      'Label',
      'Checkbox',
    ],
  },

  blog: {
    description: 'Blog or articles list page',
    sections: [
      'Page header: h1 + description. Grid of article cards (Card with CardHeader title + date/author, CardContent excerpt, CardFooter "Read more" button). Use grid gap-6 md:grid-cols-2.',
    ],
    components: ['Card', 'CardHeader', 'CardTitle', 'CardContent', 'CardFooter', 'Button'],
  },
  profile: {
    description: 'Profile or account page',
    sections: [
      'Avatar section, name and email. Personal info form (Label + Input). Connected accounts section (optional). Recent activity list. Two-column layout on desktop (md:grid-cols-2).',
    ],
    components: [
      'Card',
      'CardHeader',
      'CardTitle',
      'CardDescription',
      'CardContent',
      'Button',
      'Input',
      'Label',
      'Avatar',
      'AvatarFallback',
    ],
  },
  onboarding: {
    description: 'Onboarding or wizard (multi-step form)',
    sections: [
      'Progress indicator (step N of M). One Card per step with CardHeader (title + description), CardContent (form fields), CardFooter (Back / Next or Finish). Use "use client" and useState for step.',
    ],
    components: [
      'Card',
      'CardHeader',
      'CardTitle',
      'CardDescription',
      'CardContent',
      'CardFooter',
      'Button',
      'Input',
      'Label',
    ],
  },
  gallery: {
    description: 'Gallery or portfolio (image grid)',
    sections: [
      'Page header. Optional category filter tabs (Button variant="outline"). Grid of image cards (aspect-square, image + caption). grid-cols-2 md:grid-cols-3 lg:grid-cols-4.',
    ],
    components: ['Card', 'CardContent', 'Button'],
  },
  faq: {
    description: 'FAQ page with accordion',
    sections: [
      'Page header. Accordion or details/summary for each Q&A. Optional category tabs. Use semantic HTML or Collapsible. Max-w-3xl for content.',
    ],
    components: ['Card', 'Button'],
  },
  changelog: {
    description: 'Changelog or release timeline',
    sections: [
      'Page header. Timeline: each version with version badge, date, list of entries (type: text). Border-left timeline pattern. Badge component for version/date.',
    ],
    components: ['Badge'],
  },

  team: {
    description: 'Team page with member cards',
    sections: [
      'Page header: h1 "Our Team" className="text-2xl font-bold tracking-tight" + p className="text-sm text-muted-foreground"',
      'Grid of team member Cards (className="grid gap-4 md:grid-cols-2 lg:grid-cols-4"). Each card: avatar placeholder (bg-muted rounded-full size-12 with initials), name (text-sm font-semibold), role (text-sm text-muted-foreground).',
    ],
    components: ['Card', 'CardContent'],
  },

  tasks: {
    description: 'Task list page with status badges and search',
    sections: [
      'Page header: h1 "Tasks" + description. Search input with Search icon.',
      'Task list: divide-y container. Each row: status badge (colored), task title, priority badge, assignee name. Use flex items-center justify-between.',
      'This page uses "use client" (has useState for search). Do NOT include export const metadata.',
    ],
    components: ['Input', 'Badge'],
  },

  'task-detail': {
    description: 'Task detail page with info and activity',
    sections: [
      'Back button linking to /tasks. Page header with task title and description.',
      'Two-column layout (md:grid-cols-2): Left Card with task details (status, priority, assignee, due date). Right Card with activity timeline.',
      'This page uses "use client" (has useState). Do NOT include export const metadata.',
    ],
    components: ['Card', 'CardHeader', 'CardTitle', 'CardContent', 'Button'],
  },

  'reset-password': {
    description: 'Reset password page with centered card form',
    sections: [
      'Centered layout: outer div className="flex min-h-svh flex-col items-center justify-center p-6 md:p-10". Inner div className="w-full max-w-sm".',
      'Card with CardHeader: CardTitle "Reset Password" (text-xl), CardDescription.',
      'CardContent with form: new password Input (type="password"), confirm password Input (type="password"), Button "Reset password" (w-full).',
      'Footer text: "Remember your password?" with Sign in link.',
      'This page uses "use client" (has useState for form state). Do NOT include export const metadata.',
    ],
    components: ['Card', 'CardHeader', 'CardTitle', 'CardDescription', 'CardContent', 'Button', 'Input', 'Label'],
  },
}

/** Auth route path segments (no leading slash). Used for (auth) route group. */
const AUTH_ROUTE_SEGMENTS = new Set([
  'login',
  'signin',
  'sign-up',
  'signup',
  'register',
  'forgot-password',
  'reset-password',
])

/**
 * Returns true if the route or page name is an auth page (login, signup, etc.).
 * Used to place pages in app/(auth)/ and hide Header/Footer there.
 */
export function isAuthRoute(routeOrName: string): boolean {
  const normalized = routeOrName.toLowerCase().replace(/^\//, '').trim()
  const segment = normalized.split('/')[0] || ''
  return AUTH_ROUTE_SEGMENTS.has(segment) || AUTH_ROUTE_SEGMENTS.has(normalized)
}

export function detectPageType(pageName: string): string | null {
  const normalized = pageName.toLowerCase()

  if (/dashboard|admin|overview/.test(normalized)) return 'dashboard'
  if (/login|signin|sign-in/.test(normalized)) return 'login'
  if (/register|signup|sign.?up/.test(normalized)) return 'register'
  if (/pricing|plans|subscription/.test(normalized)) return 'pricing'
  if (/about|company/.test(normalized)) return 'about'
  if (/contact|support|help/.test(normalized)) return 'contact'
  if (/settings|preferences|account/.test(normalized)) return 'settings'
  if (/home|landing|hero/.test(normalized)) return 'landing'
  if (/services|услуг|каталог|catalog/.test(normalized)) return 'services'
  if (/blog|articles|posts/.test(normalized)) return 'blog'
  if (/profile|account/.test(normalized) && !/settings|preferences/.test(normalized)) return 'profile'
  if (/onboarding|wizard|setup/.test(normalized)) return 'onboarding'
  if (/gallery|portfolio|images/.test(normalized)) return 'gallery'
  if (/faq|frequently|questions/.test(normalized)) return 'faq'
  if (/changelog|release|versions/.test(normalized)) return 'changelog'
  if (/team|members/.test(normalized)) return 'team'
  if (/tasks?/.test(normalized) && /detail|\[id\]/.test(normalized)) return 'task-detail'
  if (/tasks?/.test(normalized)) return 'tasks'
  if (/reset.?password/.test(normalized)) return 'reset-password'

  return null
}

export function expandPageRequest(pageName: string, userRequest: string): string {
  const pageType = detectPageType(pageName)

  if (!pageType) {
    return userRequest
  }

  const template = PAGE_TEMPLATES[pageType]

  const hasDetails = userRequest.split(/\s+/).length > 5
  if (hasDetails) {
    return userRequest
  }

  return `Add ${pageName} page with:
${template.sections.map((s, i) => `${i + 1}. ${s}`).join('\n')}

Use these components if available: ${template.components.join(', ')}
Make it responsive and visually appealing.
`
}
