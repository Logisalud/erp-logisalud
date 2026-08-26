-- Perfil tributario del producto, versionado por vigencia. Nunca es un
-- campo simple en products ni algo que el vendedor elija — ver
-- docs/data-model.md para la diferencia con tax_configurations.
--
-- Un índice único parcial garantiza un solo perfil ACTIVO
-- (vigente_hasta is null) por producto; un trigger BEFORE INSERT
-- cierra el perfil anterior el día antes de que empiece el nuevo, así
-- el historial queda versionado sin borrar el registro previo.

create table pedidos.product_tax_profiles (
  id bigint generated always as identity primary key,
  product_id uuid not null references pedidos.products (id) on delete cascade,
  afectacion_tributaria text not null
    check (afectacion_tributaria in ('GRAVADO', 'INAFECTO')),
  tasa_aplicable numeric(5, 2) not null default 0,
  vigente_desde date not null default current_date,
  vigente_hasta date,
  created_at timestamptz not null default now(),
  constraint product_tax_profiles_vigencia_check
    check (vigente_hasta is null or vigente_hasta >= vigente_desde)
);

create unique index product_tax_profiles_one_active_per_product
  on pedidos.product_tax_profiles (product_id)
  where vigente_hasta is null;

create function pedidos.close_previous_tax_profile()
returns trigger
language plpgsql
security definer
set search_path = pedidos, public
as $$
begin
  update pedidos.product_tax_profiles
  set vigente_hasta = new.vigente_desde - 1
  where product_id = new.product_id
    and vigente_hasta is null;
  return new;
end;
$$;

create trigger product_tax_profiles_close_previous
  before insert on pedidos.product_tax_profiles
  for each row execute function pedidos.close_previous_tax_profile();

alter table pedidos.product_tax_profiles enable row level security;

create policy "product_tax_profiles_select_all"
  on pedidos.product_tax_profiles for select
  to authenticated
  using (true);

create policy "product_tax_profiles_admin_write"
  on pedidos.product_tax_profiles for all
  to authenticated
  using (pedidos.is_admin())
  with check (pedidos.is_admin());
