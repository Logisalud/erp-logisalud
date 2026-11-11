-- 0054 · WMS · Seguimiento para el cliente: se puede encender también en el piloto (decisión de Sebas, 2026-11-11: «enciende»).
--
-- Hasta ahora `wms._seguimiento_disponible()` pedía DOS cosas: fuera del modo piloto Y el interruptor encendido. Ahora basta el interruptor `seguimiento_cliente_habilitado`, que sigue
-- apagado de fábrica y que solo cambia un administrador de la base (un disparador se lo impide a la aplicación). Todo lo demás del seguimiento (límite de intentos, respuesta idéntica
-- si el pedido no existe o el RUC no coincide, enlaces con token hasheado, solo las dos funciones para `anon`) no cambia. Re-ejecutable. Se aplica a mano (nunca al mergear).
create or replace function wms._seguimiento_disponible() returns boolean
language sql stable security definer set search_path = wms, pg_temp as $$
  select coalesce((select valor from wms.parametros where clave = 'seguimiento_cliente_habilitado'), 'false') = 'true'
$$;

revoke execute on all functions in schema wms from public;
