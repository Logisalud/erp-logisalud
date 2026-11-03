-- Indicador 4 (Venta a clientes con deuda vencida): por cada venta del
-- mes, cuánta deuda >30 días tenía ESE cliente el día de esa venta (no
-- hoy). Requiere un "as-of" distinto por cada fila — no se puede resolver
-- con fn_saldo_documentos_asof (que es un solo corte para todas). Se
-- simplifica excluyendo del chequeo de "deuda vieja" los documentos
-- canjeados a letras (letras.estado no tiene historial por fecha, así que
-- no se puede saber si estaban pendientes en una fecha pasada arbitraria
-- sin inventar datos) — documentado también en lib/indicadoresCobranza.ts.
create or replace function fn_ventas_con_deuda_vencida(p_fecha_corte date)
returns table (
  documento_id uuid,
  cliente_ruc text,
  razon_social text,
  vendedor_nombre text,
  fecha_emision date,
  venta numeric,
  deuda_vencida_30 numeric,
  deuda_vencida_60 numeric
)
language sql
stable
as $$
  select
    d.id,
    d.cliente_ruc,
    c.razon_social,
    coalesce(v.nombres || ' ' || v.apellidos, 'Sin vendedor'),
    d.fecha_emision,
    -- Venta neta: importe_total - NC + ND (emitidas hasta el corte) del
    -- propio documento. Sin esto, el total de "ventas del mes" no cuadra
    -- con la referencia del PPT (una NC grande en el mes infla la venta
    -- bruta un 42%).
    (d.importe_total
      - coalesce((select sum(nc.importe_total) from documentos nc where nc.documento_relacionado_id = d.id and nc.tipo = '07' and nc.anulado = false and nc.fecha_emision <= p_fecha_corte), 0)
      + coalesce((select sum(nd.importe_total) from documentos nd where nd.documento_relacionado_id = d.id and nd.tipo = '08' and nd.anulado = false and nd.fecha_emision <= p_fecha_corte), 0)
    ) as venta,
    coalesce((
      select sum(greatest(0,
        d2.importe_total
        - coalesce((select sum(nc.importe_total) from documentos nc where nc.documento_relacionado_id = d2.id and nc.tipo = '07' and nc.anulado = false and nc.fecha_emision <= d.fecha_emision), 0)
        + coalesce((select sum(nd.importe_total) from documentos nd where nd.documento_relacionado_id = d2.id and nd.tipo = '08' and nd.anulado = false and nd.fecha_emision <= d.fecha_emision), 0)
        - coalesce((select sum(p2.monto) from pagos p2 where p2.documento_id = d2.id and p2.fecha_pago <= d.fecha_emision), 0)
      ))
      from documentos d2
      where d2.cliente_ruc = d.cliente_ruc
        and d2.id <> d.id
        and d2.tipo in ('01', '03')
        and d2.anulado = false
        and d2.aceptado_sunat is not false
        and not (d2.forma_pago = 'CONTADO' and d2.contado_pendiente = false and d2.fecha_emision < '2026-08-11')
        and not exists (select 1 from letra_documento ld where ld.documento_id = d2.id)
        and not exists (select 1 from factoring_facturas ff join factoring_operaciones fo on fo.id = ff.operacion_id where ff.documento_id = d2.id and fo.anulada = false)
        and not exists (select 1 from documentos_incobrables di where di.documento_id = d2.id)
        and d2.fecha_vencimiento < d.fecha_emision - 30
        and d2.fecha_emision <= d.fecha_emision
    ), 0) as deuda_vencida_30,
    coalesce((
      select sum(greatest(0,
        d2.importe_total
        - coalesce((select sum(nc.importe_total) from documentos nc where nc.documento_relacionado_id = d2.id and nc.tipo = '07' and nc.anulado = false and nc.fecha_emision <= d.fecha_emision), 0)
        + coalesce((select sum(nd.importe_total) from documentos nd where nd.documento_relacionado_id = d2.id and nd.tipo = '08' and nd.anulado = false and nd.fecha_emision <= d.fecha_emision), 0)
        - coalesce((select sum(p2.monto) from pagos p2 where p2.documento_id = d2.id and p2.fecha_pago <= d.fecha_emision), 0)
      ))
      from documentos d2
      where d2.cliente_ruc = d.cliente_ruc
        and d2.id <> d.id
        and d2.tipo in ('01', '03')
        and d2.anulado = false
        and d2.aceptado_sunat is not false
        and not (d2.forma_pago = 'CONTADO' and d2.contado_pendiente = false and d2.fecha_emision < '2026-08-11')
        and not exists (select 1 from letra_documento ld where ld.documento_id = d2.id)
        and not exists (select 1 from factoring_facturas ff join factoring_operaciones fo on fo.id = ff.operacion_id where ff.documento_id = d2.id and fo.anulada = false)
        and not exists (select 1 from documentos_incobrables di where di.documento_id = d2.id)
        and d2.fecha_vencimiento < d.fecha_emision - 60
        and d2.fecha_emision <= d.fecha_emision
    ), 0) as deuda_vencida_60
  from documentos d
  join clientes c on c.ruc = d.cliente_ruc
  left join vendedores v on v.id = c.vendedor_actual_id
  where d.tipo in ('01', '03')
    and d.anulado = false
    and d.aceptado_sunat is not false
    and d.fecha_emision <= p_fecha_corte
    and d.fecha_emision >= date_trunc('month', p_fecha_corte)::date
$$;

revoke execute on function fn_ventas_con_deuda_vencida(date) from public;
