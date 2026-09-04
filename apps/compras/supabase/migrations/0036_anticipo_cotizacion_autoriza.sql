-- Piezas 1 y 2 del refinamiento de Anticipo (pedido de Sebas, sesión
-- 2026-09-04):
--
-- 1. `cotizacion_storage_path`: sustento opcional (cotización de un vuelo,
--    de un evento, etc.) que se adjunta AL PEDIR el anticipo, antes de que
--    exista ningún comprobante real — no es una factura, no se OCRea, es
--    solo el archivo. Mismo bucket y mismo patrón de path que
--    `solicitud_comprobantes.storage_path` (ver `subirComprobante` en
--    services/solicitudes-gasto.ts), pero vive directo en la solicitud: no
--    encaja como un comprobante de fase `inicial`/`rendicion`, que es un
--    concepto distinto (evidencia de gasto ya ocurrido, no de gasto
--    futuro).
--
-- 2. `quien_autoriza`: texto libre, informativo — NO es un paso de
--    aprobación real (no bloquea, no requiere que esa persona entre al
--    sistema). Se sugiere en pantalla con el responsable del área de quien
--    crea la solicitud (`public.area_responsables`), pero es editable a
--    mano, así que se guarda como texto y no como FK a `perfiles`: lo que
--    quedó escrito puede no ser exactamente el nombre sugerido.
--
-- Las dos nullable — solicitudes ya existentes no tienen ninguno de los
-- dos datos, y no se inventan.

alter table gastos.solicitudes_gasto
  add column if not exists cotizacion_storage_path text;

alter table gastos.solicitudes_gasto
  add column if not exists quien_autoriza text;

-- Nombre del responsable del área de quien llama, para sugerir "quién
-- autoriza" en el formulario. `public.perfiles` tiene RLS que solo deja ver
-- la fila propia (salvo admin/contabilidad) — sin este helper, cualquier
-- otra persona (ej. Renato, área ventas) no podría leer el nombre del
-- responsable de su propia área (ej. Juan) para la sugerencia. Mismo
-- patrón que `es_jefe_de`/`mi_area` en 0002_compras_pagos_rls.sql: solo
-- devuelve UN nombre (el de tu propio responsable de área), no abre el
-- directorio completo de perfiles.
create or replace function public.nombre_responsable_de_mi_area()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select p.nombre
  from public.area_responsables ar
  join public.perfiles p on p.id = ar.responsable_id
  where ar.area = public.mi_area();
$$;

