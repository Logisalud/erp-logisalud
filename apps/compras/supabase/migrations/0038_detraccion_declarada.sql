-- Sesión 2026-09-07: la detracción deja de depender de un catálogo de
-- categorías (cuentas_x_pagar.tasas_detraccion, nunca se cargó con el
-- Anexo SUNAT real) y pasa a ser una declaración explícita de quien
-- registra el pago, mirando la factura real. Ver domain/obligacion.ts::
-- validarDeclaracionDetraccion.
--
-- `tasas_detraccion` y `obligaciones.tasa_detraccion_id` NO se tocan: se
-- dejan de alimentar desde Pago Directo, OS y el registro de factura de
-- OC, pero la tabla y la columna quedan — si en el futuro se carga el
-- catálogo real, se puede reactivar como atajo opcional sin migración
-- nueva. Todo aditivo y re-ejecutable.

-- ===================================================================
-- Columna nueva: el % declarado se guarda directo, sin pasar por
-- tasas_detraccion. `cuentas_x_pagar.facturas_pendientes` ya tenía esta
-- columna (0028) para la cola de OC — acá se agrega a la obligación
-- final, que es donde faltaba (se perdía en el camino: procesarFacturaPendiente
-- solo pasaba tasa_detraccion_id/monto_detraccion a
-- crearObligacionCompraMultiRecepcion, nunca el %).
-- ===================================================================
alter table cuentas_x_pagar.obligaciones
  add column if not exists porcentaje_detraccion numeric(5,2);

-- ===================================================================
-- Limpieza de categorías de gasto duplicadas en Pago Directo (distinto de
-- tasas_detraccion — esto es cuentas_x_pagar.categorias_pago_directo, el
-- catálogo general de "por qué se paga sin OC/OS", que SÍ sigue en uso).
-- Verificado antes de escribir esto: 0 obligaciones en producción
-- apuntan a ninguna de las 4 categorías involucradas, así que no hace
-- falta reasignar nada — si esa condición cambiara entre que se escribió
-- esto y que corre, el UPDATE de abajo reasigna antes de borrar.
-- ===================================================================
do $$
declare
  v_courier_sobrevive uuid;
  v_courier_duplicada uuid;
  v_viaje_sobrevive uuid;
  v_viaje_duplicada uuid;
begin
  select id into v_courier_sobrevive from cuentas_x_pagar.categorias_pago_directo where nombre = 'Courier y mensajería';
  select id into v_courier_duplicada from cuentas_x_pagar.categorias_pago_directo where nombre = 'Servicios de courier y mensajería';
  if v_courier_sobrevive is not null and v_courier_duplicada is not null then
    update cuentas_x_pagar.obligaciones set categoria_pago_directo_id = v_courier_sobrevive where categoria_pago_directo_id = v_courier_duplicada;
    delete from cuentas_x_pagar.categorias_pago_directo where id = v_courier_duplicada;
  end if;

  select id into v_viaje_sobrevive from cuentas_x_pagar.categorias_pago_directo where nombre = 'Boletos y servicios de viaje';
  select id into v_viaje_duplicada from cuentas_x_pagar.categorias_pago_directo where nombre = 'Pasajes aéreos, terrestres';
  if v_viaje_sobrevive is not null and v_viaje_duplicada is not null then
    update cuentas_x_pagar.obligaciones set categoria_pago_directo_id = v_viaje_sobrevive where categoria_pago_directo_id = v_viaje_duplicada;
    delete from cuentas_x_pagar.categorias_pago_directo where id = v_viaje_duplicada;
  end if;
end $$;
