-- Tesorería con el mismo acceso que Compras sobre Órdenes de Compra y de
-- Servicio: ver, crear y editar (pedido de Sebas, 2026-09-19).
--
-- Milagritos (tesoreria/operativo) trabaja con órdenes todos los días. El
-- menú le escondía el ítem —eso se arregló en domain/menu-principal.ts— pero
-- las policies tampoco la dejaban escribir: `*_escritura` decía
-- area_en('compras','admin') y nada más.
--
-- Hoy eso no se nota porque `compras.flags.acceso_abierto_temporal` está en
-- true y su policy `cmd=ALL` anula a las demás por OR. Esta migración es
-- justamente para el día que ese flag se apague: si no, Tesorería perdería
-- de golpe un permiso que hoy usa, y el síntoma sería un "no se pudo
-- guardar" sin explicación.
--
-- Se incluyen proveedores y sus cuentas bancarias a propósito: emitir una OC
-- contra un proveedor nuevo es parte del mismo trabajo, y dejarla a mitad de
-- camino la obligaría a pedirle a Compras que le cree la ficha.
--
-- Re-ejecutable: cada policy se borra antes de crearse.

-- ── Órdenes de Compra ────────────────────────────────────────────────────
drop policy if exists ordenes_compra_escritura on compras.ordenes_compra;
create policy ordenes_compra_escritura on compras.ordenes_compra
  for all to authenticated
  using (area_en(variadic array['compras', 'tesoreria', 'admin']))
  with check (area_en(variadic array['compras', 'tesoreria', 'admin']));

drop policy if exists ordenes_compra_items_escritura on compras.ordenes_compra_items;
create policy ordenes_compra_items_escritura on compras.ordenes_compra_items
  for all to authenticated
  using (area_en(variadic array['compras', 'tesoreria', 'admin']))
  with check (area_en(variadic array['compras', 'tesoreria', 'admin']));

-- ── Proveedores y sus cuentas ────────────────────────────────────────────
drop policy if exists proveedores_escritura on compras.proveedores;
create policy proveedores_escritura on compras.proveedores
  for all to authenticated
  using (area_en(variadic array['compras', 'tesoreria', 'admin']))
  with check (area_en(variadic array['compras', 'tesoreria', 'admin']));

drop policy if exists proveedor_cuentas_bancarias_escritura on compras.proveedor_cuentas_bancarias;
create policy proveedor_cuentas_bancarias_escritura on compras.proveedor_cuentas_bancarias
  for all to authenticated
  using (area_en(variadic array['compras', 'tesoreria', 'admin']))
  with check (area_en(variadic array['compras', 'tesoreria', 'admin']));

-- ── Órdenes de Servicio ──────────────────────────────────────────────────
-- `ordenes_servicio_crea` NO se toca: ya exige solo que quien la crea sea el
-- solicitante y que el área coincida con la suya, así que Tesorería ya podía
-- emitir una. Lo que faltaba era poder EDITARLA después.
drop policy if exists ordenes_servicio_actualiza on servicios.ordenes_servicio;
create policy ordenes_servicio_actualiza on servicios.ordenes_servicio
  for update to authenticated
  using (
    solicitante_id = auth.uid()
    or es_jefe_de(area_solicitante)
    or area_en(variadic array['contabilidad', 'tesoreria', 'admin'])
  );

-- Los proveedores de servicio viven en otro schema y tenían su propia lista.
-- OJO: esta incluía `contabilidad`, que las de compras NO tienen. Se agrega
-- tesoreria SIN sacar contabilidad — reescribir la policy de memoria acá le
-- habría quitado a Mariela un permiso que hoy usa.
drop policy if exists proveedores_servicio_escritura on servicios.proveedores_servicio;
create policy proveedores_servicio_escritura on servicios.proveedores_servicio
  for all to authenticated
  using (area_en(variadic array['compras', 'contabilidad', 'tesoreria', 'admin']))
  with check (area_en(variadic array['compras', 'contabilidad', 'tesoreria', 'admin']));
