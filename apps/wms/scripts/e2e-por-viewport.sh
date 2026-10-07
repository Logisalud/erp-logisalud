#!/usr/bin/env bash
# Corre los E2E un viewport a la vez, reiniciando el servidor de demostración entre cada uno
# para que el estado en memoria (productos dados de alta por las pruebas) no contamine las
# capturas del siguiente. Requiere `npm run build` antes. Uso:
#   PLAYWRIGHT_CHROMIUM_PATH=/opt/pw-browsers/chromium ./scripts/e2e-por-viewport.sh
set -uo pipefail
cd "$(dirname "$0")/.."
PUERTO="${WMS_E2E_PUERTO:-3100}"
PID_FILE="$(mktemp)"
resultado=0
cleanup() { [ -s "$PID_FILE" ] && kill "$(cat "$PID_FILE")" 2>/dev/null; rm -f "$PID_FILE"; }
trap cleanup EXIT
if curl -s -o /dev/null "http://localhost:${PUERTO}/wms/login"; then
  echo "El puerto ${PUERTO} ya está ocupado (¿un servidor viejo?). Detén ese servidor y vuelve a correr." >&2
  exit 1
fi
for proyecto in desktop-1440x900 laptop-1280x800 tablet-1024x768 telefono-390x844; do
  cleanup
  sleep 1
  WMS_DEMO_LOCAL=1 PORT="$PUERTO" npx next start -p "$PUERTO" >/dev/null 2>&1 &
  echo $! > "$PID_FILE"
  until curl -s -o /dev/null "http://localhost:${PUERTO}/wms/login"; do sleep 1; done
  echo "── $proyecto"
  npx playwright test --project="$proyecto" || resultado=1
done
exit $resultado
