#!/usr/bin/env bash
# Ensayo de la ventana de producción: aplica la cadena completa de migraciones (0001 a la última) sobre una
# base NUEVA y desechable, y comprueba lo básico. Cada migración se corre dos veces seguidas (un reintento tras un
# fallo es lo normal: tiene que ser re-ejecutable). Repetir TODA la cadena desde 0001 no se prueba a propósito:
# la 0005 retira objetos de la 0004 y no es un caso real.
# Uso: ensayo-migraciones.sh <url-de-un-Postgres-DESECHABLE>   (recomendado: Postgres 17, la versión de producción)
# ¡Nunca apuntarlo a una base real! Borra y recrea la base "ensayo_ventana".
set -euo pipefail
ADMIN="${1:?falta la URL del Postgres de prueba}"
AQUI="$(cd "$(dirname "$0")/.." && pwd)"
BASE=ensayo_ventana
URL="${ADMIN%/*}/$BASE"

psql "$ADMIN" -v ON_ERROR_STOP=1 -qc "drop database if exists $BASE" -c "create database $BASE"
echo "Servidor: $(psql "$URL" -tAc 'show server_version')"
psql "$URL" -v ON_ERROR_STOP=1 -q -f "$AQUI/tests/db/stubs.sql" >/dev/null

n=0; t0=$SECONDS
for f in $(ls "$AQUI"/supabase/migrations/*.sql | sort); do
  for pasada in 1 2; do
    psql "$URL" -v ON_ERROR_STOP=1 -q -f "$f" >/dev/null 2>/tmp/ensayo.err || { echo "FALLA en $(basename "$f") (aplicación $pasada):"; grep -E "ERROR|DETAIL|HINT|CONTEXT" -A2 /tmp/ensayo.err | head -8; exit 1; }
  done
  n=$((n + 1))
done
echo "$n migraciones aplicadas (cada una dos veces seguidas) en $((SECONDS - t0)) s"
for s in 0001_topologia 0002_transporte_inicial; do psql "$URL" -v ON_ERROR_STOP=1 -q -f "$AQUI/supabase/seeds/$s.sql" >/dev/null; done
echo "Semillas aplicadas (topología y transporte)"

FILAS=$(psql "$URL" -tAc "select count(*) from wms.verificar_saldos()")
[ "$FILAS" = "0" ] || { echo "verificar_saldos devolvió $FILAS filas"; exit 1; }
EXPUESTAS=$(psql "$URL" -tAc "select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='wms' and has_function_privilege('authenticated', p.oid, 'execute')")
PUBLICAS=$(psql "$URL" -tAc "select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='wms' and has_function_privilege('public', p.oid, 'execute')")
[ "$PUBLICAS" = "0" ] || { echo "Hay $PUBLICAS funciones de wms con EXECUTE para PUBLIC"; exit 1; }
TABLAS=$(psql "$URL" -tAc "select count(*) from pg_tables where schemaname='wms'")
SINRLS=$(psql "$URL" -tAc "select count(*) from pg_tables where schemaname='wms' and not rowsecurity")
[ "$SINRLS" = "0" ] || { echo "Hay $SINRLS tablas de wms sin RLS"; exit 1; }
echo "OK: $TABLAS tablas con RLS, $EXPUESTAS funciones expuestas a authenticated, ninguna a PUBLIC, verificar_saldos() sin filas."
psql "$ADMIN" -qc "drop database $BASE"
