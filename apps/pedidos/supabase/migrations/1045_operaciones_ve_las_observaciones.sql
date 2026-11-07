-- 1045 — Operaciones puede LEER las observaciones del pedido.
--
-- La observación que escribe el vendedor ("horario de recepción: 3pm en
-- adelante", "recoger 2 frascos que se enviaron por error") se guarda bien
-- y sale en el correo y en el Excel de la oficina desde la 1025. Pero a la
-- pantalla donde se arma el despacho —/operaciones/<pedido>— nunca llegó,
-- y no sólo por la pantalla: el rol `operaciones` no figuraba en la
-- política de lectura de `order_observations`, así que aunque la pantalla
-- las pidiera recibiría una lista vacía, sin error.
--
-- Resultado, visto el 2026-10-21: dos vendedoras reclamando que sus
-- observaciones "no pasan". Pasaban —39 y 3 observaciones guardadas, todas
-- con su correo enviado— pero quien prepara la caja no las veía.
--
-- Se agrega una política APARTE en vez de reescribir la que ya existe:
-- varias políticas permisivas de SELECT se suman (OR), el cambio no puede
-- dejar a nadie sin acceso ni por un instante, y un `drop`+`create` de la
-- política original fallando a la mitad sí podría. El INSERT no se toca:
-- Operaciones lee lo que pidió el vendedor, no escribe en su nombre; para
-- lo suyo ya tiene el campo de observación del despacho.

drop policy if exists "order_observations_select_operaciones" on pedidos.order_observations;

create policy "order_observations_select_operaciones"
  on pedidos.order_observations for select
  to authenticated
  using (
    pedidos.has_role('operaciones')
    and exists (select 1 from pedidos.orders o where o.id = order_id)
  );
