#!/usr/bin/env bash
# Corre los E2E un viewport a la vez, reiniciando el servidor de demostración entre cada uno
# para que el estado en memoria (productos dados de alta por las pruebas) no contamine las
# capturas del siguiente. Requiere `npm run build` antes. Uso:
#   PLAYWRIGHT_CHROMIUM_PATH=/opt/pw-browsers/chromium ./scripts/e2e-por-viewport.sh
#
# Por viewport se levantan hasta tres servidores del MISMO build (no se vuelve a compilar), cada uno con otro estado de la demo (SA-1):
#   · puerto base    → la suite de siempre, con las órdenes de ejemplo apagadas (WMS_DEMO_EJEMPLOS=0);
#   · puerto base+1  → e2e/ejemplos-por-etapa.spec.ts, con los ejemplos encendidos;
#   · puerto base+2  → e2e/salidas-vacio.spec.ts, con la demo sin ninguna salida (WMS_DEMO_EJEMPLOS=vacio).
#   · puerto base+3  → e2e/guia-panel.spec.ts, con la guía emitida en el panel (WMS_DEMO_GUIA_MODO=PANEL).
# Para correr solo la suite de siempre: WMS_E2E_SOLO_PRINCIPAL=1.
set -uo pipefail
cd "$(dirname "$0")/.."
BASE="${WMS_E2E_PUERTO:-3100}"
PID_FILE="$(mktemp)"
resultado=0
# El servidor corre en su propio grupo de procesos: se mata el grupo entero (npx deja a next-server huérfano si solo se mata al padre).
cleanup() { [ -s "$PID_FILE" ] && kill -- "-$(cat "$PID_FILE")" 2>/dev/null; : > "$PID_FILE"; }
trap 'cleanup; rm -f "$PID_FILE"' EXIT
for p in "$BASE" "$((BASE + 1))" "$((BASE + 2))" "$((BASE + 3))"; do
  if curl -s -o /dev/null "http://localhost:${p}/wms/login"; then
    echo "El puerto ${p} ya está ocupado (¿un servidor viejo?). Detén ese servidor y vuelve a correr." >&2
    exit 1
  fi
done

# servir <puerto> <WMS_DEMO_EJEMPLOS> [WMS_DEMO_GUIA_MODO]: levanta el servidor y espera a que responda
servir() {
  cleanup
  sleep 1
  WMS_DEMO_LOCAL=1 WMS_DEMO_DATOS=sintetico WMS_DEMO_EJEMPLOS="$2" WMS_DEMO_GUIA_MODO="${3:-WMS}" PORT="$1" setsid npx next start -p "$1" >/dev/null 2>&1 &
  echo $! > "$PID_FILE"
  until curl -s -o /dev/null "http://localhost:${1}/wms/login"; do sleep 1; done
}

for proyecto in desktop-1440x900 laptop-1280x800 tablet-1024x768 telefono-390x844; do
  echo "── $proyecto"
  servir "$BASE" 0
  WMS_E2E_MODO=principal WMS_E2E_PUERTO="$BASE" npx playwright test --project="$proyecto" || resultado=1
  [ -n "${WMS_E2E_SOLO_PRINCIPAL:-}" ] && continue
  echo "── $proyecto · órdenes de ejemplo"
  servir "$((BASE + 1))" 1
  WMS_E2E_MODO=ejemplos WMS_E2E_PUERTO="$BASE" npx playwright test --project="$proyecto" || resultado=1
  echo "── $proyecto · demo sin salidas"
  servir "$((BASE + 2))" vacio
  WMS_E2E_MODO=vacio WMS_E2E_PUERTO="$BASE" npx playwright test --project="$proyecto" || resultado=1
  echo "── $proyecto · guía emitida en el panel"
  servir "$((BASE + 3))" 0 PANEL
  WMS_E2E_MODO=panel WMS_E2E_PUERTO="$BASE" npx playwright test --project="$proyecto" || resultado=1
done
exit $resultado
