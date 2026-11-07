-- 0048 · «Revisar Compras ahora» fallaba en Supabase con el error 21000 (PostgREST) y la copia de las OC nunca se guardaba.
--
-- Causa: Supabase carga `pg_safeupdate` para los roles de la API y rechaza todo UPDATE sin WHERE ("UPDATE requires a WHERE clause", SQLSTATE 21000).
-- `wms.sincronizar_ocs_si_toca` (0045) actualiza `wms.oc_sincronizacion` (una sola fila, id = true) sin WHERE, así que fallaba al guardar el resultado
-- y también al guardar el error (por eso `ultimo_intento_en` y `ultimo_error` quedaron vacíos). El Postgres local de las pruebas no trae esa protección.
--
-- Arreglo: las dos actualizaciones llevan `where id`. Se parcha por texto la función vigente; re-ejecutable (no hace nada si ya está parchada).

do $$
declare
  v_def text := pg_get_functiondef('wms.sincronizar_ocs_si_toca(integer)'::regprocedure);
  v_nuevo text;
begin
  if v_def like '%ultima_por = auth.uid() where id;%' then return; end if;
  v_nuevo := replace(v_def, 'ultima_por = auth.uid();', 'ultima_por = auth.uid() where id;');
  v_nuevo := replace(v_nuevo, 'ultimo_detalle = left(v_det, 500);', 'ultimo_detalle = left(v_det, 500) where id;');
  if v_nuevo not like '%ultima_por = auth.uid() where id;%' or v_nuevo not like '%ultimo_detalle = left(v_det, 500) where id;%' then
    raise exception 'sincronizar_ocs_si_toca no tiene las dos actualizaciones esperadas: no se parcha';
  end if;
  execute v_nuevo;
end $$;

-- Permisos (default-deny): create or replace conserva los permisos de la función; se repite el cierre de siempre.
revoke execute on all functions in schema wms from public;
