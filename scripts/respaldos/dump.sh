#!/usr/bin/env bash
# Respaldo lógico de una base Supabase: todo lo que es nuestro (public, wms, almacen, compras,
# catalogo, cobranzas… cualquier esquema nuevo entra solo) más auth y storage (usuarios y metadatos
# de archivos). Se excluyen solo los esquemas que administra Supabase y se recrean solos.
# Uso: dump.sh <url-de-conexion> <archivo.dump>
# La URL viene de una variable de entorno del llamador; este script nunca la imprime.
set -euo pipefail
URL="${1:?falta la URL}"; OUT="${2:?falta el archivo}"

EXCLUIR=(extensions graphql graphql_public pgbouncer pgsodium pgsodium_masks realtime
         supabase_functions vault _analytics _realtime net cron pg_cron)
args=()
for s in "${EXCLUIR[@]}"; do args+=("--exclude-schema=$s"); done

pg_dump "$URL" --format=custom --compress=6 --no-owner --no-acl "${args[@]}" --file="$OUT"
test -s "$OUT" || { echo "ERROR: el respaldo salió vacío" >&2; exit 1; }
