// Modo piloto (0038, B.2): mientras está encendido el WMS corre «de práctica»: banner en cada pantalla, marca de agua «PILOTO, SIN VALOR» en todos los PDF, Nubefact solo
// en su cuenta DEMO y nada hacia Pedidos (los avisos quedan retenidos). Dominio puro: no lee ni el entorno ni la base; quien lo llama le pasa los valores.

export type ModoPiloto = 'si' | 'no'

/** Texto de la marca de agua diagonal de todos los PDF del WMS. */
export const TEXTO_MARCA_PILOTO = 'PILOTO, SIN VALOR'
/** Texto corto y largo del aviso fijo de cada pantalla. */
export const TEXTO_BANNER_PILOTO = 'PILOTO, datos de prueba'
export const DETALLE_BANNER_PILOTO = 'Lo que registres aquí no vale como documento y no se envía a Pedidos ni a SUNAT.'
/** Estado del aviso a Pedidos que no sale: no es entregable (migración 0038). */
export const ESTADO_EVENTO_RETENIDO = 'RETENIDO_PILOTO'

/** El valor del parámetro `modo_piloto`: «si» o «no» (sin importar mayúsculas ni espacios); cualquier otra cosa es «no se sabe». */
export function normalizarModoPiloto(v: string | null | undefined): ModoPiloto | undefined {
  const t = (v ?? '').trim().toLowerCase()
  return t === 'si' || t === 'sí' ? 'si' : t === 'no' ? 'no' : undefined
}

export interface EntornoPiloto { WMS_MODO_PILOTO?: string; WMS_GO_LIVE?: string }

/**
 * ¿Es piloto? Falla cerrada (ante la duda, sí):
 *  · `WMS_MODO_PILOTO=1` en el entorno manda siempre (aunque la base diga «no»);
 *  · si no, manda el parámetro `modo_piloto` de la base;
 *  · sin parámetro legible: es piloto, salvo que el entorno diga expresamente `WMS_GO_LIVE=1`.
 * Salir del piloto exige las dos cosas a la vez: `modo_piloto = no` en la base y `WMS_GO_LIVE=1` (sin `WMS_MODO_PILOTO`) en el entorno.
 */
export function resolverModoPiloto(parametro: ModoPiloto | undefined, env: EntornoPiloto): boolean {
  if (env.WMS_MODO_PILOTO === '1') return true
  if (parametro) return parametro === 'si'
  return env.WMS_GO_LIVE !== '1'
}

/** Lo que se dice cuando un aviso a Pedidos queda retenido en el piloto. */
export const TEXTO_PEDIDOS_RETENIDO = 'Piloto: el aviso a Pedidos quedó retenido y no se envió (no sale nada hacia Pedidos mientras dure el piloto).'
