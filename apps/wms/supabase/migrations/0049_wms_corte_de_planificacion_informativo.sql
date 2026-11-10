-- 0049 · El corte de las 16:00 deja de ser una regla dura (decisión de Sebas, 2026-11-07).
--
-- Antes: un pedido importado (o una orden creada) después de las `hora_corte_planificacion` de la víspera de la fecha de la ruta NO entraba a esa ruta sin una excepción con motivo.
-- Ahora: el corte solo AVISA (la pantalla muestra «Llegó/Se creó después del corte»; la parada sigue registrando `excepcion_corte` y el motivo si alguien los escribe). Más adelante se consultará
-- cuántos pedidos entraron después de las 16:00, pero no es una regla del producto.
-- Reversible con un parámetro: `corte_planificacion_estricto` = 'si' devuelve la regla dura sin tocar código. Por defecto 'no'.
-- Re-ejecutable: no cambia nada si `planificar_ruta` ya quedó parchada.

insert into wms.parametros (clave, valor, nota) values
  ('corte_planificacion_estricto', 'no', 'Con «si», lo que llegó después del corte de la víspera entra a una ruta solo con una excepción con motivo. Con «no» (piloto) el corte solo avisa y no bloquea.')
on conflict (clave) do nothing;

create or replace function wms._corte_estricto() returns boolean language sql stable set search_path = wms, pg_temp as $$
  select coalesce((select valor from wms.parametros where clave = 'corte_planificacion_estricto'), 'no') = 'si'
$$;

-- `planificar_ruta` (la versión de la 0030) se parcha por texto: cada validación del corte pasa a exigir también el corte estricto. Las dos (pedido y orden) o ninguna.
do $$
declare
  v_def text := pg_get_functiondef('wms.planificar_ruta(uuid, date, uuid, uuid, uuid, jsonb, text)'::regprocedure);
  v_nuevo text;
begin
  if v_def like '%wms._corte_estricto()%' then return; end if;
  v_nuevo := replace(v_def, 'if wms._fuera_de_corte(', 'if wms._corte_estricto() and wms._fuera_de_corte(');
  if (length(v_nuevo) - length(v_def)) <> 2 * length('wms._corte_estricto() and ') then
    raise exception 'planificar_ruta no tiene las dos validaciones del corte que se esperaban: no se parcha';
  end if;
  execute v_nuevo;
end $$;

-- Permisos (default-deny): el ayudante es interno; nadie lo llama desde la aplicación.
revoke execute on all functions in schema wms from public;
