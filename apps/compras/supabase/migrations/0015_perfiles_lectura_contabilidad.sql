-- Contabilidad ya puede escribir caja_chica.fondos (fondos_escritura permite
-- contabilidad/admin), pero perfiles_lectura solo dejaba leer la fila propia
-- o a un admin — así que Contabilidad no podía ver la lista de usuarios para
-- elegir un custodio al abrir un fondo nuevo. Se agrega contabilidad a la
-- misma policy, sin tocar nada más.

drop policy if exists perfiles_lectura on public.perfiles;
create policy perfiles_lectura on public.perfiles
  for select to authenticated
  using (id = auth.uid() or public.es_admin() or public.area_en('contabilidad'));
