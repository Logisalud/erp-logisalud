-- 0053 — Categoría TEMPORAL de Pago Directo para el backlog pre-ERP.
--
-- Sebas (Gerencia General) tiene que regularizar un conjunto CERRADO de
-- pagos anteriores al ERP: facturas de mercadería viejas y letras/retiros
-- viejos. Es un número limitado y se termina — nadie más del equipo usa
-- esta categoría, y el resto del equipo sigue con el flujo normal (OC para
-- mercadería nueva).
--
-- POR QUÉ ES TEMPORAL: "mercadería" no es un caso de Pago Directo. Pago
-- Directo existe para lo que NO tiene OC ni OS (luz, agua, peajes,
-- notaría…). Esta categoría es una excepción de migración de datos, no una
-- puerta nueva: dejarla activa para siempre sería ofrecer un camino
-- permanente para saltarse la OC, que es la regla de oro del módulo.
-- Cuando el backlog termine hay que desactivarla:
--
--   update cuentas_x_pagar.categorias_pago_directo
--   set activo = false
--   where nombre = 'Regularización de pagos antiguos (pre-ERP)';
--
-- Mismo mecanismo que ya se usó en 0034 (3 categorías de gasto) y en 0049
-- ("Renta"): desactivar y no borrar, para que las obligaciones ya
-- registradas con esa categoría sigan mostrando su nombre.
--
-- Re-ejecutable: el `where not exists` deja correrla de nuevo sin duplicar.

insert into cuentas_x_pagar.categorias_pago_directo (nombre, activo)
select 'Regularización de pagos antiguos (pre-ERP)', true
where not exists (
  select 1 from cuentas_x_pagar.categorias_pago_directo
  where nombre = 'Regularización de pagos antiguos (pre-ERP)'
);
