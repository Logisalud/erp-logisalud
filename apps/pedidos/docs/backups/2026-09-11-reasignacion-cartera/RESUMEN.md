# Reasignación de cartera — 2026-09-11

Origen: `Codigos_nuevos.xlsx`, hoja `Hoja1` (29.030 filas, 29.010 RUC distintos),
entregada por Comercial. Aprobada por aromero@logisalud.com el 2026-09-11.

Se comparó el archivo contra los 3.411 clientes del sistema. La copia local del
sistema usada para el cruce se verificó con md5 por zona contra la base: las 17
huellas coincidieron.

- Clientes del sistema presentes en el archivo: **2.936**
- **Cambian de zona: 479**
- Sin cambio: 2.457
- Del sistema que el archivo no menciona (no se tocaron): 475

md5 de este cambio (ruc + zona anterior + zona nueva, ordenado por ruc):
`fa3025cb934cf9a7164cfd9cad5a86b0`

## Movimientos

| De | A | Clientes |
|---|---|---|
| HYOM02 | HYOM01 | 171 |
| HYOM01 | HYOM02 | 151 |
| HYOM01 | PUCM01 | 79 |
| TRUM02 | TRUM03 | 58 |
| LIMH02 | LIMH01 | 2 |
| LIMH06 | LIMH05 | 2 |
| LIMH08 | HYOM01 | 1 |
| LIMH08 | LIMH01 | 1 |
| TRUM02 | LIMH04 | 1 |
| CUZM02 | HYOM01 | 1 |
| LIMV03 | LIMH07 | 1 |
| AREM01 | DIST01 | 1 |
| LIMV01 | LIMH04 | 1 |
| TRUM02 | CHIM01 | 1 |
| LIMH08 | HYOM02 | 1 |
| LIMV02 | LIMH06 | 1 |
| LIMH07 | CHIM01 | 1 |
| TRUM03 | PUCM01 | 1 |
| LIMH02 | LIMH04 | 1 |
| LIMH02 | LIMV01 | 1 |
| LIMH02 | LIMH06 | 1 |
| LIMH07 | LIMV03 | 1 |

## Qué se tocó

Sólo `customers.zona_id` y `customers.vendedor_id`. **No** se tocó `canal_id`,
`condicion_pago_habitual_id` ni `estado`, que es la protección acordada para no
pisar trabajo manual con una carga de cartera.

Cada cambio quedó además en `pedidos.customer_seller_reassignments` con el
vendedor anterior, el nuevo, la fecha y `fuente = 'actualización de cartera'`.
El estado anterior completo de las filas está en `audit_logs` como
`reasignar_cartera`.

## Aplicación

Aplicada el 2026-09-11 en una sola transacción: 479 clientes actualizados,
479 filas en `customer_seller_reassignments` (`fuente = 'actualizacion_cartera'`,
valor agregado al CHECK por la migración `1034`) y una fila en `audit_logs`
(`reasignar_cartera`) con el estado anterior completo de las 479.

Verificación: se recalculó el md5 del padrón por zona —el conjunto exacto de
RUC de cada una— y se comparó contra el estado esperado. **Las 19 huellas
coincidieron**, así que la carga quedó verificada cliente por cliente y no
sólo por conteo.

| Zona | Vendedor | Antes | Después |
|---|---|---|---|
| HYOM01 | JESSICA MENDOZA | 349 | 292 |
| HYOM02 | FABIOLA SAMANIEGO | 282 | 263 |
| TRUM02 | OMAR RUBIO | 152 | 92 |
| TRUM03 | OMAR QUEVEDO | 111 | 168 |
| PUCM01 | BRYAN PALOMINO | 0 | 80 |
| LIMH01 | SUSANA RAMOS | 212 | 215 |
| LIMH02 | LUIS VARGAS | 227 | 222 |
| LIMH04 | LUPE CASTRO | 154 | 157 |
| LIMH05 | CRISTIAN BARREDA | 132 | 134 |
| LIMH07 | KARINA BENDEZÚ | 146 | 145 |
| LIMH08 | ROMINA CHAMOCHUMBI | 266 | 263 |
| CHIM01 | MILAGROS SOTO | 91 | 93 |
| AREM01 | MALENA GAONA | 605 | 604 |
| CUZM02 | JENIFER MADRID | 395 | 394 |
| LIMV02 | MARYSABEL PERALTA | 26 | 25 |
| DIST01 | OFICINA LOGISSA | 0 | 1 |
| LIMH06, LIMV01, LIMV03 | | sin cambio neto | |

## Pendiente que dejó a la vista

261 clientes de LIMH08 (ZONA 08) siguen apuntando a **KAREM PARIONA** como
`vendedor_id`, una vendedora **inactiva y sin zona**. La zona sí es la
correcta —ZONA 08, de Romina Chamochumbi—, así que la visibilidad funciona;
lo que está viejo es el vendedor. No se tocó acá porque el archivo no los
menciona y arreglarlo es otra decisión.
