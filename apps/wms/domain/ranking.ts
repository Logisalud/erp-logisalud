// Rankings mensuales de picking y conformidad (decisión de Sebas, 2026-11-11; docs/wms/salidas/ranking-auxiliares.md).
// Dos pasos, siempre los mismos: 1) cumplir la meta de calidad (máx. 3 de cada 100 pedidos con error); 2) entre quienes la cumplen, gana quien hizo más carga de trabajo.

export const META_ERRORES_PCT = 3
export const AVISO_AMARILLO_PCT = 2
export const MINIMO_PEDIDOS_PISO = 20

export type RolRanking = 'PICKING' | 'CONFORMIDAD'
export const ETIQUETA_RANKING: Record<RolRanking, string> = { PICKING: 'Ranking de picking', CONFORMIDAD: 'Ranking de conformidad' }

/** Los hechos de un pedido conformado en el mes (los entrega `wms.pedidos_del_mes`). */
export interface HechoPedido {
  salidaId: string
  salidaNumero?: string
  pickerId?: string | null
  conformadorId?: string | null
  productos: number
  bultos: number
  provincia: boolean
  /** La conformidad encontró diferencias en lo que se picó. */
  errorPicking: boolean
  /** Después de la conformidad se detectó una diferencia (al cargar, y cuando haya datos, en la entrega). */
  errorPosterior: boolean
  pickerEsJefe: boolean
  conformadorEsJefe: boolean
}

/** Categoría por número de productos: A = 1, B = 2 a 5, C = 6 a 9, D = 10 o más. */
export const categoriaDePedido = (productos: number): 'A' | 'B' | 'C' | 'D' => (productos <= 1 ? 'A' : productos <= 5 ? 'B' : productos <= 9 ? 'C' : 'D')
export const PUNTOS_CATEGORIA = { A: 1, B: 3, C: 6, D: 10 } as const
/** Tamaño por bultos: S = 1, M = 2 a 5, L = 6 a 19, XL = 20 o más (umbrales ajustables). */
export const tamanoDePedido = (bultos: number): 'S' | 'M' | 'L' | 'XL' => (bultos <= 1 ? 'S' : bultos <= 5 ? 'M' : bultos <= 19 ? 'L' : 'XL')
export const PUNTOS_TAMANO = { S: 1, M: 2, L: 4, XL: 6 } as const

/** Los puntos de un pedido: categoría + tamaño; a provincia vale el doble. */
export function puntosDePedido(p: Pick<HechoPedido, 'productos' | 'bultos' | 'provincia'>): number {
  return (PUNTOS_CATEGORIA[categoriaDePedido(p.productos)] + PUNTOS_TAMANO[tamanoDePedido(p.bultos)]) * (p.provincia ? 2 : 1)
}

export type EstadoRanking = 'EN_CARRERA' | 'SOBRE_LA_META' | 'SIN_MINIMO'
export type Semaforo = 'VERDE' | 'AMARILLO' | 'ROJO'
export interface FilaRanking {
  personaId: string
  nombre?: string
  pedidos: number
  carga: number
  conError: number
  /** Porcentaje de pedidos con error, con un decimal. */
  pctError: number
  estado: EstadoRanking
  semaforo: Semaforo
  /** Solo quienes cumplen la meta y el mínimo; 1 = gana. */
  puesto?: number
}
export interface Ranking { rol: RolRanking; minimo: number; filas: FilaRanking[] }

const redondear1 = (x: number) => Math.round(x * 10) / 10

/** Mínimo de pedidos para entrar: la mitad del promedio del equipo en ese rol, y nunca menos de 20. */
export function minimoDePedidos(pedidosPorPersona: readonly number[]): number {
  if (pedidosPorPersona.length === 0) return MINIMO_PEDIDOS_PISO
  const promedio = pedidosPorPersona.reduce((a, b) => a + b, 0) / pedidosPorPersona.length
  return Math.max(MINIMO_PEDIDOS_PISO, Math.round(promedio / 2))
}

export const semaforoDe = (pct: number): Semaforo => (pct <= AVISO_AMARILLO_PCT ? 'VERDE' : pct <= META_ERRORES_PCT ? 'AMARILLO' : 'ROJO')

/** Arma el ranking de un rol. Los jefes no entran. Quien no llega al mínimo o pasa de la meta aparece, pero sin puesto. */
export function armarRanking(hechos: readonly HechoPedido[], rol: RolRanking): Ranking {
  const por = new Map<string, { pedidos: number; carga: number; conError: number }>()
  for (const h of hechos) {
    const persona = rol === 'PICKING' ? h.pickerId : h.conformadorId
    if (!persona || (rol === 'PICKING' ? h.pickerEsJefe : h.conformadorEsJefe)) continue
    const error = rol === 'PICKING' ? h.errorPicking || h.errorPosterior : h.errorPosterior
    const a = por.get(persona) ?? { pedidos: 0, carga: 0, conError: 0 }
    a.pedidos += 1; a.carga += puntosDePedido(h); a.conError += error ? 1 : 0
    por.set(persona, a)
  }
  const minimo = minimoDePedidos([...por.values()].map((x) => x.pedidos))
  const filas: FilaRanking[] = [...por.entries()].map(([personaId, a]) => {
    const pct = redondear1((100 * a.conError) / a.pedidos)
    const estado: EstadoRanking = a.pedidos < minimo ? 'SIN_MINIMO' : pct > META_ERRORES_PCT ? 'SOBRE_LA_META' : 'EN_CARRERA'
    return { personaId, pedidos: a.pedidos, carga: a.carga, conError: a.conError, pctError: pct, estado, semaforo: semaforoDe(pct) }
  })
  const orden = (a: FilaRanking, b: FilaRanking) => b.carga - a.carga || a.pctError - b.pctError || b.pedidos - a.pedidos || a.personaId.localeCompare(b.personaId)
  const rank = { EN_CARRERA: 0, SOBRE_LA_META: 1, SIN_MINIMO: 2 } as const
  filas.sort((a, b) => rank[a.estado] - rank[b.estado] || orden(a, b))
  let puesto = 0
  for (const f of filas) if (f.estado === 'EN_CARRERA') f.puesto = ++puesto
  return { rol, minimo, filas }
}

/** Cuántos pedidos más SIN error necesita para volver a la meta (0 si ya cumple). */
export function pedidosParaVolverALaMeta(f: Pick<FilaRanking, 'pedidos' | 'conError'>): number {
  const necesarios = Math.ceil(f.conError / (META_ERRORES_PCT / 100) - f.pedidos)
  return Math.max(0, necesarios)
}

/** «Cómo voy»: la frase simple para una persona, en un ranking. */
export function comoVoy(r: Ranking, personaId: string): { texto: string; semaforo: Semaforo | null; fila?: FilaRanking } {
  const f = r.filas.find((x) => x.personaId === personaId)
  if (!f) return { texto: 'Todavía no tienes pedidos este mes en este ranking.', semaforo: null }
  const pct = String(f.pctError).replace('.', ',')
  if (f.estado === 'SIN_MINIMO') return { texto: `Te faltan ${r.minimo - f.pedidos} ${r.minimo - f.pedidos === 1 ? 'pedido' : 'pedidos'} para entrar al ranking de este mes (mínimo ${r.minimo}). Llevas ${pct} % de pedidos con error.`, semaforo: f.semaforo, fila: f }
  if (f.estado === 'SOBRE_LA_META') {
    const n = pedidosParaVolverALaMeta(f)
    return { texto: `Por ahora estás fuera del premio: ${pct} % de pedidos con error (la meta es ${META_ERRORES_PCT} % o menos). Necesitas ${n} ${n === 1 ? 'pedido' : 'pedidos'} más sin error para volver a la meta.`, semaforo: f.semaforo, fila: f }
  }
  const lider = r.filas.find((x) => x.puesto === 1)!
  const cola = f.puesto === 1 ? 'Eres el 1.º: mantén tus errores bajo la meta.' : `El 1.º lleva ${lider.carga} de carga: te faltan ${lider.carga - f.carga + 1} para pasarlo.`
  const aviso = f.semaforo === 'AMARILLO' ? ` Ojo: estás cerca de la meta (${META_ERRORES_PCT} %).` : ''
  return { texto: `Vas ${f.puesto}.º. Tu ${pct} % de pedidos con error cumple la meta (${META_ERRORES_PCT} % o menos). Tu carga: ${f.carga}. ${cola}${aviso}`, semaforo: f.semaforo, fila: f }
}
