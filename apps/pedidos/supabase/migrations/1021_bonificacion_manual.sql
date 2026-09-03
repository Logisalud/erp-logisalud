-- Bonificación manual: unidades a S/ 0.00 sin promoción configurada.
--
-- Caso real: el vendedor acuerda 5 A-Fiebrin pagados + 5 bonificados, y no
-- existe ninguna regla de promoción para ese producto. El motor automático
-- (`promo_bonificaciones`, migración 1017) no sirve acá: eso es catálogo,
-- calculado, repetible. Esto es discrecional — una persona lo decide y
-- escribe por qué.
--
-- Comparten `es_linea_gratis` a propósito, para que la línea se vea igual
-- en el correo y en el Excel (con el prefijo BO), pero NO comparten nada
-- más: el motor no las genera, no las borra y no las fusiona.
--
-- Quién puede, y a qué costo:
--
--   * VENDEDOR: al enviar el pedido se crea una `approval_request` por
--     cada línea manual y el pedido cae en COMMERCIAL_EXCEPTION. Es un
--     descuento del 100%, más grande que cualquier precio especial, así
--     que pasa por el mismo control.
--   * ADMINISTRADOR: se aplica directo, sin solicitud. Es la misma
--     autoridad que ya tiene para fijar precio (migración 1011).
--
-- **Rechazar una bonificación manual borra la línea.** El camino normal de
-- un rechazo —"queda al precio de lista"— acá cobraría unidades que el
-- cliente aceptó como regalo: cambiaría el pedido en vez de negar el
-- pedido. Y dejarla puesta la volvería a mandar a aprobación en cada
-- envío, para siempre. La línea se va y el pedido vuelve a DRAFT, como
-- cualquier rechazo. Queda registrado en `pedidos.audit_logs`
-- (`rechazar_bonificacion_manual`) con el motivo y la cantidad: la
-- solicitud y su decisión caen por cascada junto con la línea, así que el
-- audit log es el registro que sobrevive.

alter table pedidos.order_items
  drop constraint if exists order_items_origen_precio_check;
alter table pedidos.order_items
  add constraint order_items_origen_precio_check check (origen_precio in (
    'LISTA', 'PROMO_ESCALA', 'PROMO_BONIFICACION', 'PROMO_CONDICIONADA',
    'BONIFICACION_MANUAL', 'APROBACION_COMERCIAL', 'FIJADO_POR_ADMIN'));

-- ---------------------------------------------------------------------
-- Marcar la bonificación
-- ---------------------------------------------------------------------

-- SECURITY DEFINER con el chequeo adentro: puede el administrador, o el
-- vendedor dueño del pedido. Que la línea necesite aprobación o no se
-- decide en el envío, no acá.
create or replace function pedidos.marcar_bonificacion_manual(
  p_order_item_id uuid,
  p_cantidad numeric,
  p_motivo text
) returns jsonb
language plpgsql
security definer
set search_path to 'pedidos', 'public'
as $$
declare
  v_item record;
  v_order record;
  v_es_admin boolean;
  v_motivo text;
  v_precio_lista numeric;
  v_existente uuid;
  v_id uuid;
  v_afectacion text;
  v_tasa numeric;
begin
  -- El motivo es obligatorio y es el punto entero del mecanismo: sin él no
  -- hay nada que aprobar ni que auditar, sólo unidades gratis sin explicar.
  v_motivo := nullif(btrim(coalesce(p_motivo, '')), '');
  if v_motivo is null then
    raise exception 'La bonificación manual necesita un motivo';
  end if;
  if p_cantidad is null or p_cantidad <= 0 then
    raise exception 'La cantidad bonificada tiene que ser mayor que cero';
  end if;

  select * into v_item from pedidos.order_items where id = p_order_item_id;
  if v_item is null then
    raise exception 'La línea no existe';
  end if;
  if v_item.es_linea_gratis then
    raise exception 'Esa línea ya va sin costo: la bonificación se marca sobre la línea que se paga';
  end if;

  select * into v_order from pedidos.orders where id = v_item.order_id for update;
  if v_order.estado <> 'DRAFT' then
    raise exception 'Solo se puede marcar una bonificación mientras el pedido está en borrador';
  end if;

  v_es_admin := pedidos.is_admin();
  if not (v_es_admin
          or (pedidos.has_role('vendedor') and v_order.seller_id = pedidos.current_seller_id())) then
    raise exception 'No autorizado para marcar bonificaciones en este pedido';
  end if;

  select tp.afectacion_tributaria, tp.tasa_aplicable into v_afectacion, v_tasa
  from pedidos.product_tax_profiles tp
  where tp.product_id = v_item.product_id and tp.vigente_hasta is null;
  if v_afectacion is null then
    raise exception 'Sin perfil tributario vigente para el producto %', v_item.product_id;
  end if;

  -- El precio de lista se guarda en la línea gratis: es cuánto se está
  -- regalando, y es lo que el aprobador necesita ver para decidir.
  select pli.precio into v_precio_lista
  from pedidos.price_list_items pli
  join pedidos.customers c on c.id = v_order.customer_id
  where pli.product_id = v_item.product_id
    and pli.sales_channel_id = c.canal_id
    and pli.vigente_hasta is null;
  v_precio_lista := coalesce(v_precio_lista, v_item.precio_lista_original, v_item.precio_unitario);

  -- Una sola línea manual por producto: volver a marcar corrige la
  -- cantidad, no acumula otra línea gratis.
  select oi.id into v_existente
  from pedidos.order_items oi
  where oi.order_id = v_item.order_id
    and oi.product_id = v_item.product_id
    and oi.origen_precio = 'BONIFICACION_MANUAL'
  limit 1;

  if v_existente is not null then
    update pedidos.order_items set
      cantidad = p_cantidad,
      motivo_precio_especial = v_motivo,
      precio_unitario = 0,
      precio_lista_original = v_precio_lista,
      afectacion_tributaria = v_afectacion,
      tasa_igv = v_tasa,
      subtotal = 0,
      igv = 0,
      total = 0,
      updated_at = now()
    where id = v_existente;

    -- Una solicitud pendiente de la cantidad anterior ya no describe lo
    -- que se está pidiendo.
    delete from pedidos.approval_requests
    where order_item_id = v_existente and estado = 'PENDIENTE';

    v_id := v_existente;
  else
    insert into pedidos.order_items (
      order_id, product_id, cantidad, precio_unitario, precio_lista_original,
      motivo_precio_especial, afectacion_tributaria, tasa_igv,
      subtotal, igv, total, origen_precio, es_linea_gratis)
    values (
      v_item.order_id, v_item.product_id, p_cantidad, 0, v_precio_lista,
      v_motivo, v_afectacion, v_tasa,
      0, 0, 0, 'BONIFICACION_MANUAL', true)
    returning id into v_id;
  end if;

  return jsonb_build_object(
    'orderId', v_item.order_id,
    'orderItemId', v_id,
    'productId', v_item.product_id,
    'cantidad', p_cantidad,
    'precioLista', v_precio_lista,
    'motivo', v_motivo,
    'requiereAprobacion', not v_es_admin);
end;
$$;

revoke all on function pedidos.marcar_bonificacion_manual(uuid, numeric, text) from public;
grant execute on function pedidos.marcar_bonificacion_manual(uuid, numeric, text) to authenticated;

-- ---------------------------------------------------------------------
-- Quitar la bonificación
-- ---------------------------------------------------------------------

create or replace function pedidos.quitar_bonificacion_manual(p_order_item_id uuid)
returns void
language plpgsql
security definer
set search_path to 'pedidos', 'public'
as $$
declare
  v_item record;
  v_order record;
begin
  select * into v_item from pedidos.order_items where id = p_order_item_id;
  if v_item is null then
    return;
  end if;
  if v_item.origen_precio <> 'BONIFICACION_MANUAL' then
    raise exception 'Esa línea no es una bonificación manual';
  end if;

  select * into v_order from pedidos.orders where id = v_item.order_id for update;
  if v_order.estado <> 'DRAFT' then
    raise exception 'Solo se puede quitar una bonificación mientras el pedido está en borrador';
  end if;
  if not (pedidos.is_admin()
          or (pedidos.has_role('vendedor') and v_order.seller_id = pedidos.current_seller_id())) then
    raise exception 'No autorizado para tocar este pedido';
  end if;

  delete from pedidos.order_items where id = p_order_item_id;
end;
$$;

revoke all on function pedidos.quitar_bonificacion_manual(uuid) from public;
grant execute on function pedidos.quitar_bonificacion_manual(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- El motor no toca las líneas manuales
-- ---------------------------------------------------------------------

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
  -- Sólo las líneas gratis que generó el MOTOR. Una bonificación manual
  -- (`BONIFICACION_MANUAL`) la marcó una persona con un motivo escrito: no
  -- es un cálculo que se pueda repetir, así que borrarla sería borrar una
  -- decisión.
  delete from pedidos.order_items
  where order_id = p_order_id
    and es_linea_gratis
    and origen_precio = 'PROMO_BONIFICACION';

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
  -- 2 unidades, fusionarla con otra de 3 borraría su decisión. Lo mismo con
  -- la bonificación manual: fusionar "5 pagadas" con "5 gratis" daría 10
  -- unidades a S/ 0.00, o sea regalar el pedido entero.
  for v_item in
    select oi.product_id, sum(oi.cantidad) as cantidad
    from pedidos.order_items oi
    where oi.order_id = p_order_id
      and not oi.precio_fijado_por_admin
      and oi.origen_precio not in ('FIJADO_POR_ADMIN', 'APROBACION_COMERCIAL', 'BONIFICACION_MANUAL')
      and not exists (select 1 from pedidos.approval_requests ar where ar.order_item_id = oi.id)
    group by oi.product_id
    having count(*) > 1
  loop
    select oi.id into v_conservar
    from pedidos.order_items oi
    where oi.order_id = p_order_id
      and oi.product_id = v_item.product_id
      and not oi.precio_fijado_por_admin
      and oi.origen_precio not in ('FIJADO_POR_ADMIN', 'APROBACION_COMERCIAL', 'BONIFICACION_MANUAL')
      and not exists (select 1 from pedidos.approval_requests ar where ar.order_item_id = oi.id)
    order by oi.created_at, oi.id
    limit 1;

    delete from pedidos.order_items oi
    where oi.order_id = p_order_id
      and oi.product_id = v_item.product_id
      and oi.id <> v_conservar
      and not oi.precio_fijado_por_admin
      and oi.origen_precio not in ('FIJADO_POR_ADMIN', 'APROBACION_COMERCIAL', 'BONIFICACION_MANUAL')
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
      and oi.origen_precio not in ('FIJADO_POR_ADMIN', 'APROBACION_COMERCIAL', 'BONIFICACION_MANUAL')
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
      and oi.origen_precio not in ('FIJADO_POR_ADMIN', 'APROBACION_COMERCIAL', 'BONIFICACION_MANUAL')
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
$$;;

revoke all on function pedidos.aplicar_promociones(uuid) from public;
grant execute on function pedidos.aplicar_promociones(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- El envío crea la solicitud cuando la marcó un vendedor
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION pedidos.submit_order(p_order_id uuid, p_motivo text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pedidos', 'public'
AS $function$
declare
  v_order record;
  v_customer record;
  v_item record;
  v_codigo text;
  v_precio numeric;
  v_precio_lista numeric;
  v_tasa numeric;
  v_afectacion text;
  v_igv numeric;
  v_subtotal numeric;
  v_total numeric;
  v_drift jsonb := '[]'::jsonb;
  v_estado_resultado text;
begin
  select * into v_order from pedidos.orders where id = p_order_id for update;
  if v_order is null or v_order.estado <> 'DRAFT' then
    raise exception 'Solo se puede enviar un pedido en DRAFT';
  end if;
  if not (pedidos.is_admin() or (pedidos.has_role('vendedor') and v_order.seller_id = pedidos.current_seller_id())) then
    raise exception 'No autorizado para enviar este pedido';
  end if;
  if not exists (select 1 from pedidos.order_items where order_id = p_order_id) then
    raise exception 'El pedido no tiene productos';
  end if;

  select * into v_customer from pedidos.customers where id = v_order.customer_id;
  if v_customer.canal_id is null then
    raise exception 'El cliente no tiene canal de venta asignado; no se puede calcular precio';
  end if;

  for v_item in select * from pedidos.order_items where order_id = p_order_id loop
    -- La línea gratis la genera el motor de promociones, no una persona:
    -- refrescarle el precio de lista sería cobrarla.
    if v_item.es_linea_gratis then
      continue;
    end if;

    select pli.precio into v_precio_lista
    from pedidos.price_list_items pli
    where pli.product_id = v_item.product_id
      and pli.sales_channel_id = v_customer.canal_id
      and pli.vigente_hasta is null;

    -- Una bonificación se entrega gratis y casi nunca tiene precio propio en
    -- la lista del canal. Antes de este cambio, el envío entero reventaba
    -- por una línea de bonificación cargada a mano: acá vale S/ 0.00
    -- explícito. Para cualquier otro producto, sin precio no hay pedido.
    if v_precio_lista is null then
      select p.codigo_interno into v_codigo
      from pedidos.products p where p.id = v_item.product_id;

      if upper(btrim(coalesce(v_codigo, ''))) like 'BO%'
         and length(btrim(v_codigo)) > 2 then
        v_precio_lista := 0;
      else
        raise exception 'Sin precio vigente para el producto % en el canal del cliente', v_item.product_id;
      end if;
    end if;

    select tp.afectacion_tributaria, tp.tasa_aplicable into v_afectacion, v_tasa
    from pedidos.product_tax_profiles tp
    where tp.product_id = v_item.product_id and tp.vigente_hasta is null;

    if v_afectacion is null then
      raise exception 'Sin perfil tributario vigente para el producto %', v_item.product_id;
    end if;

    -- Un precio que fijó el administrador se respeta: es una decisión, no
    -- un borrador desactualizado. Igual se refresca el precio de lista de
    -- referencia, para que el correo y el Excel comparen contra el vigente.
    if v_item.precio_fijado_por_admin then
      v_precio := v_item.precio_unitario;
    else
      v_precio := v_precio_lista;
      -- Una línea con promoción no "cambió de precio": vale menos porque
      -- el motor se lo bajó, y en dos líneas más se lo va a volver a
      -- bajar. Sólo se compara contra el precio que el vendedor vio.
      if v_precio_lista <> v_item.precio_unitario and v_item.origen_precio = 'LISTA' then
        v_drift := v_drift || jsonb_build_object(
          'orderItemId', v_item.id, 'precioAnterior', v_item.precio_unitario, 'precioNuevo', v_precio_lista);
      end if;
    end if;

    -- El precio de lista YA INCLUYE IGV: el total es cantidad x precio y el
    -- desglose se deriva hacia atras. El IGV sale por resta para que
    -- subtotal + igv de exactamente el total.
    v_total := round(v_item.cantidad * v_precio, 2);
    v_subtotal := case when v_afectacion = 'GRAVADO'
                       then round(v_total / (1 + v_tasa / 100), 2)
                       else v_total end;
    v_igv := round(v_total - v_subtotal, 2);

    update pedidos.order_items set
      precio_unitario = v_precio,
      precio_lista_original = case when v_item.precio_fijado_por_admin then v_precio_lista
                                   else null end,
      -- Vuelve a precio de lista puro; el motor decide de nuevo abajo.
      origen_precio = case when v_item.precio_fijado_por_admin then 'FIJADO_POR_ADMIN'
                           else 'LISTA' end,
      promocion_ref = case when v_item.precio_fijado_por_admin then v_item.promocion_ref
                           else null end,
      afectacion_tributaria = v_afectacion,
      tasa_igv = v_tasa,
      subtotal = v_subtotal,
      igv = v_igv,
      total = v_total,
      updated_at = now()
    where id = v_item.id;
  end loop;

  -- Una bonificación manual es un descuento del 100%: más grande que
  -- cualquier precio especial. Si la marcó un vendedor, pasa por el mismo
  -- control —una solicitud por línea— y el pedido no avanza hasta que
  -- alguien decida. Si la marcó un administrador, se aplica directo: es la
  -- misma autoridad que ya tiene para fijar precio.
  --
  -- La solicitud se crea acá, en el envío, y no al marcar la línea: hasta
  -- que el pedido no se envía no hay nada que aprobar, y el vendedor puede
  -- corregir la cantidad las veces que quiera sin generar ruido en la
  -- bandeja del aprobador.
  if not pedidos.is_admin() then
    insert into pedidos.approval_requests (
      order_id, order_item_id, solicitado_por, precio_solicitado, cantidad, motivo, precio_original)
    select p_order_id, oi.id, coalesce(auth.uid(), v_order.creado_por), 0, oi.cantidad,
           'Bonificación manual (100% de descuento): ' || coalesce(oi.motivo_precio_especial, 'sin motivo'),
           oi.precio_lista_original
    from pedidos.order_items oi
    where oi.order_id = p_order_id
      and oi.origen_precio = 'BONIFICACION_MANUAL'
      and not exists (
        select 1 from pedidos.approval_requests ar where ar.order_item_id = oi.id);
  end if;

  -- Las promociones del catálogo, sobre los precios ya refrescados. El
  -- pedido sigue en DRAFT: el motor inserta y borra líneas.
  perform pedidos.aplicar_promociones(p_order_id);

  update pedidos.orders set
    razon_social_snapshot = v_customer.razon_social,
    direccion_snapshot = (select direccion from pedidos.customer_addresses where id = v_order.customer_address_id),
    ubigeo_snapshot = (select ubigeo from pedidos.customer_addresses where id = v_order.customer_address_id),
    canal_snapshot = (select nombre from pedidos.sales_channels where id = v_customer.canal_id),
    zona_snapshot = (select nombre from pedidos.zones where id = v_customer.zona_id),
    vendedor_snapshot = (select nombre_completo from pedidos.sellers where id = v_order.seller_id)
  where id = p_order_id;

  perform pedidos.apply_order_transition(p_order_id, 'SUBMITTED', p_motivo);

  if v_customer.estado = 'PENDIENTE_DE_VALIDACION' then
    v_estado_resultado := 'NEW_CUSTOMER_VALIDATION';
  -- Días de crédito escritos a mano: no coinciden con ninguna condición
  -- habitual predefinida, así que Administración tiene que verlos siempre.
  elsif v_order.dias_credito_solicitados is not null then
    v_estado_resultado := 'ADMINISTRATIVE_EXCEPTION';
  -- Sin condición habitual definida no hay contra qué comparar: no es
  -- excepción administrativa.
  elsif v_customer.condicion_pago_habitual_id is not null
        and v_order.payment_terms_id <> v_customer.condicion_pago_habitual_id then
    v_estado_resultado := 'ADMINISTRATIVE_EXCEPTION';
  elsif exists (
    select 1 from pedidos.approval_requests ar
    join pedidos.order_items oi on oi.id = ar.order_item_id
    where oi.order_id = p_order_id and ar.estado = 'PENDIENTE'
  ) then
    v_estado_resultado := 'COMMERCIAL_EXCEPTION';
  else
    v_estado_resultado := 'READY_FOR_OPERATIONS';
  end if;

  perform pedidos.apply_order_transition(p_order_id, v_estado_resultado, 'Validación automática');

  return jsonb_build_object('estadoResultado', v_estado_resultado, 'priceDrift', v_drift);
end;
$function$;

-- ---------------------------------------------------------------------
-- Rechazar una bonificación manual quita la línea
-- ---------------------------------------------------------------------

-- Se reescribe la función entera porque el cambio cae dentro de su cuerpo;
-- el resto es idéntico a 1008, salvo que al aprobar se marca el origen del
-- precio (la columna no existía cuando se escribió esa versión).
create or replace function pedidos.decide_approval_request(
  p_request_id uuid,
  p_decision text,
  p_precio_aprobado numeric,
  p_comentario text
)
returns void
language plpgsql
security definer
set search_path to 'pedidos', 'public'
as $function$
declare
  v_order_id uuid;
  v_item_id uuid;
  v_precio_solicitado numeric;
  v_porcentaje numeric;
  v_item record;
  v_precio_efectivo numeric;
  v_igv numeric;
  v_subtotal numeric;
  v_total numeric;
begin
  if not (pedidos.is_admin() or pedidos.has_role('aprobador_comercial')) then
    raise exception 'Rol no autorizado para decidir solicitudes de descuento';
  end if;

  select order_id, order_item_id, precio_solicitado, porcentaje_descuento
    into v_order_id, v_item_id, v_precio_solicitado, v_porcentaje
  from pedidos.approval_requests
  where id = p_request_id and estado = 'PENDIENTE'
  for update;

  if v_order_id is null then
    raise exception 'Solicitud % no existe o ya fue resuelta', p_request_id;
  end if;

  select * into v_item from pedidos.order_items where id = v_item_id;

  if p_decision in ('APROBAR', 'APROBAR_OTRO_PRECIO') then

    if p_decision = 'APROBAR_OTRO_PRECIO' then
      if p_precio_aprobado is null then
        raise exception 'APROBAR_OTRO_PRECIO requiere un precio aprobado';
      end if;
      v_precio_efectivo := p_precio_aprobado;
    elsif v_precio_solicitado is not null then
      v_precio_efectivo := v_precio_solicitado;
    elsif v_porcentaje is not null then
      v_precio_efectivo := round(v_item.precio_unitario * (1 - v_porcentaje / 100), 4);
    else
      raise exception 'La solicitud % no indica precio ni porcentaje: no hay nada que aprobar', p_request_id;
    end if;

    -- El precio efectivo viene con IGV incluido, igual que el de lista.
    v_total := round(v_item.cantidad * v_precio_efectivo, 2);
    v_subtotal := case when v_item.afectacion_tributaria = 'GRAVADO'
                       then round(v_total / (1 + v_item.tasa_igv / 100), 2)
                       else v_total end;
    v_igv := round(v_total - v_subtotal, 2);

    update pedidos.order_items set
      precio_unitario = v_precio_efectivo,
      -- De dónde viene el precio, ahora que la columna existe (1017). Una
      -- línea gratis conserva su origen: aprobar una bonificación manual no
      -- la convierte en un descuento negociado, la confirma.
      origen_precio = case when v_item.es_linea_gratis then v_item.origen_precio
                           else 'APROBACION_COMERCIAL' end,
      subtotal = v_subtotal,
      igv = v_igv,
      total = v_total,
      updated_at = now()
    where id = v_item_id;

    insert into pedidos.approval_decisions
      (approval_request_id, decidido_por, decision, precio_aprobado, comentario)
    values (p_request_id, auth.uid(), p_decision, v_precio_efectivo, p_comentario);

    update pedidos.approval_requests set estado = 'RESUELTO' where id = p_request_id;

    perform pedidos.reevaluate_order(v_order_id, 'Solicitud de descuento aprobada');

  elsif p_decision = 'RECHAZAR' then
    insert into pedidos.approval_decisions
      (approval_request_id, decidido_por, decision, precio_aprobado, comentario)
    values (p_request_id, auth.uid(), p_decision, null, p_comentario);

    update pedidos.approval_requests set estado = 'RESUELTO' where id = p_request_id;
    perform pedidos.apply_order_transition(
      v_order_id, 'DRAFT',
      'Solicitud de descuento rechazada: ' || coalesce(p_comentario, ''));

    -- Rechazar una bonificación manual QUITA la línea. Dejarla al precio de
    -- lista sería cobrar unidades que el cliente aceptó como regalo, y
    -- dejarla gratis sería aprobar lo que se acaba de negar. La solicitud y
    -- su decisión caen por cascada con la línea, así que el registro que
    -- sobrevive es este audit log.
    if v_item.origen_precio = 'BONIFICACION_MANUAL' then
      insert into pedidos.audit_logs (actor, accion, entidad, entidad_id, datos_antes, datos_despues)
      values (
        auth.uid(), 'rechazar_bonificacion_manual', 'order_items', v_item_id::text,
        jsonb_build_object(
          'orderId', v_order_id,
          'productId', v_item.product_id,
          'cantidad', v_item.cantidad,
          'precioLista', v_item.precio_lista_original,
          'motivoDelVendedor', v_item.motivo_precio_especial,
          'solicitudId', p_request_id),
        jsonb_build_object('lineaEliminada', true, 'comentario', p_comentario));

      delete from pedidos.order_items where id = v_item_id;
    end if;

  else
    -- SOLICITAR_INFO: no cambia el estado de nada; services/approvals.ts
    -- agrega el order_observations correspondiente por su cuenta.
    insert into pedidos.approval_decisions
      (approval_request_id, decidido_por, decision, precio_aprobado, comentario)
    values (p_request_id, auth.uid(), p_decision, p_precio_aprobado, p_comentario);
  end if;
end;
$function$;
