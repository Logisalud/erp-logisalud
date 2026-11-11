-- 0062 · WMS · «Mis rutas» con los datos del ruteo interno (decisión de Sebas, 11-nov-2026)
--
-- El transportista (conductor o auxiliar de transporte) ve, con su propio usuario, lo que necesita para iniciar su ruta: las columnas de la hoja interna «RUTA DEL dd/mm/aaaa» —
-- cliente, teléfono del cliente, condición (despacho, muestra…), guía (la vigente o, si todavía no hay, la pre-guía con su número reservado), dirección, destino (distrito),
-- representante (vendedor), forma de pago y horario. Quien conduce no lee tablas: todo sale de `mis_rutas_del_dia`, que reconoce a la persona. Aditiva y re-ejecutable.
-- Se aplica a mano (nunca al mergear). Requiere 0056 y 0035 (`_parchar_funcion`).

do $$ begin
  -- re-ejecutable: si la función ya trae el representante, no se vuelve a parchar (el texto nuevo contiene al viejo)
  if exists (select 1 from pg_proc p where p.pronamespace = 'wms'::regnamespace and p.proname = 'mis_rutas_del_dia' and pg_get_functiondef(p.oid) like '%''representante''%') then return; end if;
  perform wms._parchar_funcion('mis_rutas_del_dia',
    $q$'distrito', pd.snapshot->'cliente'->>'distrito', 'ventana', pd.snapshot->'cliente'->>'ventanaCita',$q$,
    $q$'distrito', pd.snapshot->'cliente'->>'distrito', 'ventana', pd.snapshot->'cliente'->>'ventanaCita',
          'telefono', pd.snapshot->'cliente'->>'telefono', 'representante', pd.snapshot->>'vendedor', 'forma_pago', pd.snapshot->>'condicionPago', 'condicion', sa.tipo,
          'guia', coalesce((select g.numero from wms.guias_remision g where g.salida_id = p.salida_id and g.estado = 'VIGENTE' limit 1),
                           (select n.serie || '-' || lpad(n.numero::text, 8, '0') from wms.guia_numeros n where n.salida_id = p.salida_id and n.pre_guia and n.estado = 'RESERVADO' and not n.archivado limit 1)),$q$);
end $$;

revoke execute on all functions in schema wms from public;
