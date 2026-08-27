import { defineConfig } from 'vitest/config'

export default defineConfig({
  // Resolución nativa de los `paths` del tsconfig (el `@/*`). Antes esto
  // requería el plugin vite-tsconfig-paths; Vite ya lo trae.
  resolve: { tsconfigPaths: true },
  test: { environment: 'node' },
})
