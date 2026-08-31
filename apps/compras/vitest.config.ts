import { defineConfig } from 'vitest/config'
import path from 'node:path'

export default defineConfig({
  // tsconfig.json usa `jsx: "preserve"` porque de la transformación se
  // encarga Next. Vitest necesita que alguien la haga: acá — mismo criterio
  // que apps/pedidos/vitest.config.ts.
  oxc: { jsx: { runtime: 'automatic' } },
  // Resolución nativa de los `paths` del tsconfig (el `@/*`). Antes esto
  // requería el plugin vite-tsconfig-paths; Vite ya lo trae.
  resolve: {
    tsconfigPaths: true,
    alias: {
      // `server-only` lanza al importarse fuera de un Server Component —
      // en Node (services/*.test.ts) la protección no aplica. Mismo
      // patrón que apps/pedidos/vitest.config.ts.
      'server-only': path.resolve(__dirname, 'tests/stubs/server-only.ts'),
    },
  },
  test: {
    // Node por defecto (domain/ y services/ son lógica pura). Los tests de
    // componentes piden jsdom con `// @vitest-environment jsdom` arriba del
    // archivo.
    environment: 'node',
    globals: true,
    // Matchers de @testing-library/jest-dom (toBeInTheDocument, etc.) —
    // solo importa, no toca nada si el archivo corre en environment 'node'.
    setupFiles: ['./tests/setup-jsdom.ts'],
  },
})
