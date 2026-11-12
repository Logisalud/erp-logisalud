-- Seguimiento del pago del cliente a la entidad de factoring.
--
-- Cuando una factura se factoriza, Logisalud ya cobró: el factor deposita y la
-- factura queda saldada. Pero la deuda no desapareció — se mudó: ahora el
-- cliente le debe a la entidad, y si no le paga, el factor vuelve sobre
-- nosotros. Hoy ese tramo no se sigue en ningún lado: la factura sale
-- "pagada" y se pierde de vista.
--
-- Esto agrega el estado de ese tramo a la factura canjeada, al lado de su
-- `fecha_vencimiento` de factoring (la del contrato con la entidad, que puede
-- no ser la de la factura — por eso se guarda desde el #244).
--
-- Es PURAMENTE informativo: no toca `v_cobros` ni `v_saldos`. El saldo de la
-- factura ya es cero porque el factor pagó, y que el cliente le pague o no al
-- factor no cambia lo que el cliente nos debe A NOSOTROS. Si algún día el
-- factor devuelve la factura, eso es anular el canje (que desde el #273
-- anula también el ingreso), no un estado más acá.

alter table public.factoring_canje_facturas
  add column if not exists pagado_al_factor boolean not null default false,
  add column if not exists fecha_pago_al_factor date,
  add column if not exists pago_al_factor_registrado_por text,
  add column if not exists pago_al_factor_en timestamptz;

comment on column public.factoring_canje_facturas.pagado_al_factor is
  'true cuando el cliente ya le pagó a la entidad de factoring. Informativo: no afecta el saldo de la factura, que ya quedó en cero con el ingreso al banco.';

-- La fecha solo tiene sentido si está pagada, y si está pagada tiene que
-- haber fecha: un "pagado" sin cuándo no sirve para hacer seguimiento.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.factoring_canje_facturas'::regclass
      and conname = 'chk_pago_al_factor_con_fecha'
  ) then
    alter table public.factoring_canje_facturas
      add constraint chk_pago_al_factor_con_fecha
      check ( (pagado_al_factor = true  and fecha_pago_al_factor is not null)
           or (pagado_al_factor = false and fecha_pago_al_factor is null) );
  end if;
end $$;

create index if not exists idx_fcf_pendientes_al_factor
  on public.factoring_canje_facturas (fecha_vencimiento)
  where pagado_al_factor = false;
