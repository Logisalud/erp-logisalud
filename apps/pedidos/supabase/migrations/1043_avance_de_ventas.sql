-- El avance de ventas del mes, para que cada vendedor vea el suyo.
--
-- APLICADA A MANO el 2026-10-13 sobre el proyecto de pedidos, sentencia
-- por sentencia: el MCP de Supabase se cuelga a los 60 s con scripts
-- largos (y con cualquier DELETE), así que el bloque entero no entra de
-- una. Si hay que reaplicarla, ir de a un `create` por vez; es
-- re-ejecutable.
--
-- Hasta ahora esto vivía solo en un Excel que Comercial actualiza todos los
-- días: la hoja "AVANCE 2026" (avance y cuota por vendedor, por línea, por
-- semana y por día) y la hoja "base" (el detalle de cada documento
-- facturado). El vendedor no lo veía nunca, o lo veía cuando alguien se lo
-- reenviaba por WhatsApp.
--
-- Acá no se recalcula nada: lo que publica Comercial es lo que ve el
-- vendedor. Se guarda tal cual viene, carga por carga, y la pantalla lee la
-- última. Recalcular el avance desde el detalle daría otro número —la hoja
-- excluye la línea DESCUENTO y alguna fila más— y dos números distintos del
-- mismo mes es peor que no mostrar ninguno.
--
-- Cada carga reemplaza a la anterior del mismo período (`vigente`), y el
-- detalle cuelga de la carga con ON DELETE CASCADE: borrar una carga vieja
-- se lleva sus filas.

-- ===================================================================
-- HELPER
-- ===================================================================

-- El código de representante (CRP1007, CKA2003…) de quien está mirando.
-- La hoja de Comercial habla en códigos, no en uuid.
create or replace function pedidos.current_seller_code()
returns text
language sql
stable
security definer
set search_path to 'pedidos', 'public'
as $$
  select codigo_representante
  from pedidos.sellers
  where user_id = auth.uid()
  limit 1;
$$;

-- ===================================================================
-- CARGAS
-- ===================================================================

create table if not exists pedidos.avance_cargas (
  id uuid primary key default gen_random_uuid(),
  -- '2026-10': el mes al que pertenece el avance, no el día que se subió.
  periodo text not null check (periodo ~ '^[0-9]{4}-[0-9]{2}$'),
  fecha_corte date not null,
  inicio_mes date,
  dias_mes integer,
  dias_transcurridos integer,
  archivo text not null,
  filas_avance integer not null default 0,
  filas_detalle integer not null default 0,
  -- Solo una carga vigente por período: es la que ven los vendedores.
  vigente boolean not null default true,
  subido_por uuid references auth.users (id),
  subido_en timestamptz not null default now()
);

create unique index if not exists avance_cargas_vigente_idx
  on pedidos.avance_cargas (periodo) where vigente;
create index if not exists avance_cargas_periodo_idx
  on pedidos.avance_cargas (periodo, subido_en desc);

-- ===================================================================
-- FILAS DEL CUADRO (hoja "AVANCE 2026")
-- ===================================================================

create table if not exists pedidos.avance_filas (
  id bigint generated always as identity primary key,
  carga_id uuid not null references pedidos.avance_cargas (id) on delete cascade,
  -- 'total' (TOTAL LOGISSA), 'grupo' (LIMA HORIZONTAL…), 'vendedor', 'linea'.
  tipo text not null check (tipo in ('total', 'grupo', 'vendedor', 'linea')),
  -- El agrupador bajo el que cuelga la fila, para armar el cuadro sin
  -- depender del orden: un vendedor sabe a qué grupo pertenece.
  grupo text,
  zona text,
  -- Código de representante. Null en las filas de total y de grupo.
  codigo text,
  -- Vendedor vinculado, cuando el código existe en `sellers`. Es lo que
  -- usa la RLS; se deja null para códigos sin vendedor cargado (una zona
  -- vacante, por ejemplo), y esas filas solo las ve un administrador.
  seller_id uuid references pedidos.sellers (id) on delete set null,
  -- Nombre del vendedor, o nombre de la línea en las filas 'linea'.
  etiqueta text not null,
  orden integer not null,
  s1_avance numeric(14, 2), s1_cuota numeric(14, 2),
  s2_avance numeric(14, 2), s2_cuota numeric(14, 2),
  s3_avance numeric(14, 2), s3_cuota numeric(14, 2),
  s4_avance numeric(14, 2), s4_cuota numeric(14, 2),
  avance numeric(14, 2) not null default 0,
  cuota numeric(14, 2) not null default 0,
  prom_venta_diaria numeric(14, 2),
  proy_lineal numeric(10, 6),
  cuota_diaria numeric(14, 2),
  -- Los 31 días del mes: {"1": 0, "2": 137.27, …}. Como jsonb y no 31
  -- columnas porque es un dato para graficar, nunca para filtrar.
  por_dia jsonb not null default '{}'::jsonb
);

create index if not exists avance_filas_carga_idx on pedidos.avance_filas (carga_id, orden);
create index if not exists avance_filas_codigo_idx on pedidos.avance_filas (carga_id, codigo);
create index if not exists avance_filas_seller_idx on pedidos.avance_filas (seller_id);

-- ===================================================================
-- DETALLE DE VENTA (hoja "base")
-- ===================================================================

create table if not exists pedidos.avance_detalle (
  id bigint generated always as identity primary key,
  carga_id uuid not null references pedidos.avance_cargas (id) on delete cascade,
  codigo text,
  seller_id uuid references pedidos.sellers (id) on delete set null,
  vendedor text,
  fecha date,
  tipo_documento text,
  nro_documento text,
  ruc text,
  razon_social text,
  familia text,
  cod_producto text,
  producto text,
  linea text,
  proveedor text,
  origen text,
  canal text,
  departamento text,
  provincia text,
  distrito text,
  cantidad numeric(14, 2),
  neto numeric(14, 2)
);

create index if not exists avance_detalle_carga_idx on pedidos.avance_detalle (carga_id);
create index if not exists avance_detalle_seller_idx on pedidos.avance_detalle (carga_id, seller_id);
create index if not exists avance_detalle_codigo_idx on pedidos.avance_detalle (carga_id, codigo);

-- ===================================================================
-- RLS
-- ===================================================================

alter table pedidos.avance_cargas enable row level security;
alter table pedidos.avance_filas enable row level security;
alter table pedidos.avance_detalle enable row level security;

-- La carga en sí (qué período, de cuándo es el corte) la ve cualquiera
-- que entre: sin eso la pantalla no puede decir "actualizado al 12/10".
drop policy if exists avance_cargas_select_all on pedidos.avance_cargas;
create policy avance_cargas_select_all on pedidos.avance_cargas
  for select to authenticated using (true);

drop policy if exists avance_cargas_admin_write on pedidos.avance_cargas;
create policy avance_cargas_admin_write on pedidos.avance_cargas
  for all to authenticated using (pedidos.is_admin()) with check (pedidos.is_admin());

-- El cuadro: el vendedor ve su fila, sus líneas, y los totales de grupo y
-- compañía —que es el punto de comparación que pidió Comercial—, pero NO
-- la fila de otro vendedor. Esto lo hace cumplir la base, no la pantalla.
drop policy if exists avance_filas_select_propias on pedidos.avance_filas;
create policy avance_filas_select_propias on pedidos.avance_filas
  for select to authenticated
  using (
    pedidos.is_admin()
    or tipo in ('total', 'grupo')
    or (seller_id is not null and seller_id = pedidos.current_seller_id())
  );

drop policy if exists avance_filas_admin_write on pedidos.avance_filas;
create policy avance_filas_admin_write on pedidos.avance_filas
  for all to authenticated using (pedidos.is_admin()) with check (pedidos.is_admin());

-- El detalle es de quien vendió, y de nadie más.
drop policy if exists avance_detalle_select_propias on pedidos.avance_detalle;
create policy avance_detalle_select_propias on pedidos.avance_detalle
  for select to authenticated
  using (
    pedidos.is_admin()
    or (seller_id is not null and seller_id = pedidos.current_seller_id())
  );

drop policy if exists avance_detalle_admin_write on pedidos.avance_detalle;
create policy avance_detalle_admin_write on pedidos.avance_detalle
  for all to authenticated using (pedidos.is_admin()) with check (pedidos.is_admin());

-- ===================================================================
-- PUBLICAR
-- ===================================================================

-- El cambio de carga vigente, en una sola transacción.
--
-- Hay un índice único parcial sobre (periodo) where vigente, así que
-- "apagar la anterior" y "prender la nueva" no pueden ir en dos llamadas
-- separadas desde la app: entre una y otra, media empresa vería el avance
-- del día anterior o ninguno. La carga se inserta apagada, se llenan sus
-- filas, y esto la enciende de golpe.
--
-- Y son dos UPDATE, no uno con `vigente = (id = p_carga_id)`: el índice
-- único se verifica fila por fila durante la sentencia, no al final, así
-- que el UPDATE de una sola pasada falla con "duplicate key" según el
-- orden en que toque las filas. Pasó al probar la instalación.
create or replace function pedidos.avance_publicar(p_carga_id uuid)
returns void
language plpgsql
security definer
set search_path to 'pedidos', 'public'
as $$
declare
  v_periodo text;
begin
  if not pedidos.is_admin() then
    raise exception 'Solo un administrador puede publicar el avance de ventas.';
  end if;

  select periodo into v_periodo from pedidos.avance_cargas where id = p_carga_id;
  if v_periodo is null then
    raise exception 'La carga no existe.';
  end if;

  update pedidos.avance_cargas
     set vigente = false
   where periodo = v_periodo and vigente and id <> p_carga_id;

  update pedidos.avance_cargas set vigente = true where id = p_carga_id;
end;
$$;

revoke all on function pedidos.avance_publicar(uuid) from public;
grant execute on function pedidos.avance_publicar(uuid) to authenticated;
