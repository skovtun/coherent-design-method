/**
 * Component showcase page template (placeholders: {{COMPONENT_NAME}}, {{COMPONENT_ID}},
 * {{COMPONENT_DESCRIPTION}}, {{COMPONENT_CATEGORY}}, {{VARIANT_EXAMPLES}}, {{SIZE_EXAMPLES}},
 * {{USAGE_CODE}}, {{PROPS_TABLE}})
 */
export const COMPONENT_SHOWCASE = `'use client'
import { useState } from 'react'
import { {{COMPONENT_NAME}} } from '@/components/{{COMPONENT_ID}}'

const usageCode = {{USAGE_CODE_JSON}}

export default function {{COMPONENT_NAME}}Showcase() {
  const [copied, setCopied] = useState(false)
  
  const copyCode = (code: string) => {
    navigator.clipboard.writeText(code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }
  
  return (
    <div className="space-y-12">
      {/* Header */}
      <div>
        <h1 className="text-4xl font-bold tracking-tight">{{COMPONENT_NAME}}</h1>
        <p className="mt-2 text-muted-foreground">
          {{COMPONENT_DESCRIPTION}}
        </p>
        <div className="mt-4 flex gap-2 text-sm">
          <span className="inline-flex items-center rounded-full border px-2.5 py-0.5">
            {{COMPONENT_CATEGORY}}
          </span>
        </div>
      </div>
      
      {/* Variants */}
      <div>
        <h2 className="text-2xl font-bold mb-4">Variants</h2>
        <div className="space-y-4">
          {{VARIANT_EXAMPLES}}
        </div>
      </div>
      
      {/* Sizes */}
      <div>
        <h2 className="text-2xl font-bold mb-4">Sizes</h2>
        <div className="space-y-4">
          {{SIZE_EXAMPLES}}
        </div>
      </div>
      
      {/* Usage */}
      <div>
        <h2 className="text-2xl font-bold mb-4">Usage</h2>
        <div className="relative rounded-lg border bg-muted/50 p-4">
          <button
            onClick={() => copyCode(usageCode)}
            className="absolute top-4 right-4 text-xs hover:underline"
          >
            {copied ? 'Copied!' : 'Copy'}
          </button>
          <pre className="text-sm overflow-x-auto">
            <code>{usageCode}</code>
          </pre>
        </div>
      </div>
      
      {/* Props */}
      <div>
        <h2 className="text-2xl font-bold mb-4">Props</h2>
        <div className="rounded-lg border">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/50">
              <tr>
                <th className="p-3 text-left">Prop</th>
                <th className="p-3 text-left">Type</th>
                <th className="p-3 text-left">Default</th>
              </tr>
            </thead>
            <tbody>
              {{PROPS_TABLE}}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
`
