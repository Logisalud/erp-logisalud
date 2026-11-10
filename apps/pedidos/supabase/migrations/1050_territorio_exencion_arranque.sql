-- 1050 — Los pedidos que ya estaban en la calle cuando entró la regla.
--
-- La 1049 empezó a frenar pedidos con líneas que el proveedor no distribuye
-- en ese distrito. Cuando entró había 15 pedidos vivos —3 en borrador y 12
-- esperando una aprobación— que la rompían sin que nadie pudiera saberlo:
-- se armaron cuando la regla no existía.
--
-- Administración decidió el 2026-11-03 dejarlos pasar y aplicar la regla de
-- ahí en adelante. Esta migración registra esa decisión pedido por pedido.
--
-- POR QUÉ UNA LISTA Y NO UNA FECHA DE CORTE
--
-- Lo natural sería "la regla aplica a lo creado desde hoy", y es una línea
-- menos. Pero un borrador vive semanas —hay uno de 27 días— y entonces
-- cualquier borrador viejo quedaría exento PARA SIEMPRE: mañana le agregan
-- una línea de JAM Pharma a un distrito vetado y pasa igual, sin que nadie
-- entienda por qué ese pedido sí. Una lista de 15 se agota sola; una fecha
-- de corte deja la puerta entornada.

-- ---------------------------------------------------------------------
-- 1. La tabla
-- ---------------------------------------------------------------------
create table if not exists pedidos.territorio_exencion (
  order_id uuid primary key references pedidos.orders (id) on delete cascade,
  -- Por qué se dejó pasar. Se lee dentro de un mes, cuando alguien pregunte
  -- cómo salió este pedido con una línea que hoy no se puede vender.
  motivo text not null,
  creado_en timestamptz not null default now()
);

comment on table pedidos.territorio_exencion is
  'Pedidos a los que NO se les aplica la restricción territorial del '
  'proveedor, uno por fila y con su motivo. Es para casos puntuales y '
  'decididos por una persona, no un interruptor general.';

alter table pedidos.territorio_exencion enable row level security;

drop policy if exists "territorio_exencion_lectura" on pedidos.territorio_exencion;
create policy "territorio_exencion_lectura" on pedidos.territorio_exencion
  for select to authenticated using (true);

drop policy if exists "territorio_exencion_escritura" on pedidos.territorio_exencion;
create policy "territorio_exencion_escritura" on pedidos.territorio_exencion
  for all to authenticated using (pedidos.is_admin()) with check (pedidos.is_admin());

-- ---------------------------------------------------------------------
-- 2. Los 15 que ya estaban
-- ---------------------------------------------------------------------
-- Se calculan, no se pegan: el mismo criterio que usa el freno, aplicado a
-- los pedidos que todavía no se despacharon. Así la lista es exactamente la
-- que la regla iba a frenar, sin que yo transcriba quince ids a mano.
insert into pedidos.territorio_exencion (order_id, motivo)
select distinct o.id,
       'Armado antes de que existiera la restricción territorial (1049). Administración decidió el 2026-11-03 dejar pasar los pedidos vivos de ese momento.'
  from pedidos.orders o
  join pedidos.order_items oi on oi.order_id = o.id
  join pedidos.products p on p.id = oi.product_id
  join pedidos.customer_addresses ca on ca.id = o.customer_address_id
  join pedidos.territorio_vetado z
    on z.supplier_id = p.supplier_id and z.codigo_inei = ca.ubigeo
 where o.estado in ('DRAFT', 'COMMERCIAL_EXCEPTION', 'ADMINISTRATIVE_EXCEPTION', 'NEW_CUSTOMER_VALIDATION')
on conflict (order_id) do nothing;

-- ---------------------------------------------------------------------
-- 3. Que los dos frenos la respeten
-- ---------------------------------------------------------------------
-- Dos reemplazos quirúrgicos sobre los bloques que puso la 1049: se le
-- agrega la condición de exención al `exists` que decide, y nada más. El
-- texto que arma el mensaje no se toca: solo corre cuando ya se decidió
-- frenar.
do $migracion$
declare
  v_def text;
  v_viejo constant text :=
$viejo$     where oi.order_id = p_order_id
  ) then
$viejo$;
  v_nuevo constant text :=
$nuevo$     where oi.order_id = p_order_id
       and not exists (select 1 from pedidos.territorio_exencion e where e.order_id = p_order_id)
  ) then
$nuevo$;
begin
  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'pedidos' and p.proname = 'submit_order';

  if position('pedidos.territorio_exencion' in v_def) > 0 then
    raise notice 'La exención ya estaba aplicada en submit_order; no se toca nada.';
    return;
  end if;
  if position(v_viejo in v_def) = 0 then
    raise exception 'submit_order no tiene el bloque de territorio de la 1049: revisar antes de aplicar';
  end if;

  execute replace(v_def, v_viejo, v_nuevo);
end
$migracion$;

do $migracion$
declare
  v_def text;
  v_viejo constant text :=
$viejo$        where oi.order_id = p_order_id
     ) then
$viejo$;
  v_nuevo constant text :=
$nuevo$        where oi.order_id = p_order_id
          and not exists (select 1 from pedidos.territorio_exencion e where e.order_id = p_order_id)
     ) then
$nuevo$;
begin
  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'pedidos' and p.proname = 'reevaluate_order';

  if position('pedidos.territorio_exencion' in v_def) > 0 then
    raise notice 'La exención ya estaba aplicada en reevaluate_order; no se toca nada.';
    return;
  end if;
  if position(v_viejo in v_def) = 0 then
    raise exception 'reevaluate_order no tiene el bloque de territorio de la 1049: revisar antes de aplicar';
  end if;

  execute replace(v_def, v_viejo, v_nuevo);
end
$migracion$;
