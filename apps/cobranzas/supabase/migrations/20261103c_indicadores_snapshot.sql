-- Historial diario de los 6 indicadores de cobranza, para la tendencia
-- mensual del tablero. Tabla aditiva, sin relación con v_cobros/v_saldos.
create table indicadores_snapshot (
  fecha        date not null,
  indicador    text not null,  -- 'efectividad_cobranza' | 'dso' | 'morosidad_dura' | 'venta_deuda_vencida' | 'cobro_vendido' | 'registro_oportuno'
  ambito       text not null,  -- 'empresa' | 'vendedor' | 'categoria' | 'registrador'
  clave        text not null,  -- 'total' para ámbito empresa; vendedor_id/registrado_por en los otros
  valor        numeric not null,
  numerador    numeric,
  denominador  numeric,
  origen       text not null default 'diario', -- 'diario' | 'backfill'
  created_at   timestamptz not null default now(),
  primary key (fecha, indicador, ambito, clave)
);

comment on table indicadores_snapshot is
  'Historial diario de los 6 indicadores de cobranza (Bloque B), para tendencia mensual. upsert idempotente por (fecha, indicador, ambito, clave).';

revoke all on indicadores_snapshot from public;
