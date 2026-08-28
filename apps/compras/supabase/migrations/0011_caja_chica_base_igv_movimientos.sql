-- Caja Chica: base e IGV explícitos por movimiento, mismo criterio que
-- 0010 para gastos.solicitudes_gasto — el custodio tiene la boleta real en
-- la mano al registrar el movimiento, así que transcribe la base y el IGV
-- tal como figuran ahí (18% sugerido, editable, nunca forzado). Esto deja a
-- Caja Chica en mejor posición que un anticipo de gastos: cuando se genera
-- la obligación de la reposición, se suma la base/IGV real de cada
-- movimiento en vez de reconstruirla desde un total — no hace falta ningún
-- "reversarBaseEIgv" acá.
--
-- Un movimiento 'sin_comprobante' no tiene nada que transcribir: su monto
-- entero se trata como base con IGV 0 (no se inventa un 18% que no hay
-- forma de sustentar) — mismo criterio que la regla 12 (alerta visual, no
-- bloqueo) del documento maestro.
--
-- Re-ejecutable.
alter table caja_chica.movimientos add column if not exists base_imponible numeric(14,2);
alter table caja_chica.movimientos add column if not exists igv numeric(14,2);

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'movimientos_base_igv_si_hay_comprobante'
  ) then
    alter table caja_chica.movimientos
      add constraint movimientos_base_igv_si_hay_comprobante
      check (tipo_comprobante = 'sin_comprobante' or (base_imponible is not null and igv is not null));
  end if;
end $$;
