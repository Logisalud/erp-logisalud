-- Seller para pedidos de administrador que no corresponden a ningún
-- vendedor de campo real. Nombre deliberadamente distinto al vendedor
-- real ya existente "OFICINA LOGISSA" (CODI01, zona DISTRIBUIDORAS,
-- 0021_seed_zonas_vendedores.sql) para no confundir reportes de ese
-- canal con pedidos administrativos sin vendedor. Confirmado con el
-- usuario el 2026-08-02 (ver docs/business-rules.md, Fase 4).

insert into pedidos.sellers (codigo_representante, nombre_completo, zone_id, estado)
values ('SINVEND', 'OFICINA LOGISSA (SIN VENDEDOR ASIGNADO)', null, 'activo')
on conflict (codigo_representante) do nothing;
