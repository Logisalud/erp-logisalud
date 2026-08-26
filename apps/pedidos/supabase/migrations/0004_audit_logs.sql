-- Bitácora de auditoría del módulo. Ver docs/architecture.md para la
-- justificación de "capa de servicio" como mecanismo de escritura
-- principal, con un trigger de respaldo únicamente sobre user_roles.

create table pedidos.audit_logs (
  id bigint generated always as identity primary key,
  actor uuid references auth.users (id),
  accion text not null,
  entidad text not null,
  entidad_id text,
  datos_antes jsonb,
  datos_despues jsonb,
  fecha timestamptz not null default now()
);

create index audit_logs_entidad_idx on pedidos.audit_logs (entidad, entidad_id);
create index audit_logs_fecha_idx on pedidos.audit_logs (fecha);

alter table pedidos.audit_logs enable row level security;

-- Solo administrador puede leer la bitácora desde el cliente.
create policy "audit_logs_select_admin"
  on pedidos.audit_logs for select
  to authenticated
  using (pedidos.is_admin());

-- Sin políticas de insert/update/delete para anon/authenticated:
-- la escritura ocurre vía service role (capa de servicio) o vía el
-- trigger security definer de abajo, ambos evitan RLS.

-- Trigger de respaldo (defensa en profundidad) solo para user_roles:
-- las escaladas de privilegio deben quedar registradas incluso si un
-- desarrollador cambia la tabla directamente (SQL editor, migración
-- manual) sin pasar por la capa de servicio.
create function pedidos.audit_user_roles_change()
returns trigger
language plpgsql
security definer
set search_path = pedidos, public
as $$
begin
  insert into pedidos.audit_logs (actor, accion, entidad, entidad_id, datos_antes, datos_despues)
  values (
    auth.uid(),
    lower(tg_op),
    'user_roles',
    coalesce(new.user_id, old.user_id)::text,
    case when tg_op = 'INSERT' then null else to_jsonb(old) end,
    case when tg_op = 'DELETE' then null else to_jsonb(new) end
  );
  return coalesce(new, old);
end;
$$;

create trigger user_roles_audit
  after insert or update or delete on pedidos.user_roles
  for each row execute function pedidos.audit_user_roles_change();
