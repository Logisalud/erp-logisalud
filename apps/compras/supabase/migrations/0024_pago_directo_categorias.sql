-- "Pago directo": factura de un proveedor SIN Orden de Compra ni Orden de
-- Servicio (luz, agua, peajes, notaría, seguros, courier…) — origen
-- `gasto_directo` de cuentas_x_pagar.obligaciones, que ya existía en el
-- modelo de datos pero nunca tuvo pantalla propia para crearlo (services/
-- obligaciones.ts solo sabía registrar origen 'compra', desde una recepción
-- de Almacén). El beneficiario es el PROVEEDOR, no un empleado — eso ya lo
-- distingue de gastos.solicitudes_gasto (que sí paga/reembolsa a un
-- empleado, con su propia cadena de aprobación jefe → Contabilidad).
--
-- Las categorías son el catálogo de "por qué se puede pagar sin OC/OS" —
-- Contabilidad elige una al registrar, para poder reportar por categoría
-- después. Lista acordada con Sebas (21 categorías — la unión de la tabla
-- de 14 excepciones con la lista corta de 7 que ya usaba el equipo).

create table if not exists cuentas_x_pagar.categorias_pago_directo (
  id uuid primary key default gen_random_uuid(),
  nombre text not null unique,
  activo boolean not null default true,
  created_at timestamptz not null default now()
);

alter table cuentas_x_pagar.obligaciones
  add column if not exists categoria_pago_directo_id uuid
    references cuentas_x_pagar.categorias_pago_directo(id);

insert into cuentas_x_pagar.categorias_pago_directo (nombre)
select v.nombre from (
  values
    ('Boletos y servicios de viaje'),
    ('Combustible'),
    ('Servicios públicos'),
    ('Compras menores'),
    ('Peajes y estacionamientos'),
    ('Seguros'),
    ('Servicios de entidades gubernamentales'),
    ('Servicios profesionales regulados'),
    ('Suscripciones y licencias'),
    ('Gastos de representación'),
    ('Donaciones y contribuciones'),
    ('Cuotas de asociaciones / membresías'),
    ('Servicios de courier y mensajería'),
    ('Caja chica, reembolsos de gastos'),
    ('Movilidad'),
    ('Pasajes aéreos, terrestres'),
    ('Materiales de almacén'),
    ('Gastos de representación, atención a clientes'),
    ('Courier y mensajería'),
    ('Trámites y tasas notariales'),
    ('Otros gastos autorizados')
) as v(nombre)
where not exists (
  select 1 from cuentas_x_pagar.categorias_pago_directo c where c.nombre = v.nombre
);

alter table cuentas_x_pagar.categorias_pago_directo enable row level security;

drop policy if exists categorias_pago_directo_lectura on cuentas_x_pagar.categorias_pago_directo;
create policy categorias_pago_directo_lectura on cuentas_x_pagar.categorias_pago_directo
  for select to authenticated
  using (public.area_en('contabilidad','tesoreria','gerencia','compras','almacen','admin'));

drop policy if exists categorias_pago_directo_escritura on cuentas_x_pagar.categorias_pago_directo;
create policy categorias_pago_directo_escritura on cuentas_x_pagar.categorias_pago_directo
  for all to authenticated
  using (public.area_en('contabilidad','admin'))
  with check (public.area_en('contabilidad','admin'));
