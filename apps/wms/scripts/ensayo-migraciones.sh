#!/usr/bin/env bash
# Ensayo de la ventana de producción: aplica la cadena completa de migraciones (0001 a la última) sobre una
# base NUEVA y desechable, y comprueba lo básico. Cada migración se corre dos veces seguidas (un reintento tras un
# fallo es lo normal: tiene que ser re-ejecutable). Repetir TODA la cadena desde 0001 no se prueba a propósito:
# la 0005 retira objetos de la 0004 y no es un caso real.
# Uso: ensayo-migraciones.sh <url-de-un-Postgres-DESECHABLE>   (recomendado: Postgres 17, la versión de producción)
# Opciones (variables de entorno, listas separadas por comas con el número de la migración):
#   WMS_OMITIR=0008            no aplica esas migraciones en su lugar (la ventana del piloto aplica todo MENOS la 0008).
#   WMS_APLICAR_AL_FINAL=0008  las aplica (dos veces) después de todas las demás y de las semillas: la ruta del go-live.
# Las dos rutas que se ensayan: (1) WMS_OMITIR=0008   (2) WMS_OMITIR=0008 WMS_APLICAR_AL_FINAL=0008. Sin opciones corre la cadena completa en orden.
#   WMS_PROBAR_REVERSA=1       además de lo anterior, ensaya la REVERSA: aplica supabase/rollback/ventana_piloto_reversa.sql (dos veces), comprueba que no queda nada del WMS ni cambió nada
#                              fuera de `wms`, y vuelve a aplicar la cadena completa (debe funcionar y dar los mismos resultados).
# ¡Nunca apuntarlo a una base real! Borra y recrea la base "ensayo_ventana".
set -euo pipefail
ADMIN="${1:?falta la URL del Postgres de prueba}"
AQUI="$(cd "$(dirname "$0")/.." && pwd)"
BASE=ensayo_ventana
URL="${ADMIN%/*}/$BASE"

psql "$ADMIN" -v ON_ERROR_STOP=1 -qc "drop database if exists $BASE" -c "create database $BASE"
echo "Servidor: $(psql "$URL" -tAc 'show server_version')"
psql "$URL" -v ON_ERROR_STOP=1 -q -f "$AQUI/tests/db/stubs.sql" >/dev/null

huella_fuera() { psql "$URL" -tAc "select md5(string_agg(x, '|' order by x)) from (
    select 'c:' || n.nspname || '.' || c.relname || ':' || c.relkind::text as x from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname not in ('wms', 'pg_catalog', 'information_schema', 'pg_toast') and n.nspname not like 'pg_temp%' and not exists (select 1 from pg_depend d where d.objid = c.oid and d.deptype = 'e')
    union all select 'p:' || n.nspname || '.' || p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname not in ('wms', 'pg_catalog', 'information_schema') and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
    union all select 't:' || tgrelid::regclass::text || ':' || tgname from pg_trigger where not tgisinternal and tgrelid::regclass::text not like 'wms.%'
    union all select 'o:' || polrelid::regclass::text || ':' || polname from pg_policy where polrelid::regclass::text not like 'wms.%'
    union all select 'n:' || nspname from pg_namespace where nspname not in ('wms', 'pg_toast') and nspname not like 'pg_temp%' and nspname not like 'pg_toast_temp%') y"; }
HUELLA_ANTES="$(huella_fuera)"
n=0; t0=$SECONDS
OMITIR=",${WMS_OMITIR:-},"
aplicar() {
  local f="$1"
  for pasada in 1 2; do
    psql "$URL" -v ON_ERROR_STOP=1 -q -f "$f" >/dev/null 2>/tmp/ensayo.err || { echo "FALLA en $(basename "$f") (aplicación $pasada):"; grep -E "ERROR|DETAIL|HINT|CONTEXT" -A2 /tmp/ensayo.err | head -8; exit 1; }
  done
  n=$((n + 1))
}
for f in $(ls "$AQUI"/supabase/migrations/*.sql | sort); do
  num="$(basename "$f" | cut -c1-4)"
  case "$OMITIR" in *",$num,"*) echo "Se omite la $num (WMS_OMITIR)"; continue;; esac
  aplicar "$f"
done
echo "$n migraciones aplicadas (cada una dos veces seguidas) en $((SECONDS - t0)) s"
for s in 0001_topologia 0002_transporte_inicial; do psql "$URL" -v ON_ERROR_STOP=1 -q -f "$AQUI/supabase/seeds/$s.sql" >/dev/null; done
echo "Semillas aplicadas (topología y transporte)"

for num in $(echo "${WMS_APLICAR_AL_FINAL:-}" | tr ',' ' '); do
  f="$(ls "$AQUI"/supabase/migrations/${num}_*.sql)"
  aplicar "$f"; echo "Se aplicó la $num al final (go-live), dos veces seguidas"
done

FILAS=$(psql "$URL" -tAc "select count(*) from wms.verificar_saldos()")
[ "$FILAS" = "0" ] || { echo "verificar_saldos devolvió $FILAS filas"; exit 1; }
EXPUESTAS=$(psql "$URL" -tAc "select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='wms' and has_function_privilege('authenticated', p.oid, 'execute')")
PUBLICAS=$(psql "$URL" -tAc "select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='wms' and has_function_privilege('public', p.oid, 'execute')")
[ "$PUBLICAS" = "0" ] || { echo "Hay $PUBLICAS funciones de wms con EXECUTE para PUBLIC"; exit 1; }
TABLAS=$(psql "$URL" -tAc "select count(*) from pg_tables where schemaname='wms'")
SINRLS=$(psql "$URL" -tAc "select count(*) from pg_tables where schemaname='wms' and not rowsecurity")
[ "$SINRLS" = "0" ] || { echo "Hay $SINRLS tablas de wms sin RLS"; exit 1; }
echo "OK: $TABLAS tablas con RLS, $EXPUESTAS funciones expuestas a authenticated, ninguna a PUBLIC, verificar_saldos() sin filas."
if [ "${WMS_PROBAR_REVERSA:-}" = "1" ]; then
  echo "--- Ensayo de la reversa ---"
  [ "$(huella_fuera)" = "$HUELLA_ANTES" ] || { echo "La cadena cambió algo FUERA de wms (antes de la reversa)"; exit 1; }
  for pasada in 1 2; do psql "$URL" -v ON_ERROR_STOP=1 -q -f "$AQUI/supabase/rollback/ventana_piloto_reversa.sql" >/dev/null 2>/tmp/reversa.err || { echo "FALLA la reversa (aplicación $pasada):"; head -8 /tmp/reversa.err; exit 1; }; done
  [ "$(psql "$URL" -tAc "select count(*) from pg_namespace where nspname = 'wms'")" = "0" ] || { echo "Quedó el esquema wms"; exit 1; }
  [ "$(psql "$URL" -tAc "select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'wms'")" = "0" ] || { echo "Quedaron funciones de wms"; exit 1; }
  [ "$(huella_fuera)" = "$HUELLA_ANTES" ] || { echo "La reversa no dejó el resto de la base como estaba"; exit 1; }
  echo "Reversa: no queda nada del WMS y lo de fuera de wms quedó idéntico"
  n=0
  for f in $(ls "$AQUI"/supabase/migrations/*.sql | sort); do
    num="$(basename "$f" | cut -c1-4)"
    case "$OMITIR" in *",$num,"*) continue;; esac
    aplicar "$f"
  done
  for s in 0001_topologia 0002_transporte_inicial; do psql "$URL" -v ON_ERROR_STOP=1 -q -f "$AQUI/supabase/seeds/$s.sql" >/dev/null; done
  [ "$(psql "$URL" -tAc "select count(*) from wms.verificar_saldos()")" = "0" ] || { echo "Tras volver a aplicar, verificar_saldos devolvió filas"; exit 1; }
  [ "$(psql "$URL" -tAc "select count(*) from pg_tables where schemaname='wms' and not rowsecurity")" = "0" ] || { echo "Tras volver a aplicar hay tablas sin RLS"; exit 1; }
  [ "$(psql "$URL" -tAc "select count(*) from pg_tables where schemaname='wms'")" = "$TABLAS" ] || { echo "Tras volver a aplicar cambió la cantidad de tablas"; exit 1; }
  echo "OK: la cadena se volvió a aplicar completa después de la reversa ($n migraciones)."
fi
psql "$ADMIN" -qc "drop database $BASE"
