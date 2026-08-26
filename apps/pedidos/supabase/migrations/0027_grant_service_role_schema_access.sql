-- Bug de Fase 1: 0001_schema.sql solo otorgó USAGE sobre el schema
-- "pedidos" a anon/authenticated, nunca a service_role. RLS bypass y
-- privilegios GRANT son capas distintas — service_role bypassa RLS
-- pero igual necesita el GRANT de schema/tabla para poder tocar
-- objetos fuera de "public". Nunca se detectó porque ningún flujo
-- probado de punta a punta había ejercitado un write real vía el
-- cliente admin (service role) hasta el importador de listas de
-- precios.

begin;

grant usage on schema pedidos to service_role;
grant all on all tables in schema pedidos to service_role;
grant all on all sequences in schema pedidos to service_role;

alter default privileges in schema pedidos grant all on tables to service_role;
alter default privileges in schema pedidos grant all on sequences to service_role;

commit;
