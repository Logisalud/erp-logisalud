-- pedidos.payment_terms quedó vacío desde Fase 2 (0011 solo crea el
-- esquema; 0018_seed_master_data.sql nunca sembró condiciones de pago,
-- solo canales/proveedores/producto de ejemplo). Fase 4 depende de que
-- exista al menos una condición de pago real para poder tomar un
-- pedido — sin esto, el selector de "Nuevo pedido" queda vacío para
-- cualquier usuario, no solo para el cliente de prueba E2E.

insert into pedidos.payment_terms (nombre, descripcion)
values ('Contado', 'Pago al contado contra entrega')
on conflict (nombre) do nothing;

-- Ahora que existe al menos una condición de pago, el cliente de
-- prueba E2E (0039) puede tener una habitual real en vez de null.
update pedidos.customers
set condicion_pago_habitual_id = (select id from pedidos.payment_terms where nombre = 'Contado')
where ruc_o_documento = '20999999999' and condicion_pago_habitual_id is null;
