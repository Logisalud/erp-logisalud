-- 0052 · WMS · Ruteo (reunión del equipo, 1b): los auxiliares de transporte aparecen en el desplegable de la ruta.
--
-- El desplegable «Auxiliar» de la ruta lista `wms.personal_transporte` (funcion = 'AUXILIAR'); las personas con el rol `auxiliar_transporte` (el de «Mis rutas») no estaban ahí, así que
-- el desplegable salía vacío. Esta migración da de alta, una sola vez, a cada usuario con ese rol vigente que todavía no figure en el personal de transporte (se une por `usuario_id`, que es
-- también lo que usa «Mis rutas» para reconocer su ruta). El nombre sale del perfil (public.perfiles.nombre) y, si no hay, de su correo. Quien reciba el rol más adelante se agrega desde
-- Rutas → Recursos. No cambia roles, permisos ni funciones. Aditiva y re-ejecutable. Se aplica a mano (nunca al mergear).

do $$
declare
  v_nombre_sql text;
  v_n integer;
begin
  -- nombre: perfil → correo → texto genérico (según lo que exista en esta base)
  v_nombre_sql := 'null::text';
  if to_regclass('public.perfiles') is not null
     and exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'perfiles' and column_name = 'nombre') then
    v_nombre_sql := '(select nullif(btrim(p.nombre), '''') from public.perfiles p where p.id = r.user_id)';
  end if;
  if exists (select 1 from information_schema.columns where table_schema = 'auth' and table_name = 'users' and column_name = 'email') then
    v_nombre_sql := 'coalesce(' || v_nombre_sql || ', (select initcap(replace(split_part(u.email, ''@'', 1), ''.'', '' '')) from auth.users u where u.id = r.user_id))';
  end if;
  execute format($q$
    insert into wms.personal_transporte (nombre, funcion, usuario_id, activo)
    select distinct on (r.user_id) coalesce(%s, 'Auxiliar de transporte'), 'AUXILIAR', r.user_id, true
      from wms.usuario_roles r
     where r.rol = 'auxiliar_transporte' and r.desde <= current_date and (r.hasta is null or r.hasta >= current_date)
       and not exists (select 1 from wms.personal_transporte x where x.usuario_id = r.user_id)
  $q$, v_nombre_sql);
  get diagnostics v_n = row_count;
  raise notice '0052: % auxiliares de transporte dados de alta en el personal', v_n;
end $$;

revoke execute on all functions in schema wms from public;
