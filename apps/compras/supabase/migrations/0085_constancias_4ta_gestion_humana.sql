-- Gestión Humana también registra constancias de suspensión de 4ta.
-- (Sebas, 2026-10-30: es Arlette quien recibe la constancia del
-- profesional cuando registra su Recibo por Honorarios.)
--
-- Una policy ADICIONAL (las permisivas se suman con OR) en vez de rehacer
-- la de 0084: así no se toca lo que ya rige para Contabilidad.
--
-- Re-ejecutable.

drop policy if exists constancias_4ta_escritura_gestion_humana on cuentas_x_pagar.constancias_suspension_4ta;
create policy constancias_4ta_escritura_gestion_humana on cuentas_x_pagar.constancias_suspension_4ta
  for all to authenticated
  using (public.area_en('gestion_humana'))
  with check (public.area_en('gestion_humana'));

-- El PDF de la constancia va a `legajos-compras`, cuya escritura es de las
-- áreas que registran compras (más Almacén y Contabilidad): Gestión Humana
-- no estaba. Se le abre SOLO la carpeta de constancias (`…/CONST4TA-<ruc>/…`,
-- ver services/retencion-4ta.ts), no el resto de los legajos.
drop policy if exists legajos_compras_constancias_4ta_gestion_humana on storage.objects;
create policy legajos_compras_constancias_4ta_gestion_humana on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'legajos-compras'
    and public.path_legajo_valido(name)
    and name ~ '^[0-9]{4}/[0-9]{2}/CONST4TA-[0-9]{11}/'
    and public.area_en('gestion_humana')
  );
