-- Falta crítica encontrada al construir Cuentas por Pagar: los 8 schemas de
-- Compras y Pagos + `catalogo` tenían RLS activo y policies correctas desde
-- 0001/0002, pero a `authenticated` NUNCA se le dio GRANT USAGE sobre esos
-- schemas ni GRANT en sus tablas. En Postgres, RLS es la SEGUNDA barrera —
-- antes de evaluar cualquier policy, el rol necesita el permiso de base
-- (schema + tabla) para tocar el objeto. Sin este grant, toda consulta real
-- de un usuario logueado fallaba con "permission denied for schema X", sin
-- importar cuán bien escrita estuviera la policy.
--
-- Cómo pasó desapercibido: toda la verificación de este módulo hasta ahora
-- se hizo con `execute_sql` del MCP de Supabase, que corre como el rol
-- `postgres` (superusuario, no pasa por grants ni por RLS) — nunca se probó
-- como `authenticated`. Se detectó recién simulando una sesión real
-- (`set local role authenticated` + `request.jwt.claims`) para validar el
-- guard de Cuentas por Pagar, y con eso salió que ni siquiera Proveedores u
-- Órdenes de Compra —ya en producción desde antes— podían leerse.
--
-- Esto NO afecta las policies existentes: siguen siendo la barrera real por
-- fila. Este grant solo abre la puerta de entrada al edificio; quién puede
-- tocar qué adentro lo sigue decidiendo RLS exactamente igual que antes —
-- verificado en el PR: Milagritos (tesorería) pasa a poder LEER
-- compras.proveedores (antes ni eso), pero sigue sin poder ESCRIBIR una
-- obligación (bloqueada por policy, no por grant).
--
-- No se le da nada a `anon`: todo el módulo exige sesión.
--
-- `alter default privileges` para que las tablas y secuencias que se
-- agreguen en los próximos PRs (Servicios, Gastos, Caja Chica,
-- Financiamiento, Impuestos) hereden el grant solas, sin repetir este bug.
--
-- Re-ejecutable.
do $$
declare s text;
begin
  foreach s in array array[
    'compras','servicios','almacen','cuentas_x_pagar',
    'gastos','caja_chica','financiamiento','impuestos','catalogo'
  ]
  loop
    execute format('grant usage on schema %I to authenticated', s);
    execute format('grant select, insert, update, delete on all tables in schema %I to authenticated', s);
    execute format('grant usage, select on all sequences in schema %I to authenticated', s);
    execute format('alter default privileges in schema %I grant select, insert, update, delete on tables to authenticated', s);
    execute format('alter default privileges in schema %I grant usage, select on sequences to authenticated', s);
  end loop;
end $$;
