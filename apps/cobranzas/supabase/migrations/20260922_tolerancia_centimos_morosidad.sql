-- Tolerancia de céntimos: un saldo de hasta S/ 0.09 no es deuda.
--
-- Pedido del 2026-09-22. En el estado de cuenta aparecían clientes con
-- "morosidad" de 6 céntimos: el cliente pagó, pero el depósito quedó
-- corto por el redondeo del vuelto o de la retención. Contablemente es
-- ruido, y ensucia la lista de morosos con casos que nadie va a cobrar
-- (DROGUERIA MONTEAGUDO S.A.C. figuraba con 100% de morosidad por
-- S/ 0.06).
--
-- Regla: si el saldo bruto de una factura es <= 0.09 se trata como
-- pagada — no suma al saldo, no suma al vencido, no sale en las listas
-- de deuda. El umbral es "menos de 10 céntimos"; a partir de S/ 0.10 la
-- factura sigue contando entera, como siempre.
--
-- Va en v_cobros, que es de donde sale todo: v_saldos se calcula sobre
-- ella y el resto del sistema (estado de cuenta, link de vendedores,
-- exportaciones, morosidad_diaria, concentración de cartera) lee
-- v_saldos. Un solo lugar, un solo criterio.
--
-- Esto NO toca `pagos` ni `documentos.importe_total`: el importe
-- facturado y lo efectivamente cobrado siguen intactos. Solo cambia
-- cuánto se considera pendiente.
--
-- Impacto medido el 2026-09-22 sobre las facturas sin letras,
-- comparando la lógica vieja y la nueva contra los mismos datos:
--
--   saldo total            S/ 675,600.64 -> S/ 675,598.78  (-1.86)
--   saldo vencido          S/ 200,254.29 -> S/ 200,252.43  (-1.86)
--   facturas con saldo               639 -> 563            (-76)
--   clientes con deuda               415 -> 367            (-48)
--   clientes con vencido             245 -> 187            (-58)
--
-- Las 76 facturas tenían entre S/ 0.01 y S/ 0.06 de saldo (no hay
-- ninguna entre 0.07 y 0.30, así que el umbral exacto dentro de ese
-- rango no cambia nada hoy) y las 76 estaban clasificadas como
-- vencidas. Ninguna factura por encima de S/ 0.09 cambió.
--
-- Las letras quedan fuera de la regla a propósito: su importe es el
-- valor de la letra girada, no un residuo de redondeo.

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
        ), fact as (
         select d.id,
            d.cliente_ruc,
            d.fecha_vencimiento,
            c.vendedor_actual_id,
            -- Saldada por regla vieja de CONTADO (emitidas antes del
            -- 2026-08-11), o saldada porque lo que falta son céntimos.
            (d.forma_pago = 'CONTADO'::text and d.contado_pendiente = false and d.fecha_emision < '2026-08-11'::date)
              or greatest(0::numeric, d.importe_total + coalesce(nds.total_nd, 0::numeric) - coalesce(ncs.total_nc, 0::numeric) - coalesce(pgs.total_pagado, 0::numeric)) <= 0.09::numeric
              as saldada,
            greatest(0::numeric, d.importe_total + coalesce(nds.total_nd, 0::numeric) - coalesce(ncs.total_nc, 0::numeric) - coalesce(pgs.total_pagado, 0::numeric)) as saldo_bruto
           from documentos d
             join clientes c on c.ruc = d.cliente_ruc
             left join ncs on ncs.factura_id = d.id
             left join nds on nds.factura_id = d.id
             left join pgs on pgs.factura_id = d.id
          where (d.tipo = any (array['01'::bpchar, '03'::bpchar])) and d.anulado = false and d.aceptado_sunat is not false
            and not (exists ( select 1
                     from letra_documento ld
                    where ld.documento_id = d.id))
        )
 select f.id as documento_id,
    null::uuid as letra_id,
    f.cliente_ruc,
    f.vendedor_actual_id,
    f.fecha_vencimiento,
        case
            when f.saldada then 0::numeric
            else f.saldo_bruto
        end as importe_cobro,
        case
            when f.saldada then 'pagado'::text
            when f.fecha_vencimiento is null then 'sin_vencimiento'::text
            when current_date <= f.fecha_vencimiento then 'vigente'::text
            when (current_date - f.fecha_vencimiento) >= 1 and (current_date - f.fecha_vencimiento) <= 7 then '0-7'::text
            when (current_date - f.fecha_vencimiento) >= 8 and (current_date - f.fecha_vencimiento) <= 15 then '8-15'::text
            when (current_date - f.fecha_vencimiento) >= 16 and (current_date - f.fecha_vencimiento) <= 30 then '16-30'::text
            when (current_date - f.fecha_vencimiento) >= 31 and (current_date - f.fecha_vencimiento) <= 60 then '31-60'::text
            else '+60'::text
        end as rango,
    'factura'::text as tipo_cobro
   from fact f
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

-- dias_retraso en v_saldos se calculaba aparte, directo sobre
-- fecha_vencimiento, así que una factura saldada por céntimos seguía
-- mostrando "X días de retraso" con saldo 0. Se alinea con el rango: si
-- v_cobros la da por pagada, no hay retraso.
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
            sum(case when v_cobros.rango = any (array['vigente'::text, 'sin_vencimiento'::text]) then v_cobros.importe_cobro else 0::numeric end) as vigente,
            sum(case when v_cobros.rango = '0-7'::text   then v_cobros.importe_cobro else 0::numeric end) as d0_7,
            sum(case when v_cobros.rango = '8-15'::text  then v_cobros.importe_cobro else 0::numeric end) as d8_15,
            sum(case when v_cobros.rango = '16-30'::text then v_cobros.importe_cobro else 0::numeric end) as d16_30,
            sum(case when v_cobros.rango = '31-60'::text then v_cobros.importe_cobro else 0::numeric end) as d31_60,
            sum(case when v_cobros.rango = '+60'::text   then v_cobros.importe_cobro else 0::numeric end) as d61_mas,
            max(case when v_cobros.tipo_cobro = 'letra'::text then greatest(0, current_date - v_cobros.fecha_vencimiento) else null::integer end) as max_dias_letra,
            max(case when v_cobros.tipo_cobro = 'factura'::text then v_cobros.rango else null::text end) as rango_factura
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
            when ca.rango_factura = 'pagado'::text then 0
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

-- Para revertir: volver a correr la sección `create view v_cobros` /
-- `create view v_saldos` de supabase/migrations/20260812_fix_fff1_9_y_buckets_aging.sql,
-- que es la definición exacta que estas dos vistas tenían hasta hoy
-- (verificado con pg_get_viewdef antes de aplicar). Como son vistas, no
-- hay dato que restaurar.
