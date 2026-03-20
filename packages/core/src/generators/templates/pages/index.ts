import { dashboardTemplate } from './dashboard.js'
import { pricingTemplate } from './pricing.js'
import { listingTemplate } from './listing.js'
import { contactTemplate } from './contact.js'
import { settingsTemplate } from './settings.js'
import { landingTemplate } from './landing.js'
import { blogTemplate } from './blog.js'
import { profileTemplate } from './profile.js'
import { onboardingTemplate } from './onboarding.js'
import { galleryTemplate } from './gallery.js'
import { faqTemplate } from './faq.js'
import { changelogTemplate } from './changelog.js'
import { loginTemplate } from './login.js'
import { registerTemplate } from './register.js'
import type { TemplateOptions } from './types.js'

export type { TemplateOptions } from './types.js'
export type {
  DashboardContent,
  PricingContent,
  ListingContent,
  ContactContent,
  SettingsContent,
  LandingContent,
  BlogContent,
  ProfileContent,
  OnboardingContent,
  GalleryContent,
  FaqContent,
  ChangelogContent,
  LoginContent,
  RegisterContent,
  PageContent,
} from './types.js'

type TemplateFn = (content: any, options: TemplateOptions) => string

const TEMPLATE_REGISTRY: Record<string, TemplateFn> = {
  dashboard: dashboardTemplate,
  pricing: pricingTemplate,
  listing: listingTemplate,
  contact: contactTemplate,
  settings: settingsTemplate,
  landing: landingTemplate,
  blog: blogTemplate,
  profile: profileTemplate,
  onboarding: onboardingTemplate,
  gallery: galleryTemplate,
  faq: faqTemplate,
  changelog: changelogTemplate,
  login: loginTemplate,
  register: registerTemplate,
}

export function getTemplateForPageType(pageType: string): TemplateFn | null {
  return TEMPLATE_REGISTRY[pageType] ?? null
}

export function getSupportedPageTypes(): string[] {
  return Object.keys(TEMPLATE_REGISTRY)
}
