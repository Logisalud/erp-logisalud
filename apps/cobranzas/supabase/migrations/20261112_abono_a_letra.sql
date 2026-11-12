-- Abonos a una letra: poder pagar una letra de a poco sin mentir sobre ella.
--
-- El problema real (KORMED, nov-2026): el cliente estuvo pagando sus letras
-- PROTESTADAS en seis transferencias durante cuatro meses. No había dónde
-- registrarlas —`/api/pagos` rechaza un pago contra una factura canjeada, y
-- con razón: `v_cobros` saca esas facturas de la rama de facturas, su saldo
-- son las letras pendientes, y un pago ahí no bajaba nada— así que las seis
-- se cargaron a otra factura del mismo cliente (la FFF1-965), que terminó con
-- S/ 3.400 aplicados de más mientras sus letras seguían figurando enteras.
--
-- La morosidad lo arrastra: `morosidad_diaria` sale de `v_saldos`, que resta
-- los pagos de una factura normal pero no puede restar nada de una letra. Son
-- S/ 26.275,52 de morosidad vencida en letras al 2026-11-12 (11% del total)
-- que no se mueven aunque el cliente pague.
--
-- Lo que NO se hace: marcar la letra como `pagada` cuando se pagó a medias, ni
-- deshacer el canje. El usuario fue explícito — la letra fue protestada y eso
-- tiene que seguir viéndose. El estado de la letra no se toca acá.
--
-- Lo que se hace:
--
--   1. `pagos.letra_id` (opcional). Un pago contra una factura canjeada dice a
--      qué letra va. Un pago normal la deja en NULL y se comporta igual que
--      siempre — esta migración no cambia una sola factura sin letras.
--
--   2. La rama de letras de `v_cobros` descuenta esos abonos:
--         importe_cobro = greatest(0, monto_aplicado - abonos)
--
-- El abono se descuenta del par (letra, documento), no de la letra sola: hay
-- 2 letras repartidas entre varias facturas, y restarle el abono entero a cada
-- fila lo contaría dos veces. Por eso el FK compuesto contra `letra_documento`
-- en lugar de uno simple contra `letras`: un abono solo puede apuntar a un par
-- que exista de verdad. Con `letra_id` NULL el FK no se evalúa (MATCH SIMPLE),
-- que es justo lo que queremos para los pagos de siempre.
--
-- Verificación: hoy no existe NINGÚN pago con `letra_id`, así que al aplicar
-- esto `SUM(saldo_pendiente)` de `v_saldos` tiene que quedar EXACTAMENTE en
-- 651.168,55 sobre 3.012 filas. Si da otra cosa, la vista se rompió.

alter table public.pagos
  add column if not exists letra_id uuid;

comment on column public.pagos.letra_id is
  'Abono a una letra puntual. Solo se llena cuando el pago va contra una factura canjeada por letras; en un pago normal queda NULL. El par (letra_id, documento_id) tiene que existir en letra_documento.';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.pagos'::regclass and conname = 'pagos_letra_documento_fkey'
  ) then
    alter table public.pagos
      add constraint pagos_letra_documento_fkey
      foreign key (letra_id, documento_id)
      references public.letra_documento (letra_id, documento_id)
      on delete restrict;
  end if;
end $$;

create index if not exists idx_pagos_letra_id on public.pagos (letra_id) where letra_id is not null;

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
        ), abonos_letra AS (
         SELECT pagos.letra_id,
            pagos.documento_id,
            sum(pagos.monto) AS total_abonado
           FROM pagos
          WHERE pagos.letra_id IS NOT NULL
          GROUP BY pagos.letra_id, pagos.documento_id
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
    GREATEST(0::numeric, ld.monto_aplicado - COALESCE(ab.total_abonado, 0::numeric)) AS importe_cobro,
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
     LEFT JOIN abonos_letra ab ON ab.letra_id = ld.letra_id AND ab.documento_id = ld.documento_id
  WHERE l.estado <> 'pagada'::text AND (d.tipo = ANY (ARRAY['01'::bpchar, '03'::bpchar])) AND d.anulado = false AND d.aceptado_sunat IS NOT FALSE AND NOT (EXISTS ( SELECT 1
           FROM documentos_incobrables di
          WHERE di.documento_id = d.id));
