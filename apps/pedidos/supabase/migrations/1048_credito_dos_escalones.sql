-- 1048 — El crédito del cliente, en dos escalones.
--
-- La 1047 dejó un solo umbral y un solo desenlace: pasada la tolerancia, el
-- pedido iba a aprobación comercial. Administración pidió separar dos casos
-- que no son el mismo:
--
--   * De 31 a 59 días de atraso — el pedido pasa, pero frenado y con la
--     deuda escrita en el correo, como un descuento que hay que aprobar.
--   * Desde 60 — el pedido no se envía. Ni bandeja, ni aprobación: a ese
--     cliente no se le vende a crédito hasta que regularice.
--
-- Y arregla un agujero que apareció con el pedido #445 (GRUPO BARIZAL,
-- 2026-10-30): la regla de crédito colgaba del último `else` de la cadena
-- de decisión de `submit_order`, así que un pedido ya detenido por otra
-- razón —un descuento, un plazo— nunca llegaba a mirarse la deuda. El #445
-- salió a aprobación comercial por un precio especial sin que el correo ni
-- la pantalla dijeran que el cliente debía S/ 719,99 de hacía 78 días; y
-- peor, al aprobar el descuento `reevaluate_order` tampoco lo miraba,
-- porque solo buscaba una fila de bloqueo que nunca se había creado. Se
-- habría despachado sin que nadie viera la deuda en ningún punto del
-- circuito.
--
-- Acá las dos miradas se hacen siempre, y el aviso se suma al motivo que ya
-- hubiera en vez de pisarlo.

-- ---------------------------------------------------------------------
-- 1. El segundo umbral
-- ---------------------------------------------------------------------
alter table pedidos.credito_config
  add column if not exists dias_bloqueo integer not null default 60;

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'pedidos.credito_config'::regclass
       and conname = 'credito_config_dias_bloqueo_check'
  ) then
    -- El tope duro nunca puede quedar por debajo del blando: si lo
    -- estuviera, el escalón de alerta no existiría y todo saltaría directo
    -- al bloqueo sin que nadie lo hubiera pedido.
    alter table pedidos.credito_config
      add constraint credito_config_dias_bloqueo_check
      check (dias_bloqueo >= dias_tolerancia);
  end if;
end
$$;

comment on column pedidos.credito_config.dias_bloqueo is
  'Desde este atraso el pedido a crédito no se puede enviar. Entre '
  'dias_tolerancia y este número el pedido pasa pero queda esperando '
  'aprobación comercial.';

-- ---------------------------------------------------------------------
-- 2. La pregunta, ahora con tres respuestas
-- ---------------------------------------------------------------------
-- Un cliente sin fila en `credito_clientes` sigue sin frenarse: puede ser
-- un cliente nuevo, o uno que nunca compró a crédito. Frenar por falta de
-- dato sería frenar ventas por una copia incompleta.
--
-- `>` para la alerta (el que está exactamente en la tolerancia todavía
-- pasa, como hasta hoy) y `>=` para el bloqueo: Administración lo pidió
-- como "a partir de 60 días".
create or replace function pedidos.credito_nivel(p_ruc text)
returns text
language sql
stable
security definer
set search_path = pedidos, public
as $fn$
  select coalesce(
    (select case
              when not cfg.activo              then 'ninguno'
              when coalesce(c.vencido, 0) <= 0 then 'ninguno'
              when c.dias_atraso >= cfg.dias_bloqueo    then 'bloqueo'
              when c.dias_atraso >  cfg.dias_tolerancia then 'alerta'
              else 'ninguno'
            end
     from pedidos.credito_config cfg
     left join pedidos.credito_clientes c on c.ruc = p_ruc
     where cfg.id = 1),
    'ninguno');
$fn$;

comment on function pedidos.credito_nivel(text) is
  'ninguno | alerta (pasa frenado, lo decide una persona) | bloqueo (no se envía).';

-- La vieja queda como sinónimo de "alguno de los dos escalones": la usan
-- la pantalla del vendedor y el panel de administración, y seguir
-- contestando lo mismo que antes ahorra tocarlas en esta migración.
create or replace function pedidos.credito_bloquea(p_ruc text)
returns boolean
language sql
stable
security definer
set search_path = pedidos, public
as $fn$
  select pedidos.credito_nivel(p_ruc) in ('alerta', 'bloqueo');
$fn$;

-- ---------------------------------------------------------------------
-- 3. La regla dentro de submit_order
-- ---------------------------------------------------------------------
-- Mismo idioma que la 1040 y la 1047: se parte de pg_get_functiondef para
-- conservar firma y atributos, se verifica que el bloque esperado siga
-- ahí, y se reemplaza.

do $migracion$
declare
  v_def text;
  v_viejo constant text :=
$viejo$  -- Crédito del cliente. Si arrastra deuda vencida más allá de la
  -- tolerancia, el pedido no sale: va a aprobación comercial, igual que un
  -- descuento. No se pierde la venta, la decide una persona.
  --
  -- Contado queda afuera a propósito: pagar contra entrega no agranda la
  -- deuda, así que frenarlo sería castigar al cliente que sí viene a
  -- ponerse al día. Mismo criterio que la excepción administrativa.
  if v_estado_resultado = 'READY_FOR_OPERATIONS'
     and not pedidos.es_contado(v_order.payment_terms_id)
     and pedidos.credito_bloquea(v_customer.ruc_o_documento) then
    insert into pedidos.bloqueos_credito (order_id, ruc, saldo, vencido, dias_atraso)
    select p_order_id, c.ruc, c.saldo, c.vencido, c.dias_atraso
      from pedidos.credito_clientes c
     where c.ruc = v_customer.ruc_o_documento
    on conflict (order_id) do nothing;

    -- El motivo viaja con los números concretos: el correo que le llega al
    -- vendedor dice cuánto debe y hace cuánto, no "revisá su cuenta".
    select format('Deuda vencida de S/ %s con %s días de atraso',
                  to_char(c.vencido, 'FM9999999990.00'), c.dias_atraso)
      into v_motivo
      from pedidos.credito_clientes c
     where c.ruc = v_customer.ruc_o_documento;

    v_estado_resultado := 'COMMERCIAL_EXCEPTION';
  end if;

  perform pedidos.apply_order_transition(p_order_id, v_estado_resultado, v_motivo);
$viejo$;
  v_nuevo constant text :=
$nuevo$  -- Crédito del cliente, en dos escalones.
  --
  -- Hasta los días de tolerancia (30) el pedido pasa, pero frenado: cae en
  -- Aprobaciones comerciales igual que un descuento, y la deuda viaja en
  -- el motivo —y por lo tanto en el correo— para que quien decida vea las
  -- dos cosas de una.
  --
  -- Desde los días de bloqueo (60) el pedido no se envía. No hay bandeja
  -- ni aprobación posible: la decisión ya está tomada, y es que a ese
  -- cliente no se le vende a crédito hasta que regularice. Se levanta
  -- pagando, no aprobando.
  --
  -- Las dos miradas se hacen SIEMPRE, no solo cuando el pedido iba a salir
  -- limpio. Antes colgaban del `else` de la cadena de arriba, así que un
  -- pedido ya detenido por otra cosa nunca llegaba a mirarse la deuda: el
  -- #445 de GRUPO BARIZAL fue a aprobación comercial por un descuento sin
  -- que el correo dijera que el cliente debía S/ 719,99 de hacía 78 días.
  --
  -- Contado queda afuera a propósito: pagar contra entrega no agranda la
  -- deuda, así que frenarlo sería castigar al cliente que sí viene a
  -- ponerse al día. Mismo criterio que la excepción administrativa.
  if not pedidos.es_contado(v_order.payment_terms_id)
     and pedidos.credito_nivel(v_customer.ruc_o_documento) = 'bloqueo' then
    raise exception using
      errcode = 'P0001',
      message = (
        select format(
          'El pedido no se puede enviar: %s tiene S/ %s vencidos con %s días de atraso. Desde %s días de atraso no se vende a crédito — hay que regularizar la deuda con Cobranzas.',
          coalesce(c.razon_social, c.ruc),
          to_char(c.vencido, 'FM9999999990.00'), c.dias_atraso, cfg.dias_bloqueo)
          from pedidos.credito_clientes c, pedidos.credito_config cfg
         where c.ruc = v_customer.ruc_o_documento and cfg.id = 1);
  end if;

  if not pedidos.es_contado(v_order.payment_terms_id)
     and pedidos.credito_nivel(v_customer.ruc_o_documento) = 'alerta' then
    insert into pedidos.bloqueos_credito (order_id, ruc, saldo, vencido, dias_atraso)
    select p_order_id, c.ruc, c.saldo, c.vencido, c.dias_atraso
      from pedidos.credito_clientes c
     where c.ruc = v_customer.ruc_o_documento
    on conflict (order_id) do nothing;

    -- El aviso se SUMA al motivo que ya hubiera en vez de pisarlo: si el
    -- pedido venía frenado por un descuento o por plazo, el correo tiene
    -- que decir las dos cosas.
    v_motivo := coalesce(nullif(v_motivo, '') || '. ', '')
      || (select format('El cliente arrastra S/ %s vencidos con %s días de atraso',
                        to_char(c.vencido, 'FM9999999990.00'), c.dias_atraso)
            from pedidos.credito_clientes c
           where c.ruc = v_customer.ruc_o_documento);

    -- Si ya estaba detenido por otra razón, se queda donde estaba: esa
    -- bandeja es la que corresponde, y la fila en `bloqueos_credito` basta
    -- para que `reevaluate_order` no lo deje salir a operaciones sin que
    -- alguien resuelva también la deuda.
    if v_estado_resultado = 'READY_FOR_OPERATIONS' then
      v_estado_resultado := 'COMMERCIAL_EXCEPTION';
    end if;
  end if;

  perform pedidos.apply_order_transition(p_order_id, v_estado_resultado, v_motivo);
$nuevo$;
begin
  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'pedidos' and p.proname = 'submit_order';

  if v_def is null then
    raise exception 'No existe pedidos.submit_order';
  end if;
  if position(v_nuevo in v_def) > 0 then
    raise notice 'Los dos escalones ya estaban aplicados en submit_order; no se toca nada.';
    return;
  end if;
  if position(v_viejo in v_def) = 0 then
    raise exception 'submit_order no tiene el bloque de la 1047: revisar antes de aplicar';
  end if;

  execute replace(v_def, v_viejo, v_nuevo);
end
$migracion$;

-- ---------------------------------------------------------------------
-- 4. Y en reevaluate_order
-- ---------------------------------------------------------------------
-- Aprobar un descuento no puede liberar a un cliente de 60 días. La 1047
-- solo miraba si quedaba una fila de bloqueo pendiente; eso no alcanza,
-- porque el bloqueo se puede haber aprobado —o no haberse creado nunca,
-- que es justo lo que pasó con el #445.
do $migracion$
declare
  v_def text;
  v_viejo constant text :=
$viejo$  if v_estado_resultado = 'READY_FOR_OPERATIONS'
     and exists (select 1 from pedidos.bloqueos_credito b
                  where b.order_id = p_order_id and b.estado = 'pendiente') then
    v_estado_resultado := 'COMMERCIAL_EXCEPTION';
    v_motivo := coalesce(v_motivo, 'Queda el bloqueo por deuda sin resolver');
  end if;

  perform pedidos.apply_order_transition(p_order_id, v_estado_resultado, coalesce(p_motivo, v_motivo));
$viejo$;
  v_nuevo constant text :=
$nuevo$  -- Deuda grave: no vuelve a operaciones aunque se aprueben los descuentos
  -- y aunque alguien marque el bloqueo como aprobado. Desde los días de
  -- bloqueo la decisión no es de nadie de acá adentro.
  if v_estado_resultado = 'READY_FOR_OPERATIONS'
     and not pedidos.es_contado(v_order.payment_terms_id)
     and pedidos.credito_nivel(v_customer.ruc_o_documento) = 'bloqueo' then
    v_estado_resultado := 'COMMERCIAL_EXCEPTION';
    v_motivo := 'El cliente pasó los días de atraso que admiten venta a crédito: el pedido no sale hasta que regularice';
  elsif v_estado_resultado = 'READY_FOR_OPERATIONS'
     and exists (select 1 from pedidos.bloqueos_credito b
                  where b.order_id = p_order_id and b.estado = 'pendiente') then
    v_estado_resultado := 'COMMERCIAL_EXCEPTION';
    v_motivo := coalesce(v_motivo, 'Queda el bloqueo por deuda sin resolver');
  end if;

  perform pedidos.apply_order_transition(p_order_id, v_estado_resultado, coalesce(p_motivo, v_motivo));
$nuevo$;
begin
  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'pedidos' and p.proname = 'reevaluate_order';

  if v_def is null then
    raise exception 'No existe pedidos.reevaluate_order';
  end if;
  if position(v_nuevo in v_def) > 0 then
    raise notice 'Los dos escalones ya estaban aplicados en reevaluate_order; no se toca nada.';
    return;
  end if;
  if position(v_viejo in v_def) = 0 then
    raise exception 'reevaluate_order no tiene el bloque de la 1047: revisar antes de aplicar';
  end if;

  execute replace(v_def, v_viejo, v_nuevo);
end
$migracion$;
