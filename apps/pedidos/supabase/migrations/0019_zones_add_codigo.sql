-- Código de zona (ej. "LIMH01") usado por el catálogo real de zonas
-- del negocio, para poder mapear vendedores a su zona por código en
-- vez de por nombre.

begin;

alter table pedidos.zones add column codigo_zona text;
alter table pedidos.zones add constraint zones_codigo_zona_key unique (codigo_zona);

commit;
