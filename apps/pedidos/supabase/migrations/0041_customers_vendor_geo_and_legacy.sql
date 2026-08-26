-- Carga de la cartera real de clientes (3.399 clientes migrados del
-- sistema del piloto de WhatsApp). Agrega lo que el modelo de Fase 2 no
-- contemplaba y que el dato real exige:
--
--  1. customers.vendedor_id — el vendedor titular del cliente. NO se
--     puede derivar de la zona: en el dato real hay clientes atendidos
--     por un vendedor distinto al titular de su zona (venían con
--     vendedor_manual_id en el sistema de origen). Ver docs/data-model.md.
--  2. customers.zona_asignada_manualmente — preserva el flag zona_manual
--     del origen: la zona se fijó a mano y no se derivó del código de
--     zona del vendedor.
--  3. distrito / provincia / departamento como campos directos del
--     cliente y NO como customer_addresses: el origen no trae dirección
--     ni ubigeo (0 de 3.399 filas), y customer_addresses.direccion es
--     not null. Una dirección de entrega real se carga después, cliente
--     por cliente, desde el flujo de pedido.
--  4. La regla de comprobante por tipo de documento, como constraint —
--     ver el comentario de customers_boleta_only_sin_ruc_valido.
--  5. customer_seller_reassignments — historial de cambios de cartera.
--  6. legacy_vendor_snapshots — snapshot histórico de solo lectura, sin
--     relación funcional con el resto del sistema.

begin;

-- ---------------------------------------------------------------------
-- 1. Vendedor titular del cliente
-- ---------------------------------------------------------------------

alter table pedidos.customers
  add column if not exists vendedor_id uuid references pedidos.sellers (id);

create index if not exists customers_vendedor_id_idx on pedidos.customers (vendedor_id);

comment on column pedidos.customers.vendedor_id is
  'Vendedor titular del cliente. Puede diferir del titular de zona_id: '
  'la cartera real tiene clientes reasignados a mano. La RLS de lectura '
  'sigue siendo por zona (customers_select), no por esta columna.';

-- ---------------------------------------------------------------------
-- 2. Zona fijada a mano
-- ---------------------------------------------------------------------

alter table pedidos.customers
  add column if not exists zona_asignada_manualmente boolean not null default false;

comment on column pedidos.customers.zona_asignada_manualmente is
  'true = la zona se fijó manualmente en el origen y no se derivó del '
  'código de zona del vendedor. Dato informativo para Control de Pedidos.';

-- ---------------------------------------------------------------------
-- 3. Geografía del cliente (no es una dirección de entrega)
-- ---------------------------------------------------------------------

alter table pedidos.customers
  add column if not exists distrito text,
  add column if not exists provincia text,
  add column if not exists departamento text;

comment on column pedidos.customers.distrito is
  'Geografía referencial migrada del origen. NO sustituye a una '
  'customer_addresses: un pedido exige customer_address_id, no esto.';

-- ---------------------------------------------------------------------
-- 4. Sin RUC de contribuyente válido, solo BOLETA
-- ---------------------------------------------------------------------

-- Un documento que no es RUC de contribuyente (los 151 clientes cargados
-- con DNI en el campo de RUC en el sistema de origen) no permite emitir
-- factura, así que el comprobante queda restringido a BOLETA.
--
-- Va como CHECK y no como validación de la capa de servicio a propósito:
-- la restricción tiene que sobrevivir a que Control de Pedidos apruebe
-- al cliente. Aprobar no habilita factura; lo único que la habilita es
-- corregir ruc_o_documento a un RUC real, y en ese momento el constraint
-- deja de aplicar por sí solo.
--
-- La condición exige RUC COMPLETO (prefijo válido + 11 dígitos), no solo
-- el prefijo: un '20123' o un '2099999999' tienen prefijo bueno y no son
-- RUC. Se aplica btrim para que un espacio accidental alrededor de un RUC
-- legítimo no lo degrade a BOLETA. Espejo en TypeScript:
-- domain/customers.ts (esRucContribuyenteValido).

-- PRIMERO normalizar los datos que ya existen, y solo DESPUÉS agregar el
-- constraint. Un CHECK se valida contra la tabla entera al crearse, así
-- que cualquier cliente preexistente con documento no-RUC y el default
-- 'FACTURA' hace fallar el ALTER con
-- "check constraint ... is violated by some row".
--
-- Esto pasa en cuanto existe UN cliente creado desde el flujo de "cliente
-- nuevo" de la app, que acepta cualquier string como documento — no hace
-- falta ningún dato raro sembrado. La primera versión de esta migración
-- no lo contemplaba y falló al aplicarse en producción.
--
-- Poner los datos en regla (y no un NOT VALID) es lo correcto acá: la
-- regla de negocio dice que sin RUC válido el cliente va a BOLETA, así
-- que aplicarla al dato viejo ES la regla, no una excepción. Un NOT VALID
-- dejaría filas permanentemente en contra de la regla y haría fallar
-- cualquier VALIDATE CONSTRAINT futuro.
do $$
declare
  v_corregidos integer;
begin
  update pedidos.customers
  set tipo_comprobante_permitido = 'BOLETA',
      updated_at = now()
  where btrim(ruc_o_documento) !~ '^(10|15|17|20)[0-9]{9}$'
    and tipo_comprobante_permitido <> 'BOLETA';

  get diagnostics v_corregidos = row_count;

  if v_corregidos > 0 then
    raise notice
      'customers: % cliente(s) sin RUC de contribuyente válido pasaron a tipo_comprobante_permitido = BOLETA.',
      v_corregidos;
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'customers_boleta_only_sin_ruc_valido'
      and conrelid = 'pedidos.customers'::regclass
  ) then
    alter table pedidos.customers
      add constraint customers_boleta_only_sin_ruc_valido
      check (
        btrim(ruc_o_documento) ~ '^(10|15|17|20)[0-9]{9}$'
        or tipo_comprobante_permitido = 'BOLETA'
      );
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 5. Historial de reasignación de cartera
-- ---------------------------------------------------------------------

create table if not exists pedidos.customer_seller_reassignments (
  id bigint generated always as identity primary key,
  customer_id uuid not null references pedidos.customers (id) on delete cascade,
  vendedor_anterior_id uuid references pedidos.sellers (id),
  vendedor_nuevo_id uuid not null references pedidos.sellers (id),
  fecha_reasignacion date not null,
  fuente text not null default 'migracion_piloto'
    check (fuente in ('migracion_piloto', 'app')),
  created_at timestamptz not null default now(),
  constraint customer_seller_reassignments_distintos
    check (vendedor_anterior_id is null or vendedor_anterior_id <> vendedor_nuevo_id)
);

create index if not exists customer_seller_reassignments_customer_idx
  on pedidos.customer_seller_reassignments (customer_id, fecha_reasignacion desc);

alter table pedidos.customer_seller_reassignments enable row level security;

-- Misma visibilidad que el cliente al que pertenece el historial.
drop policy if exists "customer_seller_reassignments_select" on pedidos.customer_seller_reassignments;
create policy "customer_seller_reassignments_select"
  on pedidos.customer_seller_reassignments for select
  to authenticated
  using (
    exists (
      select 1 from pedidos.customers c
      where c.id = customer_id
        and (
          pedidos.is_admin()
          or pedidos.has_role('control_pedidos')
          or pedidos.has_role('operaciones')
          or pedidos.has_role('aprobador_comercial')
          or c.zona_id in (select pedidos.current_user_zone_ids())
        )
    )
  );

drop policy if exists "customer_seller_reassignments_write" on pedidos.customer_seller_reassignments;
create policy "customer_seller_reassignments_write"
  on pedidos.customer_seller_reassignments for all
  to authenticated
  using (pedidos.is_admin() or pedidos.has_role('control_pedidos'))
  with check (pedidos.is_admin() or pedidos.has_role('control_pedidos'));

-- ---------------------------------------------------------------------
-- 6. Snapshot legacy de cartera (solo lectura)
-- ---------------------------------------------------------------------

-- Referencia histórica del sistema de cobranzas. Deliberadamente SIN FK
-- a customers: se guarda el ruc tal como vino, y no determina el
-- vendedor actual de nadie — para eso está customers.vendedor_id. No
-- tiene policy de INSERT/UPDATE/DELETE para `authenticated`: se carga
-- una única vez con la service role key (que no pasa por RLS) desde el
-- importador, y desde la app es de solo lectura.
create table if not exists pedidos.legacy_vendor_snapshots (
  id bigint generated always as identity primary key,
  ruc text not null,
  vendedor_id_snapshot uuid references pedidos.sellers (id),
  fuente text not null default 'cobranzas',
  fecha_carga timestamptz not null default now()
);

create index if not exists legacy_vendor_snapshots_ruc_idx on pedidos.legacy_vendor_snapshots (ruc);

alter table pedidos.legacy_vendor_snapshots enable row level security;

drop policy if exists "legacy_vendor_snapshots_select" on pedidos.legacy_vendor_snapshots;
create policy "legacy_vendor_snapshots_select"
  on pedidos.legacy_vendor_snapshots for select
  to authenticated
  using (pedidos.is_admin() or pedidos.has_role('control_pedidos'));

comment on table pedidos.legacy_vendor_snapshots is
  'Snapshot histórico de cartera del sistema de cobranzas. Solo '
  'referencia: no define el vendedor actual (eso es customers.vendedor_id) '
  'y ningún flujo del sistema lo consulta.';

commit;
