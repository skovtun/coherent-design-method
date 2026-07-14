import { defineConfig } from 'tsup'

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    // Dev-only R10 eval tool — NOT in bin/exports. See eval-authoring-cli.ts header.
    'eval-authoring-cards': 'src/scan/cluster/eval-authoring-cli.ts',
  },
  format: ['esm'],
  dts: false,
  clean: true,
  shims: true,
  // Note: Shebang removed for ESM modules
  // npm/pnpm will automatically make the file executable via bin entry
})

