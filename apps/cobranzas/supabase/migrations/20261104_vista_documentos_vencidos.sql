-- Las facturas vencidas de cada cliente, una por fila, para el ERP de pedidos.
--
-- La vista hermana `v_deuda_por_cliente` resume: un total vencido y el mayor
-- atraso. Eso alcanza para decidir si un pedido se frena, pero no para que
-- el vendedor entienda por qué, y el resumen engaña: "S/ 6.073,41 vencidos
-- con 116 días" se lee como si hubiera UNA factura de ese monto con esa
-- antigüedad, cuando el monto es la suma de todas y los días son los de la
-- más vieja. En CORFARMA (2026-11-04) la de 116 días era de S/ 2.830,58 y
-- había otras tres, una de ellas de apenas 22 días.
--
-- Con el detalle, el vendedor puede decirle al cliente cuál pagar para
-- volver a comprar, que es la conversación que de verdad ocurre.
--
-- `saldo_vencido` ES LO VENCIDO, NO EL SALDO DE LA FACTURA. La diferencia
-- aparece en las facturas canjeadas por letras: ahí el saldo son las letras
-- que siguen pendientes, y unas ya vencieron mientras otras no. FFF1-1689
-- (2026-11-04) debe S/ 12.521,44 en total con solo S/ 5.000 vencidos. Si
-- esta vista informara el saldo entero, el detalle sumaría S/ 7.521,44 más
-- que el resumen y el vendedor tendría dos verdades del mismo cliente.
-- El saldo completo viaja aparte, en `saldo_documento`.
--
-- Misma definición de "vencido" que la vista hermana —la suma de los tramos
-- de aging— para que las dos no puedan contradecirse. Hereda igual las
-- cuatro ramas de v_cobros y la tolerancia de céntimos.

create or replace view public.v_documentos_vencidos as
select
  s.cliente_ruc               as ruc,
  s.comprobante               as comprobante,
  s.fecha_emision             as fecha_emision,
  s.fecha_vencimiento         as fecha_vencimiento,
  round(s.d0_7 + s.d8_15 + s.d16_30 + s.d31_60 + s.d61_mas, 2) as saldo_vencido,
  round(s.saldo_pendiente, 2) as saldo_documento,
  s.dias_retraso              as dias_atraso,
  s.tiene_letras              as tiene_letras
from public.v_saldos s
where s.saldo_pendiente > 0
  and (s.d0_7 + s.d8_15 + s.d16_30 + s.d31_60 + s.d61_mas) > 0;

comment on view public.v_documentos_vencidos is
  'Una fila por factura vencida, para el ERP de pedidos: qué comprobante, cuánto está '
  'vencido y hace cuántos días. saldo_vencido suma igual que v_deuda_por_cliente.vencido; '
  'saldo_documento es el saldo completo, que difiere en las canjeadas por letras.';
