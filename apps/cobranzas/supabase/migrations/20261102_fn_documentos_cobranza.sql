-- Función de lectura para "Fases de cobranza" (Bloque A del rediseño).
-- Un pedido de Finanzas, no toca v_cobros ni v_saldos — solo las LEE.
--
-- Por documento con saldo pendiente, calcula cuál es su fecha de
-- vencimiento "efectiva" y cuántos días vencido tiene esa fecha respecto a
-- un parámetro p_fecha_corte (por defecto hoy):
--
--   - Documento SIN letras: su propia fecha_vencimiento.
--   - Documento CON letras: por cada letra NO pagada, se usa su propia
--     fecha_vencimiento — EXCEPTO si está PROTESTADA, en cuyo caso se usa
--     la fecha_vencimiento ORIGINAL de la factura (política por defecto
--     desde 2026-11-03, parametrizable con p_protestada_usa_fecha_factura
--     — ver abajo). Se toma el mínimo (la peor) entre todas. Si todas sus
--     letras ya están pagadas, el documento no aparece (su saldo_pendiente
--     ya es 0 en v_saldos).
--
-- Por qué: una letra protestada es un compromiso YA incumplido — dejarla
-- "reiniciar" el aging con su propia fecha (que además puede haber sido
-- editada/extendida después del protesto, ver ADRIXEL S.A.C. en el
-- historial de esta sesión) esconde morosidad real. Verificado con la
-- muestra de 35 clientes contra el Excel de Finanzas (corte 26/10/2026):
-- de los 5 que no coincidían por la regla de letras, 3 (ADRIXEL, GRUPO
-- KORMED, *ELMEKS PERU) tenían TODAS sus letras remanentes protestadas, y
-- esta política los hace coincidir exacto con el Excel.
--
-- El saldo en sí (`saldo`) es el de v_saldos tal cual está HOY — estas
-- vistas no recalculan el saldo a una fecha pasada, así que con un
-- p_fecha_corte distinto de hoy los días vencido se recalculan pero el
-- monto sigue siendo el saldo actual. Documentado también en
-- apps/cobranzas/lib/fasesCobranza.ts.
-- Se agrega un parámetro nuevo (p_protestada_usa_fecha_factura): Postgres
-- lo trata como una función distinta (otra firma), así que hay que borrar
-- la versión vieja de un solo parámetro antes de crear esta.
drop function if exists fn_documentos_cobranza(date);

create or replace function fn_documentos_cobranza(
  p_fecha_corte date default current_date,
  p_protestada_usa_fecha_factura boolean default true
)
returns table (
  documento_id uuid,
  cliente_ruc text,
  razon_social text,
  vendedor_nombre text,
  comprobante text,
  fecha_emision date,
  fecha_vencimiento_efectiva date,
  dias_vencido integer,
  saldo numeric,
  tiene_letras boolean
)
language sql
stable
as $$
  select
    s.id as documento_id,
    s.cliente_ruc,
    s.razon_social,
    s.vendedor_nombre,
    s.comprobante,
    s.fecha_emision,
    coalesce(lw.fecha_vencimiento_peor, s.fecha_vencimiento) as fecha_vencimiento_efectiva,
    (p_fecha_corte - coalesce(lw.fecha_vencimiento_peor, s.fecha_vencimiento))::int as dias_vencido,
    s.saldo_pendiente as saldo,
    s.tiene_letras
  from v_saldos s
  left join lateral (
    select min(
      case when p_protestada_usa_fecha_factura and l.estado = 'protestada'
        then s.fecha_vencimiento
        else l.fecha_vencimiento
      end
    ) as fecha_vencimiento_peor
    from letra_documento ld
    join letras l on l.id = ld.letra_id
    where ld.documento_id = s.id and l.estado <> 'pagada'
  ) lw on s.tiene_letras
  where s.saldo_pendiente > 0
$$;

revoke execute on function fn_documentos_cobranza(date, boolean) from public;
