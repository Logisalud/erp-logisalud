# Capturas del Batch 1

Una por pantalla y viewport: `docs/wms/screenshots/<pantalla>/<viewport>.png`. Las genera
`apps/wms/scripts/e2e-por-viewport.sh` (E2E con Playwright, modo demostración con datos de prueba).

"—" = no aplica en ese viewport: el **mapa completo no se prueba en teléfono** (allí van la búsqueda y la ubicación en texto:
`almacen-lista-racks`, `almacen-busqueda-texto`, `almacen-drawer-telefono`, `almacen-sin-resultados-telefono`).

| Pantalla | 1440×900 | 1280×800 | 1024×768 | 390×844 |
|---|---|---|---|---|
| `almacen-busqueda-resaltada` | ✓ | ✓ | ✓ | — |
| `almacen-busqueda-texto` | — | — | — | ✓ |
| `almacen-drawer-cuarentena` | ✓ | ✓ | ✓ | — |
| `almacen-drawer-rack` | ✓ | ✓ | ✓ | — |
| `almacen-drawer-subracks` | ✓ | ✓ | ✓ | — |
| `almacen-drawer-telefono` | — | — | — | ✓ |
| `almacen-lista-racks` | — | — | — | ✓ |
| `almacen-mapa-estado` | ✓ | ✓ | ✓ | — |
| `almacen-mapa-ocupacion` | ✓ | ✓ | ✓ | — |
| `almacen-mapa-propietario` | ✓ | ✓ | ✓ | — |
| `almacen-sin-resultados-telefono` | — | — | — | ✓ |
| `auditoria` | ✓ | ✓ | ✓ | ✓ |
| `busqueda-universal` | ✓ | ✓ | ✓ | ✓ |
| `busqueda-universal-sin-resultados` | ✓ | ✓ | ✓ | ✓ |
| `busqueda-universal-vacia` | ✓ | ✓ | ✓ | ✓ |
| `inicio-asistente-dt` | ✓ | ✓ | ✓ | ✓ |
| `inicio-auxiliar` | ✓ | ✓ | ✓ | ✓ |
| `inicio-direccion-tecnica` | ✓ | ✓ | ✓ | ✓ |
| `inicio-jefe-almacen` | ✓ | ✓ | ✓ | ✓ |
| `login` | ✓ | ✓ | ✓ | ✓ |
| `no-encontrado` | ✓ | ✓ | ✓ | ✓ |
| `producto-alta-errores` | ✓ | ✓ | ✓ | ✓ |
| `producto-alta-exito` | ✓ | ✓ | ✓ | ✓ |
| `producto-alta-vacio` | ✓ | ✓ | ✓ | ✓ |
| `producto-detalle` | ✓ | ✓ | ✓ | ✓ |
| `producto-rs-vencido` | ✓ | ✓ | ✓ | ✓ |
| `producto-validar` | ✓ | ✓ | ✓ | ✓ |
| `productos-lista` | ✓ | ✓ | ✓ | ✓ |
| `productos-sin-resultados` | ✓ | ✓ | ✓ | ✓ |
| `propietarios` | ✓ | ✓ | ✓ | ✓ |
