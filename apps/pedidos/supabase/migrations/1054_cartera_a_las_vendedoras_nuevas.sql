-- La cartera pasa a Luz Paredes y a Cinthya Alarcon.
--
-- Pedido de Administración el 2026-11-05, después del alta de la 1053:
-- crear la cuenta no mueve clientes, y las dos estaban heredando la zona
-- con la cartera todavía colgando de las salientes.
--
-- Aplicada a mano el 2026-11-05, con respaldo previo
-- (pedidos.customers_backup_20261105, 3.561 filas).
--
--   Malena Gaona (DAQP01) -> Luz Paredes (DAQP02):      605 clientes
--   Susana Ramos (CRP1011) -> Cinthya Alarcon (CRP1015): 217 clientes
--
-- Los PEDIDOS históricos no se tocan: `orders.seller_id` sigue apuntando a
-- quien los hizo. Susana conserva sus 46. Mover la cartera no reescribe
-- quién vendió qué.
--
-- Malena queda inactiva; nunca se borra.
--
-- POR QUÉ NO SE RENOMBRÓ LA FILA DE LA SALIENTE
--
-- Administración propuso cambiarle el nombre y el código a la vendedora que
-- se va, que es más corto. No se hizo: en cobranzas `vendedores` tiene
-- `token_acceso`, el link con el que la vendedora abre su cartera sin
-- login. Renombrar la fila deja ese link vivo y apuntando a la cartera de
-- la que entra, en manos de alguien que ya no está en la empresa. Además el
-- repo marca a los ex-vendedores como inactivos y nunca los borra, y
-- existen `vendedor_anterior_id` y `fecha_reasignacion` justamente para
-- esto.

do $$
declare
  v_luz uuid; v_cinthya uuid; v_malena uuid; v_susana uuid;
begin
  select id into v_malena  from pedidos.sellers where codigo_representante = 'DAQP01';
  select id into v_susana  from pedidos.sellers where codigo_representante = 'CRP1011';
  select id into v_luz     from pedidos.sellers where codigo_representante = 'DAQP02';
  select id into v_cinthya from pedidos.sellers where codigo_representante = 'CRP1015';
  if v_luz is null or v_cinthya is null then
    raise exception 'Faltan las vendedoras nuevas (DAQP02 / CRP1015): correr antes la 1053';
  end if;

  update pedidos.customers set vendedor_id = v_luz     where vendedor_id = v_malena;
  update pedidos.customers set vendedor_id = v_cinthya where vendedor_id = v_susana;

  update pedidos.sellers set estado = 'inactivo'
   where codigo_representante = 'DAQP01' and estado <> 'inactivo';
end $$;
