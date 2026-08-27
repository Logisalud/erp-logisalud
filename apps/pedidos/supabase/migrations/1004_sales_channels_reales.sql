-- Corrige los canales de venta: los tres que sembró 1000 estaban inventados.
--
-- 1000 sembró 'FARMACIA', 'DISTRIBUIDORA' e 'INSTITUCIONAL'. Ninguno existe
-- en el negocio. Los canales reales son los seis con los que están armadas
-- las listas de precios de los proveedores, cada uno con su propio precio por
-- producto:
--
--   Mayorista · Horizontal · Minicadenas · Tops · Clínicas · Subdistribuidores
--
-- Importa además de pedidos.price_list_items: mapear seis canales reales a
-- tres inventados perdía información de precios sin forma de recuperarla. Y
-- pedidos.cliente_config.canal_id clasifica a los 3.402 clientes por acá.
--
-- Se puede borrar sin arrastrar nada porque en el momento de aplicar esto
-- cliente_config, price_lists y price_list_items estaban todos en cero
-- (verificado antes de correrla).
--
-- 1000 también quedó corregida en su seed, para que una base reconstruida
-- desde las migraciones no nazca con los canales falsos.
--
-- Re-ejecutable.

delete from pedidos.sales_channels
 where nombre in ('FARMACIA', 'DISTRIBUIDORA', 'INSTITUCIONAL');

insert into pedidos.sales_channels (nombre) values
  ('Mayorista'), ('Horizontal'), ('Minicadenas'),
  ('Tops'), ('Clínicas'), ('Subdistribuidores')
on conflict (nombre) do nothing;
