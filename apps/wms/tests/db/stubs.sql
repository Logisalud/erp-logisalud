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

-- Réplica mínima de las tablas de Compras que lee la vista wms.v_recepciones_compra
-- (estructura real: apps/compras/supabase/migrations/0001_compras_pagos_schemas.sql).
create schema if not exists compras;
create schema if not exists almacen;
create table if not exists compras.proveedores (
  id uuid primary key default gen_random_uuid(), ruc text not null unique, razon_social text not null);
create table if not exists compras.ordenes_compra (
  id uuid primary key default gen_random_uuid(), codigo text not null unique,
  proveedor_id uuid not null references compras.proveedores(id), estado text not null default 'enviada');
create table if not exists compras.ordenes_compra_items (
  id uuid primary key default gen_random_uuid(), oc_id uuid not null references compras.ordenes_compra(id),
  producto_id uuid not null references catalogo.productos(id), cantidad_pedida numeric(14,3) not null,
  cantidad_recibida numeric(14,3) not null default 0);
create table if not exists almacen.recepciones (
  id uuid primary key default gen_random_uuid(), oc_id uuid not null references compras.ordenes_compra(id),
  fecha_recepcion timestamptz not null default now(), estado text not null default 'pendiente');
create table if not exists almacen.recepciones_items (
  id uuid primary key default gen_random_uuid(), recepcion_id uuid not null references almacen.recepciones(id),
  oc_item_id uuid not null references compras.ordenes_compra_items(id), cantidad_fisica numeric(14,3) not null);
create table if not exists almacen.recepciones_guias (
  id uuid primary key default gen_random_uuid(), recepcion_id uuid not null references almacen.recepciones(id),
  numero text not null);
grant usage on schema compras, almacen to authenticated;
grant select on all tables in schema compras, almacen to authenticated;
