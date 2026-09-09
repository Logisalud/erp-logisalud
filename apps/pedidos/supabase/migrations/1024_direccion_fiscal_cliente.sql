-- 1024 — La dirección fiscal del cliente, separada de las de entrega.
--
-- `customer_addresses` es —y sigue siendo— el domicilio de ENTREGA: un
-- cliente puede tener varios (local, almacén, sucursal) y de ahí sale el
-- punto de llegada de la guía de remisión. La dirección FISCAL es otra
-- cosa: es una sola, es la que SUNAT tiene asociada al RUC y es la que va
-- a pedir el comprobante electrónico cuando se conecte NubeFact en vivo.
-- Meterla como una fila más de customer_addresses las confundiría —el
-- vendedor podría elegir la fiscal como destino de una entrega—, así que
-- va como columna del cliente.
--
-- Opcional a propósito: hoy no se exige ninguna dirección al registrar, y
-- exigir ésta frenaría el alta de un cliente desde la calle. Los 3.4k
-- clientes de la cartera migrada entran con null.
alter table pedidos.customers
  add column if not exists direccion_fiscal text;

comment on column pedidos.customers.direccion_fiscal is
  'Domicilio fiscal declarado en SUNAT (uno solo, para el comprobante '
  'electrónico). Las direcciones de ENTREGA van en customer_addresses.';

-- `whatsapp` ya existía desde 0012 y la carga de cartera trae 456 números;
-- el formulario de cliente nuevo simplemente no lo capturaba. No hace
-- falta columna nueva.
