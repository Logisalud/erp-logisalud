# Clientes de prueba borrados — 2026-09-23

Pedido por aromero@logisalud.com: los clientes creados probando el alta
ensuciaban el maestro y aparecían en el buscador junto a los reales. Uno de
ellos —`pepito`, RUC 74453492222— tenía el mismo celular que un cliente real
(`* BOTICA EL ROSARIO`), que es justamente el número de prueba que había que
encontrar.

## Qué se borró

Los **7 clientes en estado `RECHAZADO`**, que eran todos de prueba. No quedó
ningún cliente rechazado después, y ningún cliente real estaba en ese estado.

| Razón social | RUC / documento | Celular | Creado |
|---|---|---|---|
| PRUEBA | 123 | — | 2026-08-03 |
| PEPITO | 74453492 | — | 2026-09-02 |
| pepito SAC | 999999999 | — | 2026-09-05 |
| pepito | 74453492222 | 937027239 | 2026-09-10 |
| pepito | 7888888888 | 999999999 | 2026-09-11 |
| RAZON  123 | 1043592204 | — | 2026-09-11 |
| PEPITO SAN MIGUEL | 123456789 | 5555555555 | 2026-09-19 |

## Por qué era seguro

Antes de borrar se revisaron **las cinco tablas que referencian a
`customers`**:

- `orders` — **0 pedidos** en los siete. El borrado además lleva un
  `and not exists (select 1 from orders …)` como red: si alguno hubiera
  tenido un pedido, se habría salteado solo. La FK es `NO ACTION`, así que
  la base también lo habría frenado.
- `customer_addresses` — 7 direcciones, una por cliente, borradas en cascada
  (FK `ON DELETE CASCADE`). Quedaron 0 direcciones huérfanas.
- `customer_contacts`, `customer_seller_reassignments` — 0 filas.
- `notification_logs` — **1 fila** (id 156, el correo de "cliente rechazado"
  de PEPITO SAN MIGUEL). La FK es `ON DELETE SET NULL`, así que el registro
  **se conservó** con `customer_id` en null: el correo se envió de verdad y
  borrar su rastro sería peor que dejarlo sin cliente.

## Estado después

- Clientes: 3.418. Rechazados: 0. Direcciones huérfanas: 0.
- Clientes con celular: 473, **0 inválidos** (el `5555555555` se fue con
  PEPITO SAN MIGUEL).

Queda registrado en `pedidos.audit_logs` id **8313**, acción
`borrar_clientes_de_prueba`, con la lista completa de lo borrado.

## Cómo revertirlo

`revertir.sql`, en esta misma carpeta. Trae de vuelta los 7 clientes con sus
ids originales, sus 7 direcciones y el `customer_id` del log 156. Correrlo
entero y en orden: las direcciones dependen del cliente.

## Lo que NO se tocó

`* BOTICA EL ROSARIO` (RUC 10209880976, 4 pedidos) sigue con el celular
**937027239**, el que compartía con el `pepito` borrado. Es un cliente real
y cuál es su número bueno no lo sabe el sistema — se corrige a mano desde
`/admin/maestros/clientes/10209880976`.
