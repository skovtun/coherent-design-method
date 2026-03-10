import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

export function getWelcomeMarkdown(): string {
  const paths = [
    path.resolve(__dirname, '../../../../docs/getting-started/WELCOME.md'),
    path.resolve(__dirname, '../../../docs/getting-started/WELCOME.md'),
    path.resolve(__dirname, '../../docs/getting-started/WELCOME.md'),
  ]

  for (const welcomePath of paths) {
    if (fs.existsSync(welcomePath)) {
      return fs.readFileSync(welcomePath, 'utf-8')
    }
  }

  return ''
}

export function generateWelcomeComponent(_markdown: string): string {
  return `'use client'

import { useState } from 'react'
import {
  ArrowRight,
  Blocks,
  ClipboardCopy,
  Eye,
  Globe,
  LayoutDashboard,
  LogIn,
  Monitor,
  Palette,
  Rocket,
  Settings,
  ShoppingBag,
  Sparkles,
} from 'lucide-react'

export default function HomePage() {
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null)

  const copy = (text: string, idx: number) => {
    navigator.clipboard.writeText(text)
    setCopiedIdx(idx)
    setTimeout(() => setCopiedIdx(null), 2000)
  }

  const steps = [
    {
      num: 1,
      title: 'Describe your app',
      desc: 'Tell the AI what to build — pages, sections, and style. A full multi-page prototype is generated instantly.',
      cmd: 'coherent chat "Create a fitness studio app with pages: home, classes, pricing, about, and contact. Modern, light theme"',
    },
    {
      num: 2,
      title: 'Preview the result',
      desc: 'Opens your project at localhost:3000. All pages share the same header, footer, tokens, and components.',
      cmd: 'coherent preview',
    },
    {
      num: 3,
      title: 'Iterate',
      desc: 'Change colors, fonts, add pages — each command updates the entire system consistently.',
      cmd: 'coherent chat "Change primary color to indigo, add a blog page"',
    },
    {
      num: 4,
      title: 'Export & deploy',
      desc: 'Get a clean, production-ready Next.js project. Deploy to Vercel, Netlify, or any hosting.',
      cmd: 'coherent export',
    },
  ]

  return (
    <div className="flex flex-col flex-1">

      {/* Hero */}
      <section className="bg-gradient-to-b from-muted/40 via-background to-background">
        <div className="mx-auto flex max-w-3xl flex-col items-center gap-6 px-4 py-16 lg:py-24 text-center">
          <h1 className="text-3xl font-bold tracking-tight md:text-4xl lg:text-5xl max-w-2xl">
            Design once.{' '}
            <span className="text-primary">Stay consistent everywhere.</span>
          </h1>
          <p className="text-sm text-muted-foreground leading-relaxed max-w-lg">
            Your project is ready. Describe what you want to build — the AI generates
            interconnected pages with shared components, tokens, and layouts.
            Everything stays in sync.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <a
              href="#how-it-works"
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground shadow-sm hover:opacity-90 active:opacity-80 transition-opacity"
            >
              Get Started
              <ArrowRight className="size-4" />
            </a>
            <a
              href="/design-system"
              className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-5 py-2.5 text-sm font-medium text-foreground shadow-sm transition-colors hover:bg-muted"
            >
              Explore Design System
            </a>
          </div>
          <p className="text-xs text-muted-foreground max-w-md mt-2">
            As you build, the Design System section automatically collects your components,
            tokens, shared layouts, and documentation — your living style guide.
          </p>
        </div>
      </section>

      {/* Get started — 4 steps */}
      <section id="how-it-works" className="border-t bg-background px-4 py-16 lg:py-20 scroll-mt-16">
        <div className="mx-auto max-w-5xl">
          <div className="text-center mb-10">
            <p className="text-xs font-medium uppercase tracking-widest text-primary mb-3">
              How it works
            </p>
            <h2 className="text-2xl font-bold tracking-tight">
              Four steps. Full design cycle.
            </h2>
          </div>

          <div className="grid gap-5 md:grid-cols-2">
            {steps.map((step, idx) => (
              <div key={step.num} className="rounded-xl border bg-background p-5">
                <div className="flex items-center gap-3 mb-3">
                  <div className="flex size-8 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
                    {step.num}
                  </div>
                  <h3 className="text-sm font-semibold">{step.title}</h3>
                </div>
                <p className="text-sm text-muted-foreground mb-4 leading-relaxed">
                  {step.desc}
                </p>
                <div className="rounded-lg bg-muted">
                  <div className="flex items-center justify-between px-3 pt-2 pb-0.5">
                    <span className="text-[10px] font-medium text-muted-foreground">Terminal</span>
                    <span
                      role="button"
                      tabIndex={0}
                      onClick={() => copy(step.cmd, idx)}
                      onKeyDown={(e) => e.key === 'Enter' && copy(step.cmd, idx)}
                      className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground cursor-pointer transition-colors rounded px-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <ClipboardCopy className="size-3" />
                      {copiedIdx === idx ? 'Copied!' : 'Copy'}
                    </span>
                  </div>
                  <div className="px-3 pb-2.5">
                    <code className="text-xs font-mono break-all">{step.cmd}</code>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Also works in Cursor */}
      <section className="px-4 pb-12">
        <div className="mx-auto max-w-5xl">
          <div className="flex items-start gap-4 rounded-xl border bg-muted/30 p-5">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
              <Monitor className="size-5 text-primary" />
            </div>
            <div>
              <h3 className="text-sm font-semibold mb-1">Works with Cursor &amp; AI editors too</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                After initializing with CLI, you can describe design changes in Cursor or any AI editor —
                the rules in <code className="mx-0.5 rounded bg-muted px-1.5 py-0.5 text-xs font-mono">.cursorrules</code>{' '}
                guide the AI to follow your design system.
                For the best results, we recommend using{' '}
                <code className="mx-0.5 rounded bg-muted px-1.5 py-0.5 text-xs font-mono">coherent chat</code>{' '}
                as the primary workflow — it validates code, manages shared components, and keeps everything in sync automatically.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* What you can build */}
      <section className="border-t px-4 py-16 lg:py-20">
        <div className="mx-auto max-w-5xl">
          <div className="text-center mb-10">
            <p className="text-xs font-medium uppercase tracking-widest text-primary mb-3">
              What you can build
            </p>
            <h2 className="text-2xl font-bold tracking-tight">
              From idea to interface in seconds
            </h2>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div className="rounded-xl border bg-background p-5 transition-colors hover:bg-muted/30">
              <div className="flex items-start gap-3">
                <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                  <LayoutDashboard className="size-4 text-primary" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold mb-1">Dashboard</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    Stat cards, charts, activity feeds, data tables — with proper grid layout.
                  </p>
                </div>
              </div>
            </div>
            <div className="rounded-xl border bg-background p-5 transition-colors hover:bg-muted/30">
              <div className="flex items-start gap-3">
                <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                  <Rocket className="size-4 text-primary" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold mb-1">Landing &amp; Marketing</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    Hero sections, features, pricing, testimonials, CTAs — conversion-ready pages.
                  </p>
                </div>
              </div>
            </div>
            <div className="rounded-xl border bg-background p-5 transition-colors hover:bg-muted/30">
              <div className="flex items-start gap-3">
                <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                  <ShoppingBag className="size-4 text-primary" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold mb-1">Services &amp; Listings</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    Card grids with search, filters, pricing, badges — for products or team pages.
                  </p>
                </div>
              </div>
            </div>
            <div className="rounded-xl border bg-background p-5 transition-colors hover:bg-muted/30">
              <div className="flex items-start gap-3">
                <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                  <Settings className="size-4 text-primary" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold mb-1">Settings</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    Profile forms, toggles, notification preferences, danger zone — proper form patterns.
                  </p>
                </div>
              </div>
            </div>
            <div className="rounded-xl border bg-background p-5 transition-colors hover:bg-muted/30">
              <div className="flex items-start gap-3">
                <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                  <LogIn className="size-4 text-primary" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold mb-1">Authentication</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    Login, signup, forgot password — centered layout, proper validation patterns.
                  </p>
                </div>
              </div>
            </div>
            <div className="rounded-xl border bg-background p-5 transition-colors hover:bg-muted/30">
              <div className="flex items-start gap-3">
                <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                  <Palette className="size-4 text-primary" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold mb-1">Portfolio &amp; Blog</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    Project showcases, article listings, detail pages — with typography and media.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="border-t bg-muted/30 px-4 py-16 lg:py-20">
        <div className="mx-auto max-w-2xl">
          <div className="text-center mb-10">
            <p className="text-xs font-medium uppercase tracking-widest text-primary mb-3">
              FAQ
            </p>
            <h2 className="text-2xl font-bold tracking-tight">
              Common questions
            </h2>
          </div>

          <div className="rounded-xl border bg-background overflow-hidden">
            <details className="group border-b">
              <summary className="flex cursor-pointer items-center justify-between px-6 py-4 text-sm font-medium hover:bg-muted/30 [&::-webkit-details-marker]:hidden">
                What is Coherent Design Method?
                <span className="ml-2 text-muted-foreground transition-transform group-open:rotate-45">+</span>
              </summary>
              <div className="px-6 pb-4 text-sm text-muted-foreground leading-relaxed">
                An open-source CLI that generates multi-page UI prototypes with a shared
                design system. Every page uses the same tokens, components, and layout
                patterns — change a token, all pages update.
              </div>
            </details>
            <details className="group border-b">
              <summary className="flex cursor-pointer items-center justify-between px-6 py-4 text-sm font-medium hover:bg-muted/30 [&::-webkit-details-marker]:hidden">
                What&apos;s the tech stack?
                <span className="ml-2 text-muted-foreground transition-transform group-open:rotate-45">+</span>
              </summary>
              <div className="px-6 pb-4 text-sm text-muted-foreground leading-relaxed">
                Next.js 15 (App Router), Tailwind CSS, TypeScript, and a built-in component library.
                Works with Anthropic Claude or OpenAI for AI generation. Standard code — no vendor lock-in.
              </div>
            </details>
            <details className="group border-b">
              <summary className="flex cursor-pointer items-center justify-between px-6 py-4 text-sm font-medium hover:bg-muted/30 [&::-webkit-details-marker]:hidden">
                Can I customize the generated code?
                <span className="ml-2 text-muted-foreground transition-transform group-open:rotate-45">+</span>
              </summary>
              <div className="px-6 pb-4 text-sm text-muted-foreground leading-relaxed">
                Yes. Through natural language (&quot;make primary green&quot;), through
                <code className="mx-1 rounded bg-muted px-1.5 py-0.5 text-xs font-mono">design-system.config.ts</code>{' '}
                for precise control, or by editing generated files directly.
              </div>
            </details>
            <details className="group border-b">
              <summary className="flex cursor-pointer items-center justify-between px-6 py-4 text-sm font-medium hover:bg-muted/30 [&::-webkit-details-marker]:hidden">
                Can I export for production?
                <span className="ml-2 text-muted-foreground transition-transform group-open:rotate-45">+</span>
              </summary>
              <div className="px-6 pb-4 text-sm text-muted-foreground leading-relaxed">
                Yes. <code className="mx-1 rounded bg-muted px-1.5 py-0.5 text-xs font-mono">coherent export</code>{' '}
                produces a clean Next.js project without platform overlay — ready to deploy
                to Vercel, Netlify, or any static/Node.js hosting.
              </div>
            </details>
            <details className="group">
              <summary className="flex cursor-pointer items-center justify-between px-6 py-4 text-sm font-medium hover:bg-muted/30 [&::-webkit-details-marker]:hidden">
                Is it free?
                <span className="ml-2 text-muted-foreground transition-transform group-open:rotate-45">+</span>
              </summary>
              <div className="px-6 pb-4 text-sm text-muted-foreground leading-relaxed">
                Open source and free. You need your own API key (Anthropic or OpenAI)
                for AI generation, which has its own usage costs.
              </div>
            </details>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t pt-8 pb-8 mt-auto">
        <div className="flex flex-col items-center gap-5 px-4">
          <div className="flex items-center gap-3">
            <div className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground shrink-0">
              <Blocks className="size-4" />
            </div>
            <span className="text-sm font-semibold">Coherent Design Method</span>
          </div>
          <nav className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2">
            <a
              href="https://getcoherent.design"
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              getcoherent.design
            </a>
            <a href="https://github.com/skovtun/coherent-design-method" target="_blank" rel="noopener noreferrer" className="text-xs text-muted-foreground hover:text-foreground transition-colors">
              GitHub
            </a>
            <a href="#" className="text-xs text-muted-foreground hover:text-foreground transition-colors">
              Terms of Use
            </a>
            <a href="#" className="text-xs text-muted-foreground hover:text-foreground transition-colors">
              Privacy Policy
            </a>
          </nav>
          <p className="text-xs text-muted-foreground">
            © {new Date().getFullYear()}{' '}
            <a
              href="https://www.linkedin.com/in/sergeikovtun/"
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-2 hover:text-foreground transition-colors"
            >
              Sergei Kovtun
            </a>
          </p>
        </div>
      </footer>
    </div>
  )
}
`
}
