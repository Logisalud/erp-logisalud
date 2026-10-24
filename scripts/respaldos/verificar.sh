#!/usr/bin/env bash
# Prueba de restauración: carga el respaldo en una base vacía (Postgres 17) y comprueba que lo
# restaurado coincide con lo que dice el respaldo. Falla si falta cualquier tabla o si hay
# errores que no sean de la plataforma (roles/extensiones de Supabase que no existen en un Postgres limpio).
# Uso: verificar.sh <archivo.dump> <url-de-un-postgres-DESECHABLE>
# ¡Nunca apuntarlo a una base real! Borra y recrea la base "restauracion_prueba".
set -euo pipefail
ARCH="${1:?falta el respaldo}"; ADMIN_URL="${2:?falta la URL del Postgres de prueba}"
BASE=restauracion_prueba
URL_PRUEBA="${ADMIN_URL%/*}/$BASE"

psql "$ADMIN_URL" -v ON_ERROR_STOP=1 -qc "drop database if exists $BASE" -c "create database $BASE"
# Roles que Supabase trae de fábrica y que el respaldo menciona en políticas/grants.
psql "$URL_PRUEBA" -v ON_ERROR_STOP=1 -q <<'S'
do $$ declare r text; begin
  foreach r in array array['anon','authenticated','service_role','supabase_admin','authenticator','supabase_auth_admin','supabase_storage_admin','dashboard_user'] loop
    if not exists (select 1 from pg_roles where rolname=r) then execute format('create role %I nologin', r); end if;
  end loop; end $$;
create schema if not exists extensions;
S

# Tablas que el respaldo dice tener (esquema.tabla), sin las de datos de plataforma.
pg_restore --list "$ARCH" | awk '$4=="TABLE" && $5!="DATA"{print $5"."$6}' | sort > /tmp/respaldo_esperado.txt
ESPERADAS=$(wc -l < /tmp/respaldo_esperado.txt)
test "$ESPERADAS" -gt 0 || { echo "ERROR: el respaldo no trae ninguna tabla" >&2; exit 1; }

set +e
pg_restore --no-owner --no-acl --dbname="$URL_PRUEBA" "$ARCH" 2> /tmp/restauracion.err
set -e
# Errores tolerados: cosas de la plataforma Supabase. Cualquier otro error rompe la verificación.
OTROS=$(grep -E '^pg_restore: error' /tmp/restauracion.err | grep -vE 'extension|role "|schema "(extensions|graphql|vault|pgsodium)|supabase_|pg_graphql|pgsodium|pgjwt' || true)
if [ -n "$OTROS" ]; then echo "ERRORES de restauración que no son de plataforma:"; echo "$OTROS" | head -20; exit 1; fi

psql "$URL_PRUEBA" -tAc "select schemaname||'.'||tablename from pg_tables where schemaname not in ('pg_catalog','information_schema') order by 1" > /tmp/restaurado.txt
FALTAN=$(comm -23 /tmp/respaldo_esperado.txt /tmp/restaurado.txt || true)
if [ -n "$FALTAN" ]; then echo "FALTAN tablas tras restaurar:"; echo "$FALTAN" | head -20; exit 1; fi
FILAS=$(psql "$URL_PRUEBA" -tAc "select coalesce(sum((xpath('/row/c/text()', query_to_xml(format('select count(*) as c from %I.%I', schemaname, tablename), false, true, '')))[1]::text::bigint),0) from pg_tables where schemaname not in ('pg_catalog','information_schema')")
echo "Restauración verificada: $ESPERADAS tablas, $FILAS filas, Postgres $(psql "$URL_PRUEBA" -tAc 'show server_version')"
psql "$ADMIN_URL" -qc "drop database $BASE"
