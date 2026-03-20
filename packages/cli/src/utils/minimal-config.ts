/**
 * Minimal Design System Configuration
 *
 * Creates a basic, production-ready design system config
 * that can be customized later via coherent chat.
 */

import type { DesignSystemConfig } from '@getcoherent/core'
import { CLI_VERSION, FRAMEWORK_VERSIONS } from '@getcoherent/core'

export function createMinimalConfig(): DesignSystemConfig {
  const now = new Date().toISOString()

  return {
    provider: 'shadcn',
    version: '1.0.0',
    coherentVersion: CLI_VERSION,
    frameworkVersions: {
      next: FRAMEWORK_VERSIONS.next,
      react: FRAMEWORK_VERSIONS.react,
      tailwind: FRAMEWORK_VERSIONS.tailwindcss,
    },
    name: 'My App',
    description: 'Built with Coherent Design Method',

    tokens: {
      colors: {
        light: {
          primary: '#3B82F6',
          secondary: '#8B5CF6',
          accent: '#F59E0B',
          success: '#10B981',
          warning: '#F59E0B',
          error: '#EF4444',
          info: '#3B82F6',
          background: '#FFFFFF',
          foreground: '#111827',
          muted: '#F3F4F6',
          border: '#E5E7EB',
        },
        dark: {
          primary: '#60A5FA',
          secondary: '#A78BFA',
          accent: '#FBBF24',
          success: '#34D399',
          warning: '#FBBF24',
          error: '#F87171',
          info: '#60A5FA',
          background: '#111827',
          foreground: '#F9FAFB',
          muted: '#1F2937',
          border: '#374151',
        },
      },
      spacing: {
        xs: '0.25rem',
        sm: '0.5rem',
        md: '1rem',
        lg: '1.5rem',
        xl: '2rem',
        '2xl': '3rem',
        '3xl': '4rem',
      },
      typography: {
        fontFamily: {
          sans: 'Inter, system-ui, sans-serif',
          mono: 'JetBrains Mono, monospace',
        },
        fontSize: {
          xs: '0.75rem',
          sm: '0.875rem',
          base: '1rem',
          lg: '1.125rem',
          xl: '1.25rem',
          '2xl': '1.5rem',
          '3xl': '1.875rem',
          '4xl': '2.25rem',
        },
        fontWeight: {
          normal: 400,
          medium: 500,
          semibold: 600,
          bold: 700,
        },
        lineHeight: {
          tight: 1.25,
          normal: 1.5,
          relaxed: 1.75,
        },
      },
      radius: {
        none: '0',
        sm: '0.25rem',
        md: '0.5rem',
        lg: '0.75rem',
        xl: '1rem',
        full: '9999px',
      },
    },

    theme: {
      defaultMode: 'light',
      allowModeToggle: true,
    },

    components: [
      {
        id: 'button',
        name: 'Button',
        category: 'form',
        source: 'custom',
        baseClassName: 'inline-flex items-center justify-center rounded-md font-medium transition-colors',
        variants: [
          {
            name: 'default',
            className:
              'bg-primary text-primary-foreground hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
          },
          {
            name: 'secondary',
            className:
              'bg-secondary text-secondary-foreground hover:bg-secondary/80 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
          },
          {
            name: 'outline',
            className:
              'border border-input bg-background hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
          },
          {
            name: 'destructive',
            className:
              'bg-destructive text-destructive-foreground hover:bg-destructive/90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
          },
        ],
        sizes: [
          { name: 'sm', className: 'h-8 px-3 text-xs' },
          { name: 'md', className: 'h-9 px-4 text-sm' },
          { name: 'lg', className: 'h-10 px-6 text-base' },
        ],
        usedInPages: [],
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'card',
        name: 'Card',
        category: 'data-display',
        source: 'custom',
        baseClassName: 'rounded-lg border bg-card text-card-foreground shadow-sm',
        variants: [],
        sizes: [],
        usedInPages: [],
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'switch',
        name: 'Switch',
        category: 'form',
        source: 'custom',
        baseClassName: '',
        variants: [],
        sizes: [],
        usedInPages: [],
        createdAt: now,
        updatedAt: now,
      },
    ],

    layoutBlocks: [],

    pages: [
      {
        id: 'home',
        name: 'Home',
        route: '/',
        layout: 'centered',
        sections: [],
        title: 'Home',
        description: 'Welcome to My App',
        requiresAuth: false,
        noIndex: false,
        createdAt: now,
        updatedAt: now,
      },
    ],

    navigation: {
      enabled: true,
      type: 'header',
      items: [
        {
          label: 'Home',
          route: '/',
          requiresAuth: false,
          order: 0,
        },
      ],
    },

    features: {
      authentication: {
        enabled: false,
        strategies: [],
      },
      payments: {
        enabled: false,
      },
      analytics: {
        enabled: false,
      },
      database: {
        enabled: false,
      },
      stateManagement: {
        enabled: false,
        provider: 'zustand',
      },
    },

    settings: {
      initialized: false,
      appType: 'multi-page',
      framework: 'next',
      typescript: true,
      cssFramework: 'tailwind',
      autoScaffold: false,
    },

    createdAt: now,
    updatedAt: now,
  }
}
