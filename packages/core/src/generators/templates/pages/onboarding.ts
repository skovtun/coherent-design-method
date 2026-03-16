import type { OnboardingContent, TemplateOptions } from './types.js'
import { D } from './_shared.js'

export function onboardingTemplate(content: OnboardingContent, options: TemplateOptions): string {
  const { title, description, steps, totalSteps } = content
  const { pageName } = options

  const stepBars = steps
    .map(
      (_, _i) =>
        "        <div key={_i} className={`flex-1 h-2 rounded-full ${_i <= step ? 'bg-primary' : 'bg-muted'}`} />",
    )
    .join('\n')

  const stepContent = steps
    .map(
      (s, i) => `        {step === ${i} && (
          <div className="${D.card} p-6">
            <div className="mb-6">
              <h2 className="${D.cardTitle}">${s.title}</h2>
              <p className="${D.cardDesc} mt-1">${s.description}</p>
            </div>
            <div className="space-y-4">
              ${(s.fields || []).map(f => `<div className="${D.fieldGroup}"><Label htmlFor="${f.name}">${f.label}</Label><Input id="${f.name}" type="${f.type}" /></div>`).join('\n              ')}
            </div>
            <div className="flex justify-between mt-6">
              <Button variant="outline" onClick={() => setStep(Math.max(0, step - 1))} disabled={step === 0}>Back</Button>
              <Button onClick={() => setStep(Math.min(${totalSteps - 1}, step + 1))}>${i === totalSteps - 1 ? 'Finish' : 'Next'}</Button>
            </div>
          </div>
        )}`,
    )
    .join('\n')

  return `'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export default function ${pageName}() {
  const [step, setStep] = useState(0)
  return (
    <main className="${D.pageWrapper} max-w-2xl mx-auto">
      <div>
        <h1 className="${D.pageTitle}">${title}</h1>
        <p className="${D.muted}">${description}</p>
      </div>
      <p className="${D.mutedXs} mb-2">{step + 1} of ${totalSteps}</p>
      <div className="mb-6 flex gap-2">
${stepBars}
      </div>
${stepContent}
    </main>
  )
}
`
}
