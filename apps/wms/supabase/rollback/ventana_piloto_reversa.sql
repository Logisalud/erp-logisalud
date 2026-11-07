-- Reversa de la ventana del piloto: deja la base como estaba antes de aplicar el WMS (migraciones 0001 a 0046 SIN la 0008, más las semillas de topología y transporte).
-- SE EJECUTA A MANO, por quien decida Sebas, en la base donde se aplicó la ventana. Es re-ejecutable (una segunda vez no hace nada ni falla).
-- Probada en Postgres local (tests/db/reversa-ventana.test.ts) y con el modo WMS_PROBAR_REVERSA=1 de scripts/ensayo-migraciones.sh: se aplica la cadena, se aplica esta reversa,
-- se comprueba que no queda nada del WMS ni cambió nada fuera de él, y se vuelve a aplicar la cadena. NUNCA ejecutarla contra una base real sin la copia del día.
--
-- QUÉ BORRA: TODO el esquema `wms` (tablas, datos, vistas, funciones, triggers, policies y permisos viven dentro de `wms`). Revisado: ninguna migración de la ventana agrega objetos fuera de
-- `wms` (la única que toca algo de Compras, la 0008 —un trigger en catalogo.productos—, NO se aplica en la ventana; si alguna vez se aplicó, el paso 2 lo quita).
-- QUÉ NO TOCA (y se revierte a mano si se hizo): (a) `wms` en `public.schemas_compras_y_pagos()` y los grants de `public.aplicar_grants_del_modulo()`; (b) «wms» en Data API → Exposed
-- schemas; (c) el bucket privado `wms-documentos` y sus archivos (se vacía y borra desde el panel de Storage solo si Sebas lo decide); (d) las variables de entorno de Vercel; (e) la
-- extensión `btree_gist` (la crea la 0001 con `if not exists`; es inofensiva y puede usarla otro módulo: se deja); (f) los productos que ya existan en `catalogo.productos` (el WMS no los escribe en el piloto).

set lock_timeout = '5s';
set statement_timeout = '120s';

-- 1. Cinturón de seguridad: si la 0008 se aplicó por error, su trigger vive en `catalogo.productos` (de Compras) y depende de una función de `wms`: se quita primero.
do $$ begin
  if to_regclass('catalogo.productos') is not null
     and exists (select 1 from pg_trigger where tgname = 'proteger_presentacion_principio' and tgrelid = 'catalogo.productos'::regclass and not tgisinternal) then
    drop trigger proteger_presentacion_principio on catalogo.productos;
  end if;
end $$;

-- 2. El esquema completo con todo lo que contiene.
do $$ begin
  if exists (select 1 from pg_namespace where nspname = 'wms') then
    drop schema wms cascade;
  end if;
end $$;

-- 3. Comprobación: no queda nada del WMS (si queda algo, la reversa se detiene con un error en vez de dar por buena una limpieza a medias).
do $$ declare v_restos text;
begin
  select string_agg(distinct format('%s %s', k, n), ', ') into v_restos from (
    select 'función' k, p.proname n from pg_proc p where p.proname like '\_%wms%' or p.pronamespace = (select oid from pg_namespace where nspname = 'wms')
    union all select 'esquema', nspname from pg_namespace where nspname = 'wms'
  ) x;
  if v_restos is not null then raise exception 'La reversa dejó restos del WMS: %', v_restos; end if;
end $$;
