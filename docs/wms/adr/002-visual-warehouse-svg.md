# ADR-002 — Visual Warehouse en SVG (no Canvas)

**Contexto.** ~150 celdas en el mapa (una por posición de rack, con sus 4 niveles dentro), cientos de nodos como máximo.

**Decisión.** SVG con pan/zoom por transformación (`<g transform>`), rueda con listener nativo no pasivo, arrastre con
*pointer events* y teclado (+ − 0 y flechas). Capas = una función de aspecto por capa (propietario, estado, ocupación).

**Por qué.** SVG da accesibilidad (cada celda es un `role="button"` con `aria-label`), hit-testing y estilos por capa sin
código extra, y se prueba con Playwright por selectores. Canvas solo se justifica con miles de nodos; si el almacén crece
se puede migrar sin cambiar el contrato de datos (`VistaMapa`).

**Geometría.** Aproximada y marcada como tal en pantalla (los planos no tienen escala exacta). Vive en `domain/mapa.ts` y en
`wms.posicion_geometria` (columna `aproximada`). La herramienta de calibración queda para un batch posterior.
