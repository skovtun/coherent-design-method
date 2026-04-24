import type { ComponentManager } from '@getcoherent/core'

/**
 * Build component registry summary for Claude
 */
export function buildComponentRegistry(componentManager: ComponentManager): string {
  const components = componentManager.getAllComponents()

  if (components.length === 0) {
    return 'No components in registry yet.'
  }

  const registry = components
    .map(comp => {
      const variants = comp.variants.map(v => v.name).join(', ')
      const sizes = comp.sizes.map(s => s.name).join(', ')
      const usedIn = comp.usedInPages.length > 0 ? `Used in: ${comp.usedInPages.join(', ')}` : 'Not used yet'

      return `- ${comp.name} (id: ${comp.id})
  Category: ${comp.category}
  Source: ${comp.source}${comp.shadcnComponent ? ` (${comp.shadcnComponent})` : ''}
  Variants: ${variants || 'none'}
  Sizes: ${sizes || 'none'}
  ${usedIn}`
    })
    .join('\n')

  return `Available components:\n${registry}`
}
