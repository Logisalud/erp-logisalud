-- Cuentas por Pagar: historial de estados de una obligación (regla de
-- negocio 14 del documento maestro — "este sí es un trigger de base de
-- datos", a diferencia de las demás reglas que van en Server Actions).
--
-- Registra el estado inicial al crear la obligación (estado_anterior=null) y
-- cada cambio de `estado` en un update. `cambiado_por` sale de auth.uid():
-- una función SECURITY DEFINER sigue viendo el JWT de la sesión que disparó
-- el trigger, no el dueño de la función (mismo mecanismo que es_admin()).
--
-- Re-ejecutable.
create or replace function cuentas_x_pagar.fn_historial_estados()
returns trigger
language plpgsql
security definer
set search_path = public, cuentas_x_pagar
as $$
begin
  if TG_OP = 'INSERT' then
    insert into cuentas_x_pagar.historial_estados (obligacion_id, estado_anterior, estado_nuevo, cambiado_por)
    values (new.id, null, new.estado, auth.uid());
  elsif TG_OP = 'UPDATE' and new.estado is distinct from old.estado then
    insert into cuentas_x_pagar.historial_estados (obligacion_id, estado_anterior, estado_nuevo, cambiado_por)
    values (new.id, old.estado, new.estado, auth.uid());
  end if;
  return new;
end;
$$;

drop trigger if exists trg_historial_estados on cuentas_x_pagar.obligaciones;
create trigger trg_historial_estados
  after insert or update on cuentas_x_pagar.obligaciones
  for each row execute function cuentas_x_pagar.fn_historial_estados();
