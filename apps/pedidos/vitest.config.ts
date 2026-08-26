import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  // tsconfig.json usa `jsx: "preserve"` porque de la transformación se
  // encarga Next. Vitest necesita que alguien la haga: acá.
  oxc: { jsx: { runtime: "automatic" } },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
      // `server-only` lanza al importarse fuera de un Server Component, lo
      // que haría imposible testear services/. En Node la protección no
      // aplica; el import sigue en el código de producción.
      "server-only": path.resolve(__dirname, "tests/stubs/server-only.ts"),
    },
  },
  test: {
    // Node por defecto (domain/ y services/ son lógica pura). Los tests de
    // componentes piden jsdom con `// @vitest-environment jsdom` arriba.
    environment: "node",
    globals: true,
  },
});
