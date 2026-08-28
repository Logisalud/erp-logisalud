-- Corrección de diseño, confirmada con Sebas después de #41: el sistema no
-- debe inventar el desglose base/IGV hacia atrás desde un monto total. Quien
-- registra un gasto/reembolso tiene el comprobante real en la mano — tiene
-- que poder ingresar la base y el IGV tal como figuran ahí, con 18%
-- ofrecido como sugerencia editable, nunca forzado. Boletas de un régimen
-- que no discrimina IGV (RUS, por ejemplo) tienen IGV = 0, y el sistema
-- estaba a punto de inventarles un 18% que no existe.
--
-- Esto choca con cómo estaba armada `cuentas_x_pagar.obligaciones`: `igv`
-- era una columna GENERATED ALWAYS AS (base_imponible * 18%) — sin
-- excepción, para cualquier origen. No hay forma de insertar un IGV real
-- distinto al 18% con esa definición. Se cambia a una columna normal que la
-- capa de servicio llena explícitamente en cada insert (18% para compras,
-- que sí llevan IGV real de verdad; el valor real del comprobante para
-- gasto_directo/reembolso). `total` y `neto_a_pagar` siguen siendo
-- generadas, pero ahora suman `igv` en vez de recalcular 18% adentro —
-- son sumas, válidas sin importar qué tasa haya en `igv`.
--
-- La tabla no tiene filas en producción todavía (el módulo recién se está
-- construyendo), así que no hace falta migrar datos.
--
-- Re-ejecutable: cada bloque revisa el estado real de la columna antes de
-- tocarla, así un reintento tras un fallo a mitad de camino no rompe nada.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'cuentas_x_pagar' and table_name = 'obligaciones'
      and column_name = 'igv' and is_generated = 'ALWAYS'
  ) then
    alter table cuentas_x_pagar.obligaciones drop column igv;
    alter table cuentas_x_pagar.obligaciones add column igv numeric(14,2) not null default 0;
  end if;
end $$;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'cuentas_x_pagar' and table_name = 'obligaciones'
      and column_name = 'total'
  ) then
    alter table cuentas_x_pagar.obligaciones drop column if exists total;
  end if;
  alter table cuentas_x_pagar.obligaciones
    add column if not exists total numeric(14,2) generated always as (base_imponible + igv) stored;
end $$;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'cuentas_x_pagar' and table_name = 'obligaciones'
      and column_name = 'neto_a_pagar'
  ) then
    alter table cuentas_x_pagar.obligaciones drop column if exists neto_a_pagar;
  end if;
  alter table cuentas_x_pagar.obligaciones
    add column if not exists neto_a_pagar numeric(14,2)
    generated always as (base_imponible + igv - coalesce(monto_detraccion, 0)) stored;
end $$;

-- ===================================================================
-- Base e IGV explícitos en la solicitud de gasto/reembolso
-- ===================================================================
-- Solo para gasto_directo/reembolso: ya existe un comprobante real para
-- leer. Un anticipo todavía no tiene nada que mirar (es plata que sale
-- ANTES del gasto) — para ese caso sigue sin haber un desglose real hasta
-- que se rinda, y `monto_solicitado` sigue siendo el monto pedido tal cual.
alter table gastos.solicitudes_gasto add column if not exists base_imponible numeric(14,2);
alter table gastos.solicitudes_gasto add column if not exists igv numeric(14,2);

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'solicitudes_gasto_base_igv_si_hay_comprobante'
  ) then
    alter table gastos.solicitudes_gasto
      add constraint solicitudes_gasto_base_igv_si_hay_comprobante
      check (tipo = 'anticipo' or (base_imponible is not null and igv is not null));
  end if;
end $$;
