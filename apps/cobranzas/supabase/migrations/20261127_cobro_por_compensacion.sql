-- Un tercer medio de cobro: la compensación.
--
-- Hubo cobros que no entraron ni por banco ni en efectivo: la deuda del
-- cliente se cruzó contra lo que Logisalud le debe a Diphasac. La factura
-- queda cobrada igual, pero no hay plata que conciliar ni cuenta a la que
-- llegó.
--
-- Entra como `medio_cobro` y no como `tipo` —que distingue pago de
-- retención— porque es exactamente eso: el medio por el que se cobró. El
-- saldo del cliente baja igual que con cualquier pago, que es lo que el
-- negocio necesita.
--
-- Los dos CHECK que ya existían encajan solos y no hubo que tocarlos:
-- `chk_cuenta_bancaria_solo_transferencia` deja la cuenta en null porque no
-- es transferencia, y `chk_estado_efectivo_solo_en_efectivo` deja
-- `estado_efectivo` en null porque no es efectivo. Verificado contra la
-- base: los dos rechazan el update.
--
-- Dos decisiones que acompañan a esto, y viven en el código:
--
--  * La compensación nace `confirmado`. No pasó por el banco, así que no
--    hay extracto contra el cual conciliarla; dejarla pendiente la mandaría
--    para siempre a /pagos-sin-confirmar, donde nadie podría sacarla y
--    terminaría tapando los pagos que sí hay que revisar.
--  * Queda FUERA del export a Nubecont. Ese archivo es de movimientos de
--    banco y le asigna una cuenta a cada fila —y el `else` de esa rama es
--    la cuenta del efectivo—, así que incluirla la haría aparecer como un
--    depósito que nunca ocurrió. Contabilidad va a definir contra qué
--    cuenta se asienta y recién ahí entra.
--
-- Aplicada a mano contra la base. Re-ejecutable.
alter table public.pagos drop constraint if exists pagos_medio_cobro_check;

alter table public.pagos add constraint pagos_medio_cobro_check
  check (medio_cobro = any (array['transferencia'::text, 'efectivo'::text, 'compensacion'::text]));
