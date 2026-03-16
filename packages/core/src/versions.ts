/**
 * Framework Versions
 *
 * Centralized version management for all dependencies.
 * Ensures consistent versions across generated projects.
 */

export const FRAMEWORK_VERSIONS = {
  next: '15.2.4',
  react: '18.3.1',
  'react-dom': '18.3.1',
  tailwindcss: '3.4.17',
  postcss: '8.4.49',
  autoprefixer: '10.4.20',
  typescript: '5.7.2',
  '@types/node': '22.10.5',
  '@types/react': '18.3.12',
  '@types/react-dom': '18.3.1',
  eslint: '9.17.0',
  'eslint-config-next': '15.2.4',
} as const

export const CLI_VERSION = '0.1.0' // Sync with packages/cli/package.json
