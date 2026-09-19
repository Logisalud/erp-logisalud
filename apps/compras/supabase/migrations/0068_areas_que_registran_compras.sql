-- Quién puede REGISTRAR documentos de compra, en un solo lugar.
--
-- El problema que resuelve (Sebas, 2026-09-19): Milka (`otro`) y Renato
-- (`ventas`) hacen trabajo de compras —emiten OC de bienes, dan de alta
-- proveedores, piden pagos— pero sus áreas no estaban en ninguna policy de
-- escritura. Hoy no se nota porque `compras.flags.acceso_abierto_temporal`
-- está en `true` y su policy `cmd=ALL` anula a las demás por OR. El día que
-- se apague, los dos pierden de golpe permisos que usan a diario, y el
-- síntoma sería un "no se pudo guardar" sin explicación.
--
-- La lista de áreas vive en UNA función y no repetida en siete policies. Es
-- la diferencia entre agregar a la próxima persona con una línea o salir a
-- cazar policies de nuevo — que es exactamente cómo llegamos acá.
--
-- Lo que esta migración NO hace, a propósito: no toca las policies de
-- Contabilidad (conformidad, obligaciones), Tesorería (pagos, propuestas),
-- Almacén (recepciones) ni los catálogos de Contabilidad. Registrar un
-- documento y autorizar que salga plata son cosas distintas, y el módulo
-- entero existe para sostener esa separación.
--
-- Re-ejecutable: la función va con `create or replace` y cada policy se
-- borra antes de crearse.

/**
 * Las áreas que registran documentos de compra.
 *
 * `admin` está incluida porque es el rol transversal del módulo.
 * `tesoreria` entró el 2026-09-19 (migración 0067, Milagritos).
 * `otro` y `ventas` entran acá (Milka y Renato).
 *
 * Para sumar a alguien nuevo: agregá su área a esta lista y listo.
 */
create or replace function public.area_registra_compras()
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select area_en(variadic array['compras', 'tesoreria', 'otro', 'ventas', 'admin']);
$$;

comment on function public.area_registra_compras() is
  'Áreas que pueden crear/editar proveedores y órdenes de compra. Fuente única: agregar un área acá la habilita en todas las policies que la usan.';

-- ── Proveedores y sus cuentas ────────────────────────────────────────────
drop policy if exists proveedores_escritura on compras.proveedores;
create policy proveedores_escritura on compras.proveedores
  for all to authenticated
  using (area_registra_compras())
  with check (area_registra_compras());

drop policy if exists proveedor_cuentas_bancarias_escritura on compras.proveedor_cuentas_bancarias;
create policy proveedor_cuentas_bancarias_escritura on compras.proveedor_cuentas_bancarias
  for all to authenticated
  using (area_registra_compras())
  with check (area_registra_compras());

-- ── Órdenes de Compra ────────────────────────────────────────────────────
drop policy if exists ordenes_compra_escritura on compras.ordenes_compra;
create policy ordenes_compra_escritura on compras.ordenes_compra
  for all to authenticated
  using (area_registra_compras())
  with check (area_registra_compras());

drop policy if exists ordenes_compra_items_escritura on compras.ordenes_compra_items;
create policy ordenes_compra_items_escritura on compras.ordenes_compra_items
  for all to authenticated
  using (area_registra_compras())
  with check (area_registra_compras());

-- ── Proveedores de servicio ──────────────────────────────────────────────
-- Estas dos ya incluían `contabilidad`, que las de compras no tienen, así
-- que se conserva explícitamente: la función sola le quitaría a Mariela un
-- permiso que hoy usa.
drop policy if exists proveedores_servicio_escritura on servicios.proveedores_servicio;
create policy proveedores_servicio_escritura on servicios.proveedores_servicio
  for all to authenticated
  using (area_registra_compras() or area_en(variadic array['contabilidad']))
  with check (area_registra_compras() or area_en(variadic array['contabilidad']));

drop policy if exists proveedor_servicio_cuentas_escritura on servicios.proveedor_servicio_cuentas_bancarias;
create policy proveedor_servicio_cuentas_escritura on servicios.proveedor_servicio_cuentas_bancarias
  for all to authenticated
  using (area_registra_compras() or area_en(variadic array['contabilidad']))
  with check (area_registra_compras() or area_en(variadic array['contabilidad']));

-- ── Storage: el legajo de compras ────────────────────────────────────────
-- EL QUE SE IBA A ESCAPAR. Sin esto, todo lo de arriba sirve para nada
-- práctico: se podría crear la OC pero no subir la cotización ni la factura
-- que la sustentan. Y además faltaba `tesoreria`, que la migración 0067 le
-- dio permiso sobre las órdenes pero no sobre sus archivos — un hueco que
-- habría aparecido recién al apagar el flag.
drop policy if exists legajos_compras_escritura on storage.objects;
create policy legajos_compras_escritura on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'legajos-compras'
    and path_legajo_valido(name)
    and (area_registra_compras() or area_en(variadic array['almacen', 'contabilidad']))
  );
