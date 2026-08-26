-- Auditoría de customers y product_tax_profiles.
--
-- A diferencia de otras tablas de Fase 2 (canales, proveedores, etc.,
-- auditadas desde la capa de servicio vía logAudit()), estas dos
-- tablas usan un trigger igual que pedidos.user_roles en Fase 1: son
-- lo bastante sensibles (estado de aprobación de cliente, tratamiento
-- tributario de un producto) como para no depender de que el código de
-- aplicación recuerde llamar a logAudit() en cada camino posible.
--
-- pedidos.audit_row_change() generaliza el trigger puntual de
-- user_roles de Fase 1 (pedidos.audit_user_roles_change) para
-- reutilizarlo en cualquier tabla futura con la misma necesidad.

create function pedidos.audit_row_change()
returns trigger
language plpgsql
security definer
set search_path = pedidos, public
as $$
declare
  v_entidad_id text;
begin
  v_entidad_id := coalesce(new.id, old.id)::text;

  insert into pedidos.audit_logs (actor, accion, entidad, entidad_id, datos_antes, datos_despues)
  values (
    auth.uid(),
    lower(tg_op),
    tg_table_name,
    v_entidad_id,
    case when tg_op = 'INSERT' then null else to_jsonb(old) end,
    case when tg_op = 'DELETE' then null else to_jsonb(new) end
  );
  return coalesce(new, old);
end;
$$;

create trigger customers_audit
  after insert or update or delete on pedidos.customers
  for each row execute function pedidos.audit_row_change();

create trigger product_tax_profiles_audit
  after insert or update or delete on pedidos.product_tax_profiles
  for each row execute function pedidos.audit_row_change();
