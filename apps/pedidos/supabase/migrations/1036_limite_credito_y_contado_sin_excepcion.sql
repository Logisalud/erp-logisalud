-- Tres cambios que van juntos porque los tres salen de la carga de la
-- Nueva Cartera Setiembre 2026:
--
--   1. `customers.limite_credito`, informativo.
--   2. Contado deja de disparar excepción administrativa.
--   3. Default de condición y límite para los clientes nuevos.
--
-- El 2 es la condición para que el 3 no duela: hasta hoy la regla de
-- excepción administrativa no se disparaba nunca, porque 3.399 de los
-- 3.419 clientes tenían la condición habitual en NULL. En cuanto la
-- cartera trae condición para 3.249, la regla empieza a disparar de
-- verdad — y sin el cambio 2 la mayor parte de lo que frenaría serían
-- pedidos de contado, que es justo lo que no hay que frenar.

begin;

-- ---------------------------------------------------------------------
-- 1. Límite de crédito (informativo)
-- ---------------------------------------------------------------------
--
-- OJO con el nombre: la columna se llama `limite_credito`, pero el número
-- que se carga acá NO es un límite de crédito aprobado. Es el promedio de
-- compra histórico que vino en el archivo de cartera, y nadie en LOGISALUD
-- confirmó que sea un tope autorizado.
--
-- Por eso es **puramente informativa**: no hay check, no hay trigger, y
-- `submit_order` no la mira. Un pedido que se pase de este número entra
-- igual. El día que Administración defina límites de verdad, esa será otra
-- decisión con su regla escrita. En pantalla se muestra con la etiqueta
-- completa "Promedio de compra (no confirmado como límite de crédito)",
-- para que nadie la lea como una autorización.

alter table pedidos.customers
  add column if not exists limite_credito numeric(12,2);

comment on column pedidos.customers.limite_credito is
  'Promedio de compra histórico traído del archivo de cartera. NO es un límite de crédito aprobado y ninguna regla lo valida: es informativo.';

-- ---------------------------------------------------------------------
-- 2. Contado nunca es excepción administrativa
-- ---------------------------------------------------------------------
--
-- La excepción administrativa existe para frenar cuando se da MÁS crédito
-- o MÁS plazo del aprobado. Contado es lo contrario: el cliente paga
-- contra entrega, que es la opción de menor riesgo que existe para la
-- empresa. Frenar un pedido de contado porque el cliente "normalmente"
-- compra a 30 días es hacer cola por una concesión a favor nuestro.
--
-- Medido sobre los 69 pedidos reales de la primera semana: con la cartera
-- cargada y sin esta regla, 37 caerían en excepción administrativa; con
-- ella, 15. Los 22 que se salvan son todos de contado.
--
-- Sigue siendo excepción cualquier otra condición que no calce con la
-- habitual (pedir Crédito 60 a un cliente aprobado a 30), y siguen
-- siéndolo los días de crédito escritos a mano.
--
-- Lo único que cambia en las dos funciones es esa rama; el resto del
-- cuerpo se copió tal cual de producción (md5 655ed996… verificado antes
-- de tocarlo) para no reintroducir una versión vieja por accidente.

create or replace function pedidos.es_contado(p_payment_terms_id smallint)
returns boolean
language sql
stable
security definer
set search_path = pedidos, public
as $fn$
  select exists (
    select 1 from pedidos.payment_terms
     where id = p_payment_terms_id and nombre = 'Contado'
  );
$fn$;

comment on function pedidos.es_contado(smallint) is
  'Contado se reconoce por nombre y no por id fijo: que hoy sea el id 1 es un dato del catálogo, no parte de la regla.';

grant execute on function pedidos.es_contado(smallint) to authenticated;

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

  perform pedidos.apply_order_transition(p_order_id, v_estado_resultado, p_motivo);
  return v_estado_resultado;
end;
$fn$;

-- ---------------------------------------------------------------------
-- 3. Default para los clientes nuevos
-- ---------------------------------------------------------------------
--
-- Hasta hoy un cliente registrado por un vendedor nacía sin condición
-- habitual, y por eso cualquier condición que pidiera pasaba derecho.
-- Ahora nace con Crédito 30 días y S/ 1.500. El 1.500 es el TOPE de la
-- categoría "Farmacias y Boticas" de la tabla de referencia (ver
-- docs/business-rules.md), no el piso: un alta hecha por un vendedor es
-- casi siempre una farmacia, y arrancar en el piso obligaba a corregir a
-- mano casi todos los casos.
--
-- El default va en la columna y no en la aplicación para que valga
-- también para los insert que no pasan por la pantalla de alta. El id de
-- la condición se resuelve por nombre, no se escribe a mano.
--
-- Esto NO toca a los 3.419 clientes que ya existen: un default sólo
-- aplica a filas nuevas.

do $do$
declare
  v_credito_30 smallint;
begin
  select id into v_credito_30 from pedidos.payment_terms where nombre = 'Crédito 30 días';
  if v_credito_30 is null then
    raise exception 'No existe la condición de pago "Crédito 30 días"';
  end if;
  execute format(
    'alter table pedidos.customers alter column condicion_pago_habitual_id set default %L::smallint',
    v_credito_30);
end
$do$;

alter table pedidos.customers
  alter column limite_credito set default 1500;

commit;
