# Direcciones de clientes cargadas en Cobranzas — 2026-09-24

Pedido por aromero@logisalud.com: que la dirección del cliente se vea en la
pantalla del link del vendedor, además del número de factura y el RUC.

## El problema de fondo

`public.clientes` **sí tiene** la columna `direccion`, pero estaba **vacía en
los 3.594 clientes**. Nadie la había cargado nunca y ningún flujo la escribe:
ni el importador de cartera (su upsert manda sólo `ruc`, `razon_social` y los
ids de vendedor) ni la pantalla de zonas. `pedidos.cliente_direcciones`, en el
mismo proyecto, también estaba en cero.

Las direcciones **sí existen**, pero en el **otro proyecto Supabase**, el de
`apps/pedidos` (`pedidos.customer_addresses`): 909 clientes con dirección
activa, 898 de ellas con ubigeo.

## Qué se hizo

Copia **de una sola vez** de esas 909 direcciones a `public.clientes.direccion`
de Cobranzas, cruzando por RUC. Entraron **902**; las 7 restantes son RUCs que
no existen como cliente en Cobranzas. Se excluyeron a propósito dos registros
de prueba de Pedidos (`20999999999` "Av. Prueba 123" y `99999999002`
"Av. Prueba Bug Fix 456").

La carga sólo escribió donde `direccion` estaba vacía (`coalesce(btrim(...),'') = ''`),
así que no pisó nada — y como la columna estaba 100% vacía, no había nada que
pisar.

**Cobertura sobre lo que se ve:** de los 371 clientes con saldo pendiente,
**315 (84.9%) tienen dirección**. El resto son clientes que existen en
Cobranzas pero no en Pedidos, o que en Pedidos tampoco la tienen cargada.

## Esto es una copia, y se va a desactualizar

Es el punto importante. Los dos proyectos Supabase siguen separados a
propósito (ver el `CLAUDE.md` de la raíz: consolidarlos es una fase futura),
así que esto es una **foto del 2026-09-24**, no un vínculo vivo: si mañana
alguien corrige una dirección en Pedidos, Cobranzas se queda con la vieja.

Mientras siga así, hay tres caminos, de menor a mayor esfuerzo:

1. Repetir la copia cada tanto (es una consulta, está en `recargar.md`).
2. Dejar que Cobranzas edite su propia `direccion` y aceptar que son dos
   datos distintos.
3. Consolidar los proyectos, que es lo que resuelve el problema de verdad.

No se eligió ninguno todavía.

## Cómo revertirlo

La columna estaba vacía, así que revertir es vaciarla:

```sql
update public.clientes set direccion = null;
```

Nada más dependía de ella.

## El cambio de código que la acompaña

- `app/v/[token]/page.tsx` — trae `direccion` junto con distrito y celular.
- `app/v/[token]/VistaVendedorClient.tsx` — la muestra en su propia línea, sin
  truncar, en la vista de Tarjetas y en la de Tabla (agrupada por cliente).
  Sin truncar a propósito: una dirección cortada a la mitad no lleva a ningún
  lado.
- `lib/exportCarteraClientes.ts` — nueva columna "Dirección" en el Excel de
  "Mi cartera de clientes".
