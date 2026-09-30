-- Las cuentas bancarias PROPIAS de Logisalud, y de cuál salió cada pago.
-- (Pedido de Mariela vía Sebas, 2026-09-30.)
--
-- Hasta ahora un pago registraba a DÓNDE fue la plata (la cuenta del
-- proveedor, del proveedor de servicio o del empleado) pero no de DÓNDE
-- salió. Con cuatro cuentas propias, Contabilidad no podía cuadrar un
-- extracto contra los pagos del sistema sin preguntarle a Tesorería pago por
-- pago.
--
-- Vive en `cuentas_x_pagar` y no en `public` a propósito: hoy la usa solo
-- Tesorería al pagar. Cobranzas recibe plata en estas mismas cuentas, pero
-- nunca las registró como tabla (importa extractos a
-- `public.movimientos_banco_import` sin referenciarlas), y cruzar datos entre
-- apps es una decisión aparte, no un efecto colateral de esta.
--
-- Re-ejecutable.

create table if not exists cuentas_x_pagar.cuentas_bancarias_empresa (
  id uuid primary key default gen_random_uuid(),
  -- El código con el que Contabilidad ya las nombra (CF010, CF003, …). Es el
  -- que se usa en sus planillas, así que es el que tiene que poder buscarse.
  codigo_interno text not null unique,
  -- Cómo la llaman en el día a día: "BCP SOLES 1". Es lo que ve Tesorería en
  -- el desplegable — Lenguaje Ubicuo, no "cuenta corriente PEN #1".
  nombre text not null,
  banco text not null,
  numero_cuenta text not null,
  moneda text not null check (moneda in ('PEN', 'USD')),
  -- La que aparece elegida al abrir el formulario de pago. A lo sumo una —
  -- lo asegura el índice de abajo, no la aplicación.
  es_predeterminada boolean not null default false,
  activo boolean not null default true,
  created_at timestamptz not null default now()
);

create unique index if not exists cuentas_bancarias_empresa_una_predeterminada
  on cuentas_x_pagar.cuentas_bancarias_empresa (es_predeterminada)
  where es_predeterminada;

alter table cuentas_x_pagar.cuentas_bancarias_empresa enable row level security;

-- Leerlas: cualquiera con área. No son secretas — están en cada voucher que
-- sale — y la ficha de una obligación tiene que poder mostrar de cuál se pagó
-- a quien sea que la abra.
drop policy if exists cuentas_bancarias_empresa_lectura on cuentas_x_pagar.cuentas_bancarias_empresa;
create policy cuentas_bancarias_empresa_lectura on cuentas_x_pagar.cuentas_bancarias_empresa
  for select to authenticated using (public.mi_area() is not null);

-- Mantenerlas: Contabilidad, Tesorería y admin. Hoy no hay pantalla para
-- esto — las cuatro se cargan acá abajo —, pero la policy queda para el día
-- que se abra una cuenta nueva.
drop policy if exists cuentas_bancarias_empresa_escritura on cuentas_x_pagar.cuentas_bancarias_empresa;
create policy cuentas_bancarias_empresa_escritura on cuentas_x_pagar.cuentas_bancarias_empresa
  for all to authenticated
  using (public.area_en('contabilidad', 'tesoreria', 'admin'))
  with check (public.area_en('contabilidad', 'tesoreria', 'admin'));

-- Las cuatro que pasó Mariela. La predeterminada es CF010 (BCP SOLES 1,
-- "la 79"), por pedido explícito de Sebas.
insert into cuentas_x_pagar.cuentas_bancarias_empresa
  (codigo_interno, nombre, banco, numero_cuenta, moneda, es_predeterminada)
select v.* from (
  values
    ('CF010', 'BCP SOLES 1',     'BCP',       '1917315019079', 'PEN', true),
    ('CF003', 'BCP SOLES 2',     'BCP',       '1949920143063', 'PEN', false),
    ('CF004', 'BCP DÓLARES',     'BCP',       '1939948625169', 'USD', false),
    ('CF005', 'INTERBANK SOLES', 'Interbank', '2003006303674', 'PEN', false)
) as v(codigo_interno, nombre, banco, numero_cuenta, moneda, es_predeterminada)
where not exists (
  select 1 from cuentas_x_pagar.cuentas_bancarias_empresa c where c.codigo_interno = v.codigo_interno
);

-- De qué cuenta salió cada pago. Nullable A PROPÓSITO: los pagos ya
-- registrados no tienen el dato y no hay forma honesta de reconstruirlo —
-- rellenarlos con la predeterminada sería inventar que salieron todos de
-- BCP SOLES 1. Quedan en null y la ficha lo dice ("sin registrar").
alter table cuentas_x_pagar.pagos
  add column if not exists cuenta_empresa_id uuid
  references cuentas_x_pagar.cuentas_bancarias_empresa (id);

comment on column cuentas_x_pagar.pagos.cuenta_empresa_id is
  'Cuenta PROPIA de la que salió el pago (migración 0075). Null en los pagos anteriores: no se reconstruye.';
