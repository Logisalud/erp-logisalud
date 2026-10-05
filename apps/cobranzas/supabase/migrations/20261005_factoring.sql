-- Aplicado directamente en Supabase el 2026-10-05; este archivo documenta la
-- migración (igual que 20260813_pagos_medio_cobro_efectivo.sql).
--
-- Registro de operaciones de factoring sobre facturas/boletas a crédito.
-- Decisión del usuario: cuando una factura se factoriza, deja de aparecer
-- como pendiente en la cartera (el dinero ya entró vía el factor) — se
-- agrupa por OPERACIÓN (una entidad de factoring, una fecha, un adelanto)
-- que puede incluir varias facturas.

create table factoring_operaciones (
  id                   uuid primary key default gen_random_uuid(),
  entidad              text not null,              -- empresa de factoring
  fecha_operacion      date not null,
  monto_adelantado     numeric not null check (monto_adelantado >= 0),
  porcentaje_adelanto  numeric,                     -- opcional, % del total factorizado
  comision             numeric,                     -- opcional, comisión/interés del factor
  referencia           text,                        -- N° de contrato/operación, opcional
  observaciones        text,
  registrado_por       text,                        -- texto libre, no hay login
  anulada              boolean not null default false,
  anulada_motivo       text,
  anulada_en           timestamptz,
  created_at           timestamptz not null default now()
);

create table factoring_facturas (
  id                 uuid primary key default gen_random_uuid(),
  operacion_id       uuid not null references factoring_operaciones(id) on delete cascade,
  documento_id       uuid not null references documentos(id),
  -- Factoring de la factura COMPLETA: monto_factorizado = saldo_pendiente al
  -- momento de registrar la operación (lo fija la API, no es editable por el
  -- usuario) — así el saldo baja a 0 consistente con la decisión de arriba.
  monto_factorizado  numeric not null check (monto_factorizado > 0),
  created_at         timestamptz not null default now()
);

create index idx_factoring_facturas_documento on factoring_facturas(documento_id);
create index idx_factoring_facturas_operacion on factoring_facturas(operacion_id);

-- v_cobros: nueva rama "saldada" cuando la factura tiene una entrada activa
-- (operación no anulada) en factoring_facturas — mismo patrón que la rama de
-- CONTADO viejo y la tolerancia de céntimos.
create or replace view v_cobros as
with ncs as (
  select documento_relacionado_id as factura_id, sum(importe_total) as total_nc
  from documentos where tipo = '07' and anulado = false
  group by documento_relacionado_id
), nds as (
  select documento_relacionado_id as factura_id, sum(importe_total) as total_nd
  from documentos where tipo = '08' and anulado = false
  group by documento_relacionado_id
), pgs as (
  select documento_id as factura_id, sum(monto) as total_pagado
  from pagos group by documento_id
), factorizadas as (
  select ff.documento_id
  from factoring_facturas ff
  join factoring_operaciones fo on fo.id = ff.operacion_id
  where fo.anulada = false
), fact as (
  select d.id, d.cliente_ruc, d.fecha_vencimiento, c.vendedor_actual_id,
    (d.forma_pago = 'CONTADO' and d.contado_pendiente = false and d.fecha_emision < '2026-08-11')
      or greatest(0, d.importe_total + coalesce(nds.total_nd,0) - coalesce(ncs.total_nc,0) - coalesce(pgs.total_pagado,0)) <= 0.09
      or fz.documento_id is not null
      as saldada,
    greatest(0, d.importe_total + coalesce(nds.total_nd,0) - coalesce(ncs.total_nc,0) - coalesce(pgs.total_pagado,0)) as saldo_bruto
  from documentos d
  join clientes c on c.ruc = d.cliente_ruc
  left join ncs on ncs.factura_id = d.id
  left join nds on nds.factura_id = d.id
  left join pgs on pgs.factura_id = d.id
  left join factorizadas fz on fz.documento_id = d.id
  where d.tipo in ('01','03') and d.anulado = false and d.aceptado_sunat is not false
    and not exists (select 1 from letra_documento ld where ld.documento_id = d.id)
)
select f.id as documento_id, null::uuid as letra_id, f.cliente_ruc, f.vendedor_actual_id, f.fecha_vencimiento,
  case when f.saldada then 0 else f.saldo_bruto end as importe_cobro,
  case when f.saldada then 'pagado'
       when f.fecha_vencimiento is null then 'sin_vencimiento'
       when current_date <= f.fecha_vencimiento then 'vigente'
       when current_date - f.fecha_vencimiento between 1 and 7 then '0-7'
       when current_date - f.fecha_vencimiento between 8 and 15 then '8-15'
       when current_date - f.fecha_vencimiento between 16 and 30 then '16-30'
       when current_date - f.fecha_vencimiento between 31 and 60 then '31-60'
       else '+60' end as rango,
  'factura' as tipo_cobro
from fact f
union all
select d.id as documento_id, l.id as letra_id, d.cliente_ruc, c.vendedor_actual_id, l.fecha_vencimiento,
  ld.monto_aplicado as importe_cobro,
  case when current_date <= l.fecha_vencimiento then 'vigente'
       when current_date - l.fecha_vencimiento between 1 and 7 then '0-7'
       when current_date - l.fecha_vencimiento between 8 and 15 then '8-15'
       when current_date - l.fecha_vencimiento between 16 and 30 then '16-30'
       when current_date - l.fecha_vencimiento between 31 and 60 then '31-60'
       else '+60' end as rango,
  'letra' as tipo_cobro
from letra_documento ld
join letras l on l.id = ld.letra_id
join documentos d on d.id = ld.documento_id
join clientes c on c.ruc = d.cliente_ruc
where l.estado <> 'pagada' and d.tipo in ('01','03') and d.anulado = false and d.aceptado_sunat is not false;

-- v_saldos: agrega 3 columnas informativas al final (factorizado,
-- factoring_entidad, factoring_fecha) — el resto queda idéntico.
create or replace view v_saldos as
with ncs as (
  select documento_relacionado_id as factura_id, sum(importe_total) as total_nc
  from documentos where tipo = '07' and anulado = false
  group by documento_relacionado_id
), nds as (
  select documento_relacionado_id as factura_id, sum(importe_total) as total_nd
  from documentos where tipo = '08' and anulado = false
  group by documento_relacionado_id
), pgs as (
  select documento_id as factura_id, sum(monto) as total_pagado
  from pagos group by documento_id
), docs_con_letras as (
  select distinct documento_id from letra_documento
), factorizado_info as (
  select ff.documento_id, fo.entidad, fo.fecha_operacion
  from factoring_facturas ff
  join factoring_operaciones fo on fo.id = ff.operacion_id
  where fo.anulada = false
), cobros_agg as (
  select documento_id,
    sum(importe_cobro) as saldo_pendiente,
    sum(case when rango in ('vigente','sin_vencimiento') then importe_cobro else 0 end) as vigente,
    sum(case when rango = '0-7' then importe_cobro else 0 end) as d0_7,
    sum(case when rango = '8-15' then importe_cobro else 0 end) as d8_15,
    sum(case when rango = '16-30' then importe_cobro else 0 end) as d16_30,
    sum(case when rango = '31-60' then importe_cobro else 0 end) as d31_60,
    sum(case when rango = '+60' then importe_cobro else 0 end) as d61_mas,
    max(case when tipo_cobro = 'letra' then greatest(0, current_date - fecha_vencimiento) else null end) as max_dias_letra,
    max(case when tipo_cobro = 'factura' then rango else null end) as rango_factura
  from v_cobros group by documento_id
)
select d.id, d.tipo, d.serie, d.numero,
  d.serie || '-' || d.numero as comprobante,
  d.cliente_ruc, c.razon_social, d.fecha_emision, d.fecha_vencimiento, d.moneda, d.tipo_cambio,
  d.forma_pago, d.contado_pendiente, d.importe_total,
  coalesce(ncs.total_nc,0) as total_nc,
  coalesce(nds.total_nd,0) as total_nd,
  coalesce(pgs.total_pagado,0) as total_pagado,
  coalesce(ca.saldo_pendiente,0) as saldo_pendiente,
  coalesce(ca.vigente,0) as vigente,
  coalesce(ca.d0_7,0) as d0_7,
  coalesce(ca.d8_15,0) as d8_15,
  coalesce(ca.d16_30,0) as d16_30,
  coalesce(ca.d31_60,0) as d31_60,
  coalesce(ca.d61_mas,0) as d61_mas,
  dcl.documento_id is not null as tiene_letras,
  case
    when dcl.documento_id is not null and coalesce(ca.saldo_pendiente,0) = 0 then 'pagado'
    when dcl.documento_id is not null then 'con_letras'
    else coalesce(ca.rango_factura, 'sin_vencimiento')
  end as rango_vencimiento,
  case
    when dcl.documento_id is not null then coalesce(ca.max_dias_letra, 0)
    when d.forma_pago = 'CONTADO' and d.contado_pendiente = false and d.fecha_emision < '2026-08-11' then 0
    when ca.rango_factura = 'pagado' then 0
    else greatest(0, current_date - d.fecha_vencimiento)
  end as dias_retraso,
  v.id as vendedor_id, v.codigo as vendedor_codigo, v.nombres || ' ' || v.apellidos as vendedor_nombre,
  c.codigo_zona as zona_nombre, d.anulado, d.created_at,
  fi.documento_id is not null as factorizado,
  fi.entidad as factoring_entidad,
  fi.fecha_operacion as factoring_fecha
from documentos d
join clientes c on c.ruc = d.cliente_ruc
left join vendedores v on v.id = c.vendedor_actual_id
left join ncs on ncs.factura_id = d.id
left join nds on nds.factura_id = d.id
left join pgs on pgs.factura_id = d.id
left join docs_con_letras dcl on dcl.documento_id = d.id
left join cobros_agg ca on ca.documento_id = d.id
left join factorizado_info fi on fi.documento_id = d.id
where d.tipo in ('01','03') and d.anulado = false and d.aceptado_sunat is not false;
