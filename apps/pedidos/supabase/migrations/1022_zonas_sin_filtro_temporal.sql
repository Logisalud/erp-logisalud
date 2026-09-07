-- 1022 — TEMPORAL: se apaga el filtro de zona en la VISIBILIDAD de clientes.
--
-- Contexto (2026-09-07): la asignación real de zonas todavía no es
-- confiable — hay clientes en zonas que no corresponden y vendedores con
-- zonas incompletas —, así que el filtro estaba escondiendo clientes reales
-- a quien tiene que venderles. Hasta que la asignación se limpie y se
-- valide, cualquier vendedor autenticado ve y puede armar pedidos para
-- cualquier cliente.
--
-- CÓMO SE REVIERTE (un solo paso): cambiar el cuerpo de
-- pedidos.zonas_restringen_visibilidad() a `select true`. Las policies ya
-- traen el predicado de zona ORIGINAL intacto; con la bandera en true
-- vuelven a comportarse exactamente como antes de esta migración. No hace
-- falta tocar ninguna policy.
--
-- Lo que esto NO cambia:
--   * La auditoría: quién creó/editó cada pedido y cada cliente sigue
--     igual (audit_logs, creado_por, solicitado_por).
--   * Quién es el responsable comercial de un pedido: orders.seller_id
--     sigue siendo el vendedor a cuyo nombre queda, y orders_select sigue
--     mostrándole a cada vendedor SÓLO sus pedidos.
--   * Los otros roles (admin, control_pedidos, operaciones,
--     aprobador_comercial), que ya veían todo.

create or replace function pedidos.zonas_restringen_visibilidad()
returns boolean
language sql
stable
as $$
  -- false = filtro de zona APAGADO (estado actual, temporal).
  -- true  = filtro de zona ACTIVO (comportamiento original).
  select false;
$$;

comment on function pedidos.zonas_restringen_visibilidad() is
  'Bandera temporal (2026-09-07): con false, un vendedor ve clientes de '
  'cualquier zona. Volver a true cuando la asignación de zonas esté '
  'limpia y validada. Ver docs/business-rules.md.';

-- ---------------------------------------------------------------------
-- customers
-- ---------------------------------------------------------------------
drop policy if exists "customers_select" on pedidos.customers;
create policy "customers_select"
  on pedidos.customers for select
  using (
    pedidos.is_admin()
    or pedidos.has_role('control_pedidos')
    or pedidos.has_role('operaciones')
    or pedidos.has_role('aprobador_comercial')
    -- TEMPORAL: mientras la bandera esté en false, el vendedor ve todo.
    or (pedidos.has_role('vendedor') and not pedidos.zonas_restringen_visibilidad())
    -- Predicado ORIGINAL, intacto: vuelve a mandar solo con la bandera en true.
    or (zona_id in (select pedidos.current_user_zone_ids()))
  );

-- ---------------------------------------------------------------------
-- customer_addresses — sin esto el vendedor ve al cliente pero no puede
-- elegir dirección de entrega, así que no puede armarle el pedido.
-- ---------------------------------------------------------------------
drop policy if exists "customer_addresses_select" on pedidos.customer_addresses;
create policy "customer_addresses_select"
  on pedidos.customer_addresses for select
  using (
    exists (
      select 1 from pedidos.customers c
      where c.id = customer_addresses.customer_id
        and (
          pedidos.is_admin()
          or pedidos.has_role('control_pedidos')
          or pedidos.has_role('operaciones')
          or pedidos.has_role('aprobador_comercial')
          or (pedidos.has_role('vendedor') and not pedidos.zonas_restringen_visibilidad())
          or (c.zona_id in (select pedidos.current_user_zone_ids()))
        )
    )
  );

drop policy if exists "customer_addresses_insert_vendedor" on pedidos.customer_addresses;
create policy "customer_addresses_insert_vendedor"
  on pedidos.customer_addresses for insert
  with check (
    pedidos.has_role('vendedor')
    and solicitado_por = auth.uid()
    and (
      -- TEMPORAL: la cartera migrada entró sin direcciones y el vendedor
      -- las carga desde el propio pedido; si sólo pudiera cargarlas en su
      -- zona, ver clientes de otras zonas no le serviría de nada.
      not pedidos.zonas_restringen_visibilidad()
      or exists (
        select 1 from pedidos.customers c
        where c.id = customer_addresses.customer_id
          and c.zona_id in (select pedidos.current_user_zone_ids())
      )
    )
  );

-- ---------------------------------------------------------------------
-- customer_contacts
-- ---------------------------------------------------------------------
drop policy if exists "customer_contacts_select" on pedidos.customer_contacts;
create policy "customer_contacts_select"
  on pedidos.customer_contacts for select
  using (
    exists (
      select 1 from pedidos.customers c
      where c.id = customer_contacts.customer_id
        and (
          pedidos.is_admin()
          or pedidos.has_role('control_pedidos')
          or pedidos.has_role('operaciones')
          or pedidos.has_role('aprobador_comercial')
          or (pedidos.has_role('vendedor') and not pedidos.zonas_restringen_visibilidad())
          or (c.zona_id in (select pedidos.current_user_zone_ids()))
        )
    )
  );

drop policy if exists "customer_contacts_insert_vendedor" on pedidos.customer_contacts;
create policy "customer_contacts_insert_vendedor"
  on pedidos.customer_contacts for insert
  with check (
    pedidos.has_role('vendedor')
    and (
      not pedidos.zonas_restringen_visibilidad()
      or exists (
        select 1 from pedidos.customers c
        where c.id = customer_contacts.customer_id
          and c.zona_id in (select pedidos.current_user_zone_ids())
      )
    )
  );

-- ---------------------------------------------------------------------
-- customer_seller_reassignments (historial de reasignación)
-- ---------------------------------------------------------------------
drop policy if exists "customer_seller_reassignments_select" on pedidos.customer_seller_reassignments;
create policy "customer_seller_reassignments_select"
  on pedidos.customer_seller_reassignments for select
  using (
    exists (
      select 1 from pedidos.customers c
      where c.id = customer_seller_reassignments.customer_id
        and (
          pedidos.is_admin()
          or pedidos.has_role('control_pedidos')
          or pedidos.has_role('operaciones')
          or pedidos.has_role('aprobador_comercial')
          or (pedidos.has_role('vendedor') and not pedidos.zonas_restringen_visibilidad())
          or (c.zona_id in (select pedidos.current_user_zone_ids()))
        )
    )
  );

grant execute on function pedidos.zonas_restringen_visibilidad() to authenticated;
