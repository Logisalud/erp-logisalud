-- Fase 2: helper genérico de roles, análogo a pedidos.is_admin() (Fase 1)
-- pero parametrizable para cualquier rol del catálogo. Se usa en las
-- políticas RLS de los maestros (control_pedidos, operaciones,
-- aprobador_comercial, vendedor).

create function pedidos.has_role(role_name text)
returns boolean
language sql
security definer
stable
set search_path = pedidos, public
as $$
  select exists (
    select 1
    from pedidos.user_roles ur
    join pedidos.roles r on r.id = ur.role_id
    where ur.user_id = auth.uid()
      and r.name = role_name
  );
$$;
