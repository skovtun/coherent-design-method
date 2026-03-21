import type { DesignSystemConfig } from '@getcoherent/core'
import { ShadcnProvider } from './shadcn-provider.js'

export type { InstallResult, InstallOptions } from './shadcn-provider.js'
export { ShadcnProvider } from './shadcn-provider.js'

let _instance: ShadcnProvider | null = null

export function getComponentProvider(_config?: Pick<DesignSystemConfig, 'provider'>): ShadcnProvider {
  if (!_instance) {
    _instance = new ShadcnProvider()
  }
  return _instance
}
