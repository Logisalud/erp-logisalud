-- Asignación de vendedores a zonas.
--
-- Caso normal (1:1): pedidos.zone_assignments. Un índice único parcial
-- garantiza que solo haya una asignación ACTIVA (vigencia_hasta is
-- null) por zona a la vez; un trigger cierra automáticamente la
-- asignación previa al insertar una nueva, así el historial queda
-- versionado sin borrar nada.
--
-- Caso excepcional (2+ vendedores compartiendo cuota/comisión):
-- pedidos.zone_assignment_participants. No reemplaza a
-- zone_assignments — es una tabla aparte para cuando además del
-- titular (o en su lugar) hay varios vendedores con un porcentaje de
-- participación. Un trigger valida que la suma de porcentajes activos
-- por zona no supere 100%.

create table pedidos.zone_assignments (
  id bigint generated always as identity primary key,
  zone_id smallint not null references pedidos.zones (id) on delete restrict,
  vendedor uuid not null references auth.users (id),
  vigencia_desde date not null default current_date,
  vigencia_hasta date,
  created_at timestamptz not null default now(),
  constraint zone_assignments_vigencia_check
    check (vigencia_hasta is null or vigencia_hasta >= vigencia_desde)
);

-- Solo una asignación normal ACTIVA por zona.
create unique index zone_assignments_one_active_per_zone
  on pedidos.zone_assignments (zone_id)
  where vigencia_hasta is null;

create function pedidos.close_previous_zone_assignment()
returns trigger
language plpgsql
security definer
set search_path = pedidos, public
as $$
begin
  update pedidos.zone_assignments
  set vigencia_hasta = new.vigencia_desde - 1
  where zone_id = new.zone_id
    and vigencia_hasta is null;
  return new;
end;
$$;

create trigger zone_assignments_close_previous
  before insert on pedidos.zone_assignments
  for each row execute function pedidos.close_previous_zone_assignment();

create table pedidos.zone_assignment_participants (
  id bigint generated always as identity primary key,
  zone_id smallint not null references pedidos.zones (id) on delete restrict,
  vendedor uuid not null references auth.users (id),
  porcentaje_participacion numeric(5, 2) not null
    check (porcentaje_participacion > 0 and porcentaje_participacion <= 100),
  vigencia_desde date not null default current_date,
  vigencia_hasta date,
  usuario_autorizo uuid not null references auth.users (id),
  created_at timestamptz not null default now(),
  constraint zone_assignment_participants_vigencia_check
    check (vigencia_hasta is null or vigencia_hasta >= vigencia_desde),
  unique (zone_id, vendedor, vigencia_desde)
);

-- La suma de porcentajes ACTIVOS por zona no puede superar 100%.
create function pedidos.check_zone_participants_total()
returns trigger
language plpgsql
set search_path = pedidos, public
as $$
declare
  total numeric;
begin
  if new.vigencia_hasta is not null then
    return new;
  end if;

  select coalesce(sum(porcentaje_participacion), 0) into total
  from pedidos.zone_assignment_participants
  where zone_id = new.zone_id
    and vigencia_hasta is null
    and id <> coalesce(new.id, -1);

  total := total + new.porcentaje_participacion;

  if total > 100 then
    raise exception
      'La suma de participación activa en la zona % supera 100%% (actual: %)',
      new.zone_id, total;
  end if;

  return new;
end;
$$;

create trigger zone_assignment_participants_check_total
  before insert or update on pedidos.zone_assignment_participants
  for each row execute function pedidos.check_zone_participants_total();

-- Resuelve las zonas del vendedor autenticado, ya sea como titular
-- (zone_assignments) o como participante de una zona compartida
-- (zone_assignment_participants). Base de las políticas RLS de
-- customers/customer_addresses para el rol vendedor.
create function pedidos.current_user_zone_ids()
returns setof smallint
language sql
security definer
stable
set search_path = pedidos, public
as $$
  select zone_id from pedidos.zone_assignments
  where vendedor = auth.uid() and vigencia_hasta is null
  union
  select zone_id from pedidos.zone_assignment_participants
  where vendedor = auth.uid() and vigencia_hasta is null;
$$;

alter table pedidos.zone_assignments enable row level security;
alter table pedidos.zone_assignment_participants enable row level security;

create policy "zone_assignments_select"
  on pedidos.zone_assignments for select
  to authenticated
  using (
    vendedor = auth.uid()
    or pedidos.is_admin()
    or pedidos.has_role('control_pedidos')
    or pedidos.has_role('operaciones')
    or pedidos.has_role('aprobador_comercial')
  );

create policy "zone_assignments_admin_write"
  on pedidos.zone_assignments for all
  to authenticated
  using (pedidos.is_admin())
  with check (pedidos.is_admin());

create policy "zone_assignment_participants_select"
  on pedidos.zone_assignment_participants for select
  to authenticated
  using (
    vendedor = auth.uid()
    or pedidos.is_admin()
    or pedidos.has_role('control_pedidos')
    or pedidos.has_role('operaciones')
    or pedidos.has_role('aprobador_comercial')
  );

create policy "zone_assignment_participants_admin_write"
  on pedidos.zone_assignment_participants for all
  to authenticated
  using (pedidos.is_admin())
  with check (pedidos.is_admin());
