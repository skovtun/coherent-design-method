import type { SharedComponentsManifest } from '@getcoherent/core'

export interface ReuseWarning {
  type: 'missed-reuse' | 'wrong-usage' | 'duplicate-creation'
  componentId: string
  componentName: string
  message: string
}

interface NewComponentInfo {
  name: string
  type: string
  file: string
  propsInterface?: string
}

const RELEVANT_TYPES: Record<string, Set<string>> = {
  app: new Set(['data-display', 'form', 'navigation', 'feedback']),
  auth: new Set(['form', 'feedback']),
  marketing: new Set(['section', 'layout']),
}

export function validateReuse(
  manifest: SharedComponentsManifest,
  generatedCode: string,
  pageType: 'marketing' | 'app' | 'auth',
  newComponents?: NewComponentInfo[],
): ReuseWarning[] {
  const warnings: ReuseWarning[] = []
  const relevantTypes = RELEVANT_TYPES[pageType] || RELEVANT_TYPES.app

  for (const comp of manifest.shared) {
    if (!relevantTypes.has(comp.type)) continue

    const isImported =
      generatedCode.includes(`from '@/components/shared/`) &&
      (generatedCode.includes(`{ ${comp.name} }`) || generatedCode.includes(`{ ${comp.name},`))

    if (!isImported) {
      warnings.push({
        type: 'missed-reuse',
        componentId: comp.id,
        componentName: comp.name,
        message: `${comp.name} (${comp.id}) is available but not imported. Consider using it instead of inline patterns.`,
      })
    } else if (comp.propsInterface) {
      const requiredProps = parseProps(comp.propsInterface)
      const usageMatch = generatedCode.match(new RegExp(`<${comp.name}\\s([^>]*?)/?>`))
      if (usageMatch) {
        const usedProps = new Set((usageMatch[1].match(/(\w+)=/g) || []).map(p => p.replace('=', '')))
        for (const req of requiredProps) {
          if (!usedProps.has(req) && !comp.propsInterface.includes(`${req}?`)) {
            warnings.push({
              type: 'wrong-usage',
              componentId: comp.id,
              componentName: comp.name,
              message: `${comp.name} (${comp.id}) is missing required prop "${req}".`,
            })
          }
        }
      }
    }
  }

  if (newComponents) {
    for (const newComp of newComponents) {
      for (const existing of manifest.shared) {
        if (existing.type !== newComp.type) continue

        const existingProps = parseProps(existing.propsInterface || '')
        const newProps = parseProps(newComp.propsInterface || '')
        const overlap = propOverlap(existingProps, newProps)

        if (overlap > 0.5) {
          warnings.push({
            type: 'duplicate-creation',
            componentId: existing.id,
            componentName: newComp.name,
            message: `New ${newComp.name} looks similar to existing ${existing.name} (${existing.id}). Consider reusing ${existing.name} instead.`,
          })
        }
      }
    }
  }

  return warnings
}

function parseProps(propsStr: string): Set<string> {
  const names = propsStr.match(/(\w+)\s*[?:]?\s*:/g) || []
  return new Set(names.map(n => n.replace(/[?:\s]/g, '')))
}

function propOverlap(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0
  let shared = 0
  for (const prop of a) {
    if (b.has(prop)) shared++
  }
  return shared / Math.max(a.size, b.size)
}
