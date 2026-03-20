import type { LoginContent, TemplateOptions } from './types.js'
import { D } from './_shared.js'

export function loginTemplate(content: LoginContent, options: TemplateOptions): string {
  const { title, description, forgotPasswordRoute, registerRoute } = content
  const { pageName } = options

  return `"use client"

import { useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export default function ${pageName}() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

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
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
              <div className="${D.fieldGroup}">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password">Password</Label>
                  <Link href="${forgotPasswordRoute || '/forgot-password'}" className="text-xs text-muted-foreground hover:text-foreground transition-colors">
                    Forgot password?
                  </Link>
                </div>
                <Input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>
              <Button type="submit" className="w-full">Sign in</Button>
            </form>
            <p className="mt-4 text-center text-sm text-muted-foreground">
              Don&apos;t have an account?{' '}
              <Link href="${registerRoute || '/register'}" className="text-foreground underline underline-offset-4 hover:text-foreground/80 transition-colors">
                Sign up
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
