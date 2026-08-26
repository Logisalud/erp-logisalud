-- Buckets de Storage para los legajos del módulo de Compras y Pagos.
--
-- Sobre la "estructura de carpetas por año/mes/código": en Supabase Storage
-- las carpetas no existen como objeto propio, son un prefijo del path. No se
-- crean acá — se materializan al subir el primer archivo. La convención que
-- tiene que respetar la capa de servicio es:
--
--     <bucket>/<YYYY>/<MM>/<codigo>/<nombre-archivo>
--
-- donde <codigo> es el código de negocio del documento al que pertenece el
-- archivo (OC-2026-0001, OS-2026-0004, C-0012, G-2026-0007, RCC-2026-0002).
-- El check de path de las policies de abajo obliga el prefijo <YYYY>/<MM>/,
-- así que un upload con un path plano se rechaza.
--
-- Todos los buckets son PRIVADOS: los legajos son documentos fiscales. Se
-- sirven con URLs firmadas desde el servidor, nunca por URL pública.
--
-- Re-ejecutable.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('legajos-compras',        'legajos-compras',        false, 20971520,
   array['application/pdf','image/jpeg','image/png','image/webp']),
  ('legajos-servicios',      'legajos-servicios',      false, 20971520,
   array['application/pdf','image/jpeg','image/png','image/webp']),
  ('legajos-gastos',         'legajos-gastos',         false, 20971520,
   array['application/pdf','image/jpeg','image/png','image/webp']),
  ('legajos-caja-chica',     'legajos-caja-chica',     false, 20971520,
   array['application/pdf','image/jpeg','image/png','image/webp']),
  ('legajos-financiamiento', 'legajos-financiamiento', false, 20971520,
   array['application/pdf','image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;

-- ¿El path arranca con <YYYY>/<MM>/? Evita que se acumulen archivos sueltos
-- en la raíz del bucket, que es lo que vuelve inmanejable un legajo a los dos
-- años de uso.
create or replace function public.path_legajo_valido(p_name text)
returns boolean
language sql
immutable
as $$
  select p_name ~ '^[0-9]{4}/(0[1-9]|1[0-2])/[^/]+/.+$';
$$;

-- ===================================================================
-- legajos-compras — sube Almacén (guía y factura en la recepción),
-- gestiona Contabilidad. Lo lee cualquiera del staff con perfil.
-- ===================================================================
drop policy if exists legajos_compras_lectura on storage.objects;
create policy legajos_compras_lectura on storage.objects
  for select to authenticated
  using (bucket_id = 'legajos-compras' and public.mi_area() is not null);

drop policy if exists legajos_compras_escritura on storage.objects;
create policy legajos_compras_escritura on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'legajos-compras'
    and public.path_legajo_valido(name)
    and public.area_en('almacen','compras','contabilidad','admin')
  );

drop policy if exists legajos_compras_borrado on storage.objects;
create policy legajos_compras_borrado on storage.objects
  for delete to authenticated
  using (bucket_id = 'legajos-compras' and public.area_en('contabilidad','admin'));

-- ===================================================================
-- legajos-servicios — la factura y la conformidad las sube el área usuaria,
-- que puede ser cualquier área. Contabilidad las revisa.
-- ===================================================================
drop policy if exists legajos_servicios_lectura on storage.objects;
create policy legajos_servicios_lectura on storage.objects
  for select to authenticated
  using (bucket_id = 'legajos-servicios' and public.mi_area() is not null);

drop policy if exists legajos_servicios_escritura on storage.objects;
create policy legajos_servicios_escritura on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'legajos-servicios'
    and public.path_legajo_valido(name)
    and public.mi_area() is not null
  );

drop policy if exists legajos_servicios_borrado on storage.objects;
create policy legajos_servicios_borrado on storage.objects
  for delete to authenticated
  using (bucket_id = 'legajos-servicios' and public.area_en('contabilidad','admin'));

-- ===================================================================
-- legajos-gastos — comprobantes personales (reembolsos, rendición de
-- anticipos). Cada quien ve los suyos; Contabilidad y Tesorería ven todos.
-- ===================================================================
drop policy if exists legajos_gastos_lectura on storage.objects;
create policy legajos_gastos_lectura on storage.objects
  for select to authenticated
  using (
    bucket_id = 'legajos-gastos'
    and (owner_id = auth.uid()::text or public.area_en('contabilidad','tesoreria','admin'))
  );

drop policy if exists legajos_gastos_escritura on storage.objects;
create policy legajos_gastos_escritura on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'legajos-gastos'
    and public.path_legajo_valido(name)
    and public.mi_area() is not null
  );

drop policy if exists legajos_gastos_borrado on storage.objects;
create policy legajos_gastos_borrado on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'legajos-gastos'
    and (owner_id = auth.uid()::text or public.area_en('contabilidad','admin'))
  );

-- ===================================================================
-- legajos-caja-chica — boletas del fondo. Sube el custodio; leen
-- Contabilidad, Tesorería y el jefe del área del fondo.
-- ===================================================================
drop policy if exists legajos_caja_chica_lectura on storage.objects;
create policy legajos_caja_chica_lectura on storage.objects
  for select to authenticated
  using (
    bucket_id = 'legajos-caja-chica'
    and (
      owner_id = auth.uid()::text
      or public.area_en('contabilidad','tesoreria','admin')
      or public.es_jefe_de('almacen')
    )
  );

drop policy if exists legajos_caja_chica_escritura on storage.objects;
create policy legajos_caja_chica_escritura on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'legajos-caja-chica'
    and public.path_legajo_valido(name)
    and (
      exists (select 1 from caja_chica.fondos f where f.custodio_id = auth.uid())
      or public.area_en('contabilidad','admin')
    )
  );

drop policy if exists legajos_caja_chica_borrado on storage.objects;
create policy legajos_caja_chica_borrado on storage.objects
  for delete to authenticated
  using (bucket_id = 'legajos-caja-chica' and public.area_en('contabilidad','admin'));

-- ===================================================================
-- legajos-financiamiento — contratos de préstamo, resoluciones SUNAT,
-- letras. Solo Contabilidad escribe; Tesorería y Gerencia leen.
-- ===================================================================
drop policy if exists legajos_financiamiento_lectura on storage.objects;
create policy legajos_financiamiento_lectura on storage.objects
  for select to authenticated
  using (
    bucket_id = 'legajos-financiamiento'
    and public.area_en('contabilidad','tesoreria','gerencia','admin')
  );

drop policy if exists legajos_financiamiento_escritura on storage.objects;
create policy legajos_financiamiento_escritura on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'legajos-financiamiento'
    and public.path_legajo_valido(name)
    and public.area_en('contabilidad','admin')
  );

drop policy if exists legajos_financiamiento_borrado on storage.objects;
create policy legajos_financiamiento_borrado on storage.objects
  for delete to authenticated
  using (bucket_id = 'legajos-financiamiento' and public.area_en('contabilidad','admin'));
