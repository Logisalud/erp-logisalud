-- `saldo_contable`: el saldo de la factura sin NINGUNA regla de negocio.
--
-- Lo pidió Contabilidad, y es una lectura distinta de la misma factura.
-- `saldo_pendiente` responde "¿cuánto hay que salir a cobrar?" y para eso
-- aplica cuatro reglas: el CONTADO anterior al 2026-08-11 se da por cobrado
-- al despacho, un saldo de hasta S/ 0,09 es redondeo, una factura canjeada
-- por letras vale lo que falta de sus letras, y nada baja de cero.
--
-- `saldo_contable` responde otra pregunta: "¿qué dicen los documentos?".
-- Es aritmética pura y lleva signo:
--
--     importe + notas de débito − notas de crédito − pagos − letras pagadas
--
-- No se da nada por cobrado sin un pago registrado, no se perdona el
-- redondeo, una factura dada de baja por incobrable sigue figurando, y una
-- factura a la que se le aplicó de más queda en NEGATIVO en vez de en cero.
-- Las letras pagadas descuentan acá porque marcar una letra pagada no
-- escribe ninguna fila en `pagos` (ver el CLAUDE.md de la app): sin eso, una
-- factura cobrada por letras figuraría impaga.
--
-- Impacto medido al 2026-11-12, contra los 3.012 documentos de la vista:
--
--   CONTADO cobrado al despacho   523 fact.   +68.337,22
--   Dadas de baja por incobrable    2 fact.   +12.000,36
--   Normales (recorte y céntimos) 2.447 fact. −10.751,85
--   Canjeadas por letras           40 fact.    +1.166,71
--   ------------------------------------------------------
--   Saldo contable 747.124,06   vs   cartera 676.371,62
--
-- Es ADITIVA: `saldo_pendiente` no se toca y la cartera no se mueve. Son dos
-- columnas al lado de la otra, cada una respondiendo su pregunta.

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
        ), letras_pagadas AS (
         SELECT ld.documento_id,
            sum(ld.monto_aplicado) AS total_letras_pagadas
           FROM letra_documento ld
             JOIN letras l ON l.id = ld.letra_id
          WHERE l.estado = 'pagada'::text
          GROUP BY ld.documento_id
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
    ii.marcado_en AS incobrable_fecha,
        CASE
            WHEN dcl.documento_id IS NOT NULL THEN 0::numeric
            WHEN COALESCE(ncs.total_nc, 0::numeric) + COALESCE(pgs.total_pagado, 0::numeric)
                 - (d.importe_total + COALESCE(nds.total_nd, 0::numeric)) > 0.09
            THEN COALESCE(ncs.total_nc, 0::numeric) + COALESCE(pgs.total_pagado, 0::numeric)
                 - (d.importe_total + COALESCE(nds.total_nd, 0::numeric))
            ELSE 0::numeric
        END AS saldo_a_favor,
    COALESCE(lp.total_letras_pagadas, 0::numeric) AS letras_pagadas,
    d.importe_total + COALESCE(nds.total_nd, 0::numeric) - COALESCE(ncs.total_nc, 0::numeric)
      - COALESCE(pgs.total_pagado, 0::numeric) - COALESCE(lp.total_letras_pagadas, 0::numeric) AS saldo_contable
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
     LEFT JOIN letras_pagadas lp ON lp.documento_id = d.id
  WHERE (d.tipo = ANY (ARRAY['01'::bpchar, '03'::bpchar])) AND d.anulado = false AND d.aceptado_sunat IS NOT FALSE;
