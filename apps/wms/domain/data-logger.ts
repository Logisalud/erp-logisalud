// Informe del data logger Elitech RC-61 (D-173 a D-176): lectura del PDF o del CSV, mínima y máxima por ruta, cruce con las lecturas del cierre de ruta y alerta sobre el límite.
// Puro (sin Node ni Next): recibe TEXTO. Extraer el texto de un PDF es de `services/logger/leer-pdf.ts`. La base de datos (`wms.registrar_lecturas_logger`, migración 0033) recalcula todo
// desde las lecturas y es la que manda; aquí se calcula lo mismo para mostrar el resultado antes de guardar y para la demostración.
//
// Lo que trae el informe del RC-61 (PDF «Informe de datos»): modelo, S/N, intervalo (5 min), los umbrales de alarma DEL EQUIPO (24.5 / 15.5 °C: no son nuestro límite), el resumen (máximo,
// mínimo, promedio, primera y última lectura, puntos) y una tabla «Tiempo · °C · %RH» con una lectura cada intervalo. La hora es la del propio equipo, sin zona horaria.

export const LIMITE_TEMPERATURA_RUTA_C = 24.9
/** Dos temperaturas del data logger (1 decimal) se consideran iguales si difieren como mucho en esto. */
export const TOLERANCIA_CRUCE_C = 0.1
export const MAX_LECTURAS = 20000
export const TEMPERATURA_IMPOSIBLE_MIN = -50
export const TEMPERATURA_IMPOSIBLE_MAX = 80

export interface LecturaLogger {
  /** Hora del equipo, `AAAA-MM-DDTHH:mm:ss`, sin zona horaria. */
  momento: string
  temperatura: number
  humedad?: number
}

export interface ResumenInforme { maxima?: number; minima?: number; promedio?: number; primera?: string; ultima?: string; puntos?: number }

export interface InformeLogger {
  formato: 'PDF' | 'CSV'
  modelo?: string
  serie?: string
  intervaloMin?: number
  /** Los umbrales de alarma que traía configurado el equipo (RC-61: 24.5 / 15.5). */
  umbralAlto?: number
  umbralBajo?: number
  resumen?: ResumenInforme
  lecturas: LecturaLogger[]
  /** Cosas raras que no impiden usar el archivo (el resumen no coincide con las lecturas, filas sin temperatura…). */
  avisos: string[]
}

export type ResultadoLectura = { ok: true; informe: InformeLogger } | { ok: false; mensaje: string }

export const MENSAJE_NO_SE_LEYO = 'No pudimos leer las lecturas de ese archivo. Sube el informe del data logger Elitech RC-61 (PDF o CSV) o anota la mínima y la máxima a mano.'

const decimal = (t: string) => Number(t.replace(',', '.'))
const redondear1 = (n: number) => Math.round(n * 10) / 10
const dos = (n: number | string) => String(n).padStart(2, '0')

/** «2026-10-19 09:24:34», «19/10/2026 9:24» o «2026-10-19T09:24:34» → `2026-10-19T09:24:34`. Null si no es una fecha con hora válida. */
export function normalizarMomento(texto: string): string | null {
  const t = texto.trim()
  let m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{1,2}):(\d{2})(?::(\d{2}))?/.exec(t)
  let anio: string, mes: string, dia: string, hh: string, mi: string, ss: string
  if (m) { [, anio, mes, dia, hh, mi, ss] = m as unknown as string[] }
  else {
    m = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})[ T](\d{1,2}):(\d{2})(?::(\d{2}))?/.exec(t)
    if (!m) return null
    ;[, dia, mes, anio, hh, mi, ss] = m as unknown as string[]
  }
  const d = new Date(Date.UTC(Number(anio), Number(mes) - 1, Number(dia), Number(hh), Number(mi), Number(ss ?? 0)))
  if (d.getUTCFullYear() !== Number(anio) || d.getUTCMonth() !== Number(mes) - 1 || d.getUTCDate() !== Number(dia) || Number(hh) > 23 || Number(mi) > 59) return null
  return `${anio}-${dos(mes)}-${dos(dia)}T${dos(hh)}:${mi}:${dos(ss ?? '00')}`
}

function intervaloEnMinutos(valor: string, unidad: string): number | undefined {
  const n = Number(valor)
  if (!Number.isFinite(n) || n <= 0) return undefined
  const u = unidad.toLowerCase()
  if (u.startsWith('h')) return n * 60
  if (u.startsWith('s')) return Math.max(1, Math.round(n / 60))
  return n
}

const NUM = String.raw`(-?\d+(?:[.,]\d+)?)`
const FECHA_HORA = String.raw`(\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2})`

function leerResumen(texto: string): { modelo?: string; serie?: string; intervaloMin?: number; umbralAlto?: number; umbralBajo?: number; resumen: ResumenInforme } {
  const g = (re: RegExp) => re.exec(texto)?.[1]
  const num = (re: RegExp) => { const v = g(re); return v === undefined ? undefined : decimal(v) }
  const interv = /Intervalo:\s*(\d+)\s*(min|m|s|h)\b/i.exec(texto)
  const puntos = g(/Puntos totales:\s*(\d+)/i)
  const primera = g(new RegExp(String.raw`Primera lectura:\s*${FECHA_HORA}`, 'i'))
  const ultima = g(new RegExp(String.raw`[ÚU]ltima lectura:\s*${FECHA_HORA}`, 'i'))
  return {
    modelo: g(/Modelo:\s*([A-Za-z0-9-]+)/i),
    serie: g(/S\/N:\s*([A-Za-z0-9-]+)/i),
    intervaloMin: interv ? intervaloEnMinutos(interv[1], interv[2]) : undefined,
    umbralAlto: num(new RegExp(String.raw`Encima:\s*${NUM}\s*°C`, 'i')),
    umbralBajo: num(new RegExp(String.raw`Abajo:\s*${NUM}\s*°C`, 'i')),
    resumen: {
      maxima: num(new RegExp(String.raw`M[áa]ximo:\s*${NUM}\s*°C`, 'i')),
      minima: num(new RegExp(String.raw`M[íi]nimo:\s*${NUM}\s*°C`, 'i')),
      promedio: num(new RegExp(String.raw`Promedio:\s*${NUM}\s*°C`, 'i')),
      primera: primera ? (normalizarMomento(primera) ?? undefined) : undefined,
      ultima: ultima ? (normalizarMomento(ultima) ?? undefined) : undefined,
      puntos: puntos ? Number(puntos) : undefined,
    },
  }
}

/** Cruza el resumen del informe con las lecturas: si no coinciden, es un aviso (el archivo se usa igual: mandan las lecturas). */
function avisosDeResumen(resumen: ResumenInforme, lecturas: readonly LecturaLogger[]): string[] {
  const av: string[] = []
  if (!lecturas.length) return av
  const e = estadisticas(lecturas, LIMITE_TEMPERATURA_RUTA_C, 5)
  if (resumen.puntos !== undefined && resumen.puntos !== lecturas.length) av.push(`El informe dice ${resumen.puntos} puntos y leímos ${lecturas.length} lecturas.`)
  if (resumen.maxima !== undefined && Math.abs(resumen.maxima - e.max) > TOLERANCIA_CRUCE_C) av.push(`El resumen del informe marca una máxima de ${resumen.maxima} °C y las lecturas llegan a ${e.max} °C. Usamos las lecturas.`)
  if (resumen.minima !== undefined && Math.abs(resumen.minima - e.min) > TOLERANCIA_CRUCE_C) av.push(`El resumen del informe marca una mínima de ${resumen.minima} °C y las lecturas bajan a ${e.min} °C. Usamos las lecturas.`)
  return av
}

function cerrarInforme(base: Omit<InformeLogger, 'avisos'>, avisos: string[]): ResultadoLectura {
  const l = base.lecturas
  if (!l.length) return { ok: false, mensaje: MENSAJE_NO_SE_LEYO }
  if (l.length > MAX_LECTURAS) return { ok: false, mensaje: `El archivo trae más de ${String(MAX_LECTURAS).replace(/\B(?=(\d{3})+$)/g, '.')} lecturas: revisa que sea el informe del viaje.` }
  const imposibles = l.filter((x) => x.temperatura < TEMPERATURA_IMPOSIBLE_MIN || x.temperatura > TEMPERATURA_IMPOSIBLE_MAX)
  if (imposibles.length) return { ok: false, mensaje: `Hay ${imposibles.length} lecturas con una temperatura imposible (entre ${TEMPERATURA_IMPOSIBLE_MIN} y ${TEMPERATURA_IMPOSIBLE_MAX} °C): revisa el archivo.` }
  const vistas = new Set<string>()
  for (const x of l) { if (vistas.has(x.momento)) return { ok: false, mensaje: 'El archivo repite horas de lectura: revisa que sea un solo informe.' }; vistas.add(x.momento) }
  const lecturas = [...l].sort((a, b) => a.momento.localeCompare(b.momento))
  const intervaloMin = base.intervaloMin ?? intervaloPorLecturas(lecturas)
  return { ok: true, informe: { ...base, lecturas, intervaloMin, avisos: [...avisos, ...(base.resumen ? avisosDeResumen(base.resumen, lecturas) : [])] } }
}

/** Sin el dato del archivo, el intervalo es el más frecuente entre lecturas seguidas (en minutos). */
function intervaloPorLecturas(l: readonly LecturaLogger[]): number | undefined {
  if (l.length < 2) return undefined
  const cuenta = new Map<number, number>()
  for (let i = 1; i < l.length; i++) {
    const min = Math.round((Date.parse(`${l[i].momento}Z`) - Date.parse(`${l[i - 1].momento}Z`)) / 60000)
    if (min > 0) cuenta.set(min, (cuenta.get(min) ?? 0) + 1)
  }
  return [...cuenta.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0]?.[0]
}

/**
 * El texto del PDF «Informe de datos» del RC-61 (en el orden en que se lee: una fila por línea). Las lecturas son las filas «fecha hora °C %RH» de la tabla; todo lo anterior a la primera
 * cabecera «Tiempo °C %RH» es la ficha del equipo y el resumen.
 */
export function parsearInformeTexto(texto: string): ResultadoLectura {
  const t = texto.replace(/\u00a0/g, ' ')
  const cabecera = /Tiempo\s+°C\s+%RH/i.exec(t)
  if (!cabecera) return { ok: false, mensaje: MENSAJE_NO_SE_LEYO }
  const ficha = leerResumen(t.slice(0, cabecera.index))
  const filas = new RegExp(String.raw`${FECHA_HORA}\s+${NUM}(?:\s*°C)?\s+(NC|${NUM})?`, 'g')
  const lecturas: LecturaLogger[] = []
  const avisos: string[] = []
  let sinTemperatura = 0
  for (const m of t.slice(cabecera.index).matchAll(filas)) {
    const momento = normalizarMomento(m[1])
    if (!momento) continue
    const humedad = m[4] !== undefined ? decimal(m[4]) : undefined
    lecturas.push({ momento, temperatura: decimal(m[2]), ...(humedad !== undefined && Number.isFinite(humedad) ? { humedad } : {}) })
  }
  if (sinTemperatura) avisos.push(`${sinTemperatura} filas sin temperatura.`)
  return cerrarInforme({ formato: 'PDF', modelo: ficha.modelo, serie: ficha.serie, intervaloMin: ficha.intervaloMin, umbralAlto: ficha.umbralAlto, umbralBajo: ficha.umbralBajo, resumen: ficha.resumen, lecturas }, avisos)
}

/** Parte una línea de CSV respetando las comillas. */
function partirLinea(linea: string, sep: string): string[] {
  const out: string[] = []; let actual = ''; let comillas = false
  for (let i = 0; i < linea.length; i++) {
    const c = linea[i]
    if (c === '"') { if (comillas && linea[i + 1] === '"') { actual += '"'; i++ } else comillas = !comillas }
    else if (c === sep && !comillas) { out.push(actual.trim()); actual = '' }
    else actual += c
  }
  out.push(actual.trim())
  return out
}

const ES_TEMPERATURA = /(temp|°c|℃|\bc\b)/i
const ES_HUMEDAD = /(hum|%\s*rh|\brh\b)/i

/**
 * CSV del data logger: separador coma, punto y coma o tabulación; encabezado con «Temperatura» (y opcionalmente «Humedad»); la fecha puede venir como 2026-10-19 09:24:34 o 19/10/2026 09:24.
 * Las filas de arriba con el modelo, el S/N o el intervalo se aprovechan si están. Sin encabezado, la temperatura es el primer número después de la fecha.
 */
export function parsearCsv(texto: string): ResultadoLectura {
  const limpio = texto.replace(/^\uFEFF/, '').replace(/\u00a0/g, ' ')
  const lineas = limpio.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
  if (!lineas.length) return { ok: false, mensaje: MENSAJE_NO_SE_LEYO }
  const sep = [',', ';', '\t'].map((s) => ({ s, n: lineas.slice(0, 40).reduce((a, l) => a + l.split(s).length - 1, 0) })).sort((a, b) => b.n - a.n)[0].s
  const ficha = leerResumen(limpio)
  const meta = (re: RegExp) => lineas.map((l) => re.exec(l)?.[1]).find(Boolean)
  let colTemp = -1; let colHum = -1
  const lecturas: LecturaLogger[] = []
  const avisos: string[] = []
  let filasSinTemp = 0
  for (const linea of lineas) {
    const celdas = partirLinea(linea, sep)
    const iFecha = celdas.findIndex((c) => normalizarMomento(c) !== null)
    if (iFecha < 0) {
      // ¿es el encabezado de la tabla?
      const t = celdas.findIndex((c) => ES_TEMPERATURA.test(c) && !ES_HUMEDAD.test(c)); const h = celdas.findIndex((c) => ES_HUMEDAD.test(c))
      if (t >= 0 && celdas.some((c) => /(tiempo|time|fecha|date)/i.test(c))) { colTemp = t; colHum = h }
      continue
    }
    const momento = normalizarMomento(celdas[iFecha])!
    const numero = (i: number) => { const v = celdas[i]?.replace(',', '.').replace(/[^\d.-]/g, ''); return v && /^-?\d+(\.\d+)?$/.test(v) ? Number(v) : undefined }
    let temperatura = colTemp >= 0 ? numero(colTemp) : undefined
    if (colTemp < 0) for (let i = iFecha + 1; i < celdas.length && temperatura === undefined; i++) temperatura = numero(i)
    if (temperatura === undefined) { filasSinTemp++; continue }
    const humedad = colHum >= 0 ? numero(colHum) : undefined
    lecturas.push({ momento, temperatura, ...(humedad !== undefined ? { humedad } : {}) })
  }
  if (filasSinTemp) avisos.push(`${filasSinTemp} filas sin temperatura (las dejamos fuera).`)
  const interv = meta(/(?:intervalo|interval)[^0-9]*(\d+)\s*(min|m|s|h)?/i)
  return cerrarInforme({
    formato: 'CSV', modelo: ficha.modelo ?? meta(/(?:modelo|model)[,;:\t ]+([A-Za-z0-9-]+)/i), serie: ficha.serie ?? meta(/(?:s\/n|serial)[,;:\t ]+([A-Za-z0-9-]+)/i),
    intervaloMin: interv ? intervaloEnMinutos(interv, /(?:intervalo|interval)[^0-9]*\d+\s*(min|m|s|h)?/i.exec(lineas.find((l) => /(?:intervalo|interval)/i.test(l)) ?? '')?.[1] ?? 'm') : undefined, lecturas,
  }, avisos)
}

/** Lee un informe según su tipo de archivo: el texto ya extraído del PDF, o el CSV tal cual. */
export const tipoDeInforme = (nombre: string, tipoMime?: string): 'PDF' | 'CSV' | null =>
  /\.pdf$/i.test(nombre) || tipoMime === 'application/pdf' ? 'PDF' : /\.(csv|txt)$/i.test(nombre) || /csv|text\/plain/.test(tipoMime ?? '') ? 'CSV' : null

export interface Estadisticas {
  puntos: number
  min: number
  max: number
  promedio: number
  primera: string
  ultima: string
  /** Lecturas por encima del límite. */
  sobreLimite: number
  minutosSobreLimite: number
  primeraExcedencia?: string
  /** Cuándo se registró la máxima. */
  momentoMaxima: string
  excede: boolean
  limite: number
}

/** Mínima, máxima, promedio (1 decimal, igual que la base) y cuánto tiempo estuvo sobre el límite (lecturas × intervalo). */
export function estadisticas(lecturas: readonly LecturaLogger[], limite = LIMITE_TEMPERATURA_RUTA_C, intervaloMin = 5): Estadisticas {
  if (!lecturas.length) throw new Error('Sin lecturas')
  const ordenadas = [...lecturas].sort((a, b) => a.momento.localeCompare(b.momento))
  const decimas = ordenadas.map((l) => Math.round(l.temperatura * 10))
  const maxD = Math.max(...decimas); const minD = Math.min(...decimas)
  const limD = Math.round(limite * 10)
  const sobre = ordenadas.filter((_, i) => decimas[i] > limD)
  return {
    puntos: ordenadas.length, min: minD / 10, max: maxD / 10, promedio: Math.round(decimas.reduce((a, b) => a + b, 0) / decimas.length) / 10,
    primera: ordenadas[0].momento, ultima: ordenadas[ordenadas.length - 1].momento,
    sobreLimite: sobre.length, minutosSobreLimite: sobre.length * intervaloMin, primeraExcedencia: sobre[0]?.momento,
    momentoMaxima: ordenadas[decimas.indexOf(maxD)].momento, excede: sobre.length > 0, limite,
  }
}

export interface CruceCierre {
  /** Null si la ruta todavía no se cerró (no hay con qué cruzar). */
  coincide: boolean | null
  /** Las lecturas son del día de la ruta. */
  dentroDeFecha: boolean
  mensajes: string[]
}

const coma = (n: number) => n.toFixed(1).replace('.', ',')

/** Cruza lo leído del archivo con lo que el Jefe de Transporte anotó al cerrar la ruta y con la fecha de la ruta. */
export function cruzarConCierre(e: Pick<Estadisticas, 'min' | 'max' | 'primera' | 'ultima'>, fechaRuta: string, cierre?: { tempMin: number; tempMax: number } | null): CruceCierre {
  const mensajes: string[] = []
  const dentroDeFecha = e.primera.slice(0, 10) <= fechaRuta && fechaRuta <= e.ultima.slice(0, 10)
  if (!dentroDeFecha) mensajes.push(`Las lecturas son del ${e.primera.slice(0, 10).split('-').reverse().join('/')} al ${e.ultima.slice(0, 10).split('-').reverse().join('/')} y la ruta es del ${fechaRuta.split('-').reverse().join('/')}: revisa que sea el archivo de este viaje.`)
  if (!cierre) return { coincide: null, dentroDeFecha, mensajes }
  const coincide = Math.abs(cierre.tempMin - e.min) <= TOLERANCIA_CRUCE_C + 1e-9 && Math.abs(cierre.tempMax - e.max) <= TOLERANCIA_CRUCE_C + 1e-9
  if (!coincide) mensajes.push(`El cierre anota ${coma(cierre.tempMin)} – ${coma(cierre.tempMax)} °C y el archivo marca ${coma(e.min)} – ${coma(e.max)} °C. Revisa cuál es el correcto; si el del archivo es el bueno, corrige el cierre.`)
  return { coincide, dentroDeFecha, mensajes }
}

/** El texto de la alerta sobre el límite (lo mismo que arma la base para Dirección Técnica y el Jefe de Transporte). */
export function textoAlertaTemperatura(numeroRuta: string, maxima: number, limite: number, origen: 'el data logger' | 'el cierre', minutos?: number): string {
  return `Ruta ${numeroRuta}: ${origen} marca una temperatura máxima de ${String(maxima).replace('.', ',')} °C, sobre el límite de ${String(limite).replace('.', ',')} °C${minutos && minutos > 0 ? ` (estuvo ${minutos} min por encima)` : ''}. Dirección Técnica decide qué se hace con la mercadería.`
}

export const AYUDA_TEMPERATURA_RUTA =
  `El límite en ruta es ${String(LIMITE_TEMPERATURA_RUTA_C).replace('.', ',')} °C, siempre. Si el data logger lo supera, avisamos a Dirección Técnica y al Jefe de Transporte. Qué se hace con la mercadería lo decide Dirección Técnica: todavía no está definido y por eso la ruta no se bloquea.`

/** Lo que se muestra al leer el archivo, antes de guardar nada (y lo que viaja de la acción del servidor a la pantalla). */
export interface ResumenLeido {
  formato: 'PDF' | 'CSV'
  modelo?: string
  serie?: string
  intervaloMin?: number
  /** Los umbrales de alarma del propio equipo (RC-61: 24.5 / 15.5): informativos, no son nuestro límite. */
  umbralEquipo?: { alto?: number; bajo?: number }
  estadisticas: Estadisticas
  avisos: string[]
}

export function resumenDeInforme(i: InformeLogger, limite = LIMITE_TEMPERATURA_RUTA_C): ResumenLeido {
  return {
    formato: i.formato, modelo: i.modelo, serie: i.serie, intervaloMin: i.intervaloMin,
    umbralEquipo: i.umbralAlto !== undefined || i.umbralBajo !== undefined ? { alto: i.umbralAlto, bajo: i.umbralBajo } : undefined,
    estadisticas: estadisticas(i.lecturas, limite, i.intervaloMin ?? 5), avisos: i.avisos,
  }
}

/** Una importación guardada de las lecturas de una ruta. Las versiones anteriores quedan (`vigente: false`); solo la vigente trae las lecturas. */
export interface LecturasLoggerVista {
  id: string
  archivoNombre: string
  formato: 'PDF' | 'CSV'
  modelo?: string
  serie?: string
  intervaloMin?: number
  umbralEquipoAlto?: number
  umbralEquipoBajo?: number
  primera: string
  ultima: string
  puntos: number
  tempMin: number
  tempMax: number
  tempProm: number
  limite: number
  excede: boolean
  lecturasSobreLimite: number
  minutosSobreLimite: number
  primeraExcedencia?: string
  /** Null si la ruta todavía no estaba cerrada al importar. */
  coincideConCierre: boolean | null
  cierreMin?: number
  cierreMax?: number
  dentroDeFecha: boolean
  importadoPor: string
  importadoEn: string
  vigente: boolean
  lecturas: LecturaLogger[]
}

/** «19/10 09:24»: un momento del equipo, corto. */
export const momentoCorto = (m: string) => `${m.slice(8, 10)}/${m.slice(5, 7)} ${m.slice(11, 16)}`
export const temperaturaTexto = (n: number) => `${n.toFixed(1).replace('.', ',')} °C`

/** Los avisos de cruce de una importación guardada, en palabras. */
export function mensajesDeImportacion(v: Pick<LecturasLoggerVista, 'tempMin' | 'tempMax' | 'primera' | 'ultima' | 'coincideConCierre' | 'cierreMin' | 'cierreMax' | 'dentroDeFecha'>, fechaRuta: string): string[] {
  const cierre = v.cierreMin !== undefined && v.cierreMax !== undefined ? { tempMin: v.cierreMin, tempMax: v.cierreMax } : null
  return cruzarConCierre({ min: v.tempMin, max: v.tempMax, primera: v.primera, ultima: v.ultima }, fechaRuta, cierre).mensajes
}
