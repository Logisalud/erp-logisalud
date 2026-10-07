# apps/wms

WMS de Logisalud. Documentos de negocio en `docs/wms/` (raíz del monorepo).

## Tests E2E (Playwright)

- Se corren desde la raíz: `npm run test:e2e --workspace erp-logisalud-wms`.
- Config en `playwright.config.ts`. **No fijes `executablePath` en el código.**
  El Chromium se toma de la variable de entorno `PLAYWRIGHT_CHROMIUM_PATH`;
  si no existe, Playwright usa su navegador por defecto.
- Contenedor de Claude Code (trae Chromium preinstalado; `playwright install`
  no se corre ahí):

  ```bash
  export PLAYWRIGHT_CHROMIUM_PATH=/opt/pw-browsers/chromium
  ```

- CI y máquinas locales: no definir la variable y correr
  `npx playwright install chromium` una vez.
- Para verificar pantallas, viewport móvil de referencia: 390×844.

## MCP de Playwright (pendiente)

`.mcp.json` en la raíz lo declara, pero no se cargó en la sesión. Activarlo:
aprobar el servidor del proyecto (`/mcp`), reiniciar la sesión, y agregar a
los `args` `"--executable-path", "/opt/pw-browsers/chromium"` en el contenedor.
Mientras tanto, verificar con Playwright directo.
