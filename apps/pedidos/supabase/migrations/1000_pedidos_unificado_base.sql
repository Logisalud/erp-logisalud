-- Unificación de Pedidos, parte 2: catálogos y permisos.
--
-- Reemplaza las migraciones 0001-0052 de este directorio, que nunca se
-- aplicaron al proyecto consolidado. Ver docs/plan-unificacion-pedidos.md para
-- la clasificación de las 52 y el motivo de cada decisión.
--
-- Lo que ya NO existe en este schema, y por qué:
--   pedidos.customers   -> public.clientes (3.443 filas reales)
--   pedidos.sellers     -> public.vendedores (20 filas reales)
--   pedidos.zones       -> public.digemid_zona_vendedor (por codigo_zona)
--   pedidos.suppliers   -> compras.proveedores
--   pedidos.products    -> catalogo.productos
--   pedidos.profiles    -> public.perfiles
--   pedidos.roles / user_roles / has_role() / is_admin()
--                       -> public.perfiles.area + .rol, con area_en() y tiene_rol()
--
-- Se numera desde 1000 para no chocar con las 0001-0052, que quedan como
-- referencia histórica del esquema de Andrés.
--
-- Re-ejecutable.

create schema if not exists pedidos;

-- ===================================================================
-- HELPERS
-- ===================================================================

-- Mapeo vendedor <-> cuenta. public.vendedores no tiene columna de usuario
-- (nunca hubo login en cobranzas), así que el vínculo vive acá.
create table if not exists pedidos.vendedor_usuario (
  vendedor_id uuid primary key references public.vendedores (id) on delete cascade,
  user_id uuid not null unique references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

-- ¿Qué vendedor soy? Null si la persona no es un vendedor de campo.
create or replace function pedidos.vendedor_actual()
returns uuid
language sql
stable
security definer
set search_path = pedidos, public
as $$
  select vendedor_id from pedidos.vendedor_usuario where user_id = auth.uid();
$$;

-- Quién puede ver y tocar el módulo de Pedidos en general.
create or replace function pedidos.acceso_pedidos()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.tiene_rol('admin', 'control_pedidos', 'vendedor', 'operaciones')
      or public.area_en('gerencia', 'admin');
$$;

-- ===================================================================
-- AUDITORÍA
-- ===================================================================
create table if not exists pedidos.audit_logs (
  id bigint generated always as identity primary key,
  actor uuid references auth.users (id),
  accion text not null,
  entidad text not null,
  entidad_id text,
  datos_antes jsonb,
  datos_despues jsonb,
  fecha timestamptz not null default now()
);

create index if not exists audit_logs_entidad_idx on pedidos.audit_logs (entidad, entidad_id);
create index if not exists audit_logs_fecha_idx on pedidos.audit_logs (fecha desc);

create or replace function pedidos.audit_row_change()
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
    tg_table_name,
    case when tg_op = 'DELETE' then (to_jsonb(old) ->> 'id') else (to_jsonb(new) ->> 'id') end,
    case when tg_op = 'INSERT' then null else to_jsonb(old) end,
    case when tg_op = 'DELETE' then null else to_jsonb(new) end
  );
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

-- ===================================================================
-- CATÁLOGOS PROPIOS DE PEDIDOS
-- (no duplican nada del resto del ERP)
-- ===================================================================
create table if not exists pedidos.sales_channels (
  id smallint generated always as identity primary key,
  nombre text not null unique,
  estado text not null default 'activo' check (estado in ('activo', 'inactivo')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists pedidos.payment_terms (
  id smallint generated always as identity primary key,
  nombre text not null unique,
  descripcion text,
  estado text not null default 'activo' check (estado in ('activo', 'inactivo')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists pedidos.tax_configurations (
  id bigint generated always as identity primary key,
  nombre text not null,
  valor numeric(6, 3) not null,
  vigente_desde date not null default current_date,
  vigente_hasta date,
  created_at timestamptz not null default now(),
  constraint tax_configurations_vigencia_check
    check (vigente_hasta is null or vigente_hasta >= vigente_desde)
);

-- ===================================================================
-- CLIENTE: extensión de public.clientes
-- ===================================================================
-- public.clientes es la única fuente de clientes del ERP. Estos son los
-- atributos que solo le importan a Pedidos y que no corresponde meter en la
-- tabla de cobranzas.
--
-- La PK es el RUC, igual que en public.clientes: es la clave universal de
-- matching en todo el sistema (nunca DNI ni id interno).
create table if not exists pedidos.cliente_config (
  cliente_ruc char(11) primary key references public.clientes (ruc) on delete cascade,

  tipo_comprobante_permitido text not null default 'FACTURA'
    check (tipo_comprobante_permitido in ('FACTURA', 'BOLETA', 'FACTURA_O_BOLETA')),
  canal_id smallint references pedidos.sales_channels (id),
  condicion_pago_habitual_id smallint references pedidos.payment_terms (id),
  whatsapp text,

  es_agente_retencion boolean not null default false,
  fecha_ultima_validacion_tributaria date,

  estado text not null default 'PENDIENTE_DE_VALIDACION'
    check (estado in ('PENDIENTE_DE_VALIDACION', 'ACTIVO', 'RECHAZADO', 'INACTIVO')),
  solicitado_por uuid references auth.users (id),
  validado_por uuid references auth.users (id),
  fecha_validacion timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists cliente_config_estado_idx on pedidos.cliente_config (estado);

create table if not exists pedidos.cliente_direcciones (
  id uuid primary key default gen_random_uuid(),
  cliente_ruc char(11) not null references public.clientes (ruc) on delete cascade,
  direccion text not null,
  ubigeo text,
  referencia text,
  es_principal boolean not null default false,
  estado text not null default 'activo' check (estado in ('activo', 'inactivo')),
  solicitado_por uuid references auth.users (id),
  created_at timestamptz not null default now()
);

create index if not exists cliente_direcciones_ruc_idx on pedidos.cliente_direcciones (cliente_ruc);
create unique index if not exists cliente_direccion_principal_unica
  on pedidos.cliente_direcciones (cliente_ruc) where es_principal;

create table if not exists pedidos.cliente_contactos (
  id uuid primary key default gen_random_uuid(),
  cliente_ruc char(11) not null references public.clientes (ruc) on delete cascade,
  nombre text not null,
  cargo text,
  telefono text,
  email text,
  es_principal boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists cliente_contactos_ruc_idx on pedidos.cliente_contactos (cliente_ruc);

-- ===================================================================
-- ZONAS: se referencian por codigo_zona
-- ===================================================================
-- Identidad canónica de zona en el ERP: el TEXTO codigo_zona, no un uuid.
-- Es lo que usa cobranzas (clientes.codigo_zona) y su trigger de asignación
-- de vendedor, y la única tabla con codigo_zona como clave primaria es
-- public.digemid_zona_vendedor.
--
-- OJO: public.zonas NO sirve para esto. Son dos sistemas de zonas distintos
-- que conviven en cobranzas: zonas tiene 'ZONA 01'..'ZONA 16' e
-- 'INSTITUCIONES' (17 filas, uuid, sin columna de código), mientras
-- digemid_zona_vendedor tiene códigos geográficos (AREM01, LIMH01, TRUM02…,
-- 18 filas). De los 17 codigo_zona distintos que usan los 3.443 clientes,
-- 17 existen en digemid_zona_vendedor y 0 en zonas. Ver el plan.
create table if not exists pedidos.zona_asignaciones (
  id bigint generated always as identity primary key,
  codigo_zona text not null references public.digemid_zona_vendedor (codigo_zona) on delete restrict,
  vendedor_id uuid not null references public.vendedores (id),
  vigencia_desde date not null default current_date,
  vigencia_hasta date,
  created_at timestamptz not null default now(),
  constraint zona_asignaciones_vigencia_check
    check (vigencia_hasta is null or vigencia_hasta >= vigencia_desde)
);

create index if not exists zona_asignaciones_zona_idx on pedidos.zona_asignaciones (codigo_zona);

create table if not exists pedidos.zona_participaciones (
  id bigint generated always as identity primary key,
  codigo_zona text not null references public.digemid_zona_vendedor (codigo_zona) on delete restrict,
  vendedor_id uuid not null references public.vendedores (id),
  porcentaje_participacion numeric(5, 2) not null
    check (porcentaje_participacion > 0 and porcentaje_participacion <= 100),
  vigencia_desde date not null default current_date,
  vigencia_hasta date,
  usuario_autorizo uuid not null references auth.users (id),
  created_at timestamptz not null default now(),
  constraint zona_participaciones_vigencia_check
    check (vigencia_hasta is null or vigencia_hasta >= vigencia_desde),
  unique (codigo_zona, vendedor_id, vigencia_desde)
);

-- La participación de una zona no puede pasar de 100% en una fecha dada.
create or replace function pedidos.check_participacion_total()
returns trigger
language plpgsql
set search_path = pedidos, public
as $$
declare total numeric(6, 2);
begin
  select coalesce(sum(porcentaje_participacion), 0) into total
  from pedidos.zona_participaciones
  where codigo_zona = new.codigo_zona
    and (vigencia_hasta is null or vigencia_hasta >= new.vigencia_desde)
    and id <> coalesce(new.id, -1);

  if total + new.porcentaje_participacion > 100 then
    raise exception 'La participación de la zona % sumaría %%%, más de 100%%',
      new.codigo_zona, total + new.porcentaje_participacion;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_check_participacion on pedidos.zona_participaciones;
create trigger trg_check_participacion
  before insert or update on pedidos.zona_participaciones
  for each row execute function pedidos.check_participacion_total();

-- ===================================================================
-- PRECIOS DE VENTA
-- ===================================================================
-- El precio de venta es de Pedidos. El de compra es de Compras. El catálogo
-- compartido no guarda ninguno de los dos.
create table if not exists pedidos.product_tax_profiles (
  id bigint generated always as identity primary key,
  producto_id uuid not null references catalogo.productos (id) on delete cascade,
  afectacion_tributaria text not null
    check (afectacion_tributaria in ('GRAVADO', 'INAFECTO')),
  tasa_aplicable numeric(5, 2) not null default 0,
  vvf_sin_igv numeric(12, 4),
  vvd_sin_igv numeric(12, 4),
  costo_referencial_distribuidora numeric(12, 4),
  fecha_vigencia_proveedor date,
  vigente_desde date not null default current_date,
  vigente_hasta date,
  created_at timestamptz not null default now(),
  constraint product_tax_profiles_vigencia_check
    check (vigente_hasta is null or vigente_hasta >= vigente_desde)
);

create index if not exists product_tax_profiles_producto_idx
  on pedidos.product_tax_profiles (producto_id);

create table if not exists pedidos.price_lists (
  id uuid primary key default gen_random_uuid(),
  proveedor_id uuid not null references compras.proveedores (id),
  fecha_inicio date not null default current_date,
  fecha_fin date,
  archivo_nombre text not null,
  archivo_storage_path text,
  importado_por uuid not null references auth.users (id),
  publicado_en timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint price_lists_vigencia_check check (fecha_fin is null or fecha_fin >= fecha_inicio)
);

create table if not exists pedidos.price_list_items (
  id bigint generated always as identity primary key,
  price_list_id uuid not null references pedidos.price_lists (id) on delete cascade,
  producto_id uuid not null references catalogo.productos (id),
  sales_channel_id smallint not null references pedidos.sales_channels (id),
  precio numeric(12, 4) not null,
  vigente_hasta date,
  created_at timestamptz not null default now(),
  unique (price_list_id, producto_id, sales_channel_id)
);

-- ===================================================================
-- RLS
-- ===================================================================
do $$
declare t record;
begin
  for t in select tablename from pg_tables where schemaname = 'pedidos'
  loop
    execute format('alter table pedidos.%I enable row level security;', t.tablename);
  end loop;
end $$;

-- Catálogos y precios: los lee cualquiera con acceso al módulo; los mantiene
-- quien administra pedidos.
do $$
declare t text;
begin
  foreach t in array array[
    'sales_channels', 'payment_terms', 'tax_configurations',
    'product_tax_profiles', 'price_lists', 'price_list_items'
  ] loop
    execute format('drop policy if exists %I on pedidos.%I;', t || '_lectura', t);
    execute format($f$
      create policy %I on pedidos.%I for select to authenticated
      using (pedidos.acceso_pedidos());
    $f$, t || '_lectura', t);

    execute format('drop policy if exists %I on pedidos.%I;', t || '_escritura', t);
    execute format($f$
      create policy %I on pedidos.%I for all to authenticated
      using (public.tiene_rol('admin', 'control_pedidos') or public.es_admin())
      with check (public.tiene_rol('admin', 'control_pedidos') or public.es_admin());
    $f$, t || '_escritura', t);
  end loop;
end $$;

-- Mapeo vendedor <-> cuenta: cada quien ve el suyo, lo administra admin.
drop policy if exists vendedor_usuario_lectura on pedidos.vendedor_usuario;
create policy vendedor_usuario_lectura on pedidos.vendedor_usuario
  for select to authenticated
  using (user_id = auth.uid() or public.puede_actuar_por_otro());

drop policy if exists vendedor_usuario_escritura on pedidos.vendedor_usuario;
create policy vendedor_usuario_escritura on pedidos.vendedor_usuario
  for all to authenticated
  using (public.es_admin()) with check (public.es_admin());

-- Cliente: el vendedor ve los clientes de las zonas que atiende; quien
-- administra pedidos ve todos.
drop policy if exists cliente_config_lectura on pedidos.cliente_config;
create policy cliente_config_lectura on pedidos.cliente_config
  for select to authenticated
  using (
    public.puede_actuar_por_otro()
    or exists (
      select 1
      from public.clientes c
      join pedidos.zona_asignaciones za on za.codigo_zona = c.codigo_zona
      where c.ruc = cliente_config.cliente_ruc
        and za.vendedor_id = pedidos.vendedor_actual()
        and (za.vigencia_hasta is null or za.vigencia_hasta >= current_date)
    )
  );

-- Un vendedor puede pedir el alta de un cliente; validarlo es de oficina.
drop policy if exists cliente_config_crea on pedidos.cliente_config;
create policy cliente_config_crea on pedidos.cliente_config
  for insert to authenticated
  with check (pedidos.acceso_pedidos() and solicitado_por = auth.uid());

drop policy if exists cliente_config_actualiza on pedidos.cliente_config;
create policy cliente_config_actualiza on pedidos.cliente_config
  for update to authenticated using (public.puede_actuar_por_otro());

do $$
declare t text;
begin
  foreach t in array array['cliente_direcciones', 'cliente_contactos'] loop
    execute format('drop policy if exists %I on pedidos.%I;', t || '_lectura', t);
    execute format($f$
      create policy %I on pedidos.%I for select to authenticated
      using (pedidos.acceso_pedidos());
    $f$, t || '_lectura', t);

    execute format('drop policy if exists %I on pedidos.%I;', t || '_escritura', t);
    execute format($f$
      create policy %I on pedidos.%I for all to authenticated
      using (public.puede_actuar_por_otro())
      with check (public.puede_actuar_por_otro());
    $f$, t || '_escritura', t);
  end loop;
end $$;

-- Zonas: las lee todo el módulo, las asigna oficina.
do $$
declare t text;
begin
  foreach t in array array['zona_asignaciones', 'zona_participaciones'] loop
    execute format('drop policy if exists %I on pedidos.%I;', t || '_lectura', t);
    execute format($f$
      create policy %I on pedidos.%I for select to authenticated
      using (pedidos.acceso_pedidos());
    $f$, t || '_lectura', t);

    execute format('drop policy if exists %I on pedidos.%I;', t || '_escritura', t);
    execute format($f$
      create policy %I on pedidos.%I for all to authenticated
      using (public.puede_actuar_por_otro())
      with check (public.puede_actuar_por_otro());
    $f$, t || '_escritura', t);
  end loop;
end $$;

-- Auditoría: se escribe por trigger (security definer), nadie la edita.
drop policy if exists audit_logs_lectura on pedidos.audit_logs;
create policy audit_logs_lectura on pedidos.audit_logs
  for select to authenticated
  using (public.puede_actuar_por_otro() or public.area_en('gerencia'));

-- ===================================================================
-- TRIGGERS DE AUDITORÍA
-- ===================================================================
do $$
declare t text;
begin
  foreach t in array array[
    'cliente_config', 'zona_asignaciones', 'zona_participaciones',
    'product_tax_profiles', 'price_lists', 'vendedor_usuario'
  ] loop
    execute format('drop trigger if exists trg_audit_%s on pedidos.%I;', t, t);
    execute format($f$
      create trigger trg_audit_%s after insert or update or delete on pedidos.%I
      for each row execute function pedidos.audit_row_change();
    $f$, t, t);
  end loop;
end $$;

-- ===================================================================
-- SEEDS
-- ===================================================================
insert into pedidos.sales_channels (nombre) values
  ('FARMACIA'), ('DISTRIBUIDORA'), ('INSTITUCIONAL')
on conflict (nombre) do nothing;

insert into pedidos.payment_terms (nombre, descripcion) values
  ('CONTADO', 'Pago al momento de la entrega'),
  ('CREDITO 15', 'Crédito a 15 días'),
  ('CREDITO 30', 'Crédito a 30 días'),
  ('CREDITO 45', 'Crédito a 45 días'),
  ('CREDITO 60', 'Crédito a 60 días')
on conflict (nombre) do nothing;

insert into pedidos.tax_configurations (nombre, valor)
select 'IGV', 18.000
where not exists (select 1 from pedidos.tax_configurations where nombre = 'IGV');
