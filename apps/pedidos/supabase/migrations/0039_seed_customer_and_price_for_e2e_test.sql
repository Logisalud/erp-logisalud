-- Cliente ACTIVO de prueba para el primer pedido de punta a punta.
-- Elige el canal dinámicamente (el primero con un price_list_item
-- vigente hoy) en vez de asumir a ciegas el producto placeholder
-- "Dapha 10" de Fase 2 — así el pedido de prueba usa un canal que
-- realmente tiene precios reales de Diphasac/Biosana/Prades cargados.

do $$
declare
  v_zone_id smallint;
  v_payment_terms_id smallint;
  v_canal_id smallint;
  v_customer_id uuid;
begin
  select id into v_zone_id from pedidos.zones order by id limit 1;
  select id into v_payment_terms_id from pedidos.payment_terms order by id limit 1;
  select sales_channel_id into v_canal_id
  from pedidos.price_list_items
  where vigente_hasta is null
  order by id
  limit 1;

  if v_canal_id is null then
    raise exception 'No hay ningún price_list_item vigente; no se puede crear el cliente de prueba E2E.';
  end if;

  insert into pedidos.customers (
    ruc_o_documento, razon_social, canal_id, zona_id, condicion_pago_habitual_id, estado
  )
  values (
    '20999999999', 'CLIENTE DE PRUEBA E2E', v_canal_id, v_zone_id, v_payment_terms_id, 'ACTIVO'
  )
  on conflict (ruc_o_documento) do update set
    estado = 'ACTIVO',
    canal_id = excluded.canal_id,
    zona_id = excluded.zona_id,
    condicion_pago_habitual_id = excluded.condicion_pago_habitual_id
  returning id into v_customer_id;

  insert into pedidos.customer_addresses (customer_id, direccion, es_principal, estado)
  select v_customer_id, 'Av. Prueba 123, Lima', true, 'activo'
  where not exists (
    select 1 from pedidos.customer_addresses where customer_id = v_customer_id
  );
end $$;
