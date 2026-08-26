-- Aplicado directamente en Supabase el 2026-08-12; este archivo documenta la migración.

-- ── Corrección de dato: FFF1-9 (Nelly Revelo, RUC 10073243420) ─────────────
-- fecha_vencimiento tenía un typo de un año (2026-11-26 en vez de 2025-11-26).
-- Impacto: saldo_pendiente de esa factura ya era 0 (saldada por nota de
-- crédito, no por pago) y sigue siendo 0 — el único cambio es de
-- clasificación de aging (rango_vencimiento pasa de 'vigente' a vencido real).
update documentos
set fecha_vencimiento = '2025-11-26'
where id = '724fc51b-3c39-42b8-9c8c-15f1ab0e046b'
  and fecha_vencimiento = '2026-11-26';

-- ── Buckets de aging: de 1-30/31-60/61-90/+90 a 0-7/8-15/16-30/31-60/+60 ───
-- Pura re-agrupación del mismo dias_retraso; no cambia saldo_pendiente ni el
-- total vencido. CREATE OR REPLACE VIEW no permite renombrar columnas, así
-- que se recrean con DROP + CREATE (verificado: nada más depende de ellas).

drop view if exists v_saldos;
drop view if exists v_cobros;

create view v_cobros as
 with ncs as (
         select documentos.documento_relacionado_id as factura_id,
            sum(documentos.importe_total) as total_nc
           from documentos
          where documentos.tipo = '07'::bpchar and documentos.anulado = false
          group by documentos.documento_relacionado_id
        ), nds as (
         select documentos.documento_relacionado_id as factura_id,
            sum(documentos.importe_total) as total_nd
           from documentos
          where documentos.tipo = '08'::bpchar and documentos.anulado = false
          group by documentos.documento_relacionado_id
        ), pgs as (
         select pagos.documento_id as factura_id,
            sum(pagos.monto) as total_pagado
           from pagos
          group by pagos.documento_id
        )
 select d.id as documento_id,
    null::uuid as letra_id,
    d.cliente_ruc,
    c.vendedor_actual_id,
    d.fecha_vencimiento,
        case
            when d.forma_pago = 'CONTADO'::text and d.contado_pendiente = false and d.fecha_emision < '2026-08-11'::date then 0::numeric
            else greatest(0::numeric, d.importe_total + coalesce(nds.total_nd, 0::numeric) - coalesce(ncs.total_nc, 0::numeric) - coalesce(pgs.total_pagado, 0::numeric))
        end as importe_cobro,
        case
            when d.forma_pago = 'CONTADO'::text and d.contado_pendiente = false and d.fecha_emision < '2026-08-11'::date then 'pagado'::text
            when d.fecha_vencimiento is null then 'sin_vencimiento'::text
            when current_date <= d.fecha_vencimiento then 'vigente'::text
            when (current_date - d.fecha_vencimiento) >= 1 and (current_date - d.fecha_vencimiento) <= 7 then '0-7'::text
            when (current_date - d.fecha_vencimiento) >= 8 and (current_date - d.fecha_vencimiento) <= 15 then '8-15'::text
            when (current_date - d.fecha_vencimiento) >= 16 and (current_date - d.fecha_vencimiento) <= 30 then '16-30'::text
            when (current_date - d.fecha_vencimiento) >= 31 and (current_date - d.fecha_vencimiento) <= 60 then '31-60'::text
            else '+60'::text
        end as rango,
    'factura'::text as tipo_cobro
   from documentos d
     join clientes c on c.ruc = d.cliente_ruc
     left join ncs on ncs.factura_id = d.id
     left join nds on nds.factura_id = d.id
     left join pgs on pgs.factura_id = d.id
  where (d.tipo = any (array['01'::bpchar, '03'::bpchar])) and d.anulado = false and d.aceptado_sunat is not false and not (exists ( select 1
           from letra_documento ld
          where ld.documento_id = d.id))
union all
 select d.id as documento_id,
    l.id as letra_id,
    d.cliente_ruc,
    c.vendedor_actual_id,
    l.fecha_vencimiento,
    ld.monto_aplicado as importe_cobro,
        case
            when current_date <= l.fecha_vencimiento then 'vigente'::text
            when (current_date - l.fecha_vencimiento) >= 1 and (current_date - l.fecha_vencimiento) <= 7 then '0-7'::text
            when (current_date - l.fecha_vencimiento) >= 8 and (current_date - l.fecha_vencimiento) <= 15 then '8-15'::text
            when (current_date - l.fecha_vencimiento) >= 16 and (current_date - l.fecha_vencimiento) <= 30 then '16-30'::text
            when (current_date - l.fecha_vencimiento) >= 31 and (current_date - l.fecha_vencimiento) <= 60 then '31-60'::text
            else '+60'::text
        end as rango,
    'letra'::text as tipo_cobro
   from letra_documento ld
     join letras l on l.id = ld.letra_id
     join documentos d on d.id = ld.documento_id
     join clientes c on c.ruc = d.cliente_ruc
  where l.estado <> 'pagada'::text and (d.tipo = any (array['01'::bpchar, '03'::bpchar])) and d.anulado = false and d.aceptado_sunat is not false;

create view v_saldos as
 with ncs as (
         select documentos.documento_relacionado_id as factura_id,
            sum(documentos.importe_total) as total_nc
           from documentos
          where documentos.tipo = '07'::bpchar and documentos.anulado = false
          group by documentos.documento_relacionado_id
        ), nds as (
         select documentos.documento_relacionado_id as factura_id,
            sum(documentos.importe_total) as total_nd
           from documentos
          where documentos.tipo = '08'::bpchar and documentos.anulado = false
          group by documentos.documento_relacionado_id
        ), pgs as (
         select pagos.documento_id as factura_id,
            sum(pagos.monto) as total_pagado
           from pagos
          group by pagos.documento_id
        ), docs_con_letras as (
         select distinct letra_documento.documento_id
           from letra_documento
        ), cobros_agg as (
         select v_cobros.documento_id,
            sum(v_cobros.importe_cobro) as saldo_pendiente,
            sum(
                case
                    when v_cobros.rango = any (array['vigente'::text, 'sin_vencimiento'::text]) then v_cobros.importe_cobro
                    else 0::numeric
                end) as vigente,
            sum(
                case
                    when v_cobros.rango = '0-7'::text then v_cobros.importe_cobro
                    else 0::numeric
                end) as d0_7,
            sum(
                case
                    when v_cobros.rango = '8-15'::text then v_cobros.importe_cobro
                    else 0::numeric
                end) as d8_15,
            sum(
                case
                    when v_cobros.rango = '16-30'::text then v_cobros.importe_cobro
                    else 0::numeric
                end) as d16_30,
            sum(
                case
                    when v_cobros.rango = '31-60'::text then v_cobros.importe_cobro
                    else 0::numeric
                end) as d31_60,
            sum(
                case
                    when v_cobros.rango = '+60'::text then v_cobros.importe_cobro
                    else 0::numeric
                end) as d61_mas,
            max(
                case
                    when v_cobros.tipo_cobro = 'letra'::text then greatest(0, current_date - v_cobros.fecha_vencimiento)
                    else null::integer
                end) as max_dias_letra,
            max(
                case
                    when v_cobros.tipo_cobro = 'factura'::text then v_cobros.rango
                    else null::text
                end) as rango_factura
           from v_cobros
          group by v_cobros.documento_id
        )
 select d.id,
    d.tipo,
    d.serie,
    d.numero,
    (d.serie::text || '-'::text) || d.numero::text as comprobante,
    d.cliente_ruc,
    c.razon_social,
    d.fecha_emision,
    d.fecha_vencimiento,
    d.moneda,
    d.tipo_cambio,
    d.forma_pago,
    d.contado_pendiente,
    d.importe_total,
    coalesce(ncs.total_nc, 0::numeric) as total_nc,
    coalesce(nds.total_nd, 0::numeric) as total_nd,
    coalesce(pgs.total_pagado, 0::numeric) as total_pagado,
    coalesce(ca.saldo_pendiente, 0::numeric) as saldo_pendiente,
    coalesce(ca.vigente, 0::numeric) as vigente,
    coalesce(ca.d0_7, 0::numeric) as d0_7,
    coalesce(ca.d8_15, 0::numeric) as d8_15,
    coalesce(ca.d16_30, 0::numeric) as d16_30,
    coalesce(ca.d31_60, 0::numeric) as d31_60,
    coalesce(ca.d61_mas, 0::numeric) as d61_mas,
    dcl.documento_id is not null as tiene_letras,
        case
            when dcl.documento_id is not null and coalesce(ca.saldo_pendiente, 0::numeric) = 0::numeric then 'pagado'::text
            when dcl.documento_id is not null then 'con_letras'::text
            else coalesce(ca.rango_factura, 'sin_vencimiento'::text)
        end as rango_vencimiento,
        case
            when dcl.documento_id is not null then coalesce(ca.max_dias_letra, 0)
            when d.forma_pago = 'CONTADO'::text and d.contado_pendiente = false and d.fecha_emision < '2026-08-11'::date then 0
            else greatest(0, current_date - d.fecha_vencimiento)
        end as dias_retraso,
    v.id as vendedor_id,
    v.codigo as vendedor_codigo,
    (v.nombres || ' '::text) || v.apellidos as vendedor_nombre,
    c.codigo_zona as zona_nombre,
    d.anulado,
    d.created_at
   from documentos d
     join clientes c on c.ruc = d.cliente_ruc
     left join vendedores v on v.id = c.vendedor_actual_id
     left join ncs on ncs.factura_id = d.id
     left join nds on nds.factura_id = d.id
     left join pgs on pgs.factura_id = d.id
     left join docs_con_letras dcl on dcl.documento_id = d.id
     left join cobros_agg ca on ca.documento_id = d.id
  where (d.tipo = any (array['01'::bpchar, '03'::bpchar])) and d.anulado = false and d.aceptado_sunat is not false;
