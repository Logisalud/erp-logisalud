-- 0063 · WMS · «Así la ve el transportista» (decisión de Sebas, 11-nov-2026)
--
-- El Jefe de Transporte (y quien puede ver las rutas) revisa, ANTES de que salga, la ruta tal como le aparecerá al conductor o al auxiliar en «Mis rutas»
-- (cliente, teléfono, condición, guía, dirección, destino, representante, forma de pago y horario) para corregir lo que esté mal. Es SOLO lectura: no marca nada.
-- Mismo contenido que `mis_rutas_del_dia` (0056 + 0062), de una ruta cualquiera y sin el filtro de la persona. Aditiva y re-ejecutable. Se aplica a mano (nunca al mergear).

create or replace function wms.ruta_como_la_ve_el_transportista(p_ruta uuid) returns jsonb
language plpgsql stable security definer set search_path = wms, pg_temp as $$
begin
  if auth.uid() is null or not wms.tiene_rol('jefe_transporte', 'jefe_almacen', 'direccion_tecnica', 'admin_wms', 'auditoria_lectura') then
    raise exception 'No tienes permiso para ver cómo le aparece la ruta al transportista' using errcode = '42501';
  end if;
  return (
    select jsonb_build_object(
      'id', r.id, 'numero', r.numero, 'fecha', r.fecha, 'estado', r.estado, 'vehiculo', v.placa, 'conductor', c.nombre, 'auxiliar', a.nombre,
      'paradas', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', p.id, 'secuencia', p.secuencia,
          'pedido_numero', coalesce(pd.numero, sa.cliente_manual->>'pedido_numero'), 'orden_numero', sa.numero,
          'cliente', coalesce(pd.cliente_nombre, sa.cliente_manual->>'razon_social', 'Cliente'),
          'direccion', coalesce(pd.snapshot->'cliente'->>'direccion', sa.cliente_manual->>'direccion'),
          'distrito', pd.snapshot->'cliente'->>'distrito', 'ventana', pd.snapshot->'cliente'->>'ventanaCita',
          'telefono', pd.snapshot->'cliente'->>'telefono', 'representante', pd.snapshot->>'vendedor', 'forma_pago', pd.snapshot->>'condicionPago', 'condicion', sa.tipo,
          'guia', coalesce((select g.numero from wms.guias_remision g where g.salida_id = p.salida_id and g.estado = 'VIGENTE' limit 1),
                           (select n.serie || '-' || lpad(n.numero::text, 8, '0') from wms.guia_numeros n where n.salida_id = p.salida_id and n.pre_guia and n.estado = 'RESERVADO' and not n.archivado limit 1)),
          'unidades', coalesce((select sum((l->>'cantidad')::int) from jsonb_array_elements(coalesce(pd.snapshot->'lineas', '[]'::jsonb)) l), 0),
          'eventos', '[]'::jsonb
        ) order by p.secuencia)
        from wms.ruta_paradas p
        left join wms.pedidos_despacho pd on pd.id = p.pedido_despacho_id
        left join wms.salidas sa on sa.id = p.salida_id
        where p.ruta_id = r.id and p.activa), '[]'::jsonb)
    )
    from wms.rutas r
    left join wms.vehiculos v on v.id = r.vehiculo_id
    left join wms.personal_transporte c on c.id = r.conductor_id
    left join wms.personal_transporte a on a.id = r.auxiliar_id
    where r.id = p_ruta);
end $$;

grant execute on function wms.ruta_como_la_ve_el_transportista(uuid) to authenticated;
revoke execute on all functions in schema wms from public;
