-- Recibo por Honorarios (RxH) con retención de renta de 4ta categoría —
-- parte 1: Pago Directo. (Modelo validado por Sebas y Mariela, 2026-10-28.)
--
-- Hasta hoy los RxH entraban por Pago Directo como "Otros gastos
-- autorizados", registrados A MANO por el neto (ej. E001-31: 2,970.44 = 92%
-- de 3,228.74) y el 8% se cargaba aparte en Impuestos. Ahora el comprobante
-- se registra por su monto bruto, el sistema separa el 8% y la obligación
-- ya nace por el neto a pagar.
--
-- La consolidación mensual en Impuestos va en la parte 2 (0085).
--
-- Re-ejecutable.

-- ===================================================================
-- 1. Constancias de suspensión de retenciones
-- ===================================================================
-- "¿Se le retiene?" NO es un sí/no suelto en el proveedor: se retiene salvo
-- que haya una constancia vigente para ese año. Así un "no" sin documento
-- es imposible por construcción, y la excepción vence sola el 31/12 (la
-- constancia de SUNAT vale por ejercicio). La registra Contabilidad.
--
-- Un profesional puede estar en compras.proveedores o en
-- servicios.proveedores_servicio (Pago Directo le paga a cualquiera de los
-- dos): una de las dos FKs, nunca las dos.
create table if not exists cuentas_x_pagar.constancias_suspension_4ta (
  id uuid primary key default gen_random_uuid(),
  proveedor_id uuid references compras.proveedores(id),
  proveedor_servicio_id uuid references servicios.proveedores_servicio(id),
  ejercicio int not null check (ejercicio between 2020 and 2100),
  numero text not null check (nullif(btrim(numero), '') is not null),
  fecha_emision date not null,
  storage_path text not null,
  registrada_por uuid references auth.users(id) default auth.uid(),
  created_at timestamptz not null default now(),
  -- Se anula (registrada por error), nunca se borra: es el respaldo ante una
  -- fiscalización de los recibos que se pagaron sin retener.
  anulada_en timestamptz,
  anulada_por uuid references auth.users(id),
  anulada_motivo text,
  constraint constancias_4ta_un_proveedor check (num_nonnulls(proveedor_id, proveedor_servicio_id) = 1),
  constraint constancias_4ta_ejercicio_de_la_fecha check (extract(year from fecha_emision)::int = ejercicio)
);

create unique index if not exists constancias_4ta_una_por_anio
  on cuentas_x_pagar.constancias_suspension_4ta (coalesce(proveedor_id, proveedor_servicio_id), ejercicio)
  where anulada_en is null;

alter table cuentas_x_pagar.constancias_suspension_4ta enable row level security;

drop policy if exists constancias_4ta_lectura on cuentas_x_pagar.constancias_suspension_4ta;
create policy constancias_4ta_lectura on cuentas_x_pagar.constancias_suspension_4ta
  for select to authenticated using (true);

drop policy if exists constancias_4ta_escritura on cuentas_x_pagar.constancias_suspension_4ta;
create policy constancias_4ta_escritura on cuentas_x_pagar.constancias_suspension_4ta
  for all to authenticated
  using (public.es_admin() or public.area_en('contabilidad'))
  with check (public.es_admin() or public.area_en('contabilidad'));

comment on table cuentas_x_pagar.constancias_suspension_4ta is
  'Constancia de Suspensión de Retenciones de 4ta (SUNAT), una por profesional y año. Sin una vigente, a un RxH se le retiene el 8%. Migración 0084.';

-- ===================================================================
-- 2. La obligación sabe qué comprobante es y cuánto se retuvo
-- ===================================================================
alter table cuentas_x_pagar.obligaciones
  add column if not exists tipo_comprobante text
    check (tipo_comprobante in ('factura', 'boleta', 'rxh'));
alter table cuentas_x_pagar.obligaciones
  add column if not exists monto_retencion_4ta numeric(14,2) not null default 0
    check (monto_retencion_4ta >= 0);
alter table cuentas_x_pagar.obligaciones
  add column if not exists motivo_retencion_4ta text
    check (motivo_retencion_4ta in ('retenido', 'constancia_suspension', 'no_supera_1500'));

comment on column cuentas_x_pagar.obligaciones.monto_retencion_4ta is
  '8% retenido a un RxH (renta de 4ta). Se descuenta de neto_a_pagar como la detracción; se paga a SUNAT en el consolidado mensual de Impuestos. Migración 0084.';

-- Un RxH no lleva IGV ni detracción, y su motivo y su monto cuentan lo
-- mismo. Cualquier otro comprobante no tiene retención de 4ta. Las filas
-- existentes (tipo_comprobante null, retención 0) cumplen sin normalizar.
alter table cuentas_x_pagar.obligaciones
  drop constraint if exists obligaciones_rxh_coherente;
alter table cuentas_x_pagar.obligaciones
  add constraint obligaciones_rxh_coherente check (
    (tipo_comprobante is distinct from 'rxh' and monto_retencion_4ta = 0 and motivo_retencion_4ta is null)
    or (
      tipo_comprobante = 'rxh'
      and igv = 0
      and coalesce(monto_detraccion, 0) = 0
      and motivo_retencion_4ta is not null
      and ((motivo_retencion_4ta = 'retenido') = (monto_retencion_4ta > 0))
    )
  );

-- Lo que se le paga al profesional ya no incluye el 8%.
alter table cuentas_x_pagar.obligaciones
  alter column neto_a_pagar set expression as
    (base_imponible + monto_exonerado + igv - coalesce(monto_detraccion, 0) - monto_retencion_4ta);
