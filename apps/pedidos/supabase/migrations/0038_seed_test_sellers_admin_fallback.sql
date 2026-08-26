-- Vincula a los dos administradores actuales (aromero@logisalud.com,
-- sgonzales@logisalud.com) con sellers de PRUEBA separados de los
-- reales, sin zona real asignada. Es solo plumbing por si algún día
-- quieren probar el flujo "como vendedor puro" — como ambos ya tienen
-- el rol administrador, el selector de vendedor en "Nuevo pedido" les
-- sigue apareciendo siempre (el rol admin manda sobre la presencia de
-- un seller vinculado); esto NO cambia su experiencia de UI hoy. Ver
-- docs/business-rules.md, Fase 4.

do $$
declare
  v_aromero uuid;
  v_sgonzales uuid;
begin
  select id into v_aromero from auth.users where email = 'aromero@logisalud.com';
  select id into v_sgonzales from auth.users where email = 'sgonzales@logisalud.com';

  if v_aromero is not null then
    insert into pedidos.sellers (codigo_representante, nombre_completo, zone_id, user_id, estado)
    values ('TEST001', 'VENDEDOR DE PRUEBA ADMIN 1', null, v_aromero, 'activo')
    on conflict (codigo_representante) do update set user_id = excluded.user_id;
  end if;

  if v_sgonzales is not null then
    insert into pedidos.sellers (codigo_representante, nombre_completo, zone_id, user_id, estado)
    values ('TEST002', 'VENDEDOR DE PRUEBA ADMIN 2', null, v_sgonzales, 'activo')
    on conflict (codigo_representante) do update set user_id = excluded.user_id;
  end if;
end $$;
