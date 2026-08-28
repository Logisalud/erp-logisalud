-- Fase 1.7: "Dar conformidad" en Cuentas por Pagar hoy lo puede hacer
-- cualquiera de área contabilidad (Beatriz Zavala, rol operativo, y
-- Mariela Casiano, rol admin, ambas contabilidad) — pero solo Mariela debe
-- poder darla. `public.perfiles.rol` ya distingue admin/operativo dentro de
-- un área, así que la regla es "contabilidad Y rol=admin", no una persona
-- hardcodeada por nombre — cualquier futura Mariela-equivalente califica
-- sola con ese rol.
--
-- No se restringe toda la tabla (Beatriz sigue registrando facturas y
-- obligaciones, solo no puede marcarlas conformes): un trigger BEFORE
-- UPDATE bloquea específicamente la transición a 'conforme', en vez de
-- reescribir obligaciones_escritura entera.

create or replace function public.puede_dar_conformidad()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select area = 'admin' or (area = 'contabilidad' and rol = 'admin')
    from public.perfiles where id = auth.uid()
  ), false);
$$;

create or replace function cuentas_x_pagar.exigir_permiso_conformidad()
returns trigger
language plpgsql
security definer
set search_path = public, cuentas_x_pagar
as $$
begin
  if new.estado = 'conforme' and old.estado is distinct from 'conforme' then
    if not public.puede_dar_conformidad() then
      raise exception 'Solo Contabilidad (rol admin) puede dar conformidad a una obligación.';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists exigir_permiso_conformidad on cuentas_x_pagar.obligaciones;
create trigger exigir_permiso_conformidad
  before update on cuentas_x_pagar.obligaciones
  for each row
  execute function cuentas_x_pagar.exigir_permiso_conformidad();
