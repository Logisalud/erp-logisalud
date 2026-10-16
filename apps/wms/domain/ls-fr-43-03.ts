// Registro LS-FR.43.03 «Planificación de ruta» (S4b): el usuario arma la ruta y el WMS genera el documento. Las filas se DERIVAN de la ruta y de lo que
// las etapas siguientes van registrando (N.° de guía, bultos, hora real de salida): nada se copia. Puro: lo usan la demo, el adaptador de Supabase y el PDF.
import type { RutaVista } from './rutas'

export const FILAS_POR_PAGINA = 10

export interface ParametrosLsFr {
  codigo: string
  version: string
  vigenteDesde: string
  vigenteHasta: string
  filasPorPagina: number
  /** Definiciones de Dirección Técnica que faltan (valor «PENDIENTE»): no bloquean nada. */
  pendientes: string[]
}

export const PARAMETROS_LS_FR_POR_DEFECTO: ParametrosLsFr = {
  codigo: 'LS-FR.43.03', version: '01', vigenteDesde: '2026-09-01', vigenteHasta: '2028-09-01', filasPorPagina: FILAS_POR_PAGINA, pendientes: [],
}

/** Lo que dicen los parámetros `ls_fr_43_03_*` y `cajas_equivale_a_bultos` de la base de datos. */
export const PENDIENTES_LS_FR: Record<string, string> = {
  ls_fr_43_03_usuario_significado: 'Qué significa la columna USUARIO (no se imprime hasta definirlo).',
  cajas_equivale_a_bultos: 'Si «N.° cajas» es igual a los bultos (se imprimen los bultos mientras tanto).',
  ls_fr_43_03_temperatura_metodo: 'Cómo y cuándo se toma la temperatura de cada fila (queda en blanco para anotarla a mano).',
  ls_fr_43_03_copia_fisica: 'Si viaja una copia física prellenada (por ahora solo se genera el documento final).',
}

export function parametrosDesdeClaves(valores: Record<string, string | undefined>): ParametrosLsFr {
  return {
    codigo: valores.ls_fr_43_03_codigo || PARAMETROS_LS_FR_POR_DEFECTO.codigo,
    version: valores.ls_fr_43_03_version || PARAMETROS_LS_FR_POR_DEFECTO.version,
    vigenteDesde: valores.ls_fr_43_03_vigente_desde || PARAMETROS_LS_FR_POR_DEFECTO.vigenteDesde,
    vigenteHasta: valores.ls_fr_43_03_vigente_hasta || PARAMETROS_LS_FR_POR_DEFECTO.vigenteHasta,
    filasPorPagina: Number(valores.ls_fr_43_03_filas_por_pagina) > 0 ? Number(valores.ls_fr_43_03_filas_por_pagina) : FILAS_POR_PAGINA,
    pendientes: Object.keys(PENDIENTES_LS_FR).filter((k) => (valores[k] ?? 'PENDIENTE') === 'PENDIENTE'),
  }
}

/** Lo que registran las etapas siguientes y que el formato pide (todo opcional: sin dato, la celda queda en blanco para anotarla a mano). */
export interface ExtrasLsFr {
  /** pedidoId → N.° de guía (S6b). */
  guias?: Record<string, string>
  /** pedidoId → cantidad de bultos (S7). */
  cajas?: Record<string, number>
  /** Hora real de salida (S8) y de llegada de la unidad (retorno). ISO. */
  horaSalida?: string
  horaLlegada?: string
  /** pedidoId → hora de entrega y observaciones (S9, fuera de este bloque). */
  horaEntrega?: Record<string, string>
  temperatura?: Record<string, string>
  observaciones?: Record<string, string>
}

export interface FilaLsFr {
  n: number
  cliente: string
  guia?: string
  cajas?: number
  detalle: 'ENTREGA' | 'RECOJO'
  temperatura?: string
  horaEntrega?: string
  observaciones?: string
}

export interface RegistroLsFrVista {
  rutaId: string
  rutaNumero: string
  codigo: string
  version: string
  vigenteDesde: string
  vigenteHasta: string
  /** Código del procedimiento que el formato trae en su encabezado. */
  poe: string
  estado: NonNullable<RutaVista['registroLsFr']>
  fecha: string
  placa?: string
  conductor?: string
  auxiliar?: string
  horaSalida?: string
  horaLlegada?: string
  filas: FilaLsFr[]
  paginas: number
  filasPorPagina: number
  pendientes: string[]
}

export const COD_POE_LS_FR = 'LS-POE.07.05'

export function armarRegistroLsFr(ruta: RutaVista, params: ParametrosLsFr = PARAMETROS_LS_FR_POR_DEFECTO, extras: ExtrasLsFr = {}): RegistroLsFrVista {
  const filas: FilaLsFr[] = ruta.paradas.map((p, i) => ({
    n: i + 1, cliente: p.cliente, guia: extras.guias?.[p.pedidoId], cajas: extras.cajas?.[p.pedidoId], detalle: 'ENTREGA',
    temperatura: extras.temperatura?.[p.pedidoId], horaEntrega: extras.horaEntrega?.[p.pedidoId], observaciones: extras.observaciones?.[p.pedidoId],
  }))
  return {
    rutaId: ruta.id, rutaNumero: ruta.numero, codigo: params.codigo, version: params.version, vigenteDesde: params.vigenteDesde, vigenteHasta: params.vigenteHasta, poe: COD_POE_LS_FR,
    estado: ruta.registroLsFr ?? 'BASE', fecha: ruta.fecha, placa: ruta.vehiculo?.placa, conductor: ruta.conductor?.nombre, auxiliar: ruta.auxiliar?.nombre,
    horaSalida: extras.horaSalida, horaLlegada: extras.horaLlegada, filas, paginas: Math.max(1, Math.ceil(filas.length / params.filasPorPagina)), filasPorPagina: params.filasPorPagina, pendientes: params.pendientes,
  }
}

/** Parte las filas en páginas de `filasPorPagina`, completando la última con filas numeradas vacías (como el formato impreso). */
export function paginarFilas(filas: readonly FilaLsFr[], porPagina = FILAS_POR_PAGINA): (FilaLsFr | { n: number; vacia: true })[][] {
  const paginas = Math.max(1, Math.ceil(filas.length / porPagina))
  return Array.from({ length: paginas }, (_, p) => Array.from({ length: porPagina }, (_, i) => {
    const idx = p * porPagina + i
    return filas[idx] ?? { n: idx + 1, vacia: true as const }
  }))
}

/** El registro solo se imprime con la ruta confirmada (antes no existe). */
export const puedeImprimirLsFr = (ruta: Pick<RutaVista, 'estado'>) => ruta.estado !== 'BORRADOR' && ruta.estado !== 'CANCELADA'
