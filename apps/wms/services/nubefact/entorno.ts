// B.3: Nubefact solo DEMO en el piloto. El cliente REAL (el que habla con Nubefact por internet) solo se usa si el entorno lo permite:
//   · piloto (`modo_piloto = si`): únicamente con `NUBEFACT_ENTORNO=DEMO` (y nunca con `NUBEFACT_MODO=PRODUCCION`); sin eso, o con otro valor, se niega con un mensaje claro;
//   · go-live (`modo_piloto = no`): se exige `NUBEFACT_ENTORNO=PRODUCCION`.
// El simulador y la cuenta DEMO de la Preview (WMS_DEMO=1) no pasan por aquí. Los valores de las variables nunca se imprimen.
export interface EntornoNubefact { NUBEFACT_ENTORNO?: string; NUBEFACT_MODO?: string }

export const MENSAJE_NUBEFACT_PILOTO =
  'Estamos en el piloto: el WMS solo se conecta con la cuenta DEMO de Nubefact. Para usarla, pon NUBEFACT_ENTORNO=DEMO en el entorno; mientras tanto la guía se registra desde el panel o con el simulador. No se emite ninguna guía real.'
export const MENSAJE_NUBEFACT_PILOTO_PRODUCCION = 'Estamos en el piloto: Nubefact en producción está bloqueado. Usa NUBEFACT_MODO=PRUEBA con NUBEFACT_ENTORNO=DEMO.'
export const MENSAJE_NUBEFACT_GO_LIVE = 'El WMS ya salió del piloto: para emitir guías reales hay que poner NUBEFACT_ENTORNO=PRODUCCION en el entorno.'

/** `null` si el cliente real puede usarse; si no, el motivo en palabras para la persona. */
export function bloqueoNubefactReal(piloto: boolean, env: Record<string, string | undefined>): string | null {
  const entorno = (env.NUBEFACT_ENTORNO ?? '').trim().toUpperCase()
  const modo = (env.NUBEFACT_MODO ?? '').trim().toUpperCase()
  if (piloto) {
    if (entorno !== 'DEMO') return MENSAJE_NUBEFACT_PILOTO
    if (modo === 'PRODUCCION') return MENSAJE_NUBEFACT_PILOTO_PRODUCCION
    return null
  }
  return entorno === 'PRODUCCION' ? null : MENSAJE_NUBEFACT_GO_LIVE
}

/** Lo que dice la pantalla de la guía: si hoy se emitiría con el cliente real y no se puede, el motivo; si no, `undefined`. */
export function bloqueoParaPantalla(piloto: boolean, modoActual: "SIMULADOR" | "PRUEBA" | "PRODUCCION", env: Record<string, string | undefined>): string | undefined {
  if (modoActual === 'SIMULADOR') return undefined
  return bloqueoNubefactReal(piloto, env) ?? undefined
}
