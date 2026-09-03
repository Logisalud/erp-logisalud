-- Motor de promociones de Diphasac: tres mecánicas, data-driven.
--
-- Hasta acá el sistema no tenía promociones: cualquier precio distinto al
-- de lista era una excepción comercial (una persona aprobando) o un precio
-- fijado por el administrador. Las promociones del archivo de Diphasac no
-- son ninguna de las dos: son catálogo, están acordadas de antemano y
-- tienen que aplicarse solas.
--
-- Tres mecánicas, tres tablas (diseño aprobado el 2026-09-03):
--
--   1. BONIFICACIÓN POR CANTIDAD — "compra 2, lleva 1". Agrega una línea
--      del mismo producto a S/ 0.00, marcada como gratis.
--   2. DESCUENTO POR ESCALA — "de 2 a más cajas, 15%". Alcanzado el
--      umbral, TODAS las unidades van al precio promocional (confirmado
--      por el usuario: no sólo las que exceden el mínimo).
--   3. DESCUENTO CONDICIONADO POR PAR — Ibucalm 200 al 16% sólo si el
--      pedido tiene Mucoflux 200, y sólo por min(N, M) unidades.
--
-- Decisiones que valen la pena releer antes de tocar esto:
--
--   * Se guarda el PORCENTAJE, no el precio promocional del archivo. El
--     porcentaje es el invariante: el precio se deriva del PVF de cada
--     canal. Guardar el precio dejaría 4 filas con el precio del canal
--     Horizontal para los 4 canales del bloque Mayorista.
--   * El precio promocional se guarda con 4 decimales, sin redondear a 2.
--     Mucoflux con su 10% da 19.7550: redondearlo a 19.76 cobraría 10.02%
--     en vez del 10% que declara el archivo. El céntimo de diferencia que
--     aparece cada dos pares es el redondeo normal de cualquier sistema
--     con IGV, y ocurre igual con los precios de lista.
--   * El motor NO crea approval_requests: una promoción de catálogo no es
--     un descuento discrecional del vendedor y no puede frenar el pedido
--     en COMMERCIAL_EXCEPTION.
--   * Vive en SQL, no en TypeScript. submit_order recalcula precios desde
--     la lista; si el motor viviera sólo del lado del servidor de Next,
--     el envío borraría lo que hizo. Es exactamente el bug que ya tuvimos
--     con el precio fijado por el administrador (migración 1012).

-- ---------------------------------------------------------------------
-- 1. Las tres tablas
-- ---------------------------------------------------------------------

-- Versionadas con el patrón de price_list_items: una promo que cambia se
-- cierra (vigente_hasta) y se inserta de nuevo. Nunca se sobrescribe: un
-- pedido de hace tres meses tiene que poder explicarse con la promo que
-- estaba vigente ese día.

create table if not exists pedidos.promo_bonificaciones (
  id                bigint generated always as identity primary key,
  product_id        uuid     not null references pedidos.products,
  sales_channel_id  smallint not null references pedidos.sales_channels,
  cantidad_comprada numeric(12, 2) not null check (cantidad_comprada > 0),
  cantidad_gratis   numeric(12, 2) not null check (cantidad_gratis > 0),
  -- Null = se bonifica el MISMO producto. Queda para el día que exista el
  -- par BO cargado como producto aparte: ninguno de los 13 del archivo lo
  -- tiene hoy.
  producto_bonificado_id uuid references pedidos.products,
  precio_promocional_declarado numeric(12, 4),
  vigente_desde     date not null default current_date,
  vigente_hasta     date,
  created_at        timestamptz not null default now(),
  unique (product_id, sales_channel_id, vigente_desde)
);

comment on table pedidos.promo_bonificaciones is
  'Compra N, lleva M gratis. El motor agrega la línea gratis; no cambia el precio de las unidades pagadas.';
comment on column pedidos.promo_bonificaciones.precio_promocional_declarado is
  'Precio unitario promedio que declara el archivo de Diphasac. Sólo para que el importador valide su propia lectura; el motor no lo usa.';

create table if not exists pedidos.promo_escalas (
  id                   bigint generated always as identity primary key,
  product_id           uuid     not null references pedidos.products,
  sales_channel_id     smallint not null references pedidos.sales_channels,
  cantidad_minima      numeric(12, 2) not null check (cantidad_minima > 0),
  porcentaje_descuento numeric(5, 2) not null
                       check (porcentaje_descuento > 0 and porcentaje_descuento < 100),
  etiqueta_origen      text,
  precio_promocional_declarado numeric(12, 4),
  vigente_desde        date not null default current_date,
  vigente_hasta        date,
  created_at           timestamptz not null default now(),
  unique (product_id, sales_channel_id, vigente_desde)
);

comment on table pedidos.promo_escalas is
  'Desde N unidades, % de descuento sobre TODAS las unidades de la línea (no sólo las que exceden el mínimo).';
comment on column pedidos.promo_escalas.etiqueta_origen is
  'El texto del archivo tal cual ("DE 2 A MÁS CAJAS"), para poder auditar de dónde salió el umbral.';

create table if not exists pedidos.promo_descuentos_condicionados (
  id                    bigint generated always as identity primary key,
  -- El que recibe el descuento (Ibucalm 200).
  product_id            uuid     not null references pedidos.products,
  -- El que tiene que estar en el pedido (Mucoflux 200).
  producto_condicion_id uuid     not null references pedidos.products,
  sales_channel_id      smallint not null references pedidos.sales_channels,
  porcentaje_descuento  numeric(5, 2) not null
                        check (porcentaje_descuento > 0 and porcentaje_descuento < 100),
  etiqueta              text,
  vigente_desde         date not null default current_date,
  vigente_hasta         date,
  created_at            timestamptz not null default now(),
  -- Condicionarse a sí mismo no significa nada.
  constraint promo_cond_distintos check (product_id <> producto_condicion_id),
  unique (product_id, producto_condicion_id, sales_channel_id, vigente_desde)
);

comment on table pedidos.promo_descuentos_condicionados is
  'Un producto recibe descuento sólo si otro está presente en el pedido, y sólo por min(N, M) unidades. Relación estrictamente 1 a 1.';

alter table pedidos.promo_bonificaciones enable row level security;
alter table pedidos.promo_escalas enable row level security;
alter table pedidos.promo_descuentos_condicionados enable row level security;

-- Mismo criterio que price_list_items: cualquiera autenticado las lee
-- (el vendedor tiene que poder ver por qué su línea bajó de precio),
-- sólo el administrador las escribe.
drop policy if exists promo_bonificaciones_select_all on pedidos.promo_bonificaciones;
create policy promo_bonificaciones_select_all on pedidos.promo_bonificaciones
  for select to authenticated using (true);
drop policy if exists promo_bonificaciones_admin_write on pedidos.promo_bonificaciones;
create policy promo_bonificaciones_admin_write on pedidos.promo_bonificaciones
  for all to authenticated using (pedidos.is_admin()) with check (pedidos.is_admin());

drop policy if exists promo_escalas_select_all on pedidos.promo_escalas;
create policy promo_escalas_select_all on pedidos.promo_escalas
  for select to authenticated using (true);
drop policy if exists promo_escalas_admin_write on pedidos.promo_escalas;
create policy promo_escalas_admin_write on pedidos.promo_escalas
  for all to authenticated using (pedidos.is_admin()) with check (pedidos.is_admin());

drop policy if exists promo_cond_select_all on pedidos.promo_descuentos_condicionados;
create policy promo_cond_select_all on pedidos.promo_descuentos_condicionados
  for select to authenticated using (true);
drop policy if exists promo_cond_admin_write on pedidos.promo_descuentos_condicionados;
create policy promo_cond_admin_write on pedidos.promo_descuentos_condicionados
  for all to authenticated using (pedidos.is_admin()) with check (pedidos.is_admin());

create index if not exists promo_bonificaciones_producto_canal_idx
  on pedidos.promo_bonificaciones (product_id, sales_channel_id);
create index if not exists promo_escalas_producto_canal_idx
  on pedidos.promo_escalas (product_id, sales_channel_id);
create index if not exists promo_cond_canal_idx
  on pedidos.promo_descuentos_condicionados (sales_channel_id, product_id);

-- ---------------------------------------------------------------------
-- 2. De dónde salió el precio de cada línea
-- ---------------------------------------------------------------------

-- `precio_fijado_por_admin` era un booleano suelto que respondía una sola
-- pregunta. Con promociones hay seis respuestas posibles, así que la
-- columna las dice todas. El booleano se mantiene (lo leen submit_order,
-- el correo y el Excel) y se sincroniza acá.
alter table pedidos.order_items
  add column if not exists origen_precio text not null default 'LISTA';

alter table pedidos.order_items
  drop constraint if exists order_items_origen_precio_check;
alter table pedidos.order_items
  add constraint order_items_origen_precio_check check (origen_precio in (
    'LISTA', 'PROMO_ESCALA', 'PROMO_BONIFICACION', 'PROMO_CONDICIONADA',
    'APROBACION_COMERCIAL', 'FIJADO_POR_ADMIN'));

alter table pedidos.order_items
  add column if not exists promocion_ref text;

alter table pedidos.order_items
  add column if not exists es_linea_gratis boolean not null default false;

comment on column pedidos.order_items.origen_precio is
  'Por qué esta línea vale lo que vale. El motor de promociones sólo toca LISTA, PROMO_* — las decisiones humanas (FIJADO_POR_ADMIN, APROBACION_COMERCIAL) le ganan siempre.';
comment on column pedidos.order_items.promocion_ref is
  'Qué fila de promoción produjo el precio: "escala:12", "condicionada:1", "bonificacion:7". Para explicar un pedido viejo.';
comment on column pedidos.order_items.es_linea_gratis is
  'Línea que generó el motor, a S/ 0.00. Se borra y se vuelve a generar en cada corrida: nunca la carga una persona.';

-- Los pedidos que ya existen: la única promoción posible hasta hoy era el
-- precio del administrador. Un CHECK nuevo se valida contra la tabla
-- entera, así que esto va antes de cualquier otra cosa.
update pedidos.order_items
set origen_precio = 'FIJADO_POR_ADMIN'
where precio_fijado_por_admin and origen_precio = 'LISTA';

-- ---------------------------------------------------------------------
-- 3. El recálculo de importes, en un solo lugar
-- ---------------------------------------------------------------------

-- La aritmética de siempre: el precio YA INCLUYE IGV, el total es
-- cantidad × precio, la base se deriva hacia atrás y el IGV sale por
-- resta para que subtotal + igv dé exactamente el total. Está acá para
-- que el motor no tenga su propia copia y las dos se separen con el
-- tiempo.
create or replace function pedidos.recalcular_importes_orden(p_order_id uuid)
returns void
language sql
security definer
set search_path to 'pedidos', 'public'
as $$
  update pedidos.order_items oi set
    total = calc.total,
    subtotal = calc.subtotal,
    igv = round(calc.total - calc.subtotal, 2),
    updated_at = now()
  from (
    select i.id,
           round(i.cantidad * i.precio_unitario, 2) as total,
           case when i.afectacion_tributaria = 'GRAVADO'
                then round(round(i.cantidad * i.precio_unitario, 2) / (1 + i.tasa_igv / 100), 2)
                else round(i.cantidad * i.precio_unitario, 2) end as subtotal
    from pedidos.order_items i
    where i.order_id = p_order_id
  ) calc
  where oi.id = calc.id;
$$;

-- ---------------------------------------------------------------------
-- 4. El motor
-- ---------------------------------------------------------------------

-- Idempotente a propósito: se puede correr las veces que sea y deja el
-- pedido en el mismo estado. Eso es lo que hace que "el vendedor cambió
-- la cantidad" o "quitó una línea" no necesiten lógica especial — se
-- vuelve a correr y ya. Sin la consolidación del paso 0, una línea
-- partida por el descuento condicionado se volvería a partir en cada
-- corrida y el pedido acumularía líneas.
create or replace function pedidos.aplicar_promociones(p_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'pedidos', 'public'
as $$
declare
  v_order record;
  v_canal smallint;
  v_regla record;
  v_item record;
  v_conservar uuid;
  v_precio_lista numeric;
  v_precio_promo numeric;
  v_pagadas numeric;
  v_condicion numeric;
  v_emparejadas numeric;
  v_resto numeric;
  v_juegos numeric;
  v_destino uuid;
  v_afectacion text;
  v_tasa numeric;
  v_aplicadas jsonb := '[]'::jsonb;
begin
  select * into v_order from pedidos.orders where id = p_order_id;
  if v_order is null then
    raise exception 'El pedido % no existe', p_order_id;
  end if;

  -- Quien puede editar el pedido puede recalcular sus promociones. No hay
  -- nada discrecional acá —el resultado sale de las tablas, no de quien
  -- llama—, pero igual no tiene por qué correrlo un tercero.
  if not (pedidos.is_admin()
          or (pedidos.has_role('vendedor') and v_order.seller_id = pedidos.current_seller_id())) then
    raise exception 'No autorizado para recalcular las promociones de este pedido';
  end if;

  -- ------------------------------------------------------------------
  -- 0. Limpiar y consolidar
  -- ------------------------------------------------------------------
  delete from pedidos.order_items
  where order_id = p_order_id and es_linea_gratis;

  update pedidos.order_items oi set
    precio_unitario = coalesce(oi.precio_lista_original, oi.precio_unitario),
    precio_lista_original = null,
    origen_precio = 'LISTA',
    promocion_ref = null,
    updated_at = now()
  where oi.order_id = p_order_id
    and oi.origen_precio in ('PROMO_ESCALA', 'PROMO_CONDICIONADA');

  -- Las líneas partidas del mismo producto vuelven a ser una. Se excluyen
  -- las decisiones humanas: si el administrador fijó precio a una línea de
  -- 2 unidades, fusionarla con otra de 3 borraría su decisión.
  for v_item in
    select oi.product_id, sum(oi.cantidad) as cantidad
    from pedidos.order_items oi
    where oi.order_id = p_order_id
      and not oi.precio_fijado_por_admin
      and oi.origen_precio not in ('FIJADO_POR_ADMIN', 'APROBACION_COMERCIAL')
      and not exists (select 1 from pedidos.approval_requests ar where ar.order_item_id = oi.id)
    group by oi.product_id
    having count(*) > 1
  loop
    select oi.id into v_conservar
    from pedidos.order_items oi
    where oi.order_id = p_order_id
      and oi.product_id = v_item.product_id
      and not oi.precio_fijado_por_admin
      and oi.origen_precio not in ('FIJADO_POR_ADMIN', 'APROBACION_COMERCIAL')
      and not exists (select 1 from pedidos.approval_requests ar where ar.order_item_id = oi.id)
    order by oi.created_at, oi.id
    limit 1;

    delete from pedidos.order_items oi
    where oi.order_id = p_order_id
      and oi.product_id = v_item.product_id
      and oi.id <> v_conservar
      and not oi.precio_fijado_por_admin
      and oi.origen_precio not in ('FIJADO_POR_ADMIN', 'APROBACION_COMERCIAL')
      and not exists (select 1 from pedidos.approval_requests ar where ar.order_item_id = oi.id);

    update pedidos.order_items
    set cantidad = v_item.cantidad, updated_at = now()
    where id = v_conservar;
  end loop;

  -- ------------------------------------------------------------------
  -- 1. El canal del cliente
  -- ------------------------------------------------------------------
  select c.canal_id into v_canal from pedidos.customers c where c.id = v_order.customer_id;

  if v_canal is null then
    -- Sin canal no hay precio ni promoción; submit_order ya lo rechaza con
    -- su propio mensaje. Acá alcanza con dejar los importes coherentes.
    perform pedidos.recalcular_importes_orden(p_order_id);
    return jsonb_build_object('canal', null, 'aplicadas', v_aplicadas);
  end if;

  -- ------------------------------------------------------------------
  -- 2. Escalas: alcanzado el umbral, TODAS las unidades
  -- ------------------------------------------------------------------
  for v_item in
    select oi.id, oi.product_id, oi.cantidad
    from pedidos.order_items oi
    where oi.order_id = p_order_id
      and not oi.precio_fijado_por_admin
      and oi.origen_precio not in ('FIJADO_POR_ADMIN', 'APROBACION_COMERCIAL')
      and not exists (select 1 from pedidos.approval_requests ar where ar.order_item_id = oi.id)
      and not oi.es_linea_gratis
  loop
    select e.* into v_regla
    from pedidos.promo_escalas e
    where e.product_id = v_item.product_id
      and e.sales_channel_id = v_canal
      and e.vigente_desde <= current_date
      and (e.vigente_hasta is null or e.vigente_hasta >= current_date)
      and v_item.cantidad >= e.cantidad_minima
    order by e.cantidad_minima desc, e.id desc
    limit 1;

    if not found then
      continue;
    end if;

    select pli.precio into v_precio_lista
    from pedidos.price_list_items pli
    where pli.product_id = v_item.product_id
      and pli.sales_channel_id = v_canal
      and pli.vigente_hasta is null;

    -- Sin precio de lista no hay sobre qué descontar. No se inventa: la
    -- línea queda como está y submit_order dirá lo suyo.
    if v_precio_lista is null then
      continue;
    end if;

    v_precio_promo := round(v_precio_lista * (1 - v_regla.porcentaje_descuento / 100), 4);

    update pedidos.order_items set
      precio_unitario = v_precio_promo,
      precio_lista_original = v_precio_lista,
      origen_precio = 'PROMO_ESCALA',
      promocion_ref = 'escala:' || v_regla.id,
      updated_at = now()
    where id = v_item.id;

    v_aplicadas := v_aplicadas || jsonb_build_object(
      'tipo', 'PROMO_ESCALA',
      'productId', v_item.product_id,
      'ref', 'escala:' || v_regla.id,
      'cantidad', v_item.cantidad,
      'precioLista', v_precio_lista,
      'precioPromocional', v_precio_promo);
  end loop;

  -- ------------------------------------------------------------------
  -- 3. Descuentos condicionados: min(N, M) unidades
  -- ------------------------------------------------------------------
  for v_regla in
    select c.*
    from pedidos.promo_descuentos_condicionados c
    where c.sales_channel_id = v_canal
      and c.vigente_desde <= current_date
      and (c.vigente_hasta is null or c.vigente_hasta >= current_date)
    order by c.id
  loop
    -- Sólo unidades PAGADAS habilitan el descuento: un producto que entró
    -- gratis no puede desbloquear el descuento de otro.
    select coalesce(sum(oi.cantidad), 0) into v_condicion
    from pedidos.order_items oi
    where oi.order_id = p_order_id
      and oi.product_id = v_regla.producto_condicion_id
      and not oi.es_linea_gratis
      and oi.precio_unitario > 0;

    if v_condicion <= 0 then
      continue;
    end if;

    select oi.* into v_item
    from pedidos.order_items oi
    where oi.order_id = p_order_id
      and oi.product_id = v_regla.product_id
      and not oi.precio_fijado_por_admin
      and oi.origen_precio not in ('FIJADO_POR_ADMIN', 'APROBACION_COMERCIAL')
      and not exists (select 1 from pedidos.approval_requests ar where ar.order_item_id = oi.id)
      and not oi.es_linea_gratis
    order by oi.created_at, oi.id
    limit 1;

    if not found then
      continue;
    end if;

    select pli.precio into v_precio_lista
    from pedidos.price_list_items pli
    where pli.product_id = v_regla.product_id
      and pli.sales_channel_id = v_canal
      and pli.vigente_hasta is null;

    if v_precio_lista is null then
      continue;
    end if;

    v_precio_promo := round(v_precio_lista * (1 - v_regla.porcentaje_descuento / 100), 4);
    v_emparejadas := least(v_item.cantidad, v_condicion);
    v_resto := v_item.cantidad - v_emparejadas;

    update pedidos.order_items set
      cantidad = v_emparejadas,
      precio_unitario = v_precio_promo,
      precio_lista_original = v_precio_lista,
      origen_precio = 'PROMO_CONDICIONADA',
      promocion_ref = 'condicionada:' || v_regla.id,
      updated_at = now()
    where id = v_item.id;

    -- Las unidades que no se emparejaron se van a su propia línea, con el
    -- precio que tenían (el de lista, o el de su escala si tenía una).
    -- Promediar los dos precios en una línea sería más cómodo y menos
    -- honesto: el vendedor tiene que ver cuántas unidades llevan el
    -- descuento.
    if v_resto > 0 then
      insert into pedidos.order_items (
        order_id, product_id, cantidad, precio_unitario, precio_lista_original,
        afectacion_tributaria, tasa_igv, subtotal, igv, total,
        origen_precio, promocion_ref)
      values (
        p_order_id, v_item.product_id, v_resto, v_item.precio_unitario, v_item.precio_lista_original,
        v_item.afectacion_tributaria, v_item.tasa_igv, 0, 0, 0,
        v_item.origen_precio, v_item.promocion_ref);
    end if;

    v_aplicadas := v_aplicadas || jsonb_build_object(
      'tipo', 'PROMO_CONDICIONADA',
      'productId', v_regla.product_id,
      'ref', 'condicionada:' || v_regla.id,
      'unidadesConDescuento', v_emparejadas,
      'unidadesAPrecioLista', v_resto,
      'precioLista', v_precio_lista,
      'precioPromocional', v_precio_promo);
  end loop;

  -- ------------------------------------------------------------------
  -- 4. Bonificaciones: compra N, lleva M
  -- ------------------------------------------------------------------
  for v_regla in
    select b.*
    from pedidos.promo_bonificaciones b
    where b.sales_channel_id = v_canal
      and b.vigente_desde <= current_date
      and (b.vigente_hasta is null or b.vigente_hasta >= current_date)
    order by b.id
  loop
    -- Sobre la cantidad pagada total del producto, sumando las líneas
    -- partidas por el paso 3.
    select coalesce(sum(oi.cantidad), 0) into v_pagadas
    from pedidos.order_items oi
    where oi.order_id = p_order_id
      and oi.product_id = v_regla.product_id
      and not oi.es_linea_gratis
      and oi.precio_unitario > 0;

    if v_pagadas < v_regla.cantidad_comprada then
      continue;
    end if;

    -- El divisor es lo comprado, no la suma: el archivo dice "2 + 1", o
    -- sea que con 6 unidades hay 3 juegos, no 2.
    v_juegos := floor(v_pagadas / v_regla.cantidad_comprada);
    v_destino := coalesce(v_regla.producto_bonificado_id, v_regla.product_id);

    select tp.afectacion_tributaria, tp.tasa_aplicable into v_afectacion, v_tasa
    from pedidos.product_tax_profiles tp
    where tp.product_id = v_destino and tp.vigente_hasta is null;

    -- Sin perfil tributario la línea no se puede facturar. Antes que
    -- inventarle uno, no se agrega la bonificación.
    if v_afectacion is null then
      continue;
    end if;

    insert into pedidos.order_items (
      order_id, product_id, cantidad, precio_unitario,
      afectacion_tributaria, tasa_igv, subtotal, igv, total,
      origen_precio, promocion_ref, es_linea_gratis)
    values (
      p_order_id, v_destino, v_juegos * v_regla.cantidad_gratis, 0,
      v_afectacion, v_tasa, 0, 0, 0,
      'PROMO_BONIFICACION', 'bonificacion:' || v_regla.id, true);

    v_aplicadas := v_aplicadas || jsonb_build_object(
      'tipo', 'PROMO_BONIFICACION',
      'productId', v_regla.product_id,
      'productoBonificadoId', v_destino,
      'ref', 'bonificacion:' || v_regla.id,
      'cantidadPagada', v_pagadas,
      'juegos', v_juegos,
      'unidadesGratis', v_juegos * v_regla.cantidad_gratis);
  end loop;

  -- ------------------------------------------------------------------
  -- 5. Importes
  -- ------------------------------------------------------------------
  perform pedidos.recalcular_importes_orden(p_order_id);

  return jsonb_build_object('canal', v_canal, 'aplicadas', v_aplicadas);
end;
$$;

revoke all on function pedidos.aplicar_promociones(uuid) from public;
grant execute on function pedidos.aplicar_promociones(uuid) to authenticated;
revoke all on function pedidos.recalcular_importes_orden(uuid) from public;

-- ---------------------------------------------------------------------
-- 5. La única promoción que el importador no puede leer
-- ---------------------------------------------------------------------

-- En el archivo, el par Ibucalm + Mucoflux es una nota de texto libre
-- ("NUEVO PAQUETE: IBUCALM 200 + MUCOFLUX 200 ( S/. 50)") en la columna de
-- escalas, no una fila estructurada. El importador no debería adivinar
-- prosa, así que la regla se carga acá, a mano, con su origen documentado.
--
-- El 16% no es un descuento por escala: sólo existe cuando el pedido tiene
-- Mucoflux, y sólo por tantas unidades como haya de Mucoflux (regla
-- confirmada por el usuario). El 10% del Mucoflux sí es escala normal y lo
-- carga el importador desde su propia fila del archivo.
insert into pedidos.promo_descuentos_condicionados (
  product_id, producto_condicion_id, sales_channel_id, porcentaje_descuento, etiqueta, vigente_desde)
select ibu.id, muco.id, 2, 16.00,
       'Paquete Ibucalm 200 + Mucoflux 200: Ibucalm −16% por cada Mucoflux del pedido',
       current_date
from pedidos.products ibu, pedidos.products muco
where ibu.codigo_interno = 'DHP211' and muco.codigo_interno = 'DHP020'
  -- Re-ejecutable de verdad: `on conflict` no alcanza porque la clave
  -- incluye vigente_desde, y un segundo intento otro día insertaría la
  -- misma regla dos veces en vez de chocar.
  and not exists (
    select 1 from pedidos.promo_descuentos_condicionados c
    where c.product_id = ibu.id
      and c.producto_condicion_id = muco.id
      and c.sales_channel_id = 2
      and c.vigente_hasta is null);
