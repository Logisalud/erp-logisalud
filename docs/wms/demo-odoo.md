# Demo con datos de Odoo — resumen de validación

**Fecha:** 2026-10-14 · **Alcance:** solo el modo demostración (`WMS_DEMO_LOCAL=1` / Preview con `WMS_DEMO=1`). **No es la carga inicial de producción.**

Fuentes (copias en `docs/wms/datos-demo-odoo/`): `quants.csv` (stock_quant), `lotes.tsv` (lotes con caducidad), `productos-lgs-con-stock.csv`, `productos-diphasac.csv`. El juego de datos se **genera** con `npm run datos:demo-odoo --workspace erp-logisalud-wms` → `apps/wms/config/datos-demo-odoo.ts` (sin ediciones a mano; un test verifica que el archivo es exactamente lo que produce el generador). El generador se detiene si la suma de los quants de algún producto no cuadra con su cantidad a mano de Odoo.

## Qué entra (Logissa, almacén LGS)
| Concepto | Filas | Unidades |
|---|---:|---:|
| Quants leídos | 305 | 35.051 |
| Entran en estado **Aprobado** | 216 | 14.105 |
| Entran en **Cuarentena** (zona de cuarentena, A-6) | 4 | 25 |
| Entran en **Bajas/Rechazados** (E-8.1.2) | 1 | 24 |

Resultado: 247 productos (28 con prefijo BO, productos de bonificación con código propio), 221 saldos de Logissa, 207 lotes con stock (de 450 en el archivo de lotes; **los lotes sin saldo no se cargan**).

## Qué se excluye y por qué
| Exclusión | Filas | Unidades | Regla |
|---|---:|---:|---|
| Saldos sin posición exacta (solo «LGS/Stock») | 31 | 1.330 | 2 |
| Faltantes / Sobrantes (ajustes de Odoo) | 5 | 89 | 3 |
| Stock en G-8.1, G-9.1, G-10.1 (3.ª adenda: AJR; pendiente de confirmar) | 48 | 19.478 | 4 |
| Cantidades reservadas de Odoo (se ignoran; la demo parte sin reservas) | — | 1.677 | 6 |

Cuadre: 14.105 + 25 + 24 + 1.330 + 89 + 19.478 = 35.051 → **0 diferencias**.

## Reglas aplicadas
1. Vencimientos tal cual, normalizados a fecha (sin hora y sin corrimiento de zona horaria). Hay **1 lote vencido** (BODHP009, lote 230864, 2026-08-31) y **1 por vencer en menos de 60 días** (DHP005, PDT2316, 2026-11-30): sirven para probar FEFO y los 60 días. 35 productos tienen 2 o más lotes.
5. E-9.1 y E-10.1 existen y tienen stock: se quitó su marca «por verificar» (topología, semilla SQL y test).
7. Propietario: el stock del almacén LGS es de Logissa; el de Diphasac, de Diphasac, y cada uno solo en posiciones de su propietario.
8. Códigos BO (BOJAM, BODHP, BOBSA, BOP, BOD): productos propios, con su propio código (p. ej. BODHP108 y DHP108 comparten el código de lote pero son productos y lotes distintos).
9. Cuarentena y Bajas se cargan con ese estado, en la zona que corresponde.

## Diphasac (interpretación a confirmar — D-75)
El extracto trae 97 productos (cantidad a mano), sin lote ni vencimiento. Entran **87 productos / 296.903 unidades** en posiciones A-14.1…A-27.1, con el lote marcado «SIN-LOTE-ODOO» y sin vencimiento. Se excluyen los 9 códigos `AJR*` (de AJR Labs). DHP106 entra.

## Qué sigue sintético
- Los datos regulatorios (registro sanitario, etc.) no vienen de Odoo: se generan como «RS-DEMO» con los mismos 4 casos de prueba (vigente, por vencer, vencido, pendiente).
- Las solicitudes de ingreso, alertas, conteos y demás ejemplos se siembran sobre los productos de Odoo.
- Tests y E2E: `WMS_DEMO_DATOS=sintetico` (casos fijos `DEMO-…`). Prueba de rendimiento: datos sintéticos escalados.
