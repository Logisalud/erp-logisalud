-- Configuración tributaria GENERAL (ej. tasa de IGV vigente),
-- versionada por fecha. Distinta de product_tax_profiles: esto son
-- parámetros del sistema tributario peruano en general, no el
-- tratamiento de un producto puntual. Ver docs/data-model.md.
--
-- Mismo patrón de versionado que product_tax_profiles: un solo
-- registro activo (vigente_hasta is null) por "nombre" de parámetro,
-- el anterior se cierra automáticamente al insertar uno nuevo.

create table pedidos.tax_configurations (
  id bigint generated always as identity primary key,
  nombre text not null,
  valor numeric(6, 3) not null,
  vigente_desde date not null default current_date,
  vigente_hasta date,
  created_at timestamptz not null default now(),
  constraint tax_configurations_vigencia_check
    check (vigente_hasta is null or vigente_hasta >= vigente_desde)
);

create unique index tax_configurations_one_active_per_nombre
  on pedidos.tax_configurations (nombre)
  where vigente_hasta is null;

create function pedidos.close_previous_tax_configuration()
returns trigger
language plpgsql
security definer
set search_path = pedidos, public
as $$
begin
  update pedidos.tax_configurations
  set vigente_hasta = new.vigente_desde - 1
  where nombre = new.nombre
    and vigente_hasta is null;
  return new;
end;
$$;

create trigger tax_configurations_close_previous
  before insert on pedidos.tax_configurations
  for each row execute function pedidos.close_previous_tax_configuration();

alter table pedidos.tax_configurations enable row level security;

create policy "tax_configurations_select_all"
  on pedidos.tax_configurations for select
  to authenticated
  using (true);

create policy "tax_configurations_admin_write"
  on pedidos.tax_configurations for all
  to authenticated
  using (pedidos.is_admin())
  with check (pedidos.is_admin());

-- Supuesto de trabajo (a confirmar con Contabilidad): tasa de IGV
-- vigente 18%, sin fecha histórica exacta de inicio — se usa una fecha
-- de referencia razonable, no una fuente oficial. Ver
-- docs/business-rules.md.
insert into pedidos.tax_configurations (nombre, valor, vigente_desde)
values ('IGV', 18.00, '2024-01-01');
