-- ===================================================================
-- 0065 — Categoría "Suministros" para Caja Chica y Gastos
--
-- Pedido de Sebas: una llanta no tenía dónde ir. Hoy caería en
-- "Mantenimiento de flota" (que es el servicio, no el repuesto) o en
-- "Otros gastos autorizados" (que es el cajón de sastre y no dice nada).
--
-- `where not exists` y no `on conflict (nombre)`: `gastos.categorias_gasto`
-- NO tiene índice único sobre `nombre` —solo la PK sobre `id`—, así que
-- `on conflict` falla con 42P10. Ya nos pasó en la 0061.
-- ===================================================================

insert into gastos.categorias_gasto (nombre, activo)
select 'Suministros', true
where not exists (
  select 1 from gastos.categorias_gasto where nombre = 'Suministros'
);
