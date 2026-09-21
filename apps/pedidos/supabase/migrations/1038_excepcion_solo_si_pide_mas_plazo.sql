-- La excepción administrativa se dispara sólo si se pide MÁS plazo.
--
-- Hasta acá la regla comparaba por igualdad: cualquier condición distinta
-- de la habitual frenaba el pedido. Eso frenaba también al vendedor que
-- pedía MENOS plazo del aprobado —Crédito 30 a un cliente habilitado a
-- 60—, que es una concesión a favor de la empresa y no algo que haya que
-- autorizar. Dos de esos casos (pedidos #68 y #72) fueron los que
-- destaparon además el bug de la bandeja que arregló 1037.
--
-- La regla queda: **excepción sólo si los días de plazo del pedido son
-- MÁS que los de la condición habitual del cliente.** Menos o iguales,
-- pasa derecho.
--
-- Medido sobre los 80 pedidos reales del 2026-09-21: con la regla vieja
-- 17 caían en excepción, con esta 9. Los 8 que se liberan piden todos
-- menos plazo del aprobado; no aparece ninguna excepción nueva.
--
-- La regla de contado de 1036 desaparece como caso especial, y el código
-- queda más corto: contado son 0 días, y 0 nunca es mayor que nada. La
-- función `pedidos.es_contado()` se deja creada porque está documentada y
-- con tests, pero las dos funciones de estado ya no la usan.

begin;

-- ---------------------------------------------------------------------
-- 1. Cuántos días es cada condición
-- ---------------------------------------------------------------------
--
-- Para comparar "más que" hace falta un número, y hasta ahora los días
-- sólo existían dentro del nombre ("Crédito 30 días"). Deducirlos con una
-- expresión regular sobre el nombre se rompe el día que alguien renombre
-- una fila del catálogo, así que van en su propia columna.
--
--   Contado ................................  0 días
--   Crédito 30 / 45 / 60 / 90 / 120 días ...  30 / 45 / 60 / 90 / 120
--   Crédito (otro número de días) ..........  NULL (lo trae el pedido)
--
-- La última es NULL a propósito: no tiene un plazo fijo, el número lo
-- escribe el vendedor en `orders.dias_credito_solicitados`.

alter table pedidos.payment_terms
  add column if not exists dias_equivalentes smallint;

update pedidos.payment_terms set dias_equivalentes = 0
 where nombre = 'Contado' and dias_equivalentes is distinct from 0;

update pedidos.payment_terms
   set dias_equivalentes = (regexp_match(nombre, '(\d+)'))[1]::smallint
 where nombre ~ '\d' and not permite_dias_libres
   and dias_equivalentes is distinct from (regexp_match(nombre, '(\d+)'))[1]::smallint;

comment on column pedidos.payment_terms.dias_equivalentes is
  'Días de plazo de la condición, para poder compararlas entre sí. Contado = 0. NULL en la condición de días libres: ese número lo trae cada pedido en orders.dias_credito_solicitados.';

-- ---------------------------------------------------------------------
-- 2. Los días que pide un pedido
-- ---------------------------------------------------------------------
--
-- El número escrito a mano GANA sobre el del catálogo cuando está
-- presente: es la expresión más específica de lo que se pidió. Hoy la UI
-- sólo lo ofrece junto con la condición de días libres (que no tiene días
-- propios), así que en la práctica no compiten; la precedencia está
-- definida para que un dato contradictorio no se resuelva por accidente.
--
-- Decisión explícita del usuario (opción A, 2026-09-21): los días
-- escritos a mano **se comparan por número** como cualquier otra
-- condición. "Crédito 15 a mano" a un cliente de 30 días pasa derecho.
-- Antes, cualquier número a mano caía en excepción sin comparar.

create or replace function pedidos.dias_de_condicion(
  p_payment_terms_id smallint, p_dias_a_mano smallint)
returns int
language sql
stable
security definer
set search_path = pedidos, public
as $fn$
  select coalesce(
    p_dias_a_mano::int,
    (select dias_equivalentes::int from pedidos.payment_terms where id = p_payment_terms_id)
  );
$fn$;

comment on function pedidos.dias_de_condicion(smallint, smallint) is
  'Días de plazo de una condición de pago, con el número escrito a mano ganando sobre el del catálogo.';

grant execute on function pedidos.dias_de_condicion(smallint, smallint) to authenticated;

-- ---------------------------------------------------------------------
-- 3. Las dos funciones de estado
-- ---------------------------------------------------------------------
--
-- Igual que en 1036 y 1037: cuerpo copiado de produccion, verificado por
-- md5 antes de tocarlo. Cambia el bloque de decision y el motivo, que
-- ahora dice cuantos dias se pidieron contra cuantos hay aprobados en vez
-- de un generico 'Validacion automatica'.

create or replace function pedidos.submit_order(p_order_id uuid, p_motivo text)
returns jsonb
language plpgsql
security definer
set search_path = pedidos, public
as $fn$
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
  v_dias_pedido int;
  v_dias_habitual int;
  v_motivo text := 'Validacion automatica';
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
    -- La linea gratis la genera el motor de promociones o la marca una
    -- persona: refrescarle el precio de lista seria cobrarla.
    if v_item.es_linea_gratis then
      continue;
    end if;

    select pli.precio into v_precio_lista
    from pedidos.price_list_items pli
    where pli.product_id = v_item.product_id
      and pli.sales_channel_id = v_customer.canal_id
      and pli.vigente_hasta is null;

    -- Una bonificacion se entrega gratis y casi nunca tiene precio propio en
    -- la lista del canal. Antes de este cambio, el envio entero reventaba
    -- por una linea de bonificacion cargada a mano: aca vale S/ 0.00
    -- explicito. Para cualquier otro producto, sin precio no hay pedido.
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

    -- Un precio que fijo el administrador se respeta: es una decision, no
    -- un borrador desactualizado. Igual se refresca el precio de lista de
    -- referencia, para que el correo y el Excel comparen contra el vigente.
    if v_item.precio_fijado_por_admin then
      v_precio := v_item.precio_unitario;
    else
      v_precio := v_precio_lista;
      -- Una linea con promocion no "cambio de precio": vale menos porque
      -- el motor se lo bajo, y en dos lineas mas se lo va a volver a
      -- bajar. Solo se compara contra el precio que el vendedor vio.
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

  -- Una bonificacion manual es un descuento del 100%: mas grande que
  -- cualquier precio especial. Si la marco un vendedor, pasa por el mismo
  -- control -una solicitud por linea- y el pedido no avanza hasta que
  -- alguien decida. Si la marco un administrador, se aplica directo: es la
  -- misma autoridad que ya tiene para fijar precio.
  --
  -- La solicitud se crea aca, en el envio, y no al marcar la linea: hasta
  -- que el pedido no se envia no hay nada que aprobar, y el vendedor puede
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

  -- Las promociones del catalogo, sobre los precios ya refrescados. El
  -- pedido sigue en DRAFT: el motor inserta y borra lineas.
  perform pedidos.aplicar_promociones(p_order_id);

  update pedidos.orders set
    -- Un pedido que vuelve a borrador y se reenvia se juzga desde cero: la
    -- aprobacion anterior era sobre el pedido anterior.
    excepcion_administrativa_aprobada_por = null,
    excepcion_administrativa_aprobada_en = null,
    razon_social_snapshot = v_customer.razon_social,
    direccion_snapshot = (select direccion from pedidos.customer_addresses where id = v_order.customer_address_id),
    ubigeo_snapshot = (select ubigeo from pedidos.customer_addresses where id = v_order.customer_address_id),
    canal_snapshot = (select nombre from pedidos.sales_channels where id = v_customer.canal_id),
    zona_snapshot = (select nombre from pedidos.zones where id = v_customer.zona_id),
    vendedor_snapshot = (select nombre_completo from pedidos.sellers where id = v_order.seller_id)
  where id = p_order_id;

  perform pedidos.apply_order_transition(p_order_id, 'SUBMITTED', p_motivo);

  -- Dias de plazo, para poder comparar "mas" y no solo "distinto".
  v_dias_pedido := pedidos.dias_de_condicion(
    v_order.payment_terms_id, v_order.dias_credito_solicitados);
  v_dias_habitual := pedidos.dias_de_condicion(
    v_customer.condicion_pago_habitual_id, null);

  if v_customer.estado = 'PENDIENTE_DE_VALIDACION' then
    v_estado_resultado := 'NEW_CUSTOMER_VALIDATION';
  -- Excepcion administrativa SOLO si se pide MAS plazo del aprobado.
  -- Pedir menos -o contado, que son 0 dias- nunca frena un pedido: es una
  -- concesion a favor de la empresa. Ver docs/business-rules.md.
  elsif v_dias_habitual is not null
        and v_dias_pedido is not null
        and v_dias_pedido > v_dias_habitual then
    v_estado_resultado := 'ADMINISTRATIVE_EXCEPTION';
    v_motivo := format('Pide %s dias de plazo y el cliente tiene %s aprobados',
                       v_dias_pedido, v_dias_habitual);
  -- Una condicion sin dias conocidos no se puede verificar: la mira una
  -- persona en vez de pasar por no poder compararla.
  elsif v_dias_habitual is not null and v_dias_pedido is null then
    v_estado_resultado := 'ADMINISTRATIVE_EXCEPTION';
    v_motivo := 'No se pudo determinar cuantos dias de plazo pide el pedido';
  elsif exists (
    select 1 from pedidos.approval_requests ar
    join pedidos.order_items oi on oi.id = ar.order_item_id
    where oi.order_id = p_order_id and ar.estado = 'PENDIENTE'
  ) then
    v_estado_resultado := 'COMMERCIAL_EXCEPTION';
    v_motivo := 'Queda un descuento por aprobar';
  else
    v_estado_resultado := 'READY_FOR_OPERATIONS';
  end if;

  perform pedidos.apply_order_transition(p_order_id, v_estado_resultado, v_motivo);

  return jsonb_build_object('estadoResultado', v_estado_resultado, 'priceDrift', v_drift);
end;
$fn$;

create or replace function pedidos.reevaluate_order(p_order_id uuid, p_motivo text)
returns text
language plpgsql
security definer
set search_path = pedidos, public
as $fn$
declare
  v_order record;
  v_customer record;
  v_estado_resultado text;
  v_dias_pedido int;
  v_dias_habitual int;
  v_motivo text := 'Validacion automatica';
begin
  if not (pedidos.is_admin() or pedidos.has_role('control_pedidos') or pedidos.has_role('aprobador_comercial')) then
    raise exception 'No autorizado para reevaluar pedidos';
  end if;

  select * into v_order from pedidos.orders where id = p_order_id for update;
  if v_order is null then
    raise exception 'Pedido % no existe', p_order_id;
  end if;
  select * into v_customer from pedidos.customers where id = v_order.customer_id;

  -- Dias de plazo, para poder comparar "mas" y no solo "distinto".
  v_dias_pedido := pedidos.dias_de_condicion(
    v_order.payment_terms_id, v_order.dias_credito_solicitados);
  v_dias_habitual := pedidos.dias_de_condicion(
    v_customer.condicion_pago_habitual_id, null);

  if v_customer.estado = 'PENDIENTE_DE_VALIDACION' then
    v_estado_resultado := 'NEW_CUSTOMER_VALIDATION';
  -- Excepcion administrativa SOLO si se pide MAS plazo del aprobado.
  -- Pedir menos -o contado, que son 0 dias- nunca frena un pedido: es una
  -- concesion a favor de la empresa. Ver docs/business-rules.md.
  elsif v_order.excepcion_administrativa_aprobada_por is null
        and v_dias_habitual is not null
        and v_dias_pedido is not null
        and v_dias_pedido > v_dias_habitual then
    v_estado_resultado := 'ADMINISTRATIVE_EXCEPTION';
    v_motivo := format('Pide %s dias de plazo y el cliente tiene %s aprobados',
                       v_dias_pedido, v_dias_habitual);
  -- Una condicion sin dias conocidos no se puede verificar: la mira una
  -- persona en vez de pasar por no poder compararla.
  elsif v_order.excepcion_administrativa_aprobada_por is null
        and v_dias_habitual is not null and v_dias_pedido is null then
    v_estado_resultado := 'ADMINISTRATIVE_EXCEPTION';
    v_motivo := 'No se pudo determinar cuantos dias de plazo pide el pedido';
  elsif exists (
    select 1 from pedidos.approval_requests ar
    join pedidos.order_items oi on oi.id = ar.order_item_id
    where oi.order_id = p_order_id and ar.estado = 'PENDIENTE'
  ) then
    v_estado_resultado := 'COMMERCIAL_EXCEPTION';
    v_motivo := 'Queda un descuento por aprobar';
  else
    v_estado_resultado := 'READY_FOR_OPERATIONS';
  end if;

  perform pedidos.apply_order_transition(p_order_id, v_estado_resultado, coalesce(p_motivo, v_motivo));
  return v_estado_resultado;
end;
$fn$;

commit;
