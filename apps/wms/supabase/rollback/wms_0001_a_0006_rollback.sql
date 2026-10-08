-- Reversa completa del WMS (migraciones 0001–0006 + seed de topología). SE EJECUTA A MANO, por quien decida el usuario.
-- Probada en Postgres local (tests/db/rollback.test.ts): deja intactos catalogo, compras y public.
--
-- ANTES: tomar el snapshot de control de Cobranzas/Compras (ver docs/wms/plan-aplicacion-produccion.md).
-- Uso recomendado: correr con una herramienta que deje historial, en horario de poco uso. Si la herramienta falla o se cuelga: DETENERSE y avisar.
--
-- Lo que NO deshace (a propósito): los productos que `wms.crear_producto` haya insertado en `catalogo.productos`
-- (son datos de Compras; revisar a mano con: select id, codigo from catalogo.productos where creado_en >= '<fecha de la aplicación>').

set lock_timeout = '5s';
set statement_timeout = '60s';

-- 1. Si se había agregado `wms` a public.schemas_compras_y_pagos() o se concedieron grants a mano, revertirlo ANTES (paso manual,
--    ver el plan): este script no toca `public`.

-- 2. El schema completo (tablas, vistas, funciones, triggers, policies y grants viven dentro de `wms`).
drop schema if exists wms cascade;

-- 3. La extensión btree_gist solo se elimina si la creó el WMS y nada fuera de `wms` depende de ella.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'btree_gist')
     and not exists (
       select 1
         from pg_depend d
         join pg_extension e on e.oid = d.refobjid and e.extname = 'btree_gist'
        where d.classid in ('pg_class'::regclass, 'pg_proc'::regclass, 'pg_type'::regclass, 'pg_constraint'::regclass)
          and d.deptype = 'n'
     ) then
    drop extension btree_gist;
  else
    raise notice 'btree_gist se conserva (no existe o hay objetos que dependen de ella).';
  end if;
end $$;
