-- Publica una lista de precios completa (producto + perfil tributario
-- + precios por canal) en una sola transacción, para que "todo o nada"
-- también aplique al publicar desde la app, no solo a las migraciones.
--
-- Deliberadamente SECURITY INVOKER (default): corre con los privilegios
-- de quien llama, así que las políticas RLS de administrador en
-- products/product_tax_profiles/price_lists/price_list_items se siguen
-- aplicando tal cual — no se duplica ese chequeo acá.

create function pedidos.publish_price_list(
  p_supplier_id smallint,
  p_archivo_nombre text,
  p_archivo_storage_path text,
  p_products jsonb
)
returns uuid
language plpgsql
set search_path = pedidos, public
as $$
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
      set codigo_proveedor = excluded.codigo_proveedor,
          codigo_bonificacion = excluded.codigo_bonificacion,
          descripcion = excluded.descripcion,
          principio_activo = excluded.principio_activo,
          presentacion = excluded.presentacion,
          unidad_medida = excluded.unidad_medida,
          supplier_id = excluded.supplier_id,
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
$$;

revoke all on function pedidos.publish_price_list from public;
grant execute on function pedidos.publish_price_list to authenticated;
