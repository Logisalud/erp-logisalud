# Zonas de la "Nueva Cartera Setiembre 2026" (Hoja2) — 2026-09-21

Aplicado sobre `public.clientes` del proyecto Supabase consolidado de
cobranzas/compras (`qpkigzniatidsvnxikox`).

## Qué decía el archivo

`Nueva_Cartera_Setiembre_2026_2.xlsx`, hoja **Hoja2**: 2.965 filas con
`Ruc`, `CODIGO ACTUAL`, `CODIGO QUE DEBERIA` y `CONCUERDA`. Las filas se
repiten (un mismo cliente aparece hasta 6 veces), así que lo que vale es
el RUC, no la fila:

| | |
|---|---|
| Filas en la hoja | 2.965 |
| RUC distintos | 1.672 |
| Con un único destino | **1.578** ← los que se usaron |
| Con destinos contradictorios entre sí | 94 (no se tocaron) |

Los códigos son **códigos de zona**, no de vendedor. En cobranzas el
cobrador sale de la zona: el trigger `trg_vendedor_efectivo` recalcula
`vendedor_actual_id` desde `codigo_zona` vía `digemid_zona_vendedor`,
salvo que el cliente tenga `vendedor_manual_id`. Cambiar la zona cambia
el cobrador.

Los 5 destinos del archivo y su cobrador:

| Zona | Cobrador |
|---|---|
| HYOM01 | JESSICA MENDOZA (DHYO02) |
| HYOM02 | FABIOLA SAMANIEGO (DHYO01) |
| PUCM01 | BRYAN PALOMINO (DPUC01) |
| TRUM02 | OMAR RUBIO (DTRU01) |
| TRUM03 | OMAR QUEVEDO (DTRU03) |

## Qué se aplicó

De los 1.578 RUC con destino único:

| | |
|---|---|
| Existen en `clientes` | 920 |
| No existen (nunca se les facturó) | 658 |
| Ya estaban en la zona correcta | 510 |
| **Cambiados** | **410** |
| De esos, cambió también el cobrador | 408 |

Movimientos:

| Desde | Hacia | Clientes |
|---|---|---|
| HYOM01 | HYOM02 | 183 |
| HYOM02 | HYOM01 | 159 |
| TRUM02 | TRUM03 | 56 |
| HYOM01 | PUCM01 | 5 |
| LIMH08 | HYOM02 | 2 |
| LIMH02 / LIMH04 | TRUM02 | 2 |
| LIMH07 / CHIM01 | TRUM03 | 2 |
| CUZM02 | HYOM01 | 1 |

Además del `codigo_zona` se escribió el rastro que ya usa la tabla:
`vendedor_anterior_id` = el cobrador que tenían y `fecha_reasignacion` =
2026-09-21, en los 408 donde el cobrador efectivamente cambió (la misma
convención de las 400 filas reasignadas el 2026-08-11).

Cartera resultante en esas 5 zonas: FABIOLA 311, JESSICA 246, BRYAN 176,
OMAR QUEVEDO 167, OMAR RUBIO 99.

## Lo que NO se tocó, y por qué

- **94 RUC con destino contradictorio dentro de la misma hoja**
  (`hoja2-contradictorios.csv`): el archivo los lista bajo dos vendedores
  a la vez, p. ej. `20601958695 INVERSIONES EDDYN` aparece 2 veces con
  destino HYOM02 y 3 veces con HYOM01. No hay regla para desempatar:
  quedan como están hasta que Comercial decida.
- **658 RUC del archivo que no existen en `clientes`.** La tabla solo
  tiene clientes con documentos emitidos. No se crearon: dar de alta un
  cliente es otra decisión (falta razón social validada, dirección,
  ubigeo). Se listan en `hoja2-destinos.csv`; para verlos:
  ```sql
  -- contra el csv cargado en una tabla temporal, o a mano con la lista
  select t.ruc from <lista> t
   where not exists (select 1 from public.clientes c where c.ruc = t.ruc);
  ```
- **2 clientes con `vendedor_manual_id`** (`20605078371` y `20606386045`,
  ambos fijados a MILAGROS SOTO / DTRU02): se les cambió la zona a TRUM03
  como pedía el archivo, pero el cobrador **no** se movió, porque la
  asignación manual gana sobre la zona. Si tienen que pasar a OMAR
  QUEVEDO hay que limpiarles `vendedor_manual_id` a mano.
- **37 de los 410 tenían `zona_manual = true`** (alguien había fijado esa
  zona antes). El archivo los pisó igual: `zona_manual` no lo consulta
  ningún trigger, es solo una marca. Están en `clientes-antes.csv` con su
  valor original por si hay que revisarlos.

## Archivos

| Archivo | Qué es |
|---|---|
| `clientes-antes.csv` | Estado ANTES de los 410 que cambiaron: `ruc, codigo_zona, zona_manual, vendedor_actual, vendedor_manual, destino_archivo` |
| `reasignaciones-previas.csv` | Los 35 (de esos 410) que ya traían `vendedor_anterior_id` / `fecha_reasignacion` |
| `hoja2-destinos.csv` | Los 1.578 `ruc,destino` que salieron de la hoja |
| `hoja2-contradictorios.csv` | Los 94 RUC que la hoja manda a dos zonas distintas |
| `revertir.sql` | Script de reversión |

### Huellas

- `clientes-antes.csv` — md5 de `ruc:codigo_zona:vendedor_actual` sobre
  las 410 filas, ordenado por RUC con `collate "C"`:
  **`636d7f0cbc12fc26a000634c8d34fac1`**. Idéntico calculado en local
  (Python) y en SQL antes de aplicar.
- Mismo cálculo DESPUÉS de aplicar:
  **`78d631e2f6f8876128a55abd026e19da`**.
- Pares `ruc:destino` leídos de la hoja:
  **`449f340a924739708bbb3c9bb7db1866`** (1.578 filas), verificado en
  local y en la base antes de cruzar nada.

## Cómo revertir

Correr `revertir.sql` contra `qpkigzniatidsvnxikox`. Está envuelto en
`begin; … rollback;` a propósito: corre, mirá la verificación del final
—tiene que devolver 410 filas y la huella
`636d7f0cbc12fc26a000634c8d34fac1`— y recién ahí cambiá el `rollback;`
por `commit;`.

`vendedor_actual_id` no hace falta restaurarlo: lo recalcula el trigger
desde `codigo_zona`. Se verificó antes de aplicar que en los 410 casos el
cobrador anterior coincidía exactamente con el de la zona anterior (0
discrepancias), así que devolver la zona devuelve el cobrador.

Ojo: la reversión no distingue clientes creados después del
2026-09-21. Si aparecen clientes nuevos en estas zonas, el script no los
toca (solo nombra los 410 RUC del snapshot), que es lo que queremos.
