-- Fase 1: esquema propio del módulo de Pedidos.
-- Todas las tablas de este repo viven en "pedidos", sin tocar otros
-- schemas que puedan existir en el mismo proyecto Supabase.
-- Ver docs/architecture.md.

create schema if not exists pedidos;

-- Permite a los roles de API (anon/authenticated) ver el schema en
-- PostgREST. El acceso real a cada tabla sigue gobernado por RLS.
grant usage on schema pedidos to anon, authenticated;

alter default privileges in schema pedidos
  grant select, insert, update, delete on tables to authenticated;
