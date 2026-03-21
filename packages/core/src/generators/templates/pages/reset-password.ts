import type { ResetPasswordContent, TemplateOptions } from './types.js'
import { D } from './_shared.js'

export function resetPasswordTemplate(content: ResetPasswordContent, options: TemplateOptions): string {
  const { title, description, loginRoute } = content
  const { pageName } = options

  return `"use client"

import { useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export default function ${pageName}() {
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
  }

  return (
    <div className="${D.centeredForm}">
      <div className="${D.formContainer}">
        <Card>
          <CardHeader className="text-center">
            <CardTitle className="text-xl">${title}</CardTitle>
            <CardDescription>${description}</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="${D.formGap}">
              <div className="${D.fieldGroup}">
                <Label htmlFor="password">New Password</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>
              <div className="${D.fieldGroup}">
                <Label htmlFor="confirmPassword">Confirm Password</Label>
                <Input
                  id="confirmPassword"
                  type="password"
                  placeholder="••••••••"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                />
              </div>
              <Button type="submit" className="w-full">Reset password</Button>
            </form>
            <p className="mt-4 text-center text-sm text-muted-foreground">
              Remember your password?{' '}
              <Link href="${loginRoute || '/login'}" className="text-foreground underline underline-offset-4 hover:text-foreground/80 transition-colors">
                Sign in
              </Link>
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
`
}
