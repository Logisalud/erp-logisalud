-- Unifica dos pares de categorías que quedaron significando lo mismo cuando
-- la 0073 agregó los nombres que usa Arlette (Sebas, 2026-09-23).
--
--   Otros gastos autorizados  →  Varios       (la vieja tiene 9 gastos)
--   Pasajes                   →  Movilidad    (la vieja tiene 2 gastos)
--
-- Se RENOMBRA la que tiene historia y se BORRA la recién creada, no al
-- revés. Al renombrar, los gastos ya cargados siguen apuntando al mismo id y
-- pasan a mostrarse con el nombre nuevo; si en cambio se borrara la vieja,
-- habría que repuntar 11 filas a mano o perderlas. Las que se borran acá
-- nacieron hace minutos en la 0073 y tienen 0 movimientos, 0 solicitudes y
-- 0 aportes: no se lleva nada puesto.
--
-- El orden importa: primero el delete y después el rename. Al revés
-- quedarían dos filas con el mismo nombre por un instante, que es
-- exactamente el problema que esta migración viene a sacar.
--
-- `lib/excel-caja-chica.ts` (MAPA_CATEGORIAS) no menciona ninguno de los
-- cuatro nombres, así que el importador de rendiciones no se entera.
--
-- Re-ejecutable: cada paso se condiciona a que haya algo que hacer.

-- ── Varios ──────────────────────────────────────────────────────────────
delete from gastos.categorias_gasto c
 where c.nombre = 'Varios'
   and exists (select 1 from gastos.categorias_gasto v where v.nombre = 'Otros gastos autorizados')
   and not exists (select 1 from caja_chica.movimientos m where m.categoria_id = c.id)
   and not exists (select 1 from gastos.solicitudes_gasto s where s.categoria_id = c.id)
   and not exists (select 1 from gastos.aportes_accionista a where a.categoria_id = c.id);

update gastos.categorias_gasto set nombre = 'Varios'
 where nombre = 'Otros gastos autorizados';

-- ── Movilidad ───────────────────────────────────────────────────────────
delete from gastos.categorias_gasto c
 where c.nombre = 'Movilidad'
   and exists (select 1 from gastos.categorias_gasto v where v.nombre = 'Pasajes')
   and not exists (select 1 from caja_chica.movimientos m where m.categoria_id = c.id)
   and not exists (select 1 from gastos.solicitudes_gasto s where s.categoria_id = c.id)
   and not exists (select 1 from gastos.aportes_accionista a where a.categoria_id = c.id);

update gastos.categorias_gasto set nombre = 'Movilidad'
 where nombre = 'Pasajes';
