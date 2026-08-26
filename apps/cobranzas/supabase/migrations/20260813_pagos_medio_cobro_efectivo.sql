-- Aplicado directamente en Supabase el 2026-08-13; este archivo documenta la migración.
-- Trazabilidad de pagos en efectivo hasta que se depositan en el banco.
-- No toca v_saldos/v_cobros ni conciliación bancaria automática.

alter table pagos
  add column medio_cobro text not null default 'transferencia'
    check (medio_cobro in ('transferencia', 'efectivo')),
  add column estado_efectivo text
    check (estado_efectivo in ('cobrado_por_depositar', 'depositado')),
  add column fecha_deposito date;

-- Consistencia: estado_efectivo solo existe si medio_cobro='efectivo'
alter table pagos add constraint chk_estado_efectivo_solo_en_efectivo
  check (
    (medio_cobro = 'efectivo' and estado_efectivo is not null)
    or (medio_cobro <> 'efectivo' and estado_efectivo is null)
  );

-- Consistencia: fecha_deposito solo existe cuando ya está depositado
alter table pagos add constraint chk_fecha_deposito_solo_si_depositado
  check (
    (estado_efectivo = 'depositado' and fecha_deposito is not null)
    or (estado_efectivo is distinct from 'depositado')
  );
