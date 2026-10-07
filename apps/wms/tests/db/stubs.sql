-- Simulación local de lo que Supabase da por hecho (ver docs/wms/gate-0.md G.1).
-- NO es Supabase: sin PostgREST, sin GoTrue, sin Storage real.
create schema if not exists auth;
create table if not exists auth.users (id uuid primary key);
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
do $$ begin create role anon nologin; exception when duplicate_object then null; end $$;
do $$ begin create role authenticated nologin; exception when duplicate_object then null; end $$;
do $$ begin create role service_role nologin bypassrls; exception when duplicate_object then null; end $$;
-- Réplica mínima del catálogo de Compras (estructura real: catalogo.productos).
create schema if not exists catalogo;
create table if not exists catalogo.productos (
  id uuid primary key default gen_random_uuid(),
  codigo text not null unique,
  descripcion text not null,
  presentacion text, marca text, principio_activo text,
  unidad_medida text not null default 'UND',
  proveedor_id uuid,
  controla_lote boolean not null default false,
  controla_vencimiento boolean not null default false,
  estado text not null default 'activo' check (estado in ('activo', 'inactivo'))
);
grant usage on schema catalogo to authenticated;
grant select on catalogo.productos to authenticated;
