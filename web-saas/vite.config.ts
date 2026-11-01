import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    testTimeout: 30_000,
    // Integration suites share the test accounts A and B (one even resets A's vault): run files one at a time.
    fileParallelism: false,
  },
})
