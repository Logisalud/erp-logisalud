-- Condiciones de pago a crédito. Hasta ahora el catálogo solo tenía
-- 'Contado' (sembrada en 0040), así que el vendedor no tenía nada más
-- que elegir al armar un pedido.
--
-- Reproducible: ON CONFLICT sobre el unique de nombre, se puede correr
-- de nuevo sin duplicar.

insert into pedidos.payment_terms (nombre, descripcion)
values
  ('Crédito 30 días',  'Pago a 30 días desde la emisión del comprobante'),
  ('Crédito 45 días',  'Pago a 45 días desde la emisión del comprobante'),
  ('Crédito 60 días',  'Pago a 60 días desde la emisión del comprobante'),
  ('Crédito 90 días',  'Pago a 90 días desde la emisión del comprobante'),
  ('Crédito 120 días', 'Pago a 120 días desde la emisión del comprobante')
on conflict (nombre) do nothing;
