-- Alta de LUZ PAREDES (DAQP02) y CINTHYA ALARCON (CRP1015).
--
-- Pedido de Administración el 2026-11-04:
--
--   * Luz Paredes toma ZONA 13 / AREM01, la de Malena Gaona (DAQP01), que
--     ya no está en la empresa.
--   * Cinthya Alarcon toma ZONA 01 / LIMH01, la de Susana Ramos (CRP1011),
--     a quien reemplaza.
--
-- Cuentan desde las ventas de noviembre.
--
-- Aplicada a mano (ver CLAUDE.md: las migraciones de este directorio no las
-- corre el merge). Queda acá para que el repo tenga el registro.
--
-- MISMO CAMINO que la 1033 (alta de Bryan Palomino), incluidos los ocho
-- tokens vacíos: GoTrue los lee como texto y un NULL hace fallar el login
-- entero con "Database error querying schema", un mensaje que no menciona
-- ni la columna ni al usuario. La cuenta queda creada, con la contraseña
-- correcta y el correo confirmado, y aun así no deja entrar.
--
-- LO QUE ESTA MIGRACIÓN NO HACE, A PROPÓSITO:
--
--   * No desactiva a Malena ni a Susana. Sus cuentas siguen pudiendo entrar
--     y enviar pedidos. Es una decisión sobre el acceso de una persona y la
--     toma Administración, no esta migración.
--   * No mueve la cartera: 605 clientes siguen colgando de Malena y 217 de
--     Susana. `zone_assignments` decide qué zona VE un vendedor —y ese
--     filtro está apagado desde la 1022—, mientras que de quién es un
--     cliente lo dice `customers.vendedor_id`. Crear la cuenta no reasigna
--     nada.
--
-- Las dos cosas quedaron reportadas al entregar el alta.
--
-- Re-ejecutable: si la cuenta o el vendedor ya existen, no duplica nada.

do $$
declare
  v_alta record;
  v_zone_id smallint;
  v_user_id uuid;
  v_seller_id uuid;
  v_rol_id smallint;
begin
  select id into v_rol_id from pedidos.roles where name = 'vendedor';
  if v_rol_id is null then
    raise exception 'No existe el rol vendedor';
  end if;

  for v_alta in
    select * from (values
      ('lparedes@logisaludventas.com',  'LUZ PAREDES',      'DAQP02', 'AREM01'),
      ('c.alarcon@logisaludventas.com', 'CINTHYA ALARCON',  'CRP1015', 'LIMH01')
    ) as a(email, nombre, codigo, zona)
  loop
    select id into v_zone_id from pedidos.zones where codigo_zona = v_alta.zona;
    if v_zone_id is null then
      raise exception 'No existe la zona %: % no tendría dónde ir', v_alta.zona, v_alta.nombre;
    end if;

    select id into v_user_id from auth.users where email = v_alta.email;
    if v_user_id is null then
      v_user_id := gen_random_uuid();
      insert into auth.users (
        instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
        raw_app_meta_data, raw_user_meta_data, created_at, updated_at
      ) values (
        '00000000-0000-0000-0000-000000000000', v_user_id, 'authenticated', 'authenticated',
        v_alta.email, crypt('Logisalud2026', gen_salt('bf', 10)), now(),
        '{"provider":"email","providers":["email"]}'::jsonb,
        jsonb_build_object('full_name', v_alta.nombre), now(), now()
      );
      update auth.users
         set confirmation_token = '', recovery_token = '', email_change = '',
             email_change_token_new = '', email_change_token_current = '',
             phone_change = '', phone_change_token = '', reauthentication_token = ''
       where id = v_user_id;
      insert into auth.identities (
        id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
      ) values (
        gen_random_uuid(), v_user_id,
        jsonb_build_object(
          'sub', v_user_id::text,
          'email', v_alta.email,
          'email_verified', true,
          'phone_verified', false
        ),
        'email', v_user_id::text, null, now(), now()
      );
    end if;

    select id into v_seller_id from pedidos.sellers
     where codigo_representante = v_alta.codigo;
    if v_seller_id is null then
      insert into pedidos.sellers (codigo_representante, nombre_completo, zone_id, user_id, estado)
      values (v_alta.codigo, v_alta.nombre, v_zone_id, v_user_id, 'activo');
    else
      update pedidos.sellers
         set zone_id = v_zone_id, user_id = v_user_id,
             nombre_completo = v_alta.nombre, estado = 'activo'
       where id = v_seller_id;
    end if;

    -- SOLO vendedor: nada de admin ni operaciones.
    insert into pedidos.user_roles (user_id, role_id) values (v_user_id, v_rol_id)
    on conflict do nothing;

    -- La visibilidad por zona sale de acá, no de sellers.zone_id. Hoy el
    -- filtro está apagado y no cambia nada, pero sin esta fila, el día que
    -- se reactive no verían ni un cliente.
    insert into pedidos.zone_assignments (zone_id, vendedor)
    values (v_zone_id, v_user_id)
    on conflict do nothing;
  end loop;
end $$;
