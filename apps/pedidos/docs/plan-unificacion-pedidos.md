# Unificación de Pedidos — catálogos y permisos

Un solo set de catálogos y un solo sistema de permisos para todo el ERP.
Este documento registra las decisiones tomadas y por qué; la versión
navegable con la clasificación completa de las 52 migraciones originales
está en el plan publicado que revisaron Sebas y Andrés.

## Decisiones

| Catálogo de Pedidos | Decisión |
|---|---|
| `customers` | se elimina → `public.clientes` (3.443 filas reales) + extensión `pedidos.cliente_config` |
| `sellers` | se elimina → `public.vendedores` (20 filas) + mapeo `pedidos.vendedor_usuario` |
| `zones` | se elimina → se referencia por `codigo_zona` |
| `suppliers` | se elimina → `compras.proveedores` |
| `products` | se fusiona con `compras.productos` → `catalogo.productos` |
| `profiles`, `roles`, `user_roles` | se eliminan → `public.perfiles` |

## Productos: por qué es un solo catálogo

Se compararon las columnas de `pedidos.products` y `compras.productos` y
representan lo mismo: el producto físico que se le compra a un proveedor y se
le vende tal cual al cliente. Se buscó específicamente lo que los haría
catálogos distintos — doble unidad de medida, factor de conversión entre
empaque de compra y de venta, SKU de venta separado del de compra — y no
existe en ninguna de las dos: cada una tiene un único `unidad_medida` y ningún
factor.

`catalogo.productos` vive en su propio schema porque el producto no le
pertenece ni a Compras ni a Pedidos: lo comparten. Meterlo en uno haría que el
otro dependa de un contexto ajeno.

**No guarda precios.** El precio de compra es de Compras y el de venta es de
Pedidos; son conceptos distintos y viven en el contexto de cada uno
(`pedidos.price_lists`, `pedidos.product_tax_profiles`).

El identificador unificado es `codigo` a secas, por consistencia con el resto
del ERP. Ni el `codigo_interno` de Pedidos ni el `codigo` de Compras tenían
datos reales que preservar.

## Permisos: área para la organización, rol para la función

El área de `public.perfiles` es la unidad organizacional de la persona; el
`rol` es su función dentro de ella. Eso resuelve dos casos que el área sola no
podía:

- Distinguir al **vendedor de campo** del **administrador de pedidos**, los
  dos en área `ventas`.
- Darle `control_pedidos` a **Arlette** aunque su área sea `gestion_humana`
  — mismo patrón que ya se usa para responsables que no pertenecen al área
  que administran.

| Rol de Pedidos | Área | Rol |
|---|---|---|
| administrador | `admin` | `admin` |
| control_pedidos | `ventas` o la que sea | `control_pedidos` |
| aprobador_comercial | `gerencia` | `operativo` |
| operaciones | `almacen` | `operaciones` |
| vendedor | `ventas` | `vendedor` |

`perfiles.rol` pasó de texto libre a tener un `check` cerrado: un typo en un
rol era una policy que fallaba en silencio.

Helpers nuevos, junto a los que ya usa Compras:

- `public.tiene_rol(...)` — el área sola no alcanza para separar dos
  funciones dentro de la misma área.
- `public.puede_actuar_por_otro()` — quién puede registrar en nombre de otra
  persona (`admin` y `control_pedidos`).
- `pedidos.vendedor_actual()` — reemplaza a `current_seller_id()`; resuelve
  `auth.uid()` → `vendedores.id` vía `pedidos.vendedor_usuario`.
- `pedidos.acceso_pedidos()` — quién ve el módulo.

### Registrar un pedido en nombre de otro

Un vendedor registra sus propios pedidos; `admin` y `control_pedidos`
registran por un vendedor específico, eligiéndolo en la pantalla en vez de
inferirlo de la sesión. Las policies permiten **las dos cosas**, no son
excluyentes.

## Vendedores: cuenta y link de token conviven

Los 15 vendedores de campo **sí tienen cuenta** de Supabase Auth: piden y
rinden viáticos en Compras y Gastos, y registran sus propios pedidos.

El link con token de `/v/[token]` en `apps/cobranzas` **no se reemplaza**: son
dos features distintas que comparten a las mismas personas. El link sigue
siendo la vista de cobranzas sin login, igual que siempre. Tener cuenta no le
quita el link a nadie.

## Zona: la identidad es `codigo_zona`, y no está en `public.zonas`

La identidad canónica de zona en el ERP es el **texto** `codigo_zona`, que es
lo que usa cobranzas (`clientes.codigo_zona`) y su trigger de asignación de
vendedor.

**`public.zonas` no sirve para referenciarla.** Son dos sistemas de zonas
distintos que conviven en cobranzas:

| Tabla | Contenido | Filas | Clave |
|---|---|---|---|
| `public.zonas` | `ZONA 01`…`ZONA 16`, `INSTITUCIONES` | 17 | `id` uuid, **sin columna de código** |
| `public.digemid_zona_vendedor` | `AREM01`, `LIMH01`, `TRUM02`… | 18 | `codigo_zona` text |

De los 17 `codigo_zona` distintos que usan los 3.443 clientes, **17 existen en
`digemid_zona_vendedor` y 0 en `zonas`**; cruzadas por nombre solo coincide 1
de 17. Así que las FKs de zona de Pedidos apuntan a
`public.digemid_zona_vendedor (codigo_zona)`.

`public.zonas` parece ser una tabla muerta o de otro propósito. Conviene
revisarla en una limpieza aparte — no se tocó acá, y el trigger de cobranzas
quedó intacto.

## Pendiente

Este trabajo cubre catálogos y permisos. Lo que falta del esquema de Pedidos —
`orders`, `order_items`, el flujo de estados, aprobaciones, stock, despacho y
los borradores de documento electrónico — va en el PR siguiente, ya sobre
estos cimientos.
