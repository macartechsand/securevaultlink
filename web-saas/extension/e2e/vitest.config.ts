import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

// Browser end-to-end suite for the extension (kept out of the default `npm test`).
export default defineConfig({
  test: {
    root: resolve(dirname(fileURLToPath(import.meta.url)), '../..'),
    environment: 'node',
    include: ['extension/e2e/**/*.e2e.test.ts'],
    testTimeout: 60_000,
    fileParallelism: false,
  },
})
