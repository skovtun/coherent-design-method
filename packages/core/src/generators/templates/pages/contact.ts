import type { ContactContent, TemplateOptions } from './types.js'
import { D, collectIcons, resolveIcon } from './_shared.js'

export function contactTemplate(content: ContactContent, options: TemplateOptions): string {
  const { title, description, fields, submitLabel, contactInfo } = content
  const { pageName } = options

  const icons = collectIcons((contactInfo || []).map(c => c.icon))
  const iconImport = contactInfo && contactInfo.length > 0 ? `import { ${icons.join(', ')} } from 'lucide-react'` : ''

  const stateFields = fields
    .map(f => `  const [${f.name}, set${f.name.charAt(0).toUpperCase() + f.name.slice(1)}] = useState('')`)
    .join('\n')

  const formFields = fields
    .map(f => {
      if (f.type === 'textarea') {
        return `            <div className="${D.fieldGroup}">
              <Label htmlFor="${f.name}">${f.label}</Label>
              <Textarea
                id="${f.name}"
                placeholder="${f.placeholder}"
                value={${f.name}}
                onChange={(e) => set${f.name.charAt(0).toUpperCase() + f.name.slice(1)}(e.target.value)}
                rows={4}
                ${f.required ? 'required' : ''}
              />
            </div>`
      }
      return `            <div className="${D.fieldGroup}">
              <Label htmlFor="${f.name}">${f.label}</Label>
              <Input
                id="${f.name}"
                type="${f.type}"
                placeholder="${f.placeholder}"
                value={${f.name}}
                onChange={(e) => set${f.name.charAt(0).toUpperCase() + f.name.slice(1)}(e.target.value)}
                ${f.required ? 'required' : ''}
              />
            </div>`
    })
    .join('\n')

  let contactInfoSection = ''
  if (contactInfo && contactInfo.length > 0) {
    const items = contactInfo
      .map(c => {
        const icon = resolveIcon(c.icon) || icons[0]
        return `          <div className="flex items-start gap-3">
            <div className="${D.featureIconWrap}">
              <${icon} className="${D.featureIcon}" />
            </div>
            <div>
              <p className="${D.body} font-medium">${c.label}</p>
              <p className="${D.muted}">${c.value}</p>
            </div>
          </div>`
      })
      .join('\n')

    contactInfoSection = `
        <div className="space-y-6">
          <div>
            <h2 className="${D.body} font-semibold">Contact Information</h2>
            <p className="${D.muted}">Reach out to us directly</p>
          </div>
${items}
        </div>`
  }

  const hasRightCol = contactInfoSection !== ''
  const gridClass = hasRightCol ? D.grid2 : ''

  return `"use client"

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
${fields.some(f => f.type === 'textarea') ? "import { Textarea } from '@/components/ui/textarea'" : ''}
${iconImport}

export default function ${pageName}() {
${stateFields}

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
  }

  return (
    <main className="${D.pageWrapper}">
      <div>
        <h1 className="${D.pageTitle}">${title}</h1>
        <p className="${D.muted}">${description}</p>
      </div>

      <div${hasRightCol ? ` className="${gridClass}"` : ''}>
        <div className="${D.card} p-6">
          <div className="mb-6">
            <h2 className="${D.cardTitle}">Send us a message</h2>
            <p className="${D.cardDesc} mt-1">${description}</p>
          </div>
          <form onSubmit={handleSubmit} className="${D.formGap}">
${formFields}
            <Button type="submit" className="w-full">${submitLabel}</Button>
          </form>
        </div>
${contactInfoSection}
      </div>
    </main>
  )
}
`
}
