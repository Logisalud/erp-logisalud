-- Módulo Compras y Pagos — RLS en los 8 Bounded Contexts.
-- Ver sección 6 (Roles) de apps/compras/docs/modulo-compras-pagos.md
--
-- Re-ejecutable: "drop policy if exists" antes de cada create policy.
--
-- Criterio general:
--   - Lectura amplia para el staff autenticado con perfil (el ERP es
--     interno y los flujos son colaborativos), salvo datos personales
--     (gastos/anticipos), donde cada empleado solo ve los suyos.
--   - Escritura restringida al área dueña del Bounded Context.
--   - Toda escritura financiera real pasa igual por Server Actions; RLS
--     es la segunda línea de defensa, no la única.

-- ===================================================================
-- HELPERS
-- ===================================================================
create or replace function public.mi_area()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select area from public.perfiles where id = auth.uid();
$$;

create or replace function public.es_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select area = 'admin' from public.perfiles where id = auth.uid()), false);
$$;

-- ¿El usuario actual es el jefe responsable del área indicada?
create or replace function public.es_jefe_de(p_area text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.area_responsables
    where area = p_area and responsable_id = auth.uid()
  );
$$;

-- ¿El usuario actual tiene perfil en alguna de estas áreas?
create or replace function public.area_en(variadic p_areas text[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select area = any(p_areas) from public.perfiles where id = auth.uid()
  ), false);
$$;

-- ===================================================================
-- RLS ON en todas las tablas de los 8 schemas + perfiles
-- ===================================================================
do $$
declare t record;
begin
  for t in
    select schemaname, tablename from pg_tables
    where schemaname in (
      'compras','servicios','almacen','cuentas_x_pagar',
      'gastos','caja_chica','financiamiento','impuestos'
    )
  loop
    execute format('alter table %I.%I enable row level security;', t.schemaname, t.tablename);
  end loop;
end $$;

alter table public.perfiles enable row level security;
alter table public.area_responsables enable row level security;

-- ===================================================================
-- PERFILES / RESPONSABLES
-- ===================================================================
drop policy if exists perfiles_lectura on public.perfiles;
create policy perfiles_lectura on public.perfiles
  for select to authenticated
  using (id = auth.uid() or public.es_admin());

drop policy if exists perfiles_admin_escribe on public.perfiles;
create policy perfiles_admin_escribe on public.perfiles
  for all to authenticated
  using (public.es_admin()) with check (public.es_admin());

drop policy if exists area_responsables_lectura on public.area_responsables;
create policy area_responsables_lectura on public.area_responsables
  for select to authenticated using (true);

drop policy if exists area_responsables_admin_escribe on public.area_responsables;
create policy area_responsables_admin_escribe on public.area_responsables
  for all to authenticated
  using (public.es_admin()) with check (public.es_admin());

-- ===================================================================
-- COMPRAS — escribe el área compras
-- ===================================================================
do $$
declare t text;
begin
  foreach t in array array[
    'proveedores','proveedor_cuentas_bancarias','productos',
    'ordenes_compra','ordenes_compra_items'
  ] loop
    execute format('drop policy if exists %I on compras.%I;', t || '_lectura', t);
    execute format($f$
      create policy %I on compras.%I for select to authenticated
      using (public.mi_area() is not null);
    $f$, t || '_lectura', t);

    execute format('drop policy if exists %I on compras.%I;', t || '_escritura', t);
    execute format($f$
      create policy %I on compras.%I for all to authenticated
      using (public.area_en('compras','admin'))
      with check (public.area_en('compras','admin'));
    $f$, t || '_escritura', t);
  end loop;
end $$;

-- Notas de crédito: las gestiona Contabilidad, las origina Almacén.
drop policy if exists notas_credito_lectura on compras.notas_credito;
create policy notas_credito_lectura on compras.notas_credito
  for select to authenticated using (public.mi_area() is not null);

drop policy if exists notas_credito_escritura on compras.notas_credito;
create policy notas_credito_escritura on compras.notas_credito
  for all to authenticated
  using (public.area_en('contabilidad','compras','almacen','admin'))
  with check (public.area_en('contabilidad','compras','almacen','admin'));

-- ===================================================================
-- SERVICIOS — cualquier área usuaria crea su OS y da conformidad
-- ===================================================================
drop policy if exists proveedores_servicio_lectura on servicios.proveedores_servicio;
create policy proveedores_servicio_lectura on servicios.proveedores_servicio
  for select to authenticated using (public.mi_area() is not null);

drop policy if exists proveedores_servicio_escritura on servicios.proveedores_servicio;
create policy proveedores_servicio_escritura on servicios.proveedores_servicio
  for all to authenticated
  using (public.area_en('compras','contabilidad','admin'))
  with check (public.area_en('compras','contabilidad','admin'));

drop policy if exists proveedor_servicio_cuentas_lectura on servicios.proveedor_servicio_cuentas_bancarias;
create policy proveedor_servicio_cuentas_lectura on servicios.proveedor_servicio_cuentas_bancarias
  for select to authenticated using (public.mi_area() is not null);

drop policy if exists proveedor_servicio_cuentas_escritura on servicios.proveedor_servicio_cuentas_bancarias;
create policy proveedor_servicio_cuentas_escritura on servicios.proveedor_servicio_cuentas_bancarias
  for all to authenticated
  using (public.area_en('compras','contabilidad','tesoreria','admin'))
  with check (public.area_en('compras','contabilidad','tesoreria','admin'));

drop policy if exists ordenes_servicio_lectura on servicios.ordenes_servicio;
create policy ordenes_servicio_lectura on servicios.ordenes_servicio
  for select to authenticated
  using (
    solicitante_id = auth.uid()
    or public.es_jefe_de(area_solicitante)
    or public.area_en('contabilidad','tesoreria','gerencia','admin')
  );

drop policy if exists ordenes_servicio_crea on servicios.ordenes_servicio;
create policy ordenes_servicio_crea on servicios.ordenes_servicio
  for insert to authenticated
  with check (solicitante_id = auth.uid() and area_solicitante = public.mi_area());

drop policy if exists ordenes_servicio_actualiza on servicios.ordenes_servicio;
create policy ordenes_servicio_actualiza on servicios.ordenes_servicio
  for update to authenticated
  using (
    solicitante_id = auth.uid()
    or public.es_jefe_de(area_solicitante)
    or public.area_en('contabilidad','admin')
  );

drop policy if exists conformidad_servicio_lectura on servicios.conformidad_servicio;
create policy conformidad_servicio_lectura on servicios.conformidad_servicio
  for select to authenticated using (public.mi_area() is not null);

-- La conformidad la da el área usuaria dueña de la OS, nunca Contabilidad.
drop policy if exists conformidad_servicio_crea on servicios.conformidad_servicio;
create policy conformidad_servicio_crea on servicios.conformidad_servicio
  for insert to authenticated
  with check (
    confirmado_por = auth.uid()
    and exists (
      select 1 from servicios.ordenes_servicio os
      where os.id = os_id
        and (os.area_solicitante = public.mi_area() or public.es_jefe_de(os.area_solicitante))
    )
  );

-- ===================================================================
-- ALMACÉN — Charlie, Jose Carlos, Sandra Chau reciben; Sebas resuelve
-- ===================================================================
drop policy if exists recepciones_lectura on almacen.recepciones;
create policy recepciones_lectura on almacen.recepciones
  for select to authenticated using (public.mi_area() is not null);

drop policy if exists recepciones_escritura on almacen.recepciones;
create policy recepciones_escritura on almacen.recepciones
  for all to authenticated
  using (public.area_en('almacen','admin'))
  with check (public.area_en('almacen','admin'));

drop policy if exists recepciones_items_lectura on almacen.recepciones_items;
create policy recepciones_items_lectura on almacen.recepciones_items
  for select to authenticated using (public.mi_area() is not null);

drop policy if exists recepciones_items_escritura on almacen.recepciones_items;
create policy recepciones_items_escritura on almacen.recepciones_items
  for all to authenticated
  using (public.area_en('almacen','admin'))
  with check (public.area_en('almacen','admin'));

drop policy if exists matriz_discrepancias_lectura on almacen.matriz_resolucion_discrepancias;
create policy matriz_discrepancias_lectura on almacen.matriz_resolucion_discrepancias
  for select to authenticated using (public.mi_area() is not null);

drop policy if exists matriz_discrepancias_admin on almacen.matriz_resolucion_discrepancias;
create policy matriz_discrepancias_admin on almacen.matriz_resolucion_discrepancias
  for all to authenticated
  using (public.es_admin()) with check (public.es_admin());

drop policy if exists resoluciones_discrepancia_lectura on almacen.resoluciones_discrepancia;
create policy resoluciones_discrepancia_lectura on almacen.resoluciones_discrepancia
  for select to authenticated using (public.mi_area() is not null);

-- Solo el responsable de Almacén (area_responsables) decide una discrepancia.
drop policy if exists resoluciones_discrepancia_crea on almacen.resoluciones_discrepancia;
create policy resoluciones_discrepancia_crea on almacen.resoluciones_discrepancia
  for insert to authenticated
  with check (
    decidido_por = auth.uid()
    and (public.es_jefe_de('almacen') or public.es_admin())
  );

-- ===================================================================
-- CUENTAS POR PAGAR — Contabilidad da conformidad, Tesorería paga,
-- Gerencia aprueba la propuesta
-- ===================================================================
drop policy if exists tasas_detraccion_lectura on cuentas_x_pagar.tasas_detraccion;
create policy tasas_detraccion_lectura on cuentas_x_pagar.tasas_detraccion
  for select to authenticated using (public.mi_area() is not null);

drop policy if exists tasas_detraccion_escritura on cuentas_x_pagar.tasas_detraccion;
create policy tasas_detraccion_escritura on cuentas_x_pagar.tasas_detraccion
  for all to authenticated
  using (public.area_en('contabilidad','admin'))
  with check (public.area_en('contabilidad','admin'));

-- Una obligación la ve su beneficiario y todas las áreas del embudo de pago.
drop policy if exists obligaciones_lectura on cuentas_x_pagar.obligaciones;
create policy obligaciones_lectura on cuentas_x_pagar.obligaciones
  for select to authenticated
  using (
    beneficiario_persona = auth.uid()
    or public.area_en('contabilidad','tesoreria','gerencia','compras','almacen','admin')
  );

drop policy if exists obligaciones_escritura on cuentas_x_pagar.obligaciones;
create policy obligaciones_escritura on cuentas_x_pagar.obligaciones
  for all to authenticated
  using (public.area_en('contabilidad','admin'))
  with check (public.area_en('contabilidad','admin'));

drop policy if exists obligaciones_items_lectura on cuentas_x_pagar.obligaciones_items;
create policy obligaciones_items_lectura on cuentas_x_pagar.obligaciones_items
  for select to authenticated
  using (public.area_en('contabilidad','tesoreria','gerencia','compras','admin'));

drop policy if exists obligaciones_items_escritura on cuentas_x_pagar.obligaciones_items;
create policy obligaciones_items_escritura on cuentas_x_pagar.obligaciones_items
  for all to authenticated
  using (public.area_en('contabilidad','admin'))
  with check (public.area_en('contabilidad','admin'));

-- Historial: se escribe por trigger (security definer), nadie lo edita a mano.
drop policy if exists historial_estados_lectura on cuentas_x_pagar.historial_estados;
create policy historial_estados_lectura on cuentas_x_pagar.historial_estados
  for select to authenticated
  using (public.area_en('contabilidad','tesoreria','gerencia','admin'));

drop policy if exists propuestas_pago_lectura on cuentas_x_pagar.propuestas_pago;
create policy propuestas_pago_lectura on cuentas_x_pagar.propuestas_pago
  for select to authenticated
  using (public.area_en('tesoreria','gerencia','contabilidad','admin'));

-- Tesorería arma la propuesta; Gerencia solo la aprueba (update).
drop policy if exists propuestas_pago_tesoreria on cuentas_x_pagar.propuestas_pago;
create policy propuestas_pago_tesoreria on cuentas_x_pagar.propuestas_pago
  for all to authenticated
  using (public.area_en('tesoreria','admin'))
  with check (public.area_en('tesoreria','admin'));

drop policy if exists propuestas_pago_gerencia_aprueba on cuentas_x_pagar.propuestas_pago;
create policy propuestas_pago_gerencia_aprueba on cuentas_x_pagar.propuestas_pago
  for update to authenticated
  using (public.area_en('gerencia'))
  with check (public.area_en('gerencia'));

drop policy if exists propuesta_detalle_lectura on cuentas_x_pagar.propuesta_detalle;
create policy propuesta_detalle_lectura on cuentas_x_pagar.propuesta_detalle
  for select to authenticated
  using (public.area_en('tesoreria','gerencia','contabilidad','admin'));

drop policy if exists propuesta_detalle_escritura on cuentas_x_pagar.propuesta_detalle;
create policy propuesta_detalle_escritura on cuentas_x_pagar.propuesta_detalle
  for all to authenticated
  using (public.area_en('tesoreria','admin'))
  with check (public.area_en('tesoreria','admin'));

drop policy if exists pagos_lectura on cuentas_x_pagar.pagos;
create policy pagos_lectura on cuentas_x_pagar.pagos
  for select to authenticated
  using (public.area_en('tesoreria','contabilidad','gerencia','admin'));

drop policy if exists pagos_escritura on cuentas_x_pagar.pagos;
create policy pagos_escritura on cuentas_x_pagar.pagos
  for all to authenticated
  using (public.area_en('tesoreria','admin'))
  with check (public.area_en('tesoreria','admin'));

drop policy if exists pago_aplicacion_lectura on cuentas_x_pagar.pago_aplicacion;
create policy pago_aplicacion_lectura on cuentas_x_pagar.pago_aplicacion
  for select to authenticated
  using (public.area_en('tesoreria','contabilidad','gerencia','admin'));

drop policy if exists pago_aplicacion_escritura on cuentas_x_pagar.pago_aplicacion;
create policy pago_aplicacion_escritura on cuentas_x_pagar.pago_aplicacion
  for all to authenticated
  using (public.area_en('tesoreria','admin'))
  with check (public.area_en('tesoreria','admin'));

-- ===================================================================
-- GASTOS — cada empleado ve solo lo suyo; su jefe y Contabilidad ven su área
-- ===================================================================
drop policy if exists categorias_gasto_lectura on gastos.categorias_gasto;
create policy categorias_gasto_lectura on gastos.categorias_gasto
  for select to authenticated using (public.mi_area() is not null);

drop policy if exists categorias_gasto_escritura on gastos.categorias_gasto;
create policy categorias_gasto_escritura on gastos.categorias_gasto
  for all to authenticated
  using (public.area_en('contabilidad','admin'))
  with check (public.area_en('contabilidad','admin'));

drop policy if exists solicitudes_gasto_lectura on gastos.solicitudes_gasto;
create policy solicitudes_gasto_lectura on gastos.solicitudes_gasto
  for select to authenticated
  using (
    solicitante_id = auth.uid()
    or public.es_jefe_de(area)
    or public.area_en('contabilidad','tesoreria','gerencia','admin')
  );

drop policy if exists solicitudes_gasto_crea on gastos.solicitudes_gasto;
create policy solicitudes_gasto_crea on gastos.solicitudes_gasto
  for insert to authenticated
  with check (solicitante_id = auth.uid() and area = public.mi_area());

drop policy if exists solicitudes_gasto_actualiza on gastos.solicitudes_gasto;
create policy solicitudes_gasto_actualiza on gastos.solicitudes_gasto
  for update to authenticated
  using (
    solicitante_id = auth.uid()
    or public.es_jefe_de(area)
    or public.area_en('contabilidad','tesoreria','admin')
  );

drop policy if exists solicitud_comprobantes_lectura on gastos.solicitud_comprobantes;
create policy solicitud_comprobantes_lectura on gastos.solicitud_comprobantes
  for select to authenticated
  using (
    exists (
      select 1 from gastos.solicitudes_gasto s
      where s.id = solicitud_id
        and (
          s.solicitante_id = auth.uid()
          or public.es_jefe_de(s.area)
          or public.area_en('contabilidad','tesoreria','admin')
        )
    )
  );

drop policy if exists solicitud_comprobantes_escritura on gastos.solicitud_comprobantes;
create policy solicitud_comprobantes_escritura on gastos.solicitud_comprobantes
  for all to authenticated
  using (
    exists (
      select 1 from gastos.solicitudes_gasto s
      where s.id = solicitud_id
        and (s.solicitante_id = auth.uid() or public.area_en('contabilidad','admin'))
    )
  )
  with check (
    exists (
      select 1 from gastos.solicitudes_gasto s
      where s.id = solicitud_id
        and (s.solicitante_id = auth.uid() or public.area_en('contabilidad','admin'))
    )
  );

drop policy if exists liquidaciones_anticipo_lectura on gastos.liquidaciones_anticipo;
create policy liquidaciones_anticipo_lectura on gastos.liquidaciones_anticipo
  for select to authenticated
  using (
    exists (
      select 1 from gastos.solicitudes_gasto s
      where s.id = solicitud_id
        and (
          s.solicitante_id = auth.uid()
          or public.es_jefe_de(s.area)
          or public.area_en('contabilidad','tesoreria','admin')
        )
    )
  );

drop policy if exists liquidaciones_anticipo_escritura on gastos.liquidaciones_anticipo;
create policy liquidaciones_anticipo_escritura on gastos.liquidaciones_anticipo
  for all to authenticated
  using (public.area_en('contabilidad','admin'))
  with check (public.area_en('contabilidad','admin'));

-- ===================================================================
-- CAJA CHICA — el custodio administra la suya; su jefe y Contabilidad aprueban
-- ===================================================================
drop policy if exists fondos_lectura on caja_chica.fondos;
create policy fondos_lectura on caja_chica.fondos
  for select to authenticated
  using (
    custodio_id = auth.uid()
    or public.es_jefe_de(area)
    or public.area_en('contabilidad','tesoreria','gerencia','admin')
  );

drop policy if exists fondos_escritura on caja_chica.fondos;
create policy fondos_escritura on caja_chica.fondos
  for all to authenticated
  using (public.area_en('contabilidad','admin'))
  with check (public.area_en('contabilidad','admin'));

drop policy if exists movimientos_lectura on caja_chica.movimientos;
create policy movimientos_lectura on caja_chica.movimientos
  for select to authenticated
  using (
    exists (
      select 1 from caja_chica.fondos f
      where f.id = fondo_id
        and (
          f.custodio_id = auth.uid()
          or public.es_jefe_de(f.area)
          or public.area_en('contabilidad','tesoreria','admin')
        )
    )
  );

-- Solo el custodio del fondo registra sus movimientos.
drop policy if exists movimientos_escritura on caja_chica.movimientos;
create policy movimientos_escritura on caja_chica.movimientos
  for all to authenticated
  using (
    exists (
      select 1 from caja_chica.fondos f
      where f.id = fondo_id
        and (f.custodio_id = auth.uid() or public.area_en('contabilidad','admin'))
    )
  )
  with check (
    exists (
      select 1 from caja_chica.fondos f
      where f.id = fondo_id
        and (f.custodio_id = auth.uid() or public.area_en('contabilidad','admin'))
    )
  );

drop policy if exists reposiciones_lectura on caja_chica.reposiciones;
create policy reposiciones_lectura on caja_chica.reposiciones
  for select to authenticated
  using (
    exists (
      select 1 from caja_chica.fondos f
      where f.id = fondo_id
        and (
          f.custodio_id = auth.uid()
          or public.es_jefe_de(f.area)
          or public.area_en('contabilidad','tesoreria','gerencia','admin')
        )
    )
  );

drop policy if exists reposiciones_escritura on caja_chica.reposiciones;
create policy reposiciones_escritura on caja_chica.reposiciones
  for all to authenticated
  using (
    exists (
      select 1 from caja_chica.fondos f
      where f.id = fondo_id
        and (
          f.custodio_id = auth.uid()
          or public.es_jefe_de(f.area)
          or public.area_en('contabilidad','admin')
        )
    )
  )
  with check (
    exists (
      select 1 from caja_chica.fondos f
      where f.id = fondo_id
        and (
          f.custodio_id = auth.uid()
          or public.es_jefe_de(f.area)
          or public.area_en('contabilidad','admin')
        )
    )
  );

-- ===================================================================
-- FINANCIAMIENTO — Contabilidad registra, Tesorería y Gerencia leen
-- ===================================================================
do $$
declare t text;
begin
  foreach t in array array[
    'prestamos','prestamos_cuotas','fraccionamientos_sunat',
    'fraccionamientos_sunat_cuotas','letras_por_pagar'
  ] loop
    execute format('drop policy if exists %I on financiamiento.%I;', t || '_lectura', t);
    execute format($f$
      create policy %I on financiamiento.%I for select to authenticated
      using (public.area_en('contabilidad','tesoreria','gerencia','admin'));
    $f$, t || '_lectura', t);

    execute format('drop policy if exists %I on financiamiento.%I;', t || '_escritura', t);
    execute format($f$
      create policy %I on financiamiento.%I for all to authenticated
      using (public.area_en('contabilidad','admin'))
      with check (public.area_en('contabilidad','admin'));
    $f$, t || '_escritura', t);
  end loop;
end $$;

-- ===================================================================
-- IMPUESTOS — Gestión Humana carga, Contabilidad confirma
-- ===================================================================
drop policy if exists tipos_impuesto_lectura on impuestos.tipos_impuesto;
create policy tipos_impuesto_lectura on impuestos.tipos_impuesto
  for select to authenticated
  using (public.area_en('gestion_humana','contabilidad','tesoreria','gerencia','admin'));

drop policy if exists tipos_impuesto_escritura on impuestos.tipos_impuesto;
create policy tipos_impuesto_escritura on impuestos.tipos_impuesto
  for all to authenticated
  using (public.area_en('contabilidad','admin'))
  with check (public.area_en('contabilidad','admin'));

drop policy if exists obligaciones_tributarias_lectura on impuestos.obligaciones_tributarias;
create policy obligaciones_tributarias_lectura on impuestos.obligaciones_tributarias
  for select to authenticated
  using (public.area_en('gestion_humana','contabilidad','tesoreria','gerencia','admin'));

drop policy if exists obligaciones_tributarias_carga on impuestos.obligaciones_tributarias;
create policy obligaciones_tributarias_carga on impuestos.obligaciones_tributarias
  for all to authenticated
  using (public.area_en('gestion_humana','contabilidad','admin'))
  with check (public.area_en('gestion_humana','contabilidad','admin'));
