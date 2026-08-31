-- publish_price_list: dejar de sobrescribir la identidad de un producto
-- que ya existe en el catálogo.
--
-- Contexto: los archivos de los proveedores usan nombres cortos de uso
-- interno ("GRIPAMAX", "ORFENADRINA", "GASA"), mientras que el catálogo
-- de LOGISALUD tiene la descripción completa y desambiguada
-- ("GRIPAMAX 325 MG + 10 MG + 5 MG CJA X 120 CAP. BDA."). La versión
-- anterior hacía `descripcion = excluded.descripcion` en el ON CONFLICT,
-- así que cada publicación de lista pisaba el nombre bueno con el corto.
-- Peor: en el consolidado 2026-08 hay códigos donde el archivo trae otro
-- producto distinto (PLGS14 llega como "OVAMET" y en el catálogo es
-- "BLACKY FE"), y dos productos distintos comparten el nombre corto
-- "ORFENADRINA" — renombrar a ciegas ahí destruye información.
--
-- Regla nueva: un producto que ya existe conserva su descripción,
-- presentación, principio activo, unidad de medida y proveedor. Los
-- códigos del proveedor sí se refrescan (son el dato que el proveedor
-- manda y que legítimamente cambia de lista a lista). Un producto nuevo
-- se crea con lo que venga en el archivo.
--
-- Los precios y el perfil tributario NO se tocan acá: siguen
-- versionándose en cada publicación como antes (los triggers
-- close_previous_* cierran la fila anterior).

create or replace function pedidos.publish_price_list(
  p_supplier_id smallint,
  p_archivo_nombre text,
  p_archivo_storage_path text,
  p_products jsonb
)
returns uuid
language plpgsql
set search_path to 'pedidos', 'public'
as $function$
declare
  v_price_list_id uuid;
  v_product jsonb;
  v_product_id uuid;
  v_channel jsonb;
  v_channel_id smallint;
begin
  insert into pedidos.price_lists (supplier_id, archivo_nombre, archivo_storage_path, importado_por)
  values (p_supplier_id, p_archivo_nombre, p_archivo_storage_path, auth.uid())
  returning id into v_price_list_id;

  for v_product in select * from jsonb_array_elements(p_products)
  loop
    insert into pedidos.products (
      codigo_interno, codigo_proveedor, codigo_bonificacion,
      descripcion, principio_activo, presentacion, unidad_medida, supplier_id
    )
    values (
      v_product ->> 'codigoLogisalud',
      v_product ->> 'codigoProveedor',
      v_product ->> 'codigoBonificacion',
      v_product ->> 'producto',
      v_product ->> 'principioActivo',
      v_product ->> 'presentacion',
      coalesce(v_product ->> 'unidadMedida', 'UND'),
      p_supplier_id
    )
    on conflict (codigo_interno) do update
      -- Solo los códigos del proveedor se refrescan. La identidad del
      -- producto (nombre, presentación, principio activo, unidad,
      -- proveedor) es del catálogo y no la decide el archivo.
      set codigo_proveedor = excluded.codigo_proveedor,
          codigo_bonificacion = excluded.codigo_bonificacion,
          updated_at = now()
    returning id into v_product_id;

    insert into pedidos.product_tax_profiles (
      product_id, afectacion_tributaria, tasa_aplicable,
      vvf_sin_igv, vvd_sin_igv, costo_referencial_distribuidora, fecha_vigencia_proveedor
    )
    values (
      v_product_id,
      v_product ->> 'afectacionTributaria',
      (v_product ->> 'tasaAplicable')::numeric,
      (v_product ->> 'vvfSinIgv')::numeric,
      (v_product ->> 'vvdSinIgv')::numeric,
      (v_product ->> 'costoReferencialDistribuidora')::numeric,
      (v_product ->> 'fechaVigenciaProveedor')::date
    );

    for v_channel in select * from jsonb_array_elements(v_product -> 'channelPrices')
    loop
      select id into v_channel_id
      from pedidos.sales_channels
      where nombre = v_channel ->> 'channel';

      if v_channel_id is null then
        raise exception 'Canal desconocido: %', v_channel ->> 'channel';
      end if;

      insert into pedidos.price_list_items (price_list_id, product_id, sales_channel_id, precio)
      values (v_price_list_id, v_product_id, v_channel_id, (v_channel ->> 'precio')::numeric);
    end loop;
  end loop;

  return v_price_list_id;
end;
$function$;
