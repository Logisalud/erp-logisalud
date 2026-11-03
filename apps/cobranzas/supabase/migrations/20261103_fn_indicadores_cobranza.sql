-- Funciones de lectura para el tablero de Indicadores de cobranza
-- (Bloque B del rediseño). Todas parametrizadas por fecha_corte, "as-of":
-- documentos emitidos <= corte, NC/ND emitidas <= corte, pagos con
-- fecha_pago <= corte. No tocan v_cobros ni v_saldos.
--
-- Regla de letras aplicada (igual que Bloque A / v_saldos): un documento
-- canjeado por letras usa, como saldo, la suma de monto_aplicado de sus
-- letras con estado <> 'pagada'. Limitación documentada: `letras.estado`
-- no tiene historial por fecha, así que el cálculo "as-of" de un corte
-- pasado usa el estado ACTUAL de la letra, no el que tenía en esa fecha
-- (no hay cómo reconstruirlo sin una tabla de historial que no existe).
--
-- Base de documentos: tipo en ('01','03'), no anulado, aceptado_sunat
-- distinto de false — igual que v_saldos. Importe neto = importe_total +
-- ND - NC (emitidas <= corte). Tolerancia de céntimos (<=0.09) aplicada
-- igual que v_cobros. CONTADO emitido antes de 2026-08-11 y no marcado
-- contado_pendiente = saldo 0, misma regla histórica.

create or replace function fn_saldo_documentos_asof(p_fecha_corte date)
returns table (
  documento_id uuid,
  cliente_ruc text,
  vendedor_id uuid,
  vendedor_nombre text,
  fecha_emision date,
  fecha_vencimiento date,
  forma_pago text,
  importe_neto numeric,
  saldo numeric,
  tiene_letras boolean,
  fecha_vencimiento_efectiva date
)
language sql
stable
as $$
  with ncs as (
    select documento_relacionado_id as factura_id, sum(importe_total) as total
    from documentos
    where tipo = '07' and anulado = false and fecha_emision <= p_fecha_corte
    group by documento_relacionado_id
  ), nds as (
    select documento_relacionado_id as factura_id, sum(importe_total) as total
    from documentos
    where tipo = '08' and anulado = false and fecha_emision <= p_fecha_corte
    group by documento_relacionado_id
  ), pgs as (
    select documento_id as factura_id, sum(monto) as total
    from pagos
    where fecha_pago <= p_fecha_corte
    group by documento_id
  ), letras_peor as (
    select ld.documento_id,
      min(l.fecha_vencimiento) as fecha_vencimiento_peor,
      sum(ld.monto_aplicado) filter (where l.estado <> 'pagada') as saldo_letras
    from letra_documento ld
    join letras l on l.id = ld.letra_id
    group by ld.documento_id
  ), factorizadas as (
    select ff.documento_id
    from factoring_facturas ff
    join factoring_operaciones fo on fo.id = ff.operacion_id
    where fo.anulada = false
  ), incobrables as (
    select documento_id from documentos_incobrables
  )
  select
    d.id,
    d.cliente_ruc,
    c.vendedor_actual_id,
    coalesce(v.nombres || ' ' || v.apellidos, 'Sin vendedor'),
    d.fecha_emision,
    d.fecha_vencimiento,
    d.forma_pago,
    (d.importe_total + coalesce(nds.total, 0) - coalesce(ncs.total, 0)) as importe_neto,
    case
      when fz.documento_id is not null or inc.documento_id is not null then 0
      when lp.documento_id is not null then coalesce(lp.saldo_letras, 0)
      when d.forma_pago = 'CONTADO' and d.contado_pendiente = false and d.fecha_emision < '2026-08-11' then 0
      when greatest(0, d.importe_total + coalesce(nds.total, 0) - coalesce(ncs.total, 0) - coalesce(pgs.total, 0)) <= 0.09 then 0
      else greatest(0, d.importe_total + coalesce(nds.total, 0) - coalesce(ncs.total, 0) - coalesce(pgs.total, 0))
    end as saldo,
    lp.documento_id is not null as tiene_letras,
    coalesce(lp.fecha_vencimiento_peor, d.fecha_vencimiento) as fecha_vencimiento_efectiva
  from documentos d
  join clientes c on c.ruc = d.cliente_ruc
  left join vendedores v on v.id = c.vendedor_actual_id
  left join ncs on ncs.factura_id = d.id
  left join nds on nds.factura_id = d.id
  left join pgs on pgs.factura_id = d.id
  left join letras_peor lp on lp.documento_id = d.id
  left join factorizadas fz on fz.documento_id = d.id
  left join incobrables inc on inc.documento_id = d.id
  where (d.tipo = '01' or d.tipo = '03')
    and d.anulado = false
    and d.aceptado_sunat is not false
    and d.fecha_emision <= p_fecha_corte
$$;

comment on function fn_saldo_documentos_asof(date) is
  'Base compartida por los indicadores de cobranza: saldo "as-of" fecha_corte, por documento. Aplica tolerancia de céntimos vía greatest/least igual que v_cobros.';

revoke execute on function fn_saldo_documentos_asof(date) from public;
