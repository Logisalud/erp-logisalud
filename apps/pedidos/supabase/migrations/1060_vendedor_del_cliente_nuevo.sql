-- Los clientes que registra un vendedor desde la calle quedaban sin
-- vendedor asignado.
--
-- `registerCustomer()` escribe la zona y quién lo registró
-- (`solicitado_por`), pero nunca `vendedor_id`; la validación tampoco lo
-- completa. Resultado: 86 clientes sin vendedor, 83 de ellos activos,
-- creados entre el 03/08/2026 y el 17/11/2026 — salían con la columna
-- Vendedor en blanco en la cartera y no le colgaban a nadie en los
-- reportes. El alta ya quedó arreglada en el mismo cambio; esto completa
-- los que se crearon mientras el hueco estuvo abierto.
--
-- El criterio es el del negocio: el cliente es del vendedor que lo
-- registró, que es el que estuvo en la puerta. Se completa SOLO cuando las
-- tres cosas se cumplen a la vez:
--
--   1. el que lo registró es un vendedor activo;
--   2. está en la MISMA zona que el cliente;
--   3. el cliente todavía no tiene vendedor.
--
-- La condición 2 no es decorativa: deja afuera al único caso donde el
-- creador es de otra zona (un cliente de prueba creado por TEST001). Y los
-- dos clientes reales que quedaron sin zona ni creador —LANDA CAVERO
-- ESTEBAN GAMANIEL y MENDOZA RAMIREZ JESSICA MILAGROS, ambos del
-- 19/10/2026— no se tocan: no hay de dónde deducir el dueño sin inventarlo,
-- y una cartera no se adivina. Se asignan a mano.
--
-- Re-ejecutable: la condición `vendedor_id is null` hace que la segunda
-- corrida no cambie nada.

update pedidos.customers c
set vendedor_id = s.id
from pedidos.sellers s
where s.user_id = c.solicitado_por
  and s.estado = 'activo'
  and s.zone_id = c.zona_id
  and c.vendedor_id is null
  and c.zona_id is not null;
