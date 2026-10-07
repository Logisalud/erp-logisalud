import { defineConfig } from 'vitest/config'
import path from 'node:path'

export default defineConfig({
  // tsconfig usa `jsx: "preserve"` (lo transforma Next); Vitest necesita que alguien lo haga.
  oxc: { jsx: { runtime: 'automatic' } },
  resolve: {
    tsconfigPaths: true,
    alias: {
      'server-only': path.resolve(__dirname, 'tests/stubs/server-only.ts'),
    },
  },
  test: {
    environment: 'node',
    globals: true,
    setupFiles: ['./tests/setup-jsdom.ts'],
    // Los tests de e2e/ los corre Playwright, no Vitest.
    include: ['tests/**/*.test.{ts,tsx}'],
    // Los tests de base de datos comparten un Postgres local: de a uno.
    fileParallelism: false,
  },
})
