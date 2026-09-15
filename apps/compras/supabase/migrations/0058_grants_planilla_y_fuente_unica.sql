-- El schema `planilla` (creado en 0055) quedó SIN grants para
-- `authenticated`: los otros nueve del módulo los tienen desde 0009, pero
-- 0009 los aplica recorriendo un ARRAY HARDCODEADO, y `planilla` nació
-- cuatro meses después, fuera de ese array. Tampoco heredó nada por
-- `alter default privileges`, porque esos defaults se declararon por schema
-- y solo para los nueve de entonces.
--
-- Es literalmente el bug contra el que advierte el comentario de 0009,
-- repetido. La causa raíz no es el olvido: es que la lista de schemas del
-- módulo vive dentro de UNA migración vieja, así que al crear el schema #9
-- no había ningún lugar evidente donde anotarlo.
--
-- Esto NO es lo que hacía caer /planilla con "Invalid schema: planilla"
-- (HTTP 406) — eso es la lista de Exposed schemas del Data API, que se
-- configura en el dashboard y no por SQL. Este grant es la SEGUNDA barrera,
-- la que habría dado 403 "permission denied for schema planilla" apenas se
-- resolviera la primera. Se arreglan las dos o la página sigue caída.
--
-- Por qué la lista sigue siendo explícita y no un `select` sobre
-- pg_namespace: en esta base hay schemas propios (owner `postgres`, no
-- Supabase) que NO son de este módulo y a los que `authenticated` no debe
-- tener nada — verificado hoy en producción:
--
--   backup_limpieza_20260903   28 objetos   respaldo, sin grants (correcto)
--   pedidos                    13 objetos   otra app del monorepo, sin grants
--
-- Un loop "todo lo que sea de postgres" le habría abierto los dos a
-- cualquier usuario logueado de Compras. El de `pedidos` además cruzaría
-- apps, que el CLAUDE.md de la raíz prohíbe explícitamente.
--
-- Lo que sí cambia: la lista pasa a vivir en UNA función con nombre, que es
-- el lugar obvio donde buscarla, y el grant pasa a ser una función
-- idempotente que cualquier migración futura puede llamar con una línea.
-- Más `verificar_schemas_sin_grants()`, que delata al schema #10 el día que
-- alguien lo cree y se olvide de agregarlo, en vez de que se descubra en
-- producción con una página caída.
--
-- Re-ejecutable.

-- Fuente única de verdad: qué schemas son de Compras y Pagos.
-- Al agregar un schema al módulo, se agrega ACÁ y nada más.
create or replace function public.schemas_compras_y_pagos()
returns text[]
language sql
immutable
as $$
  select array[
    'compras','servicios','almacen','cuentas_x_pagar',
    'gastos','caja_chica','financiamiento','impuestos',
    'planilla','catalogo'
  ]
$$;

comment on function public.schemas_compras_y_pagos() is
  'Schemas del módulo Compras y Pagos. Fuente única: agregar un schema al '
  'módulo es agregarlo acá y llamar a aplicar_grants_del_modulo(). No '
  'incluye `public` (ya tiene grants propios) ni schemas de otras apps.';

-- Aplica los grants base a los schemas del módulo. Idempotente: se puede
-- llamar al final de cualquier migración que cree un schema o tablas.
--
-- `authenticated` y nada a `anon`: todo el módulo exige sesión. Esto solo
-- abre la puerta del edificio; quién toca qué adentro lo sigue decidiendo
-- RLS, igual que antes.
create or replace function public.aplicar_grants_del_modulo()
returns void
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare s text;
begin
  foreach s in array public.schemas_compras_y_pagos()
  loop
    if not exists (select 1 from pg_namespace where nspname = s) then
      raise exception
        'schemas_compras_y_pagos() nombra el schema %, que no existe. '
        '¿Un typo, o falta el create schema?', s;
    end if;

    execute format('grant usage on schema %I to authenticated', s);
    execute format('grant select, insert, update, delete on all tables in schema %I to authenticated', s);
    execute format('grant usage, select on all sequences in schema %I to authenticated', s);
    execute format('alter default privileges in schema %I grant select, insert, update, delete on tables to authenticated', s);
    execute format('alter default privileges in schema %I grant usage, select on sequences to authenticated', s);
  end loop;
end $$;

-- Nadie más que el owner debería poder repartir grants del módulo.
revoke all on function public.aplicar_grants_del_modulo() from public;
revoke all on function public.aplicar_grants_del_modulo() from anon, authenticated;

-- Delator: schemas propios que no son de Supabase, no son del módulo, y no
-- están declarados como de otra app. Si acá aparece algo inesperado, o es
-- un schema nuevo que falta agregar a schemas_compras_y_pagos(), o es un
-- respaldo que hay que borrar. Se consulta a mano; no bloquea nada.
create or replace function public.verificar_schemas_sin_grants()
returns table (schema_name text, objetos bigint, tiene_usage boolean)
language sql
stable
as $$
  select n.nspname::text,
         (select count(*) from pg_class c
           where c.relnamespace = n.oid and c.relkind in ('r','p','v','m')),
         has_schema_privilege('authenticated', n.nspname, 'USAGE')
  from pg_namespace n
  where pg_catalog.pg_get_userbyid(n.nspowner) = 'postgres'
    and n.nspname <> all (public.schemas_compras_y_pagos())
    and n.nspname not in (
      -- de Supabase o de infraestructura, con owner postgres igual
      'extensions', 'supabase_migrations',
      -- otras apps del monorepo: tienen su propio ciclo, no se tocan
      'pedidos'
    )
    and n.nspname not like 'pg\_%'
    and n.nspname <> 'information_schema'
  order by 1
$$;

comment on function public.verificar_schemas_sin_grants() is
  'Diagnóstico: schemas propios que no son del módulo. Sirve para detectar '
  'un schema nuevo al que le faltan grants (el bug de 0055) o un respaldo '
  'olvidado. No hace cambios.';

select public.aplicar_grants_del_modulo();
