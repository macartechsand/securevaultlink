import { basename, resolve } from 'node:path'
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import type { Plugin } from 'vite'

// emptyOutDir deletes the output folder first: a mistyped --outDir must never point at source files.
const guardOutDir = (): Plugin => ({
  name: 'securelink-guard-outdir',
  configResolved(config) {
    const out = resolve(config.root, config.build.outDir)
    if (!basename(out).startsWith('dist') || resolve(config.root).startsWith(out)) {
      throw new Error(`Refusing to build into ${out}: the output folder must be a dist* folder.`)
    }
  },
})

// https://vite.dev/config/
export default defineConfig({
  plugins: [guardOutDir(), react()],
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx', 'extension/src/**/*.test.ts'],
    testTimeout: 30_000,
    // Integration suites share the test accounts A and B (one even resets A's vault): run files one at a time.
    fileParallelism: false,
  },
})
