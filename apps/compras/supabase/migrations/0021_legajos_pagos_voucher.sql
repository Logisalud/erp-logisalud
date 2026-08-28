-- Fase 1.9: "el voucher cierra el ciclo" — cuentas_x_pagar.pagos ya tenía
-- storage_path_voucher/storage_path_detraccion desde el modelo de datos
-- original, pero nunca hubo bucket ni pantalla para subirlos: Tesorería
-- solo podía escribir un número de voucher a mano
-- (app/cuentas-por-pagar/propuestas/[id]/pago.tsx), sin adjuntar el
-- comprobante real del banco. Como TODO origen de obligación (compra,
-- servicio, gasto_directo, reembolso, anticipo, reposición, préstamo,
-- fraccionamiento, letra, impuesto) se paga por el mismo embudo de
-- cuentas_x_pagar.pagos, un solo bucket acá cubre el voucher en todos —
-- no hace falta uno por Bounded Context como legajos-gastos/-financiamiento.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('legajos-pagos', 'legajos-pagos', false, 20971520,
   array['application/pdf','image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;

drop policy if exists legajos_pagos_lectura on storage.objects;
create policy legajos_pagos_lectura on storage.objects
  for select to authenticated
  using (bucket_id = 'legajos-pagos' and public.area_en('contabilidad','tesoreria','gerencia','admin'));

drop policy if exists legajos_pagos_escritura on storage.objects;
create policy legajos_pagos_escritura on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'legajos-pagos'
    and public.path_legajo_valido(name)
    and public.area_en('tesoreria','admin')
  );

drop policy if exists legajos_pagos_borrado on storage.objects;
create policy legajos_pagos_borrado on storage.objects
  for delete to authenticated
  using (bucket_id = 'legajos-pagos' and public.area_en('contabilidad','admin'));
