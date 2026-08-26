-- Índices para la búsqueda de clientes del selector de pedido.
--
-- La búsqueda es `ilike '%term%'` sobre razón social, nombre comercial y
-- RUC (ver services/customers.ts). Un patrón que empieza con comodín NO
-- puede usar un btree, así que sin esto cada tecleada es un seq scan sobre
-- la cartera entera. Con 3.4k filas todavía se aguanta, pero la cartera
-- crece y la consulta corre en el camino caliente del vendedor.
--
-- pg_trgm sí indexa `%...%`: parte el texto en trigramas y el GIN los
-- busca. Es la única forma de que un `ilike` con comodín adelante use
-- índice.

create extension if not exists pg_trgm;

create index if not exists customers_razon_social_trgm_idx
  on pedidos.customers using gin (razon_social gin_trgm_ops);

create index if not exists customers_nombre_comercial_trgm_idx
  on pedidos.customers using gin (nombre_comercial gin_trgm_ops);

create index if not exists customers_ruc_o_documento_trgm_idx
  on pedidos.customers using gin (ruc_o_documento gin_trgm_ops);

-- El selector siempre filtra por estado = 'ACTIVO' antes de buscar.
-- customers_estado_idx (0012) ya cubre eso.
