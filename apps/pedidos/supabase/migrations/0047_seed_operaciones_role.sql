-- Acceso al rol "operaciones".
--
-- El rol ya existía en el catálogo desde 0005; lo que faltaba era que
-- alguien lo tuviera. Igual que con las cuentas de administrador, el
-- usuario de auth se crea desde el dashboard de Supabase (Authentication
-- -> Users) y esta migración solo le asigna el rol si ya existe: una
-- migración no puede crear un usuario de Supabase Auth con contraseña
-- válida sin depender de internals de gotrue.
--
-- Además le da el rol a los administradores actuales, para que puedan
-- probar y operar la bandeja de despacho sin depender de que exista una
-- cuenta dedicada. No cambia lo que pueden hacer (is_admin() ya pasa
-- todas las policies), solo hace que les aparezca el acceso en el menú.
--
-- Re-ejecutable: ON CONFLICT DO NOTHING sobre la PK (user_id, role_id).

do $$
declare
  v_role_id smallint;
  v_user_id uuid;
  v_email text;
  v_emails text[] := array[
    'operaciones@logisalud.com',
    'aromero@logisalud.com',
    'sgonzales@logisalud.com'
  ];
  v_asignados integer := 0;
begin
  select id into v_role_id from pedidos.roles where name = 'operaciones';
  if v_role_id is null then
    raise exception 'No existe el rol operaciones en pedidos.roles (¿falta 0005_seed_roles?)';
  end if;

  foreach v_email in array v_emails loop
    select id into v_user_id from auth.users where email = v_email;

    if v_user_id is null then
      raise notice 'Usuario % no existe todavía; créalo en Authentication -> Users y vuelve a correr esta migración para asignarle el rol operaciones.', v_email;
    else
      insert into pedidos.user_roles (user_id, role_id)
      values (v_user_id, v_role_id)
      on conflict (user_id, role_id) do nothing;
      v_asignados := v_asignados + 1;
    end if;
  end loop;

  raise notice 'Rol operaciones asignado a % usuario(s).', v_asignados;
end $$;
