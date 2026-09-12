-- 0052 — "Editar" en OS, Pago Directo, Anticipo y Reembolso.
--
-- Regla de negocio (decidida el 2026-09-12): editar está permitido para
-- CUALQUIERA con acceso al sistema, pero ÚNICAMENTE antes de que la
-- autoridad correspondiente decida — el jefe de área en una OS,
-- Contabilidad en un Pago Directo / Anticipo / Reembolso. Después de una
-- aprobación o un rechazo no edita nadie, ni Administración: a partir de
-- ahí los caminos son Rechazar, Anular, o un ajuste aparte si ya se pagó.
--
-- Es un criterio DISTINTO al de Anular (creador + autoridad). Editar es más
-- abierto a propósito: mientras nadie decidió nada, corregir un dato mal
-- tipeado no le quita nada a nadie, y exigir que sea justo el creador quien
-- esté disponible para hacerlo es lo que hoy obliga a anular y volver a
-- cargar todo de cero.
--
-- Re-ejecutable: `if not exists` y `drop policy if exists`, porque un
-- reintento después de un fallo es lo normal.

-- 1. El rastro visible. Dos columnas y no una tabla de historial: lo que la
--    ficha necesita mostrar es "esto se tocó, quién y cuándo", no un diff
--    campo por campo. Si mañana hace falta el detalle, la auditoría de
--    negocio ya existe vía services/audit-log.ts y no depende de esto.
alter table servicios.ordenes_servicio
  add column if not exists editado_por uuid references public.perfiles(id),
  add column if not exists editado_en timestamptz;

alter table cuentas_x_pagar.obligaciones
  add column if not exists editado_por uuid references public.perfiles(id),
  add column if not exists editado_en timestamptz;

alter table gastos.solicitudes_gasto
  add column if not exists editado_por uuid references public.perfiles(id),
  add column if not exists editado_en timestamptz;

-- 2. Que el CREADOR pueda actualizar lo suyo.
--
--    Hoy esto parece innecesario porque `compras.flags.acceso_abierto_temporal`
--    está en true y las policies `*_acceso_temporal` dejan pasar a cualquiera
--    (las policies se combinan con OR). Pero ese flag es deuda conocida y se
--    va a cerrar: el día que se cierre, las policies nominales de abajo son
--    las que quedan, y NINGUNA incluye hoy al creador. O sea que "Editar" se
--    rompería justo para la persona que más lo necesita —quien cargó el
--    registro y se dio cuenta del error— sin que nada avise.
--
--    Esto NO abre el permiso a "cualquiera" a nivel de base: la regla amplia
--    la aplica la Server Action. Acá se garantiza el piso mínimo que tiene
--    que sobrevivir al cierre del flag.
drop policy if exists ordenes_servicio_actualiza on servicios.ordenes_servicio;
create policy ordenes_servicio_actualiza on servicios.ordenes_servicio
  for update using (
    solicitante_id = auth.uid()
    or es_jefe_de(area_solicitante)
    or area_en('contabilidad', 'admin')
  );

drop policy if exists solicitudes_gasto_actualiza on gastos.solicitudes_gasto;
create policy solicitudes_gasto_actualiza on gastos.solicitudes_gasto
  for update using (
    solicitante_id = auth.uid()
    or es_jefe_de(area)
    or area_en('contabilidad', 'tesoreria', 'admin')
  );

-- `obligaciones` no tiene policy de UPDATE propia: la cubre
-- `obligaciones_escritura`, que es `for all` (contabilidad/admin). Sumarle
-- el creador ahí le daría también INSERT y DELETE, así que va una policy
-- de UPDATE aparte — más angosta y más fácil de auditar.
drop policy if exists obligaciones_actualiza_creador on cuentas_x_pagar.obligaciones;
create policy obligaciones_actualiza_creador on cuentas_x_pagar.obligaciones
  for update using (created_by = auth.uid());
