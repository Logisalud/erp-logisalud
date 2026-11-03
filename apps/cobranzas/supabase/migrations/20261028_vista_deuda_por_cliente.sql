-- La deuda de cada cliente, en una fila, para el ERP de pedidos.
--
-- El ERP de pedidos está en otro proyecto Supabase: no puede hacer un join
-- contra esta cartera. Se lleva una copia por RUC, y esta vista es lo único
-- que lee. Acá queda qué significa "deuda" para esa regla, para que el día
-- que cambie no haya que buscarlo dentro del otro sistema.
--
-- "Vencido" es la suma de los tramos de aging de v_saldos, y "dias_atraso"
-- es el MAYOR atraso entre los documentos vencidos del cliente — no el
-- promedio: un cliente con una factura de 200 días no deja de ser un riesgo
-- porque las otras cinco estén al día.
--
-- Hereda sola las cuatro ramas de v_cobros y la tolerancia de céntimos: un
-- saldo de hasta S/ 0.09 ya viene en cero desde ahí, así que nadie se
-- bloquea por un redondeo.

create or replace view public.v_deuda_por_cliente as
select
  s.cliente_ruc                                    as ruc,
  max(s.razon_social)                              as razon_social,
  round(sum(s.saldo_pendiente), 2)                 as saldo,
  round(sum(s.d0_7 + s.d8_15 + s.d16_30 + s.d31_60 + s.d61_mas), 2) as vencido,
  coalesce(max(case when (s.d0_7 + s.d8_15 + s.d16_30 + s.d31_60 + s.d61_mas) > 0
                    then s.dias_retraso end), 0)   as dias_atraso,
  count(*) filter (where (s.d0_7 + s.d8_15 + s.d16_30 + s.d31_60 + s.d61_mas) > 0) as documentos_vencidos,
  now()                                            as calculado_en
from public.v_saldos s
where s.saldo_pendiente > 0
group by s.cliente_ruc;

comment on view public.v_deuda_por_cliente is
  'Resumen de deuda por cliente para el ERP de pedidos: saldo, vencido y el mayor atraso. '
  'Lo consume el puente de crédito (pedidos.credito_clientes), que lo copia una vez al día.';
