-- 1047 — Puente de crédito: la deuda del cliente frena el pedido.
--
-- La deuda vive en el ERP de cobranzas, que es OTRO proyecto Supabase. No
-- hay join posible, así que el dato se copia: una fila por RUC, refrescada
-- una vez al día desde `public.v_deuda_por_cliente` de cobranzas. El RUC
-- alcanza como llave — 315 de los 320 clientes con deuda cruzan exacto.
--
-- Por qué copiar y no consultar en vivo: si cobranzas no responde, pedidos
-- tiene que poder seguir vendiendo. Con la copia, el peor caso es trabajar
-- con el dato de ayer; en vivo, el peor caso es un vendedor que no puede
-- enviar nada con el cliente adelante. El dato de deuda cambia cuando
-- entra un pago, y los pagos se registran de día: 24 h de atraso es
-- aceptable, y queda el botón "actualizar ahora" para los casos en que no.
--
-- ARRANCA APAGADO (`credito_config.activo = false`). Encenderlo es un
-- UPDATE de una fila, a hacer recién cuando Administración mire el impacto:
-- al 2026-10-28, con tolerancia de 30 días, son 95 clientes y S/ 124.041,83
-- de vencido.

-- ---------------------------------------------------------------------
-- 1. La copia de la deuda
-- ---------------------------------------------------------------------
create table if not exists pedidos.credito_clientes (
  ruc text primary key,
  razon_social text,
  saldo numeric(14,2) not null default 0,
  vencido numeric(14,2) not null default 0,
  -- El mayor atraso entre los documentos vencidos del cliente. Es el que
  -- decide, no el promedio: un cliente con una factura de 200 días no deja
  -- de ser un riesgo porque las otras cinco estén al día.
  dias_atraso integer not null default 0,
  documentos_vencidos integer not null default 0,
  actualizado_en timestamptz not null default now()
);

comment on table pedidos.credito_clientes is
  'Copia diaria de la deuda por cliente que vive en el ERP de cobranzas '
  '(public.v_deuda_por_cliente). No es la fuente de verdad: es un espejo.';

-- ---------------------------------------------------------------------
-- 2. La regla, en una fila editable
-- ---------------------------------------------------------------------
-- Una sola fila: el umbral y el interruptor. Van en la base y no en el
-- código porque los va a mover Administración, no un deploy.
create table if not exists pedidos.credito_config (
  id smallint primary key default 1 check (id = 1),
  activo boolean not null default false,
  dias_tolerancia integer not null default 30 check (dias_tolerancia >= 0),
  actualizado_en timestamptz not null default now()
);

insert into pedidos.credito_config (id, activo, dias_tolerancia)
values (1, false, 30)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------
-- 3. Qué pedidos quedaron frenados por crédito
-- ---------------------------------------------------------------------
-- Guarda las cifras del momento del bloqueo, no solo el vínculo: dentro de
-- un mes la deuda va a ser otra, y quien revise por qué se frenó este
-- pedido tiene que ver lo que vio el sistema cuando lo frenó.
create table if not exists pedidos.bloqueos_credito (
  order_id uuid primary key references pedidos.orders (id) on delete cascade,
  ruc text not null,
  saldo numeric(14,2) not null,
  vencido numeric(14,2) not null,
  dias_atraso integer not null,
  estado text not null default 'pendiente'
    check (estado in ('pendiente', 'aprobado', 'rechazado')),
  creado_en timestamptz not null default now(),
  decidido_por uuid references pedidos.profiles (id),
  decidido_en timestamptz,
  motivo text
);

create index if not exists bloqueos_credito_pendientes_idx
  on pedidos.bloqueos_credito (estado, creado_en);

-- ---------------------------------------------------------------------
-- 4. La pregunta, en un solo lugar
-- ---------------------------------------------------------------------
-- Un cliente sin fila en `credito_clientes` NO se bloquea: puede ser un
-- cliente nuevo, o uno que nunca compró a crédito. Bloquear por falta de
-- dato sería frenar ventas por una copia incompleta.
create or replace function pedidos.credito_bloquea(p_ruc text)
returns boolean
language sql
stable
security definer
set search_path = pedidos, public
as $fn$
  select coalesce(
    (select cfg.activo
            and c.vencido > 0
            and c.dias_atraso > cfg.dias_tolerancia
     from pedidos.credito_config cfg
     left join pedidos.credito_clientes c on c.ruc = p_ruc
     where cfg.id = 1),
    false);
$fn$;

-- ---------------------------------------------------------------------
-- 5. RLS
-- ---------------------------------------------------------------------
alter table pedidos.credito_clientes  enable row level security;
alter table pedidos.credito_config    enable row level security;
alter table pedidos.bloqueos_credito  enable row level security;

-- La deuda la lee cualquier autenticado: el vendedor tiene que poder ver
-- por qué su pedido se frenó, y ya ve la cartera de sus clientes en el
-- link de cobranzas. Escribir, solo el administrador — la sincronización
-- corre con la service role y no pasa por RLS.
drop policy if exists "credito_clientes_lectura" on pedidos.credito_clientes;
create policy "credito_clientes_lectura" on pedidos.credito_clientes
  for select to authenticated using (true);

drop policy if exists "credito_clientes_escritura" on pedidos.credito_clientes;
create policy "credito_clientes_escritura" on pedidos.credito_clientes
  for all to authenticated using (pedidos.is_admin()) with check (pedidos.is_admin());

drop policy if exists "credito_config_lectura" on pedidos.credito_config;
create policy "credito_config_lectura" on pedidos.credito_config
  for select to authenticated using (true);

drop policy if exists "credito_config_escritura" on pedidos.credito_config;
create policy "credito_config_escritura" on pedidos.credito_config
  for all to authenticated using (pedidos.is_admin()) with check (pedidos.is_admin());

drop policy if exists "bloqueos_credito_lectura" on pedidos.bloqueos_credito;
create policy "bloqueos_credito_lectura" on pedidos.bloqueos_credito
  for select to authenticated using (true);

-- Lo levanta el aprobador comercial, que es quien ya resuelve las
-- excepciones comerciales del pedido.
drop policy if exists "bloqueos_credito_escritura" on pedidos.bloqueos_credito;
create policy "bloqueos_credito_escritura" on pedidos.bloqueos_credito
  for all to authenticated
  using (pedidos.is_admin() or pedidos.has_role('aprobador_comercial'))
  with check (pedidos.is_admin() or pedidos.has_role('aprobador_comercial'));

-- ---------------------------------------------------------------------
-- 6. La regla dentro de submit_order
-- ---------------------------------------------------------------------
-- Mismo idioma que la 1040: se parte de pg_get_functiondef para conservar
-- firma y atributos, se verifica que el bloque esperado siga ahí, y se
-- reemplaza. Reescribir la función entera acá la desincronizaría del resto
-- de parches que ya tiene aplicados.
do $migracion$
declare
  v_def text;
  v_viejo constant text :=
$viejo$  perform pedidos.apply_order_transition(p_order_id, v_estado_resultado, v_motivo);
$viejo$;
  v_nuevo constant text :=
$nuevo$  -- Crédito del cliente. Si arrastra deuda vencida más allá de la
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
$nuevo$;
begin
  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'pedidos' and p.proname = 'submit_order';

  if v_def is null then
    raise exception 'No existe pedidos.submit_order';
  end if;
  if position(v_nuevo in v_def) > 0 then
    raise notice 'La regla de crédito ya estaba aplicada en submit_order; no se toca nada.';
    return;
  end if;
  if position(v_viejo in v_def) = 0 then
    raise exception 'submit_order no tiene el bloque esperado: revisar antes de aplicar';
  end if;

  execute replace(v_def, v_viejo, v_nuevo);
end
$migracion$;

-- Y en reevaluate_order: mientras el bloqueo siga pendiente, el pedido no
-- vuelve a operaciones por más que se resuelvan los descuentos. Aprobar el
-- bloqueo y reevaluar es lo que lo libera.
do $migracion$
declare
  v_def text;
  v_viejo constant text :=
$viejo$  perform pedidos.apply_order_transition(p_order_id, v_estado_resultado, coalesce(p_motivo, v_motivo));
$viejo$;
  v_nuevo constant text :=
$nuevo$  if v_estado_resultado = 'READY_FOR_OPERATIONS'
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
    raise notice 'La regla de crédito ya estaba aplicada en reevaluate_order; no se toca nada.';
    return;
  end if;
  if position(v_viejo in v_def) = 0 then
    raise exception 'reevaluate_order no tiene el bloque esperado: revisar antes de aplicar';
  end if;

  execute replace(v_def, v_viejo, v_nuevo);
end
$migracion$;
