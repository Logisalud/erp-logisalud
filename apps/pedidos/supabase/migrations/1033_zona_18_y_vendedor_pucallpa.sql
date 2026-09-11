-- ZONA 18 (PUCM01) y su vendedor, BRYAN PALOMINO (DPUC01).
--
-- Aplicada a mano el 2026-09-11 (ver CLAUDE.md: las migraciones de este
-- directorio no las corre el merge). Queda acá para que el repo tenga el
-- registro de qué se hizo en producción y por qué.
--
-- Es DATOS, no esquema: la zona y el vendedor faltaban del catálogo de la
-- empresa —estaban en la planilla de vendedores pero nunca se cargaron—, y
-- sin ellos los 171 clientes de Pucallpa no tienen dónde ir.
--
-- Re-ejecutable: si ya existen, no duplica nada.

do $$
declare
  v_zone_id smallint;
  v_user_id uuid;
  v_seller_id uuid;
  v_rol_id smallint;
begin
  select id into v_zone_id from pedidos.zones where codigo_zona = 'PUCM01';
  if v_zone_id is null then
    insert into pedidos.zones (nombre, codigo_zona, estado)
    values ('ZONA 18', 'PUCM01', 'activo')
    returning id into v_zone_id;
  end if;

  -- La cuenta se arma con el mismo criterio que las otras 16 de vendedor:
  -- correo confirmado, bcrypt, e identidad de tipo email.
  select id into v_user_id from auth.users where email = 'bpalomino@logisaludventas.com';
  if v_user_id is null then
    v_user_id := gen_random_uuid();
    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at
    ) values (
      '00000000-0000-0000-0000-000000000000', v_user_id, 'authenticated', 'authenticated',
      'bpalomino@logisaludventas.com', crypt('Logisalud2026', gen_salt('bf', 10)), now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{"full_name":"BRYAN PALOMINO"}'::jsonb, now(), now()
    );
    insert into auth.identities (
      id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
    ) values (
      gen_random_uuid(), v_user_id,
      jsonb_build_object(
        'sub', v_user_id::text,
        'email', 'bpalomino@logisaludventas.com',
        'email_verified', true,
        'phone_verified', false
      ),
      'email', v_user_id::text, null, now(), now()
    );
  end if;

  select id into v_seller_id from pedidos.sellers where codigo_representante = 'DPUC01';
  if v_seller_id is null then
    insert into pedidos.sellers (codigo_representante, nombre_completo, zone_id, user_id, estado)
    values ('DPUC01', 'BRYAN PALOMINO', v_zone_id, v_user_id, 'activo')
    returning id into v_seller_id;
  else
    update pedidos.sellers
       set zone_id = v_zone_id, user_id = v_user_id, estado = 'activo'
     where id = v_seller_id;
  end if;

  -- SOLO vendedor: nada de admin ni operaciones.
  select id into v_rol_id from pedidos.roles where name = 'vendedor';
  insert into pedidos.user_roles (user_id, role_id) values (v_user_id, v_rol_id)
  on conflict do nothing;

  -- La visibilidad por zona sale de zone_assignments, no de sellers.zone_id.
  -- Hoy el filtro está apagado (migración 1022) y no cambia nada, pero sin
  -- esta fila, el día que se reactive Bryan no vería ni un cliente.
  insert into pedidos.zone_assignments (zone_id, vendedor)
  values (v_zone_id, v_user_id)
  on conflict do nothing;
end $$;
