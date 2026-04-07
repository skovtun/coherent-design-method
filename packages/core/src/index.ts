/**
 * Coherent Core - Main export
 *
 * This package contains the core design system engine:
 * - DesignSystemManager
 * - ComponentManager
 * - PageManager
 * - Generators
 * - Validators
 */

export * from './types/design-system'
export * from './types/component-provider'
export * from './types/shared-components-manifest'
export * from './managers/DesignSystemManager'
export * from './managers/ComponentManager'
export * from './managers/PageManager'
export * from './managers/SharedComponentsRegistry'
export * from './generators/ComponentGenerator'
export * from './generators/DesignSystemGenerator'
export * from './generators/PageGenerator'
export * from './generators/TailwindConfigGenerator'
export * from './generators/SharedComponentGenerator'
export * from './generators/SharedLayoutIntegration'
export * from './generators/ProjectScaffolder'
export { getTemplateForPageType, getSupportedPageTypes } from './generators/templates/pages/index'
export type {
  TemplateOptions,
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
} from './generators/templates/pages/index'
export * from './types/figma'
export * from './figma'
export * from './validators/schema'
export * from './versions'
export * from './utils/buildCssVariables'
export * from './utils/atomicWrite'
export { colorToHex } from './utils/color-utils'
export * from './utils/allowedColorClasses'
export * from './audit'
