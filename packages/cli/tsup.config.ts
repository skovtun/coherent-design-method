import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: false,
  clean: true,
  shims: true,
  // Note: Shebang removed for ESM modules
  // npm/pnpm will automatically make the file executable via bin entry
})

