// Registro LS-FR.43.03 «Planificación de ruta» (S4b): el usuario arma la ruta y el WMS genera el documento. Las filas se DERIVAN de la ruta y de lo que
// las etapas siguientes van registrando (N.° de guía, bultos, hora real de salida): nada se copia. Puro: lo usan la demo, el adaptador de Supabase y el PDF.
//
// OS-7 (respuestas de DT 2026-10-17, §9): USUARIO = el Jefe de Transporte que prepara la ruta; «N.° de cajas» = bultos (caja master); la temperatura sale del
// data logger Elitech GSP-6 (al cerrar la ruta se adjunta su archivo y se registran mínima y máxima); se imprime una copia antes de la salida (queda registrada);
// las firmas físicas (conductor y DT) se suben como escaneo y se conservan 5 años.
import type { RutaVista } from './rutas'

export const FILAS_POR_PAGINA = 10

export interface ParametrosLsFr {
  codigo: string
  version: string
  vigenteDesde: string
  vigenteHasta: string
  filasPorPagina: number
  /** Definiciones que todavía faltan (valor «PENDIENTE»): no bloquean nada. */
  pendientes: string[]
  /** Años que se conserva el formato firmado (parámetro `ls_fr_43_03_conservacion_anios`; DT: 5). */
  conservacionAnios: number
  /** Rango de temperatura que trae el formato (15 °C - 25 °C). */
  tempMin: number
  tempMax: number
}

export const CONSERVACION_ANIOS_POR_DEFECTO = 5
export const TEMP_MIN_POR_DEFECTO = 15
export const TEMP_MAX_POR_DEFECTO = 25

export const PARAMETROS_LS_FR_POR_DEFECTO: ParametrosLsFr = {
  codigo: 'LS-FR.43.03', version: '01', vigenteDesde: '2026-09-01', vigenteHasta: '2028-09-01', filasPorPagina: FILAS_POR_PAGINA, pendientes: [],
  conservacionAnios: CONSERVACION_ANIOS_POR_DEFECTO, tempMin: TEMP_MIN_POR_DEFECTO, tempMax: TEMP_MAX_POR_DEFECTO,
}

/**
 * Lo que TODAVÍA está abierto del formato (parámetros en «PENDIENTE» de la base de datos). Las cuatro definiciones de Dirección Técnica de 2026-10-17
 * (USUARIO, cajas = bultos, temperatura y copia física) ya se cerraron en OS-7 y salieron de esta lista.
 */
export const PENDIENTES_LS_FR: Record<string, string> = {
  ls_fr_43_03_logger_formato: 'El formato del archivo que descarga el data logger Elitech GSP-6 (Sebas lo pasa después): hoy el archivo se guarda tal cual y la mínima y la máxima se escriben a mano.',
  ls_fr_43_03_temperatura_fuera_de_rango: 'Qué se hace cuando la temperatura del data logger sale del rango del formato (hoy solo se marca; no bloquea ni avisa a nadie).',
}

export function parametrosDesdeClaves(valores: Record<string, string | undefined>): ParametrosLsFr {
  return {
    codigo: valores.ls_fr_43_03_codigo || PARAMETROS_LS_FR_POR_DEFECTO.codigo,
    version: valores.ls_fr_43_03_version || PARAMETROS_LS_FR_POR_DEFECTO.version,
    vigenteDesde: valores.ls_fr_43_03_vigente_desde || PARAMETROS_LS_FR_POR_DEFECTO.vigenteDesde,
    vigenteHasta: valores.ls_fr_43_03_vigente_hasta || PARAMETROS_LS_FR_POR_DEFECTO.vigenteHasta,
    filasPorPagina: Number(valores.ls_fr_43_03_filas_por_pagina) > 0 ? Number(valores.ls_fr_43_03_filas_por_pagina) : FILAS_POR_PAGINA,
    pendientes: Object.keys(PENDIENTES_LS_FR).filter((k) => (valores[k] ?? 'PENDIENTE') === 'PENDIENTE'),
    conservacionAnios: Number(valores.ls_fr_43_03_conservacion_anios) > 0 ? Math.floor(Number(valores.ls_fr_43_03_conservacion_anios)) : CONSERVACION_ANIOS_POR_DEFECTO,
    tempMin: Number.isFinite(Number(valores.ls_fr_43_03_temp_min_c)) && valores.ls_fr_43_03_temp_min_c ? Number(valores.ls_fr_43_03_temp_min_c) : TEMP_MIN_POR_DEFECTO,
    tempMax: Number.isFinite(Number(valores.ls_fr_43_03_temp_max_c)) && valores.ls_fr_43_03_temp_max_c ? Number(valores.ls_fr_43_03_temp_max_c) : TEMP_MAX_POR_DEFECTO,
  }
}

/** Una impresión del formato (la copia que viaja con el conductor se imprime ANTES de la salida). */
export interface ImpresionLsFr { por: string; en: string; antesDeSalir: boolean }

/** El escaneo del formato firmado (conductor y Dirección Técnica). Cambiarlo deja la versión anterior: la lista viene de la más nueva a la más vieja. */
export interface EscaneoLsFr {
  version: number
  nombre: string
  bytes: number
  tipo?: string
  subidoPor: string
  subidoEn: string
  /** Fecha de la ruta + años de conservación. */
  conservarHasta: string
  motivo?: string
  vigente: boolean
}

/** El cierre de la ruta: archivo del data logger y temperatura mínima y máxima. Corregirlo deja la versión anterior (más nueva primero). */
export interface CierreRutaVista {
  version: number
  tempMin: number
  tempMax: number
  fueraDeRango: boolean
  archivoNombre: string
  archivoBytes: number
  archivoTipo?: string
  observaciones?: string
  motivo?: string
  cerradoPor: string
  cerradoEn: string
  vigente: boolean
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
  /** USUARIO del formato: el Jefe de Transporte que preparó la ruta (OS-7). */
  usuario?: string
  /** Cierre de la ruta y todo lo que dejó el papel: impresiones, escaneo firmado (de la más nueva a la más vieja). */
  impresiones?: ImpresionLsFr[]
  escaneos?: EscaneoLsFr[]
  cierres?: CierreRutaVista[]
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
  /** El Jefe de Transporte que preparó la ruta (columna USUARIO). */
  usuario?: string
  placa?: string
  conductor?: string
  auxiliar?: string
  horaSalida?: string
  horaLlegada?: string
  filas: FilaLsFr[]
  paginas: number
  filasPorPagina: number
  pendientes: string[]
  impresiones: ImpresionLsFr[]
  escaneos: EscaneoLsFr[]
  cierres: CierreRutaVista[]
  conservacionAnios: number
  /** Rango de temperatura del formato. */
  tempRango: { min: number; max: number }
}

/** El cierre vigente (el más nuevo) de la ruta. */
export const cierreVigente = (r: Pick<RegistroLsFrVista, 'cierres'>) => r.cierres.find((c) => c.vigente)
export const escaneoVigente = (r: Pick<RegistroLsFrVista, 'escaneos'>) => r.escaneos.find((e) => e.vigente)

/** «17,2 – 22,8 °C» */
export const textoTemperatura = (min: number, max: number) => `${min.toFixed(1).replace('.', ',')} – ${max.toFixed(1).replace('.', ',')} °C`

/** ¿La mínima o la máxima salen del rango que trae el formato? (Solo se marca: no bloquea.) */
export const fueraDeRangoTemperatura = (min: number, max: number, rango = { min: TEMP_MIN_POR_DEFECTO, max: TEMP_MAX_POR_DEFECTO }) => min < rango.min || max > rango.max

/** AAAA-MM-DD de la fecha de la ruta más los años de conservación (el escaneo se guarda 5 años). */
export function conservarHasta(fechaRuta: string, anios = CONSERVACION_ANIOS_POR_DEFECTO): string {
  const [a, m, d] = fechaRuta.slice(0, 10).split('-').map(Number)
  const f = new Date(Date.UTC(a + anios, m - 1, d))
  // 29 de febrero + años que no son bisiestos: Postgres también lo lleva al 28 de febrero
  if (f.getUTCMonth() !== m - 1) f.setUTCDate(0)
  return f.toISOString().slice(0, 10)
}

/**
 * Advertencia al liberar la unidad: la copia impresa viaja con el conductor y todavía no se imprimió. Es una ADVERTENCIA, no un bloqueo
 * (decisión técnica reversible, D-111): se puede liberar igual.
 */
export const textoNoImpreso = 'Todavía no imprimiste el formato LS-FR.43.03 de esta ruta: la copia impresa viaja con el conductor. Puedes liberar la unidad igual, pero imprímela antes de que salga.'
export const faltaImprimir = (r: { impresiones: readonly ImpresionLsFr[] } | null | undefined) => !r || r.impresiones.length === 0

export const COD_POE_LS_FR = 'LS-POE.07.05'

export function armarRegistroLsFr(ruta: RutaVista, params: ParametrosLsFr = PARAMETROS_LS_FR_POR_DEFECTO, extras: ExtrasLsFr = {}): RegistroLsFrVista {
  const cierre = extras.cierres?.find((c) => c.vigente)
  const filas: FilaLsFr[] = ruta.paradas.map((p, i) => ({
    n: i + 1, cliente: p.cliente, guia: extras.guias?.[p.pedidoId], cajas: extras.cajas?.[p.pedidoId], detalle: 'ENTREGA',
    temperatura: extras.temperatura?.[p.pedidoId] ?? (cierre ? textoTemperatura(cierre.tempMin, cierre.tempMax) : undefined), horaEntrega: extras.horaEntrega?.[p.pedidoId], observaciones: extras.observaciones?.[p.pedidoId],
  }))
  return {
    rutaId: ruta.id, rutaNumero: ruta.numero, codigo: params.codigo, version: params.version, vigenteDesde: params.vigenteDesde, vigenteHasta: params.vigenteHasta, poe: COD_POE_LS_FR,
    estado: ruta.registroLsFr ?? 'BASE', fecha: ruta.fecha, usuario: extras.usuario ?? ruta.creadaPor, placa: ruta.vehiculo?.placa, conductor: ruta.conductor?.nombre, auxiliar: ruta.auxiliar?.nombre,
    horaSalida: extras.horaSalida, horaLlegada: extras.horaLlegada, filas, paginas: Math.max(1, Math.ceil(filas.length / params.filasPorPagina)), filasPorPagina: params.filasPorPagina, pendientes: params.pendientes,
    impresiones: extras.impresiones ?? [], escaneos: extras.escaneos ?? [], cierres: extras.cierres ?? [], conservacionAnios: params.conservacionAnios,
    tempRango: { min: params.tempMin, max: params.tempMax },
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
