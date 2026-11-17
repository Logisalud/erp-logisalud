-- SOLO LECTURA. SNAPSHOT DE CONTROL: se corre ANTES de la primera migración y DESPUÉS de la última (y otra vez si hay reversa).
-- Mira TODO lo que no es del WMS ni del sistema de Supabase. Guarda el resultado completo (copiar como texto o CSV) con la hora.
--
-- Parte 1: cuántas filas tiene cada tabla (conteo exacto).
select table_schema as esquema, table_name as tabla,
       (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from %I.%I', table_schema, table_name), false, true, '')))[1]::text::bigint as filas
  from information_schema.tables
 where table_type = 'BASE TABLE'
   and table_schema not in ('pg_catalog','information_schema','pg_toast','wms','auth','storage','realtime','vault','extensions','graphql','graphql_public',
                            'pgsodium','pgsodium_masks','supabase_functions','supabase_migrations','net','cron','pgbouncer','_realtime','_analytics','pgtle')
 order by 1, 2;

-- Parte 2: una «huella» por esquema de sus funciones, triggers, columnas y políticas (RLS). Si algo cambia, cambia la huella de ESE esquema.
with excluidos(nombre) as (values ('pg_catalog'),('information_schema'),('pg_toast'),('wms'),('auth'),('storage'),('realtime'),('vault'),('extensions'),('graphql'),('graphql_public'),
                                  ('pgsodium'),('pgsodium_masks'),('supabase_functions'),('supabase_migrations'),('net'),('cron'),('pgbouncer'),('_realtime'),('_analytics'),('pgtle')),
f as (select n.nspname as esquema, md5(string_agg(p.oid::regprocedure::text || ':' || md5(pg_get_functiondef(p.oid)), '|' order by p.oid::regprocedure::text)) as h
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where p.prokind in ('f','p') and n.nspname not in (select nombre from excluidos) group by 1),
t as (select n.nspname as esquema, md5(string_agg(c.relname || ':' || tg.tgname || ':' || md5(pg_get_triggerdef(tg.oid)), '|' order by c.relname, tg.tgname)) as h
        from pg_trigger tg join pg_class c on c.oid = tg.tgrelid join pg_namespace n on n.oid = c.relnamespace
       where not tg.tgisinternal and n.nspname not in (select nombre from excluidos) group by 1),
c as (select table_schema as esquema, md5(string_agg(table_name || '.' || column_name || ':' || data_type || ':' || is_nullable, '|' order by table_name, ordinal_position)) as h
        from information_schema.columns where table_schema not in (select nombre from excluidos) group by 1),
p as (select schemaname::text as esquema, md5(string_agg(tablename || '.' || policyname || ':' || cmd || ':' || coalesce(qual, '') || ':' || coalesce(with_check, ''), '|' order by tablename, policyname)) as h
        from pg_policies where schemaname not in (select nombre from excluidos) group by 1)
select coalesce(f.esquema, t.esquema, c.esquema, p.esquema) as esquema,
       f.h as huella_funciones, t.h as huella_triggers, c.h as huella_columnas, p.h as huella_politicas
  from f full join t on t.esquema = f.esquema full join c on c.esquema = coalesce(f.esquema, t.esquema) full join p on p.esquema = coalesce(f.esquema, t.esquema, c.esquema)
 order by 1;
