# Cargar datos a mano: el SQL de cada operación

Guía de referencia para hacer sin ayuda lo que normalmente se pide por
chat: dar de alta una línea de proveedor, cargar precios y escalas, activar
o desactivar un producto, dar de alta o de baja a un vendedor.

**Todo esto se corre contra el proyecto Supabase de pedidos**
(`dfqhxwkdflnkcjnysbwu`), desde el SQL Editor del dashboard. No es el mismo
proyecto que cobranzas y compras.

Antes de empezar, tres cosas que valen para todo el documento:

- **Las migraciones no se aplican solas al mergear.** Lo que corras acá es
  lo que queda; el archivo en `supabase/migrations/` es el registro, no el
  que ejecuta. Ver el README de migraciones.
- **Nunca se borra: se desactiva.** Un producto que ya está en un pedido no
  se puede borrar sin romper el historial. Lo mismo con vendedores.
- **Preferir subconsultas por código a pegar UUIDs.** `(select id from
  pedidos.products where codigo_interno = 'ITP001')` en vez del uuid
  copiado: un carácter mal transcripto escribe sobre otra fila sin avisar.

---

## 1. Qué tablas se tocan, y en qué orden

Una línea nueva de proveedor necesita estas cinco, en este orden, porque
cada una depende de la anterior:

| Orden | Tabla | Qué guarda |
|---|---|---|
| 1 | `pedidos.suppliers` | el proveedor |
| 2 | `pedidos.products` | cada producto y su gemelo de bonificación |
| 3 | `pedidos.product_tax_profiles` | si paga IGV y a qué tasa |
| 4 | `pedidos.price_lists` + `price_list_items` | el precio, por canal |
| 5 | `pedidos.promo_escalas` | los descuentos por cantidad |

Sin el paso 3 el producto **no se puede agregar a un pedido**: la función
que arma la línea corta con "Sin perfil tributario vigente". Sin el 4
tampoco: el buscador lo muestra bloqueado porque no hay con qué valorizar.

---

## 2. Alta de un proveedor

```sql
insert into pedidos.suppliers (nombre, estado)
select 'P Harmed', 'activo'
where not exists (select 1 from pedidos.suppliers where nombre = 'P Harmed');
```

El `where not exists` es para poder correrlo dos veces sin duplicar. Es el
patrón de todo el documento.

---

## 3. Alta de productos y sus bonificados

Los productos regulares, con el código de su bonificado al lado:

```sql
insert into pedidos.products
  (codigo_interno, descripcion, unidad_medida, codigo_bonificacion, supplier_id, estado)
select v.codigo, v.descripcion, v.unidad, v.bonificado,
       (select id from pedidos.suppliers where nombre = 'P Harmed'), 'activo'
from (values
  ('PRD101', 'ARCOXIB 90 x 10 TAB. REC.', 'TABLETA', 'BOPRD101'),
  ('PRD102', 'ARCOXIB 120 x 10 TAB. REC.', 'TABLETA', 'BOPRD102')
) as v(codigo, descripcion, unidad, bonificado)
on conflict (codigo_interno) do nothing;
```

Y los bonificados, que salen solos del campo `codigo_bonificacion` de los
anteriores — no hay que escribirlos de nuevo:

```sql
insert into pedidos.products
  (codigo_interno, descripcion, unidad_medida, supplier_id, estado)
select b.codigo_bonificacion, b.descripcion, b.unidad_medida, b.supplier_id, 'activo'
from pedidos.products b
where b.codigo_interno like 'PRD%' and b.codigo_bonificacion is not null
on conflict (codigo_interno) do nothing;
```

**Los bonificados van SIN precio**: son el mismo artículo que llega sin
costo. Existen para que el día que el almacén cargue stock de uno, el
importador no lo rechace por código desconocido.

---

## 4. El perfil tributario

Gravado al 18%, que es lo normal:

```sql
insert into pedidos.product_tax_profiles
  (product_id, afectacion_tributaria, tasa_aplicable, vigente_desde)
select p.id, 'GRAVADO', 18.00, current_date
from pedidos.products p
where (p.codigo_interno like 'PRD%' or p.codigo_interno like 'BOPRD%')
  and not exists (select 1 from pedidos.product_tax_profiles t
                   where t.product_id = p.id and t.vigente_hasta is null);
```

### Cambiarlo después (de gravado a inafecto, por ejemplo)

Hay un índice único de **un solo perfil vigente por producto**, así que
cerrar el viejo y abrir el nuevo tienen que ir en la misma transacción:

```sql
do $$
declare v_ids uuid[];
begin
  select array_agg(id) into v_ids from pedidos.products
   where codigo_interno in ('JAM313','JAM314','JAM315');

  update pedidos.product_tax_profiles
     set vigente_hasta = current_date
   where product_id = any(v_ids) and vigente_hasta is null;

  insert into pedidos.product_tax_profiles
    (product_id, afectacion_tributaria, tasa_aplicable, vigente_desde)
  select unnest(v_ids), 'INAFECTO', 0, current_date;
end $$;
```

El perfil viejo **no se borra**: queda con su `vigente_hasta` y las líneas
de pedidos anteriores conservan la foto del impuesto que tenían. Es a
propósito.

---

## 5. La lista de precios

Una lista por carga, y sus ítems: **un precio por producto y por canal**.
Son seis canales, así que 34 productos son 204 filas.

```sql
with lista as (
  insert into pedidos.price_lists (supplier_id, fecha_inicio, archivo_nombre, importado_por)
  select (select id from pedidos.suppliers where nombre = 'P Harmed'), current_date,
         'LISTA_DE_PRECIOS_P_HARMED.xlsx',
         (select id from pedidos.profiles where email = 'aromero@logisalud.com')
  where not exists (
    select 1 from pedidos.price_list_items i
    join pedidos.products p on p.id = i.product_id
    where p.codigo_interno like 'PRD%' and i.vigente_hasta is null)
  returning id
),
precios(codigo, precio) as (values
  ('PRD101', 30.3),
  ('PRD102', 32.85)
)
insert into pedidos.price_list_items (price_list_id, product_id, sales_channel_id, precio, vigente_desde)
select (select id from lista), p.id, c.id, pr.precio::numeric, current_date
from precios pr
join pedidos.products p on p.codigo_interno = pr.codigo
cross join pedidos.sales_channels c
where exists (select 1 from lista);
```

**El precio va CON IGV.** `price_list_items.precio` es con IGV desde la
migración `0051`. Dividirlo por 1,18 antes de cargarlo deja todos los
pedidos de ese proveedor un 18% abajo.

### Cambiar el precio de un producto

Mismo criterio que el perfil tributario: se cierra el vigente y se abre
otro, no se pisa el número.

```sql
update pedidos.price_list_items
   set vigente_hasta = current_date
 where product_id = (select id from pedidos.products where codigo_interno = 'PRD101')
   and vigente_hasta is null;
```

…y después el `insert` de arriba con el precio nuevo.

### Agregar un producto a una lista ya publicada

Cuando no es un cambio de precios del proveedor sino un producto que
faltaba (el caso del panetón):

```sql
insert into pedidos.price_list_items (price_list_id, product_id, sales_channel_id, precio, vigente_desde)
select (select pl.id from pedidos.price_lists pl
          join pedidos.suppliers s on s.id = pl.supplier_id
         where s.nombre = 'Intipharma'
         order by pl.fecha_inicio desc limit 1),
       (select id from pedidos.products where codigo_interno = 'BOI000'),
       c.id, 0.01, current_date
  from pedidos.sales_channels c
 where not exists (
   select 1 from pedidos.price_list_items i
   where i.product_id = (select id from pedidos.products where codigo_interno = 'BOI000')
     and i.sales_channel_id = c.id and i.vigente_hasta is null);
```

---

## 6. Las escalas por cantidad

El motor aplica un **porcentaje** sobre el precio de lista, no el precio
del archivo. El precio se guarda al lado, en
`precio_promocional_declarado`, para poder auditarlo.

```sql
with tramos(codigo, cantidad_minima, pct, precio, etiqueta) as (values
  ('PRD101', 3, 5.28, 28.7, '3 a 9'),
  ('PRD101', 10, 12.41, 26.54, '10 a más')
)
insert into pedidos.promo_escalas
  (product_id, sales_channel_id, cantidad_minima, porcentaje_descuento,
   precio_promocional_declarado, etiqueta_origen, vigente_desde)
select p.id, c.id, t.cantidad_minima, t.pct::numeric, t.precio::numeric,
       'P Harmed nov-2026 · ' || t.etiqueta, current_date
from tramos t
join pedidos.products p on p.codigo_interno = t.codigo
cross join pedidos.sales_channels c
on conflict (product_id, sales_channel_id, vigente_desde, cantidad_minima) do nothing;
```

El porcentaje se saca así: `(precio_lista − precio_del_tramo) / precio_lista
× 100`, redondeado a dos decimales. **Conviene verificar que el porcentaje
reconstruya el precio al céntimo** antes de darlo por bueno:

```sql
with base as (
  select p.codigo_interno, max(i.precio) as lista
    from pedidos.price_list_items i join pedidos.products p on p.id = i.product_id
   where p.codigo_interno like 'PRD%' and i.vigente_hasta is null
   group by 1)
select count(*) as tramos,
       count(*) filter (where round(b.lista * (1 - e.porcentaje_descuento/100), 2)
                           <> round(e.precio_promocional_declarado, 2)) as no_reproducen,
       count(*) filter (where e.precio_promocional_declarado >= b.lista) as no_bajan
  from pedidos.promo_escalas e
  join pedidos.products p on p.id = e.product_id
  join base b on b.codigo_interno = p.codigo_interno
 where p.codigo_interno like 'PRD%' and e.vigente_hasta is null;
```

Las dos últimas columnas tienen que dar **0**. La segunda atrapa el error
que trajo la lista de P Harmed: un tramo de más cantidad a mayor precio, o
sea comprar más y pagar más. El motor se queda siempre con el tramo más
profundo alcanzado, así que ese error le cobra de más a quien compra en
cantidad.

### Las bonificaciones automáticas (N+M)

Otra tabla, misma idea:

```sql
insert into pedidos.promo_bonificaciones
  (product_id, sales_channel_id, cantidad_comprada, cantidad_gratis,
   producto_bonificado_id, vigente_desde)
select p.id, c.id, 1, 1,
       (select id from pedidos.products where codigo_interno = 'BOI000'),
       current_date
from pedidos.products p
cross join pedidos.sales_channels c
where p.codigo_interno = 'ITP007';
```

Eso es "por cada 1 de ITP007, 1 panetón gratis". `producto_bonificado_id`
en `null` significa que se bonifica con el mismo producto.

**El modelo es por PRODUCTO y CANTIDAD, no por monto.** Una promo del tipo
"por S/ 500 de compra, un panetón" no entra sin cambiar el motor.

---

## 7. Activar y desactivar

```sql
-- Sacar de circulación sin borrar
update pedidos.products set estado = 'inactivo', updated_at = now()
 where codigo_interno = 'PRD208';

-- Volver a ponerlo
update pedidos.products set estado = 'activo', updated_at = now()
 where codigo_interno = 'BOI000';
```

Un producto `inactivo` desaparece del buscador y de la lista de bloqueados.
Los pedidos que ya lo tienen no se tocan.

Para un proveedor entero es lo mismo sobre `pedidos.suppliers`, pero **no
cambia el estado de sus productos**: hay que hacer los dos.

---

## 8. Vendedores

Dar de alta un vendedor son **dos cosas**: la cuenta para entrar
(`auth.users`) y el vendedor del negocio (`pedidos.sellers`). Ver la
migración `1053` para el script completo, y el `CLAUDE.md` de la app para la
trampa de los ocho tokens en cadena vacía — sin eso la cuenta queda creada,
con la contraseña correcta, y el login falla con un error que no menciona ni
la columna ni al usuario.

Dar de baja:

```sql
-- 1. Que no pueda entrar más
update auth.users
   set banned_until = timestamptz '2099-12-31 00:00:00+00', updated_at = now()
 where email = 'sramos@logisaludventas.com';

-- 2. Cortar la sesión que ya tenga abierta en el celular. El ban frena el
--    login nuevo, no el token que ya está en el teléfono.
delete from auth.sessions
 where user_id in (select id from auth.users where email = 'sramos@logisaludventas.com');
delete from auth.refresh_tokens
 where user_id in (select id::text from auth.users where email = 'sramos@logisaludventas.com');

-- 3. Y el vendedor del negocio
update pedidos.sellers set estado = 'inactivo', updated_at = now()
 where codigo_representante = 'CRP1011';
```

**No se borra la cuenta.** `sellers.user_id`, `orders.creado_por` y
`audit_logs.actor` apuntan a ella; borrarla se lleva puesto el historial.

### Pasar la cartera a otro vendedor

```sql
update pedidos.customers
   set vendedor_id = (select id from pedidos.sellers where codigo_representante = 'DAQP02'),
       updated_at = now()
 where vendedor_id = (select id from pedidos.sellers where codigo_representante = 'DAQP01');
```

Los pedidos históricos **no se tocan**: siguen siendo del vendedor que los
hizo, que es lo correcto.

---

## 9. El territorio del proveedor

Qué distritos NO puede vender una línea. Lo que no está en la tabla se
puede vender: un proveedor sin filas no tiene restricción.

```sql
-- Liberar distritos
delete from pedidos.territorio_vetado tv
 using pedidos.ubigeos u
 where u.codigo_inei = tv.codigo_inei
   and tv.supplier_id = (select id from pedidos.suppliers where nombre = 'JAM Pharma')
   and u.departamento = 'CALLAO';

-- Vetarlos
insert into pedidos.territorio_vetado (supplier_id, codigo_inei, motivo)
select (select id from pedidos.suppliers where nombre = 'JAM Pharma'), u.codigo_inei,
       'Fuera del acuerdo de distribución'
  from pedidos.ubigeos u
 where u.departamento = 'TUMBES'
on conflict (supplier_id, codigo_inei) do nothing;
```

---

## 10. Antes de dar nada por hecho: verificar

Después de cualquier carga, contar:

```sql
select
  (select count(*) from pedidos.products p join pedidos.suppliers s on s.id = p.supplier_id
    where s.nombre = 'P Harmed' and p.codigo_interno not like 'BO%') as productos,
  (select count(*) from pedidos.products p join pedidos.suppliers s on s.id = p.supplier_id
    where s.nombre = 'P Harmed' and p.codigo_interno like 'BO%') as bonificados,
  (select count(*) from pedidos.price_list_items i join pedidos.products p on p.id = i.product_id
    where p.codigo_interno like 'PRD%' and i.vigente_hasta is null) as items_precio,
  (select count(*) from pedidos.promo_escalas e join pedidos.products p on p.id = e.product_id
    where p.codigo_interno like 'PRD%' and e.vigente_hasta is null) as escalas;
```

Los ítems de precio tienen que dar **productos × 6**, y las escalas
**tramos × 6**. Si no cuadra, algún código del archivo no existe en
`products` y el `join` lo dejó afuera en silencio — ese es el error más
común de todos.
