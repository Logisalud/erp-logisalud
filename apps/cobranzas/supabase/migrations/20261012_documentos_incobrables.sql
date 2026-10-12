-- Facturas incobrables: sacarlas de la cobranza sin borrarlas.
--
-- Hay facturas que nunca se van a cobrar — una estafa, un cliente que
-- desapareció— y que mientras tanto inflan la cartera y la morosidad del
-- vendedor que no tuvo la culpa. Hasta ahora la única salida era anularlas,
-- que es mentira: la factura se emitió y SUNAT la tiene.
--
-- El mecanismo es el mismo que ya usa el factoring: una tabla de vínculo que
-- `v_cobros` consulta para dar la factura por saldada. La factura sigue
-- existiendo, visible y marcada, con el motivo escrito y quién la marcó.
-- Se desmarca borrando la fila, y vuelve a la cartera como estaba.
--
-- OJO, esto es cobranza y no contabilidad: marcar una factura acá no la
-- anula ante SUNAT, no emite nota de crédito y no recupera el IGV. El
-- castigo tributario es un trámite aparte.

create table if not exists public.documentos_incobrables (
  documento_id uuid primary key references public.documentos(id) on delete cascade,
  motivo       text        not null,
  marcado_por  text        not null,
  marcado_en   timestamptz not null default now(),
  constraint documentos_incobrables_motivo_check check (length(btrim(motivo)) >= 5),
  constraint documentos_incobrables_marcado_por_check check (length(btrim(marcado_por)) >= 2)
);

comment on table public.documentos_incobrables is
  'Facturas dadas de baja de la cobranza por incobrables. No se borran ni se anulan: v_cobros las da por saldadas. Borrar la fila revierte la baja.';

alter table public.documentos_incobrables enable row level security;

-- v_cobros: una factura incobrable se trata como saldada, y sus letras
-- (si las tuviera) dejan de sumar.
create or replace view public.v_cobros as
 WITH ncs AS (
         SELECT documentos.documento_relacionado_id AS factura_id,
            sum(documentos.importe_total) AS total_nc
           FROM documentos
          WHERE documentos.tipo = '07'::bpchar AND documentos.anulado = false
          GROUP BY documentos.documento_relacionado_id
        ), nds AS (
         SELECT documentos.documento_relacionado_id AS factura_id,
            sum(documentos.importe_total) AS total_nd
           FROM documentos
          WHERE documentos.tipo = '08'::bpchar AND documentos.anulado = false
          GROUP BY documentos.documento_relacionado_id
        ), pgs AS (
         SELECT pagos.documento_id AS factura_id,
            sum(pagos.monto) AS total_pagado
           FROM pagos
          GROUP BY pagos.documento_id
        ), factorizadas AS (
         SELECT ff.documento_id
           FROM factoring_facturas ff
             JOIN factoring_operaciones fo ON fo.id = ff.operacion_id
          WHERE fo.anulada = false
        ), incobrables AS (
         SELECT di.documento_id
           FROM documentos_incobrables di
        ), fact AS (
         SELECT d.id,
            d.cliente_ruc,
            d.fecha_vencimiento,
            c.vendedor_actual_id,
            d.forma_pago = 'CONTADO'::text AND d.contado_pendiente = false AND d.fecha_emision < '2026-08-11'::date OR GREATEST(0::numeric, d.importe_total + COALESCE(nds.total_nd, 0::numeric) - COALESCE(ncs.total_nc, 0::numeric) - COALESCE(pgs.total_pagado, 0::numeric)) <= 0.09 OR fz.documento_id IS NOT NULL OR inc.documento_id IS NOT NULL AS saldada,
            GREATEST(0::numeric, d.importe_total + COALESCE(nds.total_nd, 0::numeric) - COALESCE(ncs.total_nc, 0::numeric) - COALESCE(pgs.total_pagado, 0::numeric)) AS saldo_bruto
           FROM documentos d
             JOIN clientes c ON c.ruc = d.cliente_ruc
             LEFT JOIN ncs ON ncs.factura_id = d.id
             LEFT JOIN nds ON nds.factura_id = d.id
             LEFT JOIN pgs ON pgs.factura_id = d.id
             LEFT JOIN factorizadas fz ON fz.documento_id = d.id
             LEFT JOIN incobrables inc ON inc.documento_id = d.id
          WHERE (d.tipo = ANY (ARRAY['01'::bpchar, '03'::bpchar])) AND d.anulado = false AND d.aceptado_sunat IS NOT FALSE AND NOT (EXISTS ( SELECT 1
                   FROM letra_documento ld
                  WHERE ld.documento_id = d.id))
        )
 SELECT f.id AS documento_id,
    NULL::uuid AS letra_id,
    f.cliente_ruc,
    f.vendedor_actual_id,
    f.fecha_vencimiento,
        CASE
            WHEN f.saldada THEN 0::numeric
            ELSE f.saldo_bruto
        END AS importe_cobro,
        CASE
            WHEN f.saldada THEN 'pagado'::text
            WHEN f.fecha_vencimiento IS NULL THEN 'sin_vencimiento'::text
            WHEN CURRENT_DATE <= f.fecha_vencimiento THEN 'vigente'::text
            WHEN (CURRENT_DATE - f.fecha_vencimiento) >= 1 AND (CURRENT_DATE - f.fecha_vencimiento) <= 7 THEN '0-7'::text
            WHEN (CURRENT_DATE - f.fecha_vencimiento) >= 8 AND (CURRENT_DATE - f.fecha_vencimiento) <= 15 THEN '8-15'::text
            WHEN (CURRENT_DATE - f.fecha_vencimiento) >= 16 AND (CURRENT_DATE - f.fecha_vencimiento) <= 30 THEN '16-30'::text
            WHEN (CURRENT_DATE - f.fecha_vencimiento) >= 31 AND (CURRENT_DATE - f.fecha_vencimiento) <= 60 THEN '31-60'::text
            ELSE '+60'::text
        END AS rango,
    'factura'::text AS tipo_cobro
   FROM fact f
UNION ALL
 SELECT d.id AS documento_id,
    l.id AS letra_id,
    d.cliente_ruc,
    c.vendedor_actual_id,
    l.fecha_vencimiento,
    ld.monto_aplicado AS importe_cobro,
        CASE
            WHEN CURRENT_DATE <= l.fecha_vencimiento THEN 'vigente'::text
            WHEN (CURRENT_DATE - l.fecha_vencimiento) >= 1 AND (CURRENT_DATE - l.fecha_vencimiento) <= 7 THEN '0-7'::text
            WHEN (CURRENT_DATE - l.fecha_vencimiento) >= 8 AND (CURRENT_DATE - l.fecha_vencimiento) <= 15 THEN '8-15'::text
            WHEN (CURRENT_DATE - l.fecha_vencimiento) >= 16 AND (CURRENT_DATE - l.fecha_vencimiento) <= 30 THEN '16-30'::text
            WHEN (CURRENT_DATE - l.fecha_vencimiento) >= 31 AND (CURRENT_DATE - l.fecha_vencimiento) <= 60 THEN '31-60'::text
            ELSE '+60'::text
        END AS rango,
    'letra'::text AS tipo_cobro
   FROM letra_documento ld
     JOIN letras l ON l.id = ld.letra_id
     JOIN documentos d ON d.id = ld.documento_id
     JOIN clientes c ON c.ruc = d.cliente_ruc
  WHERE l.estado <> 'pagada'::text AND (d.tipo = ANY (ARRAY['01'::bpchar, '03'::bpchar])) AND d.anulado = false AND d.aceptado_sunat IS NOT FALSE
    AND NOT (EXISTS ( SELECT 1
                   FROM documentos_incobrables di
                  WHERE di.documento_id = d.id));

-- v_saldos: tres columnas nuevas al final (incobrable, su motivo y su fecha),
-- igual que las de factoring, para que la pantalla pueda marcarla.
create or replace view public.v_saldos as
 WITH ncs AS (
         SELECT documentos.documento_relacionado_id AS factura_id,
            sum(documentos.importe_total) AS total_nc
           FROM documentos
          WHERE documentos.tipo = '07'::bpchar AND documentos.anulado = false
          GROUP BY documentos.documento_relacionado_id
        ), nds AS (
         SELECT documentos.documento_relacionado_id AS factura_id,
            sum(documentos.importe_total) AS total_nd
           FROM documentos
          WHERE documentos.tipo = '08'::bpchar AND documentos.anulado = false
          GROUP BY documentos.documento_relacionado_id
        ), pgs AS (
         SELECT pagos.documento_id AS factura_id,
            sum(pagos.monto) AS total_pagado
           FROM pagos
          GROUP BY pagos.documento_id
        ), docs_con_letras AS (
         SELECT DISTINCT letra_documento.documento_id
           FROM letra_documento
        ), factorizado_info AS (
         SELECT ff.documento_id,
            fo.entidad,
            fo.fecha_operacion
           FROM factoring_facturas ff
             JOIN factoring_operaciones fo ON fo.id = ff.operacion_id
          WHERE fo.anulada = false
        ), incobrable_info AS (
         SELECT di.documento_id,
            di.motivo,
            di.marcado_en
           FROM documentos_incobrables di
        ), cobros_agg AS (
         SELECT v_cobros.documento_id,
            sum(v_cobros.importe_cobro) AS saldo_pendiente,
            sum(
                CASE
                    WHEN v_cobros.rango = ANY (ARRAY['vigente'::text, 'sin_vencimiento'::text]) THEN v_cobros.importe_cobro
                    ELSE 0::numeric
                END) AS vigente,
            sum(
                CASE
                    WHEN v_cobros.rango = '0-7'::text THEN v_cobros.importe_cobro
                    ELSE 0::numeric
                END) AS d0_7,
            sum(
                CASE
                    WHEN v_cobros.rango = '8-15'::text THEN v_cobros.importe_cobro
                    ELSE 0::numeric
                END) AS d8_15,
            sum(
                CASE
                    WHEN v_cobros.rango = '16-30'::text THEN v_cobros.importe_cobro
                    ELSE 0::numeric
                END) AS d16_30,
            sum(
                CASE
                    WHEN v_cobros.rango = '31-60'::text THEN v_cobros.importe_cobro
                    ELSE 0::numeric
                END) AS d31_60,
            sum(
                CASE
                    WHEN v_cobros.rango = '+60'::text THEN v_cobros.importe_cobro
                    ELSE 0::numeric
                END) AS d61_mas,
            max(
                CASE
                    WHEN v_cobros.tipo_cobro = 'letra'::text THEN GREATEST(0, CURRENT_DATE - v_cobros.fecha_vencimiento)
                    ELSE NULL::integer
                END) AS max_dias_letra,
            max(
                CASE
                    WHEN v_cobros.tipo_cobro = 'factura'::text THEN v_cobros.rango
                    ELSE NULL::text
                END) AS rango_factura
           FROM v_cobros
          GROUP BY v_cobros.documento_id
        )
 SELECT d.id,
    d.tipo,
    d.serie,
    d.numero,
    (d.serie::text || '-'::text) || d.numero AS comprobante,
    d.cliente_ruc,
    c.razon_social,
    d.fecha_emision,
    d.fecha_vencimiento,
    d.moneda,
    d.tipo_cambio,
    d.forma_pago,
    d.contado_pendiente,
    d.importe_total,
    COALESCE(ncs.total_nc, 0::numeric) AS total_nc,
    COALESCE(nds.total_nd, 0::numeric) AS total_nd,
    COALESCE(pgs.total_pagado, 0::numeric) AS total_pagado,
    COALESCE(ca.saldo_pendiente, 0::numeric) AS saldo_pendiente,
    COALESCE(ca.vigente, 0::numeric) AS vigente,
    COALESCE(ca.d0_7, 0::numeric) AS d0_7,
    COALESCE(ca.d8_15, 0::numeric) AS d8_15,
    COALESCE(ca.d16_30, 0::numeric) AS d16_30,
    COALESCE(ca.d31_60, 0::numeric) AS d31_60,
    COALESCE(ca.d61_mas, 0::numeric) AS d61_mas,
    dcl.documento_id IS NOT NULL AS tiene_letras,
        CASE
            WHEN dcl.documento_id IS NOT NULL AND COALESCE(ca.saldo_pendiente, 0::numeric) = 0::numeric THEN 'pagado'::text
            WHEN dcl.documento_id IS NOT NULL THEN 'con_letras'::text
            ELSE COALESCE(ca.rango_factura, 'sin_vencimiento'::text)
        END AS rango_vencimiento,
        CASE
            WHEN dcl.documento_id IS NOT NULL THEN COALESCE(ca.max_dias_letra, 0)
            WHEN d.forma_pago = 'CONTADO'::text AND d.contado_pendiente = false AND d.fecha_emision < '2026-08-11'::date THEN 0
            WHEN ca.rango_factura = 'pagado'::text THEN 0
            ELSE GREATEST(0, CURRENT_DATE - d.fecha_vencimiento)
        END AS dias_retraso,
    v.id AS vendedor_id,
    v.codigo AS vendedor_codigo,
    (v.nombres || ' '::text) || v.apellidos AS vendedor_nombre,
    c.codigo_zona AS zona_nombre,
    d.anulado,
    d.created_at,
    fi.documento_id IS NOT NULL AS factorizado,
    fi.entidad AS factoring_entidad,
    fi.fecha_operacion AS factoring_fecha,
    ii.documento_id IS NOT NULL AS incobrable,
    ii.motivo AS incobrable_motivo,
    ii.marcado_en AS incobrable_fecha
   FROM documentos d
     JOIN clientes c ON c.ruc = d.cliente_ruc
     LEFT JOIN vendedores v ON v.id = c.vendedor_actual_id
     LEFT JOIN ncs ON ncs.factura_id = d.id
     LEFT JOIN nds ON nds.factura_id = d.id
     LEFT JOIN pgs ON pgs.factura_id = d.id
     LEFT JOIN docs_con_letras dcl ON dcl.documento_id = d.id
     LEFT JOIN cobros_agg ca ON ca.documento_id = d.id
     LEFT JOIN factorizado_info fi ON fi.documento_id = d.id
     LEFT JOIN incobrable_info ii ON ii.documento_id = d.id
  WHERE (d.tipo = ANY (ARRAY['01'::bpchar, '03'::bpchar])) AND d.anulado = false AND d.aceptado_sunat IS NOT FALSE;
