#!/usr/bin/env bash
# Arranca el Postgres local del contenedor y deja listo el usuario de pruebas.
# Los tests de base de datos (npm run test:db) usan WMS_TEST_DATABASE_URL, o por
# defecto postgres://wms_test:wms_test@127.0.0.1:5432/postgres.
# En CI se usa un servicio de Postgres 16 y este script no hace falta.
set -euo pipefail
if command -v pg_ctlcluster >/dev/null 2>&1; then
  pg_ctlcluster 16 main start 2>/dev/null || true
  for _ in $(seq 1 20); do su postgres -c "psql -tAc 'select 1'" >/dev/null 2>&1 && break; sleep 0.5; done
  su postgres -c "psql -tAc \"select 1 from pg_roles where rolname='wms_test'\"" | grep -q 1 \
    || su postgres -c "psql -c \"create role wms_test superuser login password 'wms_test'\""
  # TCP local con contraseña (el contenedor trae scram para 127.0.0.1 por defecto).
fi
echo "Postgres local listo."
