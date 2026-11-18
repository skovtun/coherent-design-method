import { defineConfig } from 'tsup'

// `scripts/design-check.mjs`, copied into projects by `coherent init`: one
// self-contained file (no chunks), loading `typescript` and Tailwind from the project.
export default defineConfig({
  entry: { 'design-check': 'src/design-check.ts' },
  outDir: 'dist/standalone',
  format: ['esm'],
  outExtension: () => ({ js: '.mjs' }),
  splitting: false,
  clean: false,
  dts: false,
  external: ['typescript'],
  // Ownership mark: `coherent init` only ever overwrites a file that carries it.
  banner: { js: '// coherent:managed design-check (written by `coherent init`; overwritten on update)' },
})
