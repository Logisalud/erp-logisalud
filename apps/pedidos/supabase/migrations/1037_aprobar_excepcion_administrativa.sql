-- Aprobar una excepción administrativa no aprobaba nada.
--
-- El botón "Aprobar" de la bandeja llamaba a `reevaluate_order`, que
-- RECALCULA el estado con la misma regla que frenó el pedido. Como la
-- condición de pago del pedido sigue siendo distinta de la habitual del
-- cliente —aprobar no cambia ese dato—, la función volvía a devolver
-- ADMINISTRATIVE_EXCEPTION y el pedido regresaba a la bandeja. Aprobar era
-- un bucle: quedaba registrado en el historial y no pasaba nada.
--
-- Se vio en producción el 2026-09-21: el pedido #68 (INVERSIONES BIOFAR)
-- tiene TRES transiciones con motivo "Excepción administrativa aprobada" y
-- seguía frenado; el #72 (V & V SALUD), una. Ninguno de los dos llegó nunca
-- a operaciones, y por eso tampoco salió el correo.
--
-- Son dos errores, y los dos se arreglan acá:
--
--   1. Aprobar tiene que DECIDIR, no volver a evaluar. La decisión se
--      guarda en el pedido y `reevaluate_order` la respeta.
--   2. Al liberarse, el pedido tiene que avisar por correo. Antes no
--      avisaba nada: el aviso de "pedido enviado" había salido al enviarlo,
--      cuando el pedido justamente NO iba a operaciones.
--
-- Lo que NO cambia acá: la regla de cuándo se frena un pedido. Eso es otra
-- conversación (comparar días en vez de igualdad) y va aparte.

begin;

-- ---------------------------------------------------------------------
-- 1. La decisión humana queda guardada en el pedido
-- ---------------------------------------------------------------------
--
-- Quién y cuándo, no un booleano: hace falta para auditar y es lo que uno
-- quiere ver cuando pregunta "¿por qué este pedido salió con 30 días si el
-- cliente tiene 60 aprobados?".

alter table pedidos.orders
  add column if not exists excepcion_administrativa_aprobada_por uuid references auth.users(id),
  add column if not exists excepcion_administrativa_aprobada_en timestamptz;

comment on column pedidos.orders.excepcion_administrativa_aprobada_por is
  'Quién aprobó la excepción administrativa. Mientras esté puesto, reevaluate_order NO vuelve a comparar la condición de pago contra la habitual del cliente: la decisión de una persona le gana a la regla automática.';

-- El aviso de que el pedido se liberó es un tipo de notificación nuevo.
alter table pedidos.notification_logs drop constraint if exists notification_logs_tipo_check;
alter table pedidos.notification_logs add constraint notification_logs_tipo_check
  check (tipo = any (array[
    'pedido_enviado', 'descuento_solicitado', 'descuento_resuelto',
    'observacion_agregada', 'cliente_aprobado', 'cliente_rechazado',
    'excepcion_administrativa_resuelta'
  ]));

-- ---------------------------------------------------------------------
-- 2. Las dos funciones de estado
-- ---------------------------------------------------------------------
--
-- Igual que en 1036: el cuerpo se copió de producción y se verificó por
-- md5 antes de tocarlo. En `submit_order` lo único que cambia es que
-- limpia la aprobación anterior; en `reevaluate_order`, que la respeta.

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

  if v_customer.estado = 'PENDIENTE_DE_VALIDACION' then
    v_estado_resultado := 'NEW_CUSTOMER_VALIDATION';
  elsif v_order.dias_credito_solicitados is not null then
    v_estado_resultado := 'ADMINISTRATIVE_EXCEPTION';
  -- Contado no se compara contra la condicion habitual: pagar contra
  -- entrega nunca es pedir una concesion. Ver el comentario de arriba.
  elsif pedidos.es_contado(v_order.payment_terms_id) then
    v_estado_resultado := 'SIN_EXCEPCION_ADMINISTRATIVA';
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

  -- Contado igual pasa por el control comercial: un descuento pedido sobre
  -- un pedido de contado sigue necesitando que alguien lo apruebe.
  if v_estado_resultado = 'SIN_EXCEPCION_ADMINISTRATIVA' then
    if exists (
      select 1 from pedidos.approval_requests ar
      join pedidos.order_items oi on oi.id = ar.order_item_id
      where oi.order_id = p_order_id and ar.estado = 'PENDIENTE'
    ) then
      v_estado_resultado := 'COMMERCIAL_EXCEPTION';
    else
      v_estado_resultado := 'READY_FOR_OPERATIONS';
    end if;
  end if;

  perform pedidos.apply_order_transition(p_order_id, v_estado_resultado, 'Validacion automatica');

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
begin
  if not (pedidos.is_admin() or pedidos.has_role('control_pedidos') or pedidos.has_role('aprobador_comercial')) then
    raise exception 'No autorizado para reevaluar pedidos';
  end if;

  select * into v_order from pedidos.orders where id = p_order_id for update;
  if v_order is null then
    raise exception 'Pedido % no existe', p_order_id;
  end if;
  select * into v_customer from pedidos.customers where id = v_order.customer_id;

  if v_customer.estado = 'PENDIENTE_DE_VALIDACION' then
    v_estado_resultado := 'NEW_CUSTOMER_VALIDATION';
  -- Mismo criterio que submit_order: contado nunca es excepción.
  elsif pedidos.es_contado(v_order.payment_terms_id) then
    v_estado_resultado := case
      when exists (
        select 1 from pedidos.approval_requests ar
        join pedidos.order_items oi on oi.id = ar.order_item_id
        where oi.order_id = p_order_id and ar.estado = 'PENDIENTE'
      ) then 'COMMERCIAL_EXCEPTION'
      else 'READY_FOR_OPERATIONS'
    end;
  -- Sin habitual tampoco hay excepción: no hay contra qué comparar.
  -- Si una persona ya aprobo la excepcion, NO se vuelve a evaluar la
  -- condicion de pago: aprobar es decidir, y recalcular la regla encima
  -- borraba esa decision y devolvia el pedido a la bandeja.
  elsif v_order.excepcion_administrativa_aprobada_por is null
        and v_customer.condicion_pago_habitual_id is not null
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

  perform pedidos.apply_order_transition(p_order_id, v_estado_resultado, p_motivo);
  return v_estado_resultado;
end;
$fn$;

-- ---------------------------------------------------------------------
-- 3. Aprobar, en una sola operación
-- ---------------------------------------------------------------------
--
-- Marcar la aprobación y reevaluar tienen que pasar juntos o no pasar: si
-- se hicieran en dos llamadas desde la aplicación y la segunda fallara, el
-- pedido quedaría marcado como aprobado pero seguiría frenado, que es
-- exactamente el estado confuso del que venimos.
--
-- Reevaluar DESPUÉS de marcar no es lo mismo que antes: ahora la función
-- ya no mira la condición de pago, así que el pedido cae donde
-- corresponda por lo demás — a operaciones si no hay nada más pendiente, a
-- excepción comercial si quedó un descuento sin resolver, o a validación
-- si el cliente todavía no está validado. Aprobar el plazo no aprueba esas
-- otras cosas.

create or replace function pedidos.approve_administrative_exception(
  p_order_id uuid, p_motivo text)
returns text
language plpgsql
security definer
set search_path = pedidos, public
as $fn$
declare
  v_estado text;
begin
  if not (pedidos.is_admin() or pedidos.has_role('control_pedidos')) then
    raise exception 'No autorizado para aprobar excepciones administrativas';
  end if;

  if not exists (
    select 1 from pedidos.orders
     where id = p_order_id and estado = 'ADMINISTRATIVE_EXCEPTION'
  ) then
    raise exception 'El pedido no está en excepción administrativa';
  end if;

  update pedidos.orders
     set excepcion_administrativa_aprobada_por = auth.uid(),
         excepcion_administrativa_aprobada_en = now(),
         updated_at = now()
   where id = p_order_id;

  v_estado := pedidos.reevaluate_order(p_order_id, p_motivo);

  -- Con la aprobación puesta, volver a caer en excepción administrativa
  -- sería el bucle de antes. Preferimos que reviente y se vea.
  if v_estado = 'ADMINISTRATIVE_EXCEPTION' then
    raise exception 'La aprobación no liberó el pedido %; revisar reevaluate_order', p_order_id;
  end if;

  return v_estado;
end;
$fn$;

comment on function pedidos.approve_administrative_exception(uuid, text) is
  'Aprueba la excepción administrativa de un pedido: deja registrada la decisión y recalcula el estado sin volver a comparar la condición de pago.';

revoke all on function pedidos.approve_administrative_exception(uuid, text) from public;
grant execute on function pedidos.approve_administrative_exception(uuid, text) to authenticated;

commit;
