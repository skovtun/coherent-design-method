/**
 * Component Manager
 *
 * Handles component CRUD operations, registry, and reuse logic.
 * Prevents duplicate components and tracks usage.
 */

import type {
  DesignSystemConfig,
  ComponentDefinition,
  ComponentCriteria,
  ComponentSpec,
  ModificationResult,
  ComponentDependency,
} from '../types/design-system.js'
import { validateConfig, getComponent } from '../types/design-system.js'

export class ComponentManager {
  private config: DesignSystemConfig
  private componentRegistry: Map<string, ComponentDefinition> = new Map()
  private DEBUG = process.env.COHERENT_DEBUG === '1'

  constructor(config: DesignSystemConfig) {
    this.config = config
    this.loadRegistry()
  }

  /**
   * Load component registry from config
   */
  private loadRegistry(): void {
    this.componentRegistry.clear()
    this.config.components.forEach(comp => {
      this.componentRegistry.set(comp.id, comp)
    })
  }

  /**
   * Register a new component (with duplicate prevention)
   */
  async register(def: ComponentDefinition): Promise<ModificationResult> {
    // Check for exact duplicate by ID
    if (this.componentRegistry.has(def.id)) {
      return {
        success: false,
        modified: [],
        config: this.config,
        message: `Component ${def.id} already exists`,
        warnings: ['Use update() to modify existing component'],
      }
    }

    // Check for similar components (prevent duplicates)
    const similar = this.findSimilar(def)
    if (similar.length > 0) {
      return {
        success: false,
        modified: [],
        config: this.config,
        message: `Similar component(s) already exist: ${similar.map(c => c.id).join(', ')}`,
        warnings: [
          'Consider reusing existing component instead of creating duplicate',
          `Existing: ${similar.map(c => `${c.name} (${c.id})`).join(', ')}`,
        ],
      }
    }

    // Add to config
    this.config.components.push(def)
    this.config.updatedAt = new Date().toISOString()

    // Validate
    this.config = validateConfig(this.config)

    // Update registry
    this.componentRegistry.set(def.id, def)

    return {
      success: true,
      modified: [`component:${def.id}`],
      config: this.config,
      message: `Registered component ${def.name} (${def.id})`,
    }
  }

  /**
   * Create a new component (alias for register)
   */
  async create(def: ComponentDefinition): Promise<ModificationResult> {
    return this.register(def)
  }

  /**
   * Read component by ID
   */
  read(id: string): ComponentDefinition | undefined {
    return this.componentRegistry.get(id) || getComponent(this.config, id)
  }

  /**
   * Update existing component
   */
  async update(id: string, changes: Partial<ComponentDefinition>): Promise<ModificationResult> {
    const component = this.read(id)
    if (!component) {
      return {
        success: false,
        modified: [],
        config: this.config,
        message: `Component ${id} not found`,
      }
    }

    // Warn if component is used in pages and baseClassName changes
    const classNameWarnings: string[] = []
    if (component.usedInPages.length > 0 && changes.baseClassName) {
      classNameWarnings.push(
        `baseClassName changed on component used in ${component.usedInPages.length} page(s): ${component.usedInPages.join(', ')}`,
      )
    }

    // Apply changes
    const updated: ComponentDefinition = {
      ...component,
      ...changes,
      id: component.id, // Prevent ID change
      updatedAt: new Date().toISOString(),
    }

    // Update in config
    const index = this.config.components.findIndex(c => c.id === id)
    if (index === -1) {
      return {
        success: false,
        modified: [],
        config: this.config,
        message: `Component ${id} not found in config`,
      }
    }

    this.config.components[index] = updated
    this.config.updatedAt = new Date().toISOString()

    // Validate
    this.config = validateConfig(this.config)

    // Update registry
    this.componentRegistry.set(id, updated)

    // Find affected pages
    const affectedPages = component.usedInPages

    const allWarnings = [
      ...classNameWarnings,
      ...(affectedPages.length > 0 ? [`This change affects ${affectedPages.length} page(s)`] : []),
    ]

    return {
      success: true,
      modified: [`component:${id}`, ...affectedPages.map(page => `page:${page}`)],
      config: this.config,
      message: `Updated component ${updated.name} (${id})`,
      warnings: allWarnings.length > 0 ? allWarnings : undefined,
    }
  }

  /**
   * Delete component (with usage check)
   */
  async delete(id: string): Promise<ModificationResult> {
    const component = this.read(id)
    if (!component) {
      return {
        success: false,
        modified: [],
        config: this.config,
        message: `Component ${id} not found`,
      }
    }

    // Check if component is used
    if (component.usedInPages.length > 0) {
      return {
        success: false,
        modified: [],
        config: this.config,
        message: `Cannot delete component used in ${component.usedInPages.length} page(s)`,
        warnings: ['Remove component from all pages before deleting', `Used in: ${component.usedInPages.join(', ')}`],
      }
    }

    // Remove from config
    this.config.components = this.config.components.filter(c => c.id !== id)
    this.config.updatedAt = new Date().toISOString()

    // Validate
    this.config = validateConfig(this.config)

    // Remove from registry
    this.componentRegistry.delete(id)

    return {
      success: true,
      modified: [`component:${id}`],
      config: this.config,
      message: `Deleted component ${component.name} (${id})`,
    }
  }

  /**
   * Find components by criteria
   */
  find(criteria: ComponentCriteria): ComponentDefinition[] {
    let results = Array.from(this.componentRegistry.values())

    // Filter by ID
    if (criteria.id) {
      results = results.filter(c => c.id === criteria.id)
    }

    // Filter by name (case-insensitive partial match)
    if (criteria.name) {
      const nameLower = criteria.name.toLowerCase()
      results = results.filter(c => c.name.toLowerCase().includes(nameLower))
    }

    // Filter by category
    if (criteria.category) {
      results = results.filter(c => c.category === criteria.category)
    }

    // Filter by source
    if (criteria.source) {
      results = results.filter(c => c.source === criteria.source)
    }

    // Filter by shadcn component
    if (criteria.shadcnComponent) {
      results = results.filter(c => c.shadcnComponent === criteria.shadcnComponent)
    }

    // Filter by usage in page
    if (criteria.usedInPage) {
      results = results.filter(c => c.usedInPages.includes(criteria.usedInPage!))
    }

    // Filter by variant
    if (criteria.hasVariant) {
      results = results.filter(c => c.variants.some(v => v.name === criteria.hasVariant))
    }

    // Filter by size
    if (criteria.hasSize) {
      results = results.filter(c => c.sizes.some(s => s.name === criteria.hasSize))
    }

    return results
  }

  /**
   * Find single component by criteria (returns first match)
   */
  findOne(criteria: ComponentCriteria): ComponentDefinition | null {
    const results = this.find(criteria)
    return results.length > 0 ? results[0] : null
  }

  /**
   * Get all components
   */
  getAllComponents(): ComponentDefinition[] {
    return Array.from(this.componentRegistry.values())
  }

  /**
   * Get components by category
   */
  getByCategory(category: ComponentDefinition['category']): ComponentDefinition[] {
    return this.find({ category })
  }

  /**
   * Track component usage in a page
   */
  trackUsage(componentId: string, pageRoute: string): void {
    const component = this.read(componentId)
    if (!component) {
      return
    }

    if (!component.usedInPages.includes(pageRoute)) {
      component.usedInPages.push(pageRoute)
      component.updatedAt = new Date().toISOString()

      // Update in config
      const index = this.config.components.findIndex(c => c.id === componentId)
      if (index !== -1) {
        this.config.components[index] = component
        this.componentRegistry.set(componentId, component)
      }
    }
  }

  /**
   * Remove component usage tracking
   */
  untrackUsage(componentId: string, pageRoute: string): void {
    const component = this.read(componentId)
    if (!component) {
      return
    }

    const index = component.usedInPages.indexOf(pageRoute)
    if (index !== -1) {
      component.usedInPages.splice(index, 1)
      component.updatedAt = new Date().toISOString()

      // Update in config
      const configIndex = this.config.components.findIndex(c => c.id === componentId)
      if (configIndex !== -1) {
        this.config.components[configIndex] = component
        this.componentRegistry.set(componentId, component)
      }
    }
  }

  /**
   * Get component dependencies
   */
  getDependencies(componentId: string): ComponentDependency {
    const component = this.read(componentId)
    if (!component) {
      throw new Error(`Component ${componentId} not found`)
    }

    // TODO: In future, track actual component dependencies
    // For now, just track which pages use it
    return {
      componentId,
      dependsOn: [], // Will be enhanced in future
      usedBy: component.usedInPages,
    }
  }

  /**
   * Find similar components (for duplicate prevention)
   */
  private findSimilar(def: ComponentDefinition): ComponentDefinition[] {
    const similar: ComponentDefinition[] = []

    for (const existing of this.componentRegistry.values()) {
      // Same name (case-insensitive)
      if (existing.name.toLowerCase() === def.name.toLowerCase() && existing.id !== def.id) {
        const reason = `same name: ${existing.name} === ${def.name}`
        if (this.DEBUG) console.log(`[DEBUG] findSimilar: ${def.id} similar to ${existing.id} - ${reason}`)
        similar.push(existing)
        continue
      }

      // Same shadcn component
      if (
        def.source === 'shadcn' &&
        existing.source === 'shadcn' &&
        def.shadcnComponent === existing.shadcnComponent &&
        existing.id !== def.id
      ) {
        const reason = `same shadcnComponent: ${existing.shadcnComponent} === ${def.shadcnComponent}`
        if (this.DEBUG) console.log(`[DEBUG] findSimilar: ${def.id} similar to ${existing.id} - ${reason}`)
        similar.push(existing)
        continue
      }

      // Very similar baseClassName (80% match)
      // BUT: Don't compare baseClassName for different shadcn components
      if (
        !(
          def.source === 'shadcn' &&
          existing.source === 'shadcn' &&
          def.shadcnComponent !== existing.shadcnComponent
        ) &&
        this.isSimilarClassName(existing.baseClassName, def.baseClassName)
      ) {
        const reason = 'similar baseClassName'
        if (this.DEBUG) console.log(`[DEBUG] findSimilar: ${def.id} similar to ${existing.id} - ${reason}`)
        similar.push(existing)
        continue
      }
    }

    if (this.DEBUG && similar.length > 0) {
      console.log(
        `[DEBUG] findSimilar result for ${def.id}: found ${similar.length} similar: ${similar.map(c => c.id).join(', ')}`,
      )
    }

    return similar
  }

  /**
   * Check if two class names are similar (simple heuristic)
   */
  private isSimilarClassName(className1: string, className2: string): boolean {
    const classes1 = className1.split(' ').sort()
    const classes2 = className2.split(' ').sort()

    const common = classes1.filter(c => classes2.includes(c))
    const total = new Set([...classes1, ...classes2]).size

    // If 80% of classes are common, consider them similar
    return common.length / total >= 0.8
  }

  /**
   * Check if component should be reused instead of creating new
   */
  shouldReuseComponent(requested: ComponentSpec, existing: ComponentDefinition): boolean {
    // Must match name (case-insensitive)
    if (requested.name) {
      if (existing.name.toLowerCase() !== requested.name.toLowerCase()) {
        return false
      }
    }

    // Must match category if specified
    if (requested.category && existing.category !== requested.category) {
      return false
    }

    // Must match source if specified
    if (requested.source && existing.source !== requested.source) {
      return false
    }

    // Must match shadcn component if specified
    if (requested.shadcnComponent && existing.shadcnComponent !== requested.shadcnComponent) {
      return false
    }

    // Check if existing component has required variants
    if (requested.requiredVariants) {
      const existingVariantNames = existing.variants.map(v => v.name)
      const hasAllVariants = requested.requiredVariants.every(v => existingVariantNames.includes(v))
      if (!hasAllVariants) {
        return false
      }
    }

    // Check if existing component has required sizes
    if (requested.requiredSizes) {
      const existingSizeNames = existing.sizes.map(s => s.name)
      // Type guard: check if string is a valid ComponentSize name
      const isValidSize = (s: string): s is 'xs' | 'sm' | 'md' | 'lg' | 'xl' => {
        return ['xs', 'sm', 'md', 'lg', 'xl'].includes(s as 'xs' | 'sm' | 'md' | 'lg' | 'xl')
      }
      const hasAllSizes = requested.requiredSizes.every(s => isValidSize(s) && existingSizeNames.includes(s))
      if (!hasAllSizes) {
        return false
      }
    }

    // If baseClassName is specified, check similarity
    if (requested.baseClassName) {
      if (!this.isSimilarClassName(existing.baseClassName, requested.baseClassName)) {
        return false
      }
    }

    return true
  }

  /**
   * Find best matching component for reuse
   */
  findBestMatch(requested: ComponentSpec): ComponentDefinition | null {
    const candidates = this.getAllComponents()

    // First, try exact match
    for (const candidate of candidates) {
      if (this.shouldReuseComponent(requested, candidate)) {
        return candidate
      }
    }

    // If no exact match, try partial match (name only)
    if (requested.name) {
      const requestedName = requested.name.toLowerCase()
      const nameMatch = candidates.find(c => c.name.toLowerCase() === requestedName)
      if (nameMatch) {
        return nameMatch
      }
    }

    // If no name match, try category match
    if (requested.category) {
      const categoryMatch = candidates.find(c => c.category === requested.category)
      if (categoryMatch) {
        return categoryMatch
      }
    }

    return null
  }

  /**
   * Update config reference (when config changes externally)
   */
  updateConfig(newConfig: DesignSystemConfig): void {
    this.config = newConfig
    this.loadRegistry()
  }

  /**
   * Get current config
   */
  getConfig(): DesignSystemConfig {
    return this.config
  }
}
