-- Agrega 'cheque' como medio de cobro, con el mismo ciclo de vida que
-- efectivo (cobrado_por_depositar → depositado, ver 20260813_pagos_medio_cobro_efectivo.sql):
-- un cheque también hay que llevarlo físicamente al banco antes de que sea
-- plata real. Reutiliza estado_efectivo/fecha_deposito/voucher_deposito_path
-- tal cual — no se crean columnas nuevas, solo se amplían los CHECK que
-- limitaban esos campos a medio_cobro='efectivo'.
-- No toca v_saldos/v_cobros ni conciliación bancaria automática.

alter table pagos drop constraint pagos_medio_cobro_check;
alter table pagos add constraint pagos_medio_cobro_check
  check (medio_cobro in ('transferencia', 'efectivo', 'cheque'));

alter table pagos drop constraint chk_estado_efectivo_solo_en_efectivo;
alter table pagos add constraint chk_estado_efectivo_solo_en_efectivo
  check (
    (medio_cobro in ('efectivo', 'cheque') and estado_efectivo is not null)
    or (medio_cobro not in ('efectivo', 'cheque') and estado_efectivo is null)
  );
