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

// ---- P1 (Fase 4): piloto con producción REAL. Lo oficial sigue siendo el proceso actual (Odoo y papel). ----

/** Lo que se le dice a TODO el equipo al entrar por primera vez (y en el enlace del Inicio). Lenguaje llano. */
export const TITULO_BIENVENIDA_PILOTO = 'Esto es un PILOTO'
export const PUNTOS_BIENVENIDA_PILOTO = [
  { clave: 'oficial', titulo: 'Lo oficial sigue siendo el proceso actual', texto: 'Odoo y el papel siguen mandando. Lo que hagas aquí no reemplaza nada de lo que haces hoy.' },
  { clave: 'prueba', titulo: 'Lo que registres aquí es de prueba', texto: 'Las actas, las aprobaciones y las guías de este sistema no valen como documento: llevan la marca «PILOTO, SIN VALOR».' },
  { clave: 'borra', titulo: 'Todo se borra el 1 de diciembre', texto: 'Ese día se reinicia el sistema y se carga la información definitiva. Nada de lo de prueba pasa a producción.' },
  { clave: 'nada-sale', titulo: 'Nada sale a Pedidos, a clientes ni a SUNAT', texto: 'No se envía nada a Pedidos ni a SUNAT, no hay correos ni enlaces para clientes y los avisos a vendedores quedan marcados «PRUEBA».' },
] as const
export const COOKIE_BIENVENIDA_PILOTO = 'wms_piloto_bienvenida'
export const FECHA_REINICIO_PILOTO = '2026-12-01'

/** ¿Hay que mostrar la bienvenida? Solo en piloto, y solo si esta persona todavía no la aceptó en este navegador. */
export function debeVerBienvenida(piloto: boolean, cookie: string | undefined, usuarioId: string): boolean {
  return piloto && cookie !== usuarioId
}

/** Encabezado de TODO aviso que sale del WMS mientras dure el piloto (el texto copiable «Copiar aviso» sigue disponible, pero marcado). */
export const ENCABEZADO_AVISO_PRUEBA = 'PRUEBA (piloto del WMS): este aviso no es real, no lo envíes al vendedor.'
export function avisoDePrueba(texto: string): string {
  return texto.startsWith(ENCABEZADO_AVISO_PRUEBA) ? texto : `${ENCABEZADO_AVISO_PRUEBA}\n\n${texto}`
}
