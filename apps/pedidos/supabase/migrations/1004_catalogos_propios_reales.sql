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

-- ===================================================================
-- Condiciones de pago: mismo problema, mismo origen
-- ===================================================================
-- 1000 sembró CONTADO / CREDITO 15 / 30 / 45 / 60. Las reales son otras seis:
-- no existe un "15 días", y faltaban 90 y 120, que sí se usan.
--
-- Igual que con los canales, cliente_config estaba en cero al aplicar esto,
-- así que el delete no arrastró ninguna clasificación de cliente.

delete from pedidos.payment_terms
 where nombre in ('CONTADO', 'CREDITO 15', 'CREDITO 30', 'CREDITO 45', 'CREDITO 60');

insert into pedidos.payment_terms (nombre) values
  ('Contado'),
  ('Crédito 30 días'),
  ('Crédito 45 días'),
  ('Crédito 60 días'),
  ('Crédito 90 días'),
  ('Crédito 120 días')
on conflict (nombre) do nothing;
