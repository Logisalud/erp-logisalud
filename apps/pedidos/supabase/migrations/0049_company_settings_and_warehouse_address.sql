-- Datos del EMISOR y dirección real del almacén central.
--
-- Cierra dos huecos que el borrador de GRE venía reportando como
-- advertencia: no había de dónde sacar los datos legales de quien emite, y
-- warehouses no guardaba dirección ni ubigeo.

begin;

-- ---------------------------------------------------------------------
-- 1. Empresa emisora (singleton)
-- ---------------------------------------------------------------------

-- Los datos legales de quien emite los comprobantes y guías. No cambian
-- por cliente ni por pedido, así que no tienen por qué vivir en cada
-- documento: alimentan cualquier campo del JSON que se refiera al EMISOR
-- (el destinatario sale de customers).
--
-- Singleton de verdad: `check (id = 1)` impide que aparezca una segunda
-- fila y que el código tenga que decidir "cuál de las dos es la buena".
create table if not exists pedidos.company_settings (
  id smallint primary key default 1 check (id = 1),
  razon_social text not null,
  ruc text not null,
  direccion text not null,
  ubigeo_codigo text,
  telefono text,
  email text,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id)
);

comment on table pedidos.company_settings is
  'Datos legales del EMISOR de comprobantes y guías. Una sola fila. '
  'Alimenta los campos de emisor del JSON de documentación electrónica; '
  'el destinatario sale de customers.';

insert into pedidos.company_settings (id, razon_social, ruc, direccion, ubigeo_codigo, telefono, email)
values (
  1,
  'LOGISSA SOCIEDAD ANONIMA CERRADA',
  '20610284508',
  'CAR. PANAMERICANA SUR KM.29.5 INT.A-08, LURIN - LIMA - LIMA',
  -- Inferido: la dirección es la misma del Almacén Central Lima, cuyo
  -- ubigeo confirmado es 150119 (Lima - Lima - Lurín). Editable desde
  -- /admin/configuracion/empresa si el domicilio fiscal difiere.
  '150119',
  '950242412',
  'hola@logisalud.com'
)
on conflict (id) do update set
  razon_social = excluded.razon_social,
  ruc = excluded.ruc,
  direccion = excluded.direccion,
  ubigeo_codigo = excluded.ubigeo_codigo,
  telefono = excluded.telefono,
  email = excluded.email,
  updated_at = now();

alter table pedidos.company_settings enable row level security;

-- Lectura para cualquier autenticado: son datos que van impresos en cada
-- comprobante, no hay nada que ocultar, y la pantalla de administración
-- los necesita. Escritura solo administrador.
drop policy if exists "company_settings_select_all" on pedidos.company_settings;
create policy "company_settings_select_all"
  on pedidos.company_settings for select
  to authenticated
  using (true);

drop policy if exists "company_settings_admin_write" on pedidos.company_settings;
create policy "company_settings_admin_write"
  on pedidos.company_settings for all
  to authenticated
  using (pedidos.is_admin())
  with check (pedidos.is_admin());

-- ---------------------------------------------------------------------
-- 2. Dirección y ubigeo del almacén
-- ---------------------------------------------------------------------

-- 0045 creó warehouses con solo nombre/descripción, y el borrador de GRE
-- venía advirtiendo "el almacén no tiene dirección". Estas son las columnas
-- que faltaban.
alter table pedidos.warehouses
  add column if not exists direccion text,
  add column if not exists ubigeo_codigo text;

comment on column pedidos.warehouses.ubigeo_codigo is
  'Código de ubigeo INEI de 6 dígitos (departamento+provincia+distrito). '
  'Obligatorio en la guía de remisión como punto de partida.';

-- Dato real confirmado para el almacén central. Los demás almacenes quedan
-- sin dirección a propósito: el borrador de GRE los sigue advirtiendo hasta
-- que se confirme su dato real, en vez de inventar una dirección.
update pedidos.warehouses
set direccion = 'CAR. PANAMERICANA SUR KM.29.5 INT.A-08',
    ubigeo_codigo = '150119',
    updated_at = now()
where nombre = 'Almacén Central Lima';

commit;
