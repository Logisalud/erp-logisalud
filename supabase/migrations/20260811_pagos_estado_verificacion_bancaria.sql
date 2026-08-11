-- Estado de verificación bancaria en pagos + corte de la regla CONTADO=pagado.
-- Aplicado directamente en Supabase el 2026-08-11; este archivo documenta la migración.

-- ── Parte 1: estado de verificación bancaria ────────────────────────────────
alter table pagos
  add column if not exists estado_verificacion text not null default 'pendiente_confirmar'
    check (estado_verificacion in ('pendiente_confirmar','confirmado')),
  add column if not exists confirmado_en timestamptz,
  add column if not exists registrado_por text,
  add column if not exists investigado boolean not null default false,
  add column if not exists investigado_comentario text,
  add column if not exists investigado_en timestamptz;

-- Backfill: pagos ya conciliados contra el extracto bancario hoy se marcan
-- confirmado retroactivamente (no deben generar alertas falsas).
update pagos p
set estado_verificacion = 'confirmado',
    confirmado_en = coalesce(m.conciliado_en, p.created_at)
from movimientos_banco_import m
where m.pago_id = p.id
  and m.estado_conciliacion = 'conciliado'
  and p.estado_verificacion <> 'confirmado';

-- ── Parte 2: corte de la regla "CONTADO = pagado" ───────────────────────────
-- Facturas CONTADO con fecha_emision < 2026-08-11: siguen con la regla vieja
-- (se asumen pagadas salvo contado_pendiente=true). No es retroactivo.
-- Facturas CONTADO con fecha_emision >= 2026-08-11: requieren un pago real
-- registrado, igual que las de crédito.

create or replace view v_cobros as
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
            when (current_date - d.fecha_vencimiento) >= 1 and (current_date - d.fecha_vencimiento) <= 30 then '1-30'::text
            when (current_date - d.fecha_vencimiento) >= 31 and (current_date - d.fecha_vencimiento) <= 60 then '31-60'::text
            when (current_date - d.fecha_vencimiento) >= 61 and (current_date - d.fecha_vencimiento) <= 90 then '61-90'::text
            else '+90'::text
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
            when (current_date - l.fecha_vencimiento) >= 1 and (current_date - l.fecha_vencimiento) <= 30 then '1-30'::text
            when (current_date - l.fecha_vencimiento) >= 31 and (current_date - l.fecha_vencimiento) <= 60 then '31-60'::text
            when (current_date - l.fecha_vencimiento) >= 61 and (current_date - l.fecha_vencimiento) <= 90 then '61-90'::text
            else '+90'::text
        end as rango,
    'letra'::text as tipo_cobro
   from letra_documento ld
     join letras l on l.id = ld.letra_id
     join documentos d on d.id = ld.documento_id
     join clientes c on c.ruc = d.cliente_ruc
  where l.estado <> 'pagada'::text and (d.tipo = any (array['01'::bpchar, '03'::bpchar])) and d.anulado = false and d.aceptado_sunat is not false;

create or replace view v_saldos as
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
                    when v_cobros.rango = '1-30'::text then v_cobros.importe_cobro
                    else 0::numeric
                end) as d1_30,
            sum(
                case
                    when v_cobros.rango = '31-60'::text then v_cobros.importe_cobro
                    else 0::numeric
                end) as d31_60,
            sum(
                case
                    when v_cobros.rango = '61-90'::text then v_cobros.importe_cobro
                    else 0::numeric
                end) as d61_90,
            sum(
                case
                    when v_cobros.rango = '+90'::text then v_cobros.importe_cobro
                    else 0::numeric
                end) as mas90,
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
    coalesce(ca.d1_30, 0::numeric) as d1_30,
    coalesce(ca.d31_60, 0::numeric) as d31_60,
    coalesce(ca.d61_90, 0::numeric) as d61_90,
    coalesce(ca.mas90, 0::numeric) as mas90,
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
