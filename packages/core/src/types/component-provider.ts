import type { DesignTokens } from './design-system.js'

export interface ComponentMeta {
  id: string
  name: string
  category: 'form' | 'layout' | 'navigation' | 'feedback' | 'data-display' | 'overlay' | 'typography'
  managed: boolean
}

export interface ComponentAPI {
  name: string
  subcomponents: string[]
  importPath: string
  keyProps: Record<string, string>
  usage: string
  antiPatterns: string[]
}

export interface ComponentProvider {
  id: string
  init(projectRoot: string): Promise<void>
  install(name: string, projectRoot: string): Promise<void>
  list(): ComponentMeta[]
  getComponentAPI(name: string): ComponentAPI | null
  getCssVariables(tokens: DesignTokens): string
  getThemeBlock(tokens: DesignTokens): string
}
