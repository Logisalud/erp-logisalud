-- Login sin contraseña: tabla de personas esperadas + asignación automática
-- de perfil al primer inicio de sesión.
--
-- Con magic link / SMS OTP nadie crea cuentas por adelantado: la fila en
-- auth.users nace sola cuando la persona entra por primera vez. Esta tabla es
-- la que dice quién es cada correo y qué área/rol le toca.
--
-- Quien entre con un correo que NO esté acá queda SIN perfil, y sin perfil
-- las políticas RLS le niegan todo. No hace falta bloquear el login en sí.
--
-- Re-ejecutable.

create table if not exists public.usuarios_esperados (
  id bigint generated always as identity primary key,
  correo text unique,
  telefono text unique,
  nombre text not null,
  area text not null check (area in (
    'compras','almacen','contabilidad','tesoreria','gerencia',
    'gestion_humana','legal','direccion_tecnica','ventas','admin','otro'
  )),
  rol text not null default 'operativo',
  -- Áreas de las que esta persona es responsable. Se resuelve a
  -- area_responsables recién cuando inicia sesión y existe su user_id.
  responsable_de text[] not null default '{}',
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  constraint contacto_requerido check (correo is not null or telefono is not null)
);

alter table public.usuarios_esperados enable row level security;

drop policy if exists usuarios_esperados_admin on public.usuarios_esperados;
create policy usuarios_esperados_admin on public.usuarios_esperados
  for all to authenticated
  using (public.es_admin()) with check (public.es_admin());

-- ===================================================================
-- Asignación de perfil al crearse la cuenta
-- ===================================================================
create or replace function public.asignar_perfil_al_registrarse()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
declare
  esperado public.usuarios_esperados%rowtype;
  a text;
begin
  select * into esperado
  from public.usuarios_esperados
  where activo
    and (
      (new.email is not null and correo is not null and lower(correo) = lower(new.email))
      or (new.phone is not null and telefono is not null and telefono = new.phone)
    )
  limit 1;

  -- No está en la lista: entra pero sin perfil, y RLS le niega todo.
  if not found then
    return new;
  end if;

  insert into public.perfiles (id, nombre, area, rol)
  values (new.id, esperado.nombre, esperado.area, esperado.rol)
  on conflict (id) do update
    set nombre = excluded.nombre, area = excluded.area, rol = excluded.rol;

  foreach a in array esperado.responsable_de loop
    insert into public.area_responsables (area, responsable_id)
    values (a, new.id)
    on conflict (area) do update set responsable_id = excluded.responsable_id;
  end loop;

  return new;
end;
$fn$;

drop trigger if exists trg_asignar_perfil on auth.users;
create trigger trg_asignar_perfil
  after insert on auth.users
  for each row execute function public.asignar_perfil_al_registrarse();

-- ===================================================================
-- Datos: el organigrama esperado
-- ===================================================================
insert into public.usuarios_esperados (correo, telefono, nombre, area, rol, responsable_de)
values
  ('sgonzales@logisalud.com', null, 'Sebastian Gonzales', 'admin', 'admin', array['almacen']::text[]),
  ('aromero@logisalud.com', null, 'Andres Romero', 'admin', 'admin', '{}'::text[]),
  ('jgonzales@logisalud.com', null, 'Juan Gonzales', 'gerencia', 'operativo', array['otro','ventas']::text[]),
  ('a.aguilar@logisalud.com', null, 'Arlette Aguilar', 'gestion_humana', 'control_pedidos', '{}'::text[]),
  ('mcasiano@logisalud.com', null, 'Mariela Casiano', 'contabilidad', 'admin', array['contabilidad']::text[]),
  ('bzavala@logisalud.com', null, 'Beatriz Zavala', 'contabilidad', 'operativo', '{}'::text[]),
  ('mminaya@logisalud.com', null, 'Milagritos Minaya', 'tesoreria', 'operativo', array['tesoreria']::text[]),
  ('rcruz@logisalud.com', null, 'Renato Cruz', 'otro', 'operativo', '{}'::text[]),
  ('ataboada@logisalud.com', null, 'Ana Lucia Taboada', 'legal', 'admin', array['legal']::text[]),
  ('kzapata@logisalud.com', null, 'Katia Zapata', 'direccion_tecnica', 'admin', array['direccion_tecnica']::text[]),
  ('slopez@logisalud.com', null, 'Sandra Lopez', 'direccion_tecnica', 'operativo', '{}'::text[]),
  ('cchancco@logisalud.com', null, 'Charlie Chancco', 'almacen', 'operativo', '{}'::text[]),
  ('schau@logisalud.com', null, 'Sandra Chau', 'almacen', 'operativo', '{}'::text[]),
  ('rmunoz@logisalud.com', null, 'Roberto Munoz', 'almacen', 'operativo', '{}'::text[]),
  ('mmauriello@logisalud.com', null, 'Michele Mauriello', 'almacen', 'operativo', '{}'::text[]),
  ('hastoyauri@logisalud.com', null, 'Hans Astoyauri', 'almacen', 'operativo', '{}'::text[]),
  ('lcastro@logisaludventas.com', null, 'Lupe Castro', 'ventas', 'vendedor', '{}'::text[]),
  ('lvargas@logisaludventas.com', null, 'Luis Vargas', 'ventas', 'vendedor', '{}'::text[]),
  ('sramos@logisaludventas.com', null, 'Susana Ramos', 'ventas', 'vendedor', '{}'::text[]),
  ('kbendezu@logisaludventas.com', null, 'Karina Bendezu', 'ventas', 'vendedor', '{}'::text[]),
  ('mperalta@logisaludventas.com', null, 'Marysabel Peralta', 'ventas', 'vendedor', '{}'::text[]),
  ('cvilchez@logisaludventas.com', null, 'Cinthya Vilchez', 'ventas', 'vendedor', '{}'::text[]),
  ('jmadrid@logisaludventas.com', null, 'Jennifer Madrid', 'ventas', 'vendedor', '{}'::text[]),
  ('jmendoza@logisaludventas.com', null, 'Jessica Mendoza', 'ventas', 'vendedor', '{}'::text[]),
  ('fsamaniego@logisaludventas.com', null, 'Fabiola Samaniego', 'ventas', 'vendedor', '{}'::text[]),
  ('mgaona@logisaludventas.com', null, 'Malena Gaona', 'ventas', 'vendedor', '{}'::text[]),
  ('orubio@logisaludventas.com', null, 'Omar Rubio', 'ventas', 'vendedor', '{}'::text[]),
  ('oquevedo@logisaludventas.com', null, 'Omar Quevedo', 'ventas', 'vendedor', '{}'::text[]),
  ('msoto@logisaludventas.com', null, 'Milagros Soto', 'ventas', 'vendedor', '{}'::text[]),
  ('tsamanez@logisaludventas.com', null, 'Teresa Samanez', 'ventas', 'vendedor', '{}'::text[]),
  ('lminguillo@logisaludventas.com', null, 'Luis Minguillo', 'ventas', 'vendedor', '{}'::text[]),
  ('rchamochumbi@logisaludventas.com', null, 'Romina Chamochumbi', 'ventas', 'vendedor', '{}'::text[])
on conflict (correo) do update
  set nombre = excluded.nombre,
      area = excluded.area,
      rol = excluded.rol,
      responsable_de = excluded.responsable_de,
      activo = true;

-- ===================================================================
-- Backfill: quien YA tenga cuenta creada antes de este trigger
-- ===================================================================
-- El trigger es AFTER INSERT, así que no corre para las cuentas que ya
-- existen. Se les aplica la misma lógica una vez, con SQL directo.
insert into public.perfiles (id, nombre, area, rol)
select u.id, e.nombre, e.area, e.rol
from auth.users u
join public.usuarios_esperados e
  on e.activo
 and (
   (u.email is not null and e.correo is not null and lower(e.correo) = lower(u.email))
   or (u.phone is not null and e.telefono is not null and e.telefono = u.phone)
 )
on conflict (id) do update
  set nombre = excluded.nombre, area = excluded.area, rol = excluded.rol;

insert into public.area_responsables (area, responsable_id)
select a, u.id
from auth.users u
join public.usuarios_esperados e
  on e.activo
 and (
   (u.email is not null and e.correo is not null and lower(e.correo) = lower(u.email))
   or (u.phone is not null and e.telefono is not null and e.telefono = u.phone)
 )
cross join lateral unnest(e.responsable_de) as a
on conflict (area) do update set responsable_id = excluded.responsable_id;
