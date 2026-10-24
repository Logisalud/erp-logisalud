// Numeración de las guías de remisión (D-162 a D-164). La serie es TTT1, la misma del RUC de Logisalud: el panel de Nubefact y el WMS numeran sobre la MISMA serie.
// La API de Nubefact exige que el WMS mande el número correlativo, sin saltos. Por eso el WMS reserva cada número de forma atómica (una sola guía en curso por serie),
// no emite guías reales hasta que alguien confirme el correlativo inicial, y reconcilia lo que Nubefact responde («ya existe», «salto»).
// Espejo de la migración 0032 (la base de datos manda). Todo puro.
import { puede } from './permisos'
import type { Rol } from './tipos'

/** La serie real de las guías remitente del RUC de Logisalud (reemplaza lo que decían los documentos de «serie propia»). */
export const SERIE_GUIA_DEFECTO = 'TTT1'

export type EstadoNumeroGuia = 'RESERVADO' | 'USADO' | 'LIBERADO' | 'OCUPADO'
export const ETIQUETA_ESTADO_NUMERO: Record<EstadoNumeroGuia, string> = {
  RESERVADO: 'En curso',
  USADO: 'Usado por una guía del WMS',
  LIBERADO: 'Libre otra vez (Nubefact no lo recibió)',
  OCUPADO: 'Ya existía en Nubefact (se saltó)',
}

/** Cómo está la serie en el WMS. */
export interface EstadoCorrelativo {
  serie: string
  /** El último número que el WMS reservó (o el último que se confirmó como usado, mientras no haya ninguno reservado). */
  ultimo: number
  /** ¿Alguien confirmó el correlativo inicial? Sin eso no se emite ninguna guía REAL (el simulador y el entorno de pruebas sí). */
  confirmado: boolean
  /** El número que usaría la próxima guía. */
  proximo: number
  /** Hay una guía en curso (número reservado y todavía sin registrar). */
  enCurso?: { numero: number; salidaNumero?: string; incierta: boolean }
}

/** El texto de la regla que el WMS pone a la vista (pantalla y documento). */
export const REGLA_PANEL_NUBEFACT =
  'Desde que el WMS emite guías reales, el panel de Nubefact solo se usa para dar de baja. Si alguien emite una guía desde el panel, el número se salta y Nubefact deja de aceptar las del WMS hasta corregir el correlativo.'

export const MENSAJE_SIN_CORRELATIVO = (serie: string) =>
  `Todavía no se puede emitir una guía real: falta confirmar con qué número empieza la serie ${serie}. Lo indica Sebas al salir a producción y lo registra el Jefe de Transporte en «Numeración de guías». Mientras tanto se emite en el simulador o en el entorno de pruebas.`

export const mensajeSerieConfirmada = (serie: string) => `La serie ${serie} ya está confirmada para producción: no se emiten guías de prueba con sus números`

export const mensajeGuiaEnCurso = (numero: number, serie: string, salida?: string) =>
  `Se está emitiendo otra guía de la serie ${serie}${salida ? ` (la de ${salida})` : ''} con el número ${numero}. Espera un momento y vuelve a intentar: así la numeración no se salta.`

export const mensajeNumeroOcupado = (serie: string, numero: number, siguiente: number) =>
  `El número ${serie}-${String(numero).padStart(8, '0')} ya existía en Nubefact: alguien emitió una guía desde el panel. El WMS lo dio por usado y pasó al ${siguiente}. Recuerda: el panel solo se usa para dar de baja.`

export const mensajeSalto = (serie: string, esperado?: number) =>
  `Nubefact no aceptó el número porque no sigue al último de la serie ${serie}${esperado ? ` (esperaba el ${esperado})` : ''}: alguien emitió o anuló guías desde el panel. No se emitió nada. Revisa en Nubefact cuál es el último número de la serie y corrígelo en «Numeración de guías».`

export const MENSAJE_RESULTADO_INCIERTO =
  'No supimos si Nubefact recibió la guía (no respondió a tiempo). No se emitió otra: vuelve a intentar y el WMS reutiliza el mismo número, preguntando antes a Nubefact si ya la tiene.'

// ── Lo que Nubefact responde ─────────────────────────────────────────────────────────────────────────────────────────

/** Por qué Nubefact no aceptó una guía, en lo que le importa a la numeración. */
export type CausaNubefact = 'NUMERO_EXISTE' | 'NUMERO_SALTO' | 'NO_ENCONTRADA'

const sinTildes = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

/**
 * Clasifica el error de Nubefact por su texto (y el código 1033 de SUNAT). Los textos exactos de la demo de Nubefact se confirman en la Preview (docs/wms/nubefact.md):
 * hasta entonces se reconocen por palabras. «No existe / no se encontró» (al consultar) va antes que «ya existe», para no confundirlos.
 */
export function clasificarCausaNubefact(codigo: string | number | undefined, texto: string | undefined): CausaNubefact | null {
  const t = sinTildes(texto ?? '')
  if (/\bno\s+(existe|se\s+encontro|fue\s+encontrad|esta\s+registrad)/.test(t) || /no\s+encontrad/.test(t)) return 'NO_ENCONTRADA'
  if (/correlativ|salto|secuencia|(numero|documento)\s+(esperado|siguiente|anterior)|siguiente\s+numero|debe\s+ser\s+el\s+\d/.test(t)) return 'NUMERO_SALTO'
  if (String(codigo ?? '') === '1033' || /ya\s+(existe|fue\s+registrad|se\s+(genero|emitio|registro)|esta\s+registrad)|duplicad|ya\s+tiene\s+una\s+guia/.test(t)) return 'NUMERO_EXISTE'
  return null
}

/** Si el mensaje de Nubefact dice cuál número esperaba («el siguiente debe ser 2890»), lo devuelve. */
export function numeroEsperadoPorNubefact(texto: string | undefined): number | undefined {
  const m = /(?:siguiente|esperad[oa]|debe\s+ser|esperaba)\D{0,40}?(\d{1,8})/i.exec(sinTildes(texto ?? ''))
  const n = m ? Number(m[1]) : NaN
  return Number.isInteger(n) && n > 0 ? n : undefined
}

// ── Quién y con qué datos ───────────────────────────────────────────────────────────────────────────────────────────

/** Quién confirma o corrige el correlativo: el Jefe de Transporte (dueño de las guías) y la administración del WMS. Espejo de `wms.confirmar_correlativo_guia`. */
export const puedeAdministrarNumeracion = (roles: readonly Rol[]) => puede(roles, 'anular_guia') || puede(roles, 'configurar')
export const MENSAJE_SIN_PERMISO_NUMERACION = 'Solo el Jefe de Transporte o la administración del WMS confirman el correlativo de las guías'

/** El correlativo inicial es el PRIMER número que usará el WMS (un entero de 1 a 99 999 999). */
export function validarCorrelativoInicial(v: string | number): string | null {
  const n = typeof v === 'number' ? v : Number(String(v).trim())
  if (String(v).trim() === '' || !Number.isInteger(n) || n < 1 || n > 99_999_999) return 'Escribe el primer número que usará el WMS: un entero de 1 a 99 999 999 (el siguiente al último que muestra Nubefact)'
  return null
}

/** El número como lo muestra Nubefact: TTT1-00002888. */
export const numeroConSerie = (serie: string, numero: number) => `${serie}-${String(numero).padStart(8, '0')}`
