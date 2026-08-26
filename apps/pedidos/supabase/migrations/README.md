# Migraciones de Pedidos

## `1000_` en adelante — el esquema vigente

`1000_pedidos_unificado_base.sql` es el punto de partida real del schema
`pedidos` en el **proyecto Supabase consolidado** (`qpkigzniatidsvnxikox`).

Ese esquema no tiene catálogos propios de cliente, vendedor, zona, proveedor
ni producto, y **no tiene sistema de permisos propio**. Todo eso es compartido
por el ERP:

| Antes en `pedidos` | Ahora |
|---|---|
| `customers` | `public.clientes` + extensión `pedidos.cliente_config` |
| `sellers` | `public.vendedores` + mapeo `pedidos.vendedor_usuario` |
| `zones` | `public.digemid_zona_vendedor`, por `codigo_zona` |
| `suppliers` | `compras.proveedores` |
| `products` | `catalogo.productos` |
| `profiles` | `public.perfiles` |
| `roles`, `user_roles`, `has_role()`, `is_admin()` | `public.perfiles.area` + `.rol`, con `area_en()` y `tiene_rol()` |

Ver `apps/pedidos/docs/plan-unificacion-pedidos.md`.

## `0001_` a `0052_` — referencia histórica, no correr

Son las migraciones del proyecto Supabase separado de Andrés, donde Pedidos
vivía antes de la consolidación. **Nunca se aplicaron al proyecto
consolidado** y no hay que aplicarlas: crearían los catálogos duplicados y el
sistema de permisos paralelo que la unificación justamente retira.

Se conservan porque son la fuente de la que salió el esquema unificado: si
aparece una columna o una regla que falta, el original está acá.
