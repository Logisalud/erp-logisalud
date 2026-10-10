// Indicadores (KPI) del WMS: definidos en docs/wms/kpis.md. Todo es cálculo puro sobre datos ya leídos; no hay metas ni semáforos (D-42):
// cada indicador muestra su valor, hacia dónde va frente al periodo anterior (una flecha, el cambio y una palabra: «mejoró» o «empeoró»,
// según si «más» es mejor o peor para ese indicador), su tendencia de 30 días, cómo se calcula y a qué reporte lleva.
// La tendencia dice hacia dónde va, no si está bien o mal: no hay metas.
import { ETIQUETA_DIFERENCIA_RECEPCION, type AlertaVista, type SolicitudResumen, type TipoDiferenciaRecepcion } from './entradas-vistas'
import type { AjusteVista, OrdenMovimiento } from './inventario'
import type { Cobertura, FilaExactitud, PendienteVista, ProgramacionVista, RevisionDiaria } from './operacion'
import { exactitudDeFilas, lunesDe, sumarDiasISO } from './operacion'
import type { Panorama } from './panorama'
import type { Saldo } from './tipos'
import { asignacionVigente } from './zonas'
import { ETIQUETA_ALERTA, type TipoAlerta } from './entradas'

export type Tema = 'Inventario' | 'Recepciones' | 'Calidad' | 'Movimientos y conteos' | 'Operación diaria' | 'Despacho'
export const TEMAS: Tema[] = ['Inventario', 'Recepciones', 'Calidad', 'Movimientos y conteos', 'Operación diaria', 'Despacho']

export interface Periodo { desde: string; hasta: string; dias: number }
export const PERIODOS_RAPIDOS = [7, 30, 90] as const

export function periodoDe(hasta: string, dias: number): Periodo { return { desde: sumarDiasISO(hasta, -(dias - 1)), hasta, dias } }
export function periodoAnterior(p: Periodo): Periodo { const hasta = sumarDiasISO(p.desde, -1); return { desde: sumarDiasISO(hasta, -(p.dias - 1)), hasta, dias: p.dias } }
/** Un rango libre (AAAA-MM-DD a AAAA-MM-DD); si viene mal, los últimos 30 días. */
export function periodoDeRango(desde: string | undefined, hasta: string | undefined, hoy: string): Periodo {
  const ok = (x?: string) => !!x && /^\d{4}-\d{2}-\d{2}$/.test(x)
  if (ok(desde) && ok(hasta) && desde! <= hasta!) {
    const dias = Math.round((Date.parse(`${hasta}T12:00:00Z`) - Date.parse(`${desde}T12:00:00Z`)) / 86_400_000) + 1
    if (dias <= 366) return { desde: desde!, hasta: hasta!, dias }
  }
  return periodoDe(hoy, 30)
}

/** `efecto`: si el cambio mejoró o empeoró según el sentido del indicador; `sin-juicio` si el indicador no declara cuál es mejor. */
export type EfectoVariacion = 'mejoro' | 'empeoro' | 'igual' | 'sin-juicio'
export interface Variacion {
  sentido: 'sube' | 'baja' | 'igual'
  efecto: EfectoVariacion
  /** Cuánto cambió y en qué unidad («15,6 puntos», «2 lotes»); vacío si no cambió. */
  cantidad: string
  /** «mejoró», «empeoró» o «sin cambio»; vacío si el indicador no declara qué es mejor. */
  palabra: string
  /** Todo junto, para leer o anunciar: «↑ 15,6 puntos · mejoró». */
  texto: string
  /** Contra qué se comparó («los 30 días anteriores»). */
  comparacion: string
}
export interface PuntoSerie { dia: string; valor: number | null }
export interface DetalleIndicador { etiqueta: string; valor: string; /** Una línea más pequeña bajo la fila (por ejemplo, el tipo de diferencia). */ sub?: string }
export interface Indicador {
  clave: string
  tema: Tema
  nombre: string
  /** Aparece en el grupo «Inventario y almacén» de Inicio. */
  enInicio: boolean
  valor: number | null
  /** Lo que se lee grande en la tarjeta («92,5 %», «12 lotes · 340 u»). */
  texto: string
  variacion: Variacion | null
  /** Cada indicador declara si «más» es mejor (true), peor (false) o si no se juzga todavía (null). Ver MAS_ES_MEJOR. */
  masEsMejor: boolean | null
  /** Su valor cada pocos días de los últimos 30 (tendencia). Ausente si ese indicador no se puede reconstruir hacia atrás. */
  serie?: PuntoSerie[]
  /** Por qué no hay variación (por ejemplo, no hay historial). */
  sinVariacion?: string
  detalle: DetalleIndicador[]
  formula: string
  /** Los números concretos con que salió este valor. */
  datos: string
  href: string
  /** ¿Respeta el filtro por propietario? (la revisión diaria, las alertas… no tienen propietario). */
  filtraPropietario: boolean
  /** Si no se puede calcular todavía, el motivo (se muestra en lugar del valor). */
  sinDatos?: string
}

// ── Datos de entrada ────────────────────────────────────────────────────────

export interface DatosIndicadores {
  hoy: string
  panorama: Panorama
  /** Cómo era el stock al final del día anterior al inicio del periodo. */
  saldosAntes: Saldo[]
  ordenes: OrdenMovimiento[]
  /** Conteos cerrados de ambos periodos. */
  exactitud: FilaExactitud[]
  solicitudes: SolicitudResumen[]
  revisiones: RevisionDiaria[]
  pendientes: PendienteVista[]
  alertas: AlertaVista[]
  ajustes: AjusteVista[]
  programaciones: ProgramacionVista[]
  cobertura: Cobertura[]
  plazoMovHoras: number
  diasAlertaVencimiento: number
}

// ── Utilidades ──────────────────────────────────────────────────────────────

const limaDia = (ts: string) => new Date(ts).toLocaleDateString('en-CA', { timeZone: 'America/Lima' })
const enPeriodo = (dia: string, p: Periodo) => dia >= p.desde && dia <= p.hasta
const nf = (n: number, dec = 1) => n.toLocaleString('es-PE', { maximumFractionDigits: dec })
const pct = (n: number) => `${nf(n)} %`
const razon = (a: number, b: number): number | null => (b > 0 ? Math.round((a / b) * 1000) / 10 : null)
const dias = (a: string, b: string) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86_400_000)
const finDelDia = (d: string) => Date.parse(`${d}T23:59:59-05:00`)
type EntradaIndicador = Pick<Indicador, 'clave' | 'tema' | 'nombre' | 'enInicio' | 'formula' | 'href' | 'filtraPropietario'> & Partial<Indicador>
function base(x: EntradaIndicador): Indicador {
  return { valor: null, texto: '—', variacion: null, masEsMejor: MAS_ES_MEJOR[x.clave] ?? null, detalle: [], datos: '', ...x }
}

export const textoPeriodo = (p: Periodo) => `${p.dias} días`

const SINGULAR: Record<string, string> = { puntos: 'punto', lotes: 'lote', líneas: 'línea', ajustes: 'ajuste', alertas: 'alerta', días: 'día', horas: 'hora', pendientes: 'pendiente' }

/**
 * Cuánto y hacia dónde cambió un indicador (sin juzgarlo todavía: el juicio lo pone `juzgar`, según el sentido del indicador).
 * `unidad` va en plural («puntos», «lotes», «u», «días»); un puntos de diferencia dice «1 punto».
 */
export function variacion(actual: number | null, anterior: number | null, unidad: string, etiquetaAnterior: string, decimales = 1): Variacion | null {
  if (actual === null || anterior === null) return null
  const d = Math.round((actual - anterior) * 10 ** decimales) / 10 ** decimales
  const comparacion = `frente a ${etiquetaAnterior}`
  if (d === 0) return { sentido: 'igual', efecto: 'igual', cantidad: '', palabra: 'sin cambio', texto: '= sin cambio', comparacion }
  const abs = Math.abs(d)
  const cantidad = `${nf(abs, decimales)} ${abs === 1 ? SINGULAR[unidad] ?? unidad : unidad}`
  return { sentido: d > 0 ? 'sube' : 'baja', efecto: 'sin-juicio', cantidad, palabra: '', texto: `${d > 0 ? '↑' : '↓'} ${cantidad}`, comparacion }
}

/** Dice con una palabra si el cambio mejoró o empeoró, según si «más» es mejor para ese indicador. No es una meta: solo hacia dónde va. */
export function juzgar(v: Variacion | null, masEsMejor: boolean | null): Variacion | null {
  if (!v || v.sentido === 'igual' || masEsMejor === null) return v
  const mejoro = (v.sentido === 'sube') === masEsMejor
  const palabra = mejoro ? 'mejoró' : 'empeoró'
  return { ...v, efecto: mejoro ? 'mejoro' : 'empeoro', palabra, texto: `${v.texto} · ${palabra}` }
}

/**
 * Para cada indicador, ¿«más» es mejor? true = más es mejor; false = más es peor; null = todavía sin juicio (solo flecha y cambio).
 * Es la única lista que decide las palabras «mejoró» y «empeoró»: Dirección Técnica la confirma (docs/wms/kpis.md).
 */
export const MAS_ES_MEJOR: Record<string, boolean | null> = {
  exactitud: true,
  'conteos-semana': true,
  cobertura: true,
  'diferencias-conteo': false,
  'movs-a-tiempo': true,
  'movs-sin-verificar': false,
  'lineas-con-dif': false,
  'cuarentena-trasladar': false,
  vencimientos: false,
  'ciclo-recepcion': false,
  'recepciones-dif': false,
  'tiempo-cuarentena': false,
  disponibilidad: false,
  ocupacion: null,
  'revision-diaria': true,
  pendientes: false,
  ajustes: false,
  alertas: false,
}

const sinHistorial = 'No hay historial para comparar este indicador.'

// ── El cálculo ──────────────────────────────────────────────────────────────

export interface OpcionesIndicadores {
  propietarioId?: string
  /** El momento «actual» (ms). Por defecto, ahora; las series de tendencia lo mueven al final de cada día. */
  ahora?: number
}

export function calcularIndicadores(d: DatosIndicadores, periodo: Periodo, o: OpcionesIndicadores = {}): Indicador[] {
  const ant = periodoAnterior(periodo)
  const p = d.panorama
  const pid = o.propietarioId
  const ahoraMs = o.ahora ?? Date.now()
  const codigoDe = new Map(p.propietarios.map((x) => [x.id, x.codigo]))
  const cod = pid ? codigoDe.get(pid) : undefined
  const posPorId = new Map(p.posiciones.map((x) => [x.id, x]))
  const loteVence = new Map(p.lotes.map((l) => [l.id, l.vence]))
  const etiqAnt = `los ${ant.dias} días anteriores`
  const etiqHace = `hace ${periodo.dias} días`
  const filtraSaldo = (s: Saldo) => !pid || s.propietarioId === pid
  const q = `desde=${periodo.desde}&hasta=${periodo.hasta}`
  const prop = cod ? `&propietario=${encodeURIComponent(cod)}` : ''

  const out: Indicador[] = []
  // 1 · Exactitud del inventario (primer conteo)
  {
    const de = (per: Periodo) => d.exactitud.filter((f) => enPeriodo(limaDia(f.cerradoEn), per) && (!cod || f.propietario === cod))
    const a = exactitudDeFilas(de(periodo)); const b = exactitudDeFilas(de(ant))
    out.push(base({
      clave: 'exactitud', tema: 'Inventario', nombre: 'Exactitud de inventario', enInicio: true, filtraPropietario: true,
      formula: 'Líneas contadas (ubicación + lote) cuyo PRIMER conteo coincidió con lo que decía el sistema ÷ líneas contadas, en conteos cerrados del periodo.',
      valor: a.porcentaje, texto: a.porcentaje === null ? '—' : pct(a.porcentaje), variacion: variacion(a.porcentaje, b.porcentaje, 'puntos', etiqAnt),
      sinVariacion: b.porcentaje === null ? `No hubo conteos cerrados en ${etiqAnt}.` : undefined,
      datos: a.lineas ? `${a.exactas} de ${a.lineas} líneas coincidieron en el primer conteo (${b.lineas} líneas en ${etiqAnt}).` : 'No hubo conteos cerrados en el periodo.',
      sinDatos: a.lineas ? undefined : 'Sin conteos cerrados en este periodo.', href: `/reportes/exactitud?${q}${prop}`,
    }))
  }

  // 2 · Cumplimiento de los conteos semanales
  {
    const semanas = (per: Periodo) => { const s = new Set<string>(); for (let x = lunesDe(per.desde); x <= per.hasta; x = sumarDiasISO(x, 7)) s.add(x); return s }
    const cumple = (per: Periodo) => { const w = semanas(per); const hechos = d.programaciones.filter((x) => x.tipo === 'ROTATIVO' && x.estado === 'GENERADO' && w.has(x.semana)).length; return { hechos, previstos: w.size * 3 } }
    const a = cumple(periodo); const b = cumple(ant)
    out.push(base({
      clave: 'conteos-semana', tema: 'Movimientos y conteos', nombre: 'Cumplimiento de los conteos semanales', enInicio: false, filtraPropietario: false,
      formula: 'Conteos semanales generados ÷ 3 por cada semana del periodo (los conteos extra por incidencia no cuentan).',
      valor: razon(a.hechos, a.previstos), texto: pct(razon(a.hechos, a.previstos) ?? 0), variacion: variacion(razon(a.hechos, a.previstos), razon(b.hechos, b.previstos), 'puntos', etiqAnt),
      datos: `${a.hechos} de ${a.previstos} conteos previstos se generaron.`, href: '/conteos',
    }))
  }

  // 3 · Cobertura de ubicaciones con stock (últimos 90 días)
  {
    const conStock = new Set(p.saldos.filter((s) => s.cantidad > 0 && filtraSaldo(s)).map((s) => s.posicionId))
    const limite = sumarDiasISO(d.hoy, -90)
    const cubiertas = d.cobertura.filter((c) => conStock.has(c.posicionId) && c.ultima && c.ultima >= limite).length
    out.push(base({
      clave: 'cobertura', tema: 'Inventario', nombre: 'Cobertura de ubicaciones', enInicio: false, filtraPropietario: true,
      formula: 'Ubicaciones con stock contadas (o programadas) en los últimos 90 días ÷ ubicaciones con stock.',
      valor: razon(cubiertas, conStock.size), texto: conStock.size ? pct(razon(cubiertas, conStock.size)!) : '—', sinVariacion: sinHistorial,
      datos: `${cubiertas} de ${conStock.size} ubicaciones con stock se cubrieron desde el ${limite}.`, href: '/conteos', sinDatos: conStock.size ? undefined : 'No hay ubicaciones con stock.',
    }))
  }

  // 4 · Diferencias en conteo
  {
    const de = (per: Periodo) => { const f = d.exactitud.filter((x) => enPeriodo(limaDia(x.cerradoEn), per) && (!cod || x.propietario === cod)); return { dif: f.reduce((n, x) => n + Math.abs(x.diferencia), 0), sis: f.reduce((n, x) => n + x.cantidadSistema, 0), lineas: f.length } }
    const a = de(periodo); const b = de(ant)
    const v = razon(a.dif, a.sis)
    out.push(base({
      clave: 'diferencias-conteo', tema: 'Inventario', nombre: 'Diferencias en conteo', enInicio: false, filtraPropietario: true,
      formula: 'Suma de |contado final − sistema| ÷ suma de lo que decía el sistema, en conteos cerrados del periodo.',
      valor: v, texto: v === null ? '—' : pct(v), variacion: variacion(v, razon(b.dif, b.sis), 'puntos', etiqAnt),
      datos: `${a.dif.toLocaleString('es-PE')} u de diferencia sobre ${a.sis.toLocaleString('es-PE')} u en el sistema (${a.lineas} líneas).`, sinDatos: a.lineas ? undefined : 'Sin conteos cerrados en este periodo.',
      href: `/reportes/exactitud?${q}&diferencia=Con%20diferencia${prop}`,
    }))
  }

  // 5 · Movimientos verificados a tiempo
  {
    const plazoMs = d.plazoMovHoras * 3_600_000
    const ahora = ahoraMs
    const duenos = (o2: OrdenMovimiento) => !cod || o2.lineas.some((l) => l.propietario === cod)
    const de = (per: Periodo) => {
      const os = d.ordenes.filter((x) => x.estado !== 'ANULADO' && enPeriodo(limaDia(x.ejecutadoEn), per) && duenos(x))
      let atiempo = 0; let total = 0
      for (const x of os) {
        const e0 = Date.parse(x.ejecutadoEn)
        if (x.verificadoEn) { total += 1; if (Date.parse(x.verificadoEn) - e0 <= plazoMs) atiempo += 1 } else if (ahora - e0 > plazoMs) total += 1
      }
      return { atiempo, total }
    }
    const a = de(periodo); const b = de(ant)
    out.push(base({
      clave: 'movs-a-tiempo', tema: 'Movimientos y conteos', nombre: 'Movimientos verificados a tiempo', enInicio: false, filtraPropietario: true,
      formula: `Movimientos verificados en ${d.plazoMovHoras} h o menos desde que se ejecutaron ÷ movimientos que ya se verificaron o que ya pasaron ese plazo sin verificar. Los que siguen dentro del plazo no cuentan todavía.`,
      valor: razon(a.atiempo, a.total), texto: a.total ? pct(razon(a.atiempo, a.total)!) : '—', variacion: variacion(razon(a.atiempo, a.total), razon(b.atiempo, b.total), 'puntos', etiqAnt),
      datos: `${a.atiempo} de ${a.total} movimientos se verificaron a tiempo.`, sinDatos: a.total ? undefined : 'Sin movimientos para medir en este periodo.', href: `/reportes/movimientos?${q}${prop}`,
    }))
  }

  // 6 · Movimientos sin verificar (ahora y hace un periodo)
  {
    const pendientesAl = (corte: number) => {
      let lineas = 0; let vencidas = 0
      for (const x of d.ordenes) {
        if (x.estado === 'ANULADO' || Date.parse(x.ejecutadoEn) > corte) continue
        if (x.verificadoEn && Date.parse(x.verificadoEn) <= corte) continue
        const ls = x.lineas.filter((l) => l.verificacion !== 'ANULADA' && (!cod || l.propietario === cod))
        lineas += ls.length
        if (corte - Date.parse(x.ejecutadoEn) > d.plazoMovHoras * 3_600_000) vencidas += ls.length
      }
      return { lineas, vencidas }
    }
    const a = pendientesAl(ahoraMs); const b = pendientesAl(finDelDia(sumarDiasISO(periodo.desde, -1)))
    out.push(base({
      clave: 'movs-sin-verificar', tema: 'Movimientos y conteos', nombre: 'Movimientos sin verificar', enInicio: false, filtraPropietario: true,
      formula: `Líneas de movimientos ejecutados que todavía no verificó otra persona (sus unidades están en tránsito); y de ellas, las que pasaron de ${d.plazoMovHoras} h.`,
      valor: a.lineas, texto: `${a.lineas} ${a.lineas === 1 ? 'línea' : 'líneas'}`, variacion: variacion(a.lineas, b.lineas, 'líneas', etiqHace, 0),
      detalle: [{ etiqueta: `Con más de ${d.plazoMovHoras} h`, valor: `${a.vencidas}` }], datos: `Ahora: ${a.lineas} líneas por verificar, ${a.vencidas} fuera de plazo. Hace ${periodo.dias} días: ${b.lineas}.`,
      href: `/reportes/movimientos?estado=Por%20verificar${prop}`,
    }))
  }

  // 7 · Líneas con diferencia al verificar
  {
    const de = (per: Periodo) => {
      const ls = d.ordenes.filter((x) => x.estado !== 'ANULADO' && enPeriodo(limaDia(x.ejecutadoEn), per)).flatMap((x) => x.lineas).filter((l) => !cod || l.propietario === cod)
      const verificadas = ls.filter((l) => l.verificacion === 'CONFIRMADA' || l.verificacion === 'CON_DIFERENCIA')
      return { dif: verificadas.filter((l) => l.verificacion === 'CON_DIFERENCIA').length, verificadas: verificadas.length }
    }
    const a = de(periodo); const b = de(ant)
    out.push(base({
      clave: 'lineas-con-dif', tema: 'Movimientos y conteos', nombre: 'Líneas con diferencia al verificar', enInicio: false, filtraPropietario: true,
      formula: 'Líneas con diferencia ÷ líneas verificadas (confirmadas + con diferencia), de movimientos ejecutados en el periodo.',
      valor: razon(a.dif, a.verificadas), texto: a.verificadas ? pct(razon(a.dif, a.verificadas)!) : '—', variacion: variacion(razon(a.dif, a.verificadas), razon(b.dif, b.verificadas), 'puntos', etiqAnt),
      datos: `${a.dif} de ${a.verificadas} líneas verificadas tuvieron diferencia.`, sinDatos: a.verificadas ? undefined : 'Sin líneas verificadas en este periodo.',
      href: `/reportes/movimientos?${q}&estado=Con%20diferencia${prop}`,
    }))
  }

  // 8 · Stock en Cuarentena y por trasladar
  {
    const calc = (saldos: Saldo[]) => {
      let cuarentena = 0; let trasladar = 0
      for (const s of saldos) {
        if (s.cantidad <= 0 || !filtraSaldo(s)) continue
        const area = posPorId.get(s.posicionId)?.tipoArea
        if (s.estado === 'CUARENTENA') cuarentena += s.cantidad
        else if (s.estado === 'APROBADO' && (area === 'CUARENTENA' || area === 'RECEPCION')) trasladar += s.cantidad
      }
      return { cuarentena, trasladar }
    }
    const a = calc(p.saldos); const b = calc(d.saldosAntes)
    out.push(base({
      clave: 'cuarentena-trasladar', tema: 'Calidad', nombre: 'Stock en Cuarentena y por trasladar', enInicio: false, filtraPropietario: true,
      formula: 'Unidades en estado Cuarentena + unidades Aprobadas que siguen en el área de Cuarentena o Recepción (esperan su traslado).',
      valor: a.cuarentena + a.trasladar, texto: `${(a.cuarentena + a.trasladar).toLocaleString('es-PE')} u`, variacion: variacion(a.cuarentena + a.trasladar, b.cuarentena + b.trasladar, 'u', etiqHace, 0),
      detalle: [{ etiqueta: 'En Cuarentena', valor: `${a.cuarentena.toLocaleString('es-PE')} u` }, { etiqueta: 'Aprobadas por trasladar', valor: `${a.trasladar.toLocaleString('es-PE')} u` }],
      datos: `Ahora: ${a.cuarentena} u en Cuarentena y ${a.trasladar} u por trasladar. Hace ${periodo.dias} días: ${b.cuarentena + b.trasladar} u.`, href: `/reportes/calidad${prop ? `?${prop.slice(1)}` : ''}`,
    }))
  }

  // 9 · Por vencer y vencidos (Inicio)
  {
    const calc = (saldos: Saldo[], al: string) => {
      const limite = sumarDiasISO(al, d.diasAlertaVencimiento)
      const lotes = new Set<string>(); const vencidos = new Set<string>(); const porVencer = new Set<string>(); let uV = 0; let uP = 0
      for (const s of saldos) {
        if (s.cantidad <= 0 || s.estado === 'BAJAS_RECHAZADOS' || !filtraSaldo(s)) continue
        const v = loteVence.get(s.loteId)
        if (!v || v > limite) continue
        lotes.add(s.loteId)
        if (v < al) { vencidos.add(s.loteId); uV += s.cantidad } else { porVencer.add(s.loteId); uP += s.cantidad }
      }
      return { lotes: lotes.size, unidades: uV + uP, vencidos: vencidos.size, uV, porVencer: porVencer.size, uP }
    }
    const a = calc(p.saldos, d.hoy); const b = calc(d.saldosAntes, sumarDiasISO(periodo.desde, -1))
    out.push(base({
      clave: 'vencimientos', tema: 'Calidad', nombre: 'Por vencer y vencidos', enInicio: true, filtraPropietario: true,
      formula: `Lotes (y sus unidades) con stock que vencen en ${d.diasAlertaVencimiento} días o menos, más los que ya vencieron. No cuenta lo que está en Bajas/Rechazados.`,
      valor: a.lotes, texto: `${a.lotes} ${a.lotes === 1 ? 'lote' : 'lotes'} · ${a.unidades.toLocaleString('es-PE')} u`, variacion: variacion(a.lotes, b.lotes, 'lotes', etiqHace, 0),
      detalle: [{ etiqueta: 'Ya vencidos', valor: `${a.vencidos} ${a.vencidos === 1 ? 'lote' : 'lotes'} · ${a.uV.toLocaleString('es-PE')} u` }, { etiqueta: `Vencen en ${d.diasAlertaVencimiento} días o menos`, valor: `${a.porVencer} ${a.porVencer === 1 ? 'lote' : 'lotes'} · ${a.uP.toLocaleString('es-PE')} u` }],
      datos: `Ahora: ${a.lotes} lotes y ${a.unidades} u. Hace ${periodo.dias} días: ${b.lotes} lotes y ${b.unidades} u.`, href: `/reportes/vencimientos?diasHasta=${d.diasAlertaVencimiento}${prop}`,
    }))
  }

  // 10 · Ciclo de recepción
  {
    const de = (per: Periodo) => {
      const s = d.solicitudes.filter((x) => x.estado === 'CERRADA' && x.cerradaEn && enPeriodo(limaDia(x.cerradaEn), per) && (!cod || x.propietario === cod))
      const dd = s.map((x) => Math.max(0, (Date.parse(x.cerradaEn!) - Date.parse(x.creadoEn)) / 86_400_000))
      return { n: s.length, prom: dd.length ? Math.round((dd.reduce((a, b) => a + b, 0) / dd.length) * 10) / 10 : null }
    }
    const a = de(periodo); const b = de(ant)
    out.push(base({
      clave: 'ciclo-recepcion', tema: 'Recepciones', nombre: 'Ciclo de recepción', enInicio: false, filtraPropietario: true,
      formula: 'Promedio de (cierre − creación) de las solicitudes de ingreso cerradas en el periodo, en días.',
      valor: a.prom, texto: a.prom === null ? '—' : `${nf(a.prom)} días`, variacion: variacion(a.prom, b.prom, 'días', etiqAnt),
      datos: `${a.n} solicitudes cerradas en el periodo.`, sinDatos: a.n ? undefined : 'Sin solicitudes cerradas en este periodo.', href: `/reportes/recepciones?estado=Cerrada&${q}${prop}`,
    }))
  }

  // 11 · Recepciones con diferencia (Inicio): por la fecha en que se CONFIRMÓ la recepción física
  {
    const de = (per: Periodo) => d.solicitudes.filter((x) => x.confirmadaEn && enPeriodo(limaDia(x.confirmadaEn), per) && (!cod || x.propietario === cod))
    const sa = de(periodo); const sb = de(ant)
    const difA = sa.filter((x) => x.conDiferencias).length; const difB = sb.filter((x) => x.conDiferencias).length
    const porProv = new Map<string, { dif: number; total: number; tipos: Map<string, number> }>()
    const porTipo = new Map<string, number>()
    for (const x of sa) {
      const k = x.contraparte ?? 'Sin proveedor'; const e = porProv.get(k) ?? { dif: 0, total: 0, tipos: new Map() }
      e.total += 1
      if (x.conDiferencias) { e.dif += 1; for (const t of x.tiposDiferencia) { e.tipos.set(t, (e.tipos.get(t) ?? 0) + 1); porTipo.set(t, (porTipo.get(t) ?? 0) + 1) } }
      porProv.set(k, e)
    }
    const textoTipos = (m: Map<string, number>) => [...m].sort((x, y) => y[1] - x[1]).map(([t, n]) => `${ETIQUETA_DIFERENCIA_RECEPCION[t as TipoDiferenciaRecepcion] ?? t}${n > 1 ? ` ×${n}` : ''}`).join(' · ')
    out.push(base({
      clave: 'recepciones-dif', tema: 'Recepciones', nombre: 'Recepciones con diferencia', enInicio: false, filtraPropietario: true,
      formula: 'Recepciones físicas confirmadas en el periodo que llegaron distintas de lo declarado ÷ recepciones confirmadas en el periodo. Hay diferencia si la cantidad final no coincide con la Solicitud de Ingreso o la OC, si hay una línea no esperada, o si el lote o el vencimiento es distinto al declarado (D-35). El periodo se cuenta por la fecha en que se confirmó la recepción física.',
      valor: razon(difA, sa.length), texto: sa.length ? pct(razon(difA, sa.length)!) : '—', variacion: variacion(razon(difA, sa.length), razon(difB, sb.length), 'puntos', etiqAnt),
      detalle: [...porProv].sort((x, y) => y[1].dif - x[1].dif || y[1].total - x[1].total).slice(0, 5).map(([k, v]) => ({ etiqueta: k, valor: `${v.dif} de ${v.total}`, sub: v.dif ? textoTipos(v.tipos) : undefined })),
      datos: `${difA} de ${sa.length} recepciones confirmadas tuvieron diferencia (${difB} de ${sb.length} en ${etiqAnt}).${porTipo.size ? ` Tipos: ${textoTipos(porTipo)}.` : ''}`,
      sinDatos: sa.length ? undefined : 'Sin recepciones confirmadas en este periodo.', href: `/reportes/recepciones?diferencias=S%C3%AD&${q}${prop}`,
    }))
  }

  // 11b · Tiempo de disponibilidad (dock-to-stock, Inicio)
  {
    const mediana = (xs: number[]) => { if (!xs.length) return null; const s = [...xs].sort((a, b) => a - b); const m = s.length >> 1; return Math.round((s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2) * 10) / 10 }
    const todas = tiemposDeDisponibilidad(d.solicitudes, d.ordenes, posPorId).filter((x) => !cod || x.propietario === cod)
    const de = (per: Periodo) => todas.filter((x) => enPeriodo(limaDia(x.disponibleEn), per))
    const sa = de(periodo); const sb = de(ant)
    const ma = mediana(sa.map((x) => x.horas)); const mb = mediana(sb.map((x) => x.horas))
    const porProp = new Map<string, number[]>(); for (const x of sa) porProp.set(x.propietario, [...(porProp.get(x.propietario) ?? []), x.horas])
    out.push(base({
      clave: 'disponibilidad', tema: 'Recepciones', nombre: 'Tiempo de disponibilidad', enInicio: true, filtraPropietario: true,
      formula: 'Horas desde que se confirmó la recepción física hasta que toda la mercadería de esa recepción quedó Aprobada y verificada en una posición de Aprobados (el último lote que quedó disponible). Es la mediana de las recepciones que quedaron disponibles en el periodo.',
      valor: ma, texto: ma === null ? '—' : `${nf(ma)} h`, variacion: variacion(ma, mb, 'horas', etiqAnt),
      sinVariacion: mb === null ? `No hubo recepciones disponibles en ${etiqAnt}.` : undefined,
      detalle: [...porProp].map(([k, v]) => ({ k, m: mediana(v)!, n: v.length })).sort((x, y) => y.n - x.n || x.k.localeCompare(y.k)).map((x) => ({ etiqueta: x.k, valor: `${nf(x.m)} h`, sub: `${x.n} ${x.n === 1 ? 'recepción' : 'recepciones'}` })),
      datos: ma === null ? 'Ninguna recepción quedó disponible en el periodo.' : `Mediana de ${sa.length} recepciones: ${nf(ma)} h (${sb.length} en ${etiqAnt}${mb === null ? '' : `: ${nf(mb)} h`}).`,
      sinDatos: sa.length ? undefined : 'Ninguna recepción quedó disponible en este periodo.', href: `/reportes/recepciones?estado=Cerrada&${q}${prop}`,
    }))
  }

  // 12 · Tiempo en Cuarentena (solo en Reportes)
  {
    const de = (per: Periodo) => {
      const s = d.solicitudes.filter((x) => x.aprobadaEn && x.cerradaEn && enPeriodo(limaDia(x.aprobadaEn), per) && (!cod || x.propietario === cod))
      const dd = s.map((x) => Math.max(0, (Date.parse(x.aprobadaEn!) - Date.parse(x.cerradaEn!)) / 86_400_000))
      return { n: s.length, prom: dd.length ? Math.round((dd.reduce((a, b) => a + b, 0) / dd.length) * 10) / 10 : null }
    }
    const a = de(periodo); const b = de(ant)
    const ahora = p.saldos.filter((s) => s.cantidad > 0 && s.estado === 'CUARENTENA' && filtraSaldo(s))
    out.push(base({
      clave: 'tiempo-cuarentena', tema: 'Calidad', nombre: 'Tiempo en Cuarentena', enInicio: false, filtraPropietario: true,
      formula: 'Promedio de (aprobación de Dirección Técnica − confirmación del ingreso) de los lotes aprobados en el periodo, en días.',
      valor: a.prom, texto: a.prom === null ? '—' : `${nf(a.prom)} días`, variacion: variacion(a.prom, b.prom, 'días', etiqAnt),
      detalle: [{ etiqueta: 'Ahora en Cuarentena', valor: `${new Set(ahora.map((s) => s.loteId)).size} lotes · ${ahora.reduce((n, s) => n + s.cantidad, 0).toLocaleString('es-PE')} u` }],
      datos: `${a.n} ingresos aprobados en el periodo.`, sinDatos: a.n ? undefined : 'Ningún ingreso se aprobó en este periodo.', href: `/reportes/calidad?situacion=En%20Cuarentena${prop}`,
    }))
  }

  // 13 · Ocupación del almacén (Inicio)
  {
    const activas = p.posiciones.filter((x) => x.activa)
    const calc = (saldos: Saldo[]) => {
      const conStock = new Set(saldos.filter((s) => s.cantidad > 0).map((s) => s.posicionId))
      const universo = pid
        ? new Set(p.asignaciones.filter((a) => a.propietarioId === pid && asignacionVigente(a, d.hoy) && posPorId.get(a.posicionId)?.activa).map((a) => a.posicionId))
        : new Set(activas.map((x) => x.id))
      const ocupadas = [...universo].filter((id) => conStock.has(id)).length
      return { ocupadas, total: universo.size, conStock }
    }
    const a = calc(p.saldos); const b = calc(d.saldosAntes)
    const porProp = p.propietarios.map((pr) => {
      const asignadas = new Set(p.asignaciones.filter((x) => x.propietarioId === pr.id && asignacionVigente(x, d.hoy) && posPorId.get(x.posicionId)?.activa).map((x) => x.posicionId))
      const usadas = [...asignadas].filter((id) => a.conStock.has(id)).length
      return { cod: pr.codigo, asignadas: asignadas.size, usadas }
    }).filter((x) => x.asignadas > 0).sort((x, y) => y.asignadas - x.asignadas)
    out.push(base({
      clave: 'ocupacion', tema: 'Inventario', nombre: 'Ocupación del almacén', enInicio: false, filtraPropietario: true,
      formula: pid ? 'Ubicaciones asignadas a este propietario con stock ÷ ubicaciones asignadas vigentes.' : 'Ubicaciones activas con stock ÷ ubicaciones activas.',
      valor: razon(a.ocupadas, a.total), texto: a.total ? pct(razon(a.ocupadas, a.total)!) : '—', variacion: variacion(razon(a.ocupadas, a.total), razon(b.ocupadas, b.total), 'puntos', etiqHace),
      detalle: porProp.slice(0, 6).map((x) => ({ etiqueta: x.cod, valor: `${razon(x.usadas, x.asignadas)?.toLocaleString('es-PE') ?? 0} % (${x.usadas} de ${x.asignadas})` })),
      datos: `${a.ocupadas} de ${a.total} ubicaciones tienen stock. Hace ${periodo.dias} días: ${b.ocupadas} de ${b.total}.`, href: `/reportes/ocupacion${prop ? `?${prop.slice(1)}` : ''}`, sinDatos: a.total ? undefined : 'No hay ubicaciones para medir.',
    }))
  }

  // 14 · Cumplimiento de la revisión diaria
  {
    const laborables = (per: Periodo) => { let n = 0; for (let x = per.desde; x <= per.hasta && x <= d.hoy; x = sumarDiasISO(x, 1)) { const dow = new Date(`${x}T12:00:00Z`).getUTCDay(); if (dow >= 1 && dow <= 5) n += 1 } return n }
    const cerradas = (per: Periodo) => d.revisiones.filter((r) => r.estado === 'CERRADA' && enPeriodo(r.fecha, per)).length
    const a = { c: cerradas(periodo), l: laborables(periodo) }; const b = { c: cerradas(ant), l: laborables(ant) }
    out.push(base({
      clave: 'revision-diaria', tema: 'Operación diaria', nombre: 'Cumplimiento de la revisión diaria', enInicio: false, filtraPropietario: false,
      formula: 'Días de trabajo (lunes a viernes) con la revisión diaria cerrada ÷ días de trabajo del periodo.',
      valor: razon(a.c, a.l), texto: a.l ? pct(razon(a.c, a.l)!) : '—', variacion: variacion(razon(a.c, a.l), razon(b.c, b.l), 'puntos', etiqAnt),
      datos: `${a.c} revisiones cerradas en ${a.l} días de trabajo.`, href: '/revision-diaria', sinDatos: a.l ? undefined : 'Sin días de trabajo en este periodo.',
    }))
  }

  // 15 · Pendientes de la revisión
  {
    const vivos = d.pendientes.filter((x) => x.estado !== 'VERIFICADO')
    const importantes = vivos.filter((x) => x.critico || x.afectaProducto).length
    out.push(base({
      clave: 'pendientes', tema: 'Operación diaria', nombre: 'Pendientes de la revisión', enInicio: false, filtraPropietario: false,
      formula: 'Pendientes abiertos o resueltos que el Jefe todavía no verificó; aparte, los críticos o que pueden afectar producto.',
      valor: vivos.length, texto: `${vivos.length} ${vivos.length === 1 ? 'pendiente' : 'pendientes'}`, sinVariacion: sinHistorial,
      detalle: [{ etiqueta: 'Críticos o que afectan producto', valor: `${importantes}` }, { etiqueta: 'Resueltos, por verificar', valor: `${vivos.filter((x) => x.estado === 'RESUELTO').length}` }],
      datos: `${vivos.length} pendientes vivos, ${importantes} importantes.`, href: '/revision-diaria',
    }))
  }

  // 16 · Ajustes de inventario
  {
    const de = (per: Periodo) => d.ajustes.filter((x) => x.estado === 'AUTORIZADO' && x.decididoEn && enPeriodo(limaDia(x.decididoEn), per))
    const a = de(periodo); const b = de(ant)
    const aum = a.filter((x) => x.delta > 0).reduce((n, x) => n + x.delta, 0); const dis = a.filter((x) => x.delta < 0).reduce((n, x) => n + x.delta, 0)
    out.push(base({
      clave: 'ajustes', tema: 'Inventario', nombre: 'Ajustes de inventario', enInicio: false, filtraPropietario: false,
      formula: 'Ajustes autorizados por Dirección Técnica en el periodo y sus unidades (aumentos y disminuciones por separado).',
      valor: a.length, texto: `${a.length} ${a.length === 1 ? 'ajuste' : 'ajustes'}`, variacion: variacion(a.length, b.length, 'ajustes', etiqAnt, 0),
      detalle: [{ etiqueta: 'Aumentos', valor: `+${aum.toLocaleString('es-PE')} u` }, { etiqueta: 'Disminuciones', valor: `${dis.toLocaleString('es-PE')} u` }],
      datos: `${a.length} ajustes autorizados (${b.length} en ${etiqAnt}).`, href: '/conteos',
    }))
  }

  // 17 · Alertas abiertas
  {
    const abiertasAl = (corte: number) => d.alertas.filter((x) => Date.parse(x.creadaEn) <= corte && (x.estado === 'ABIERTA' || !x.atendidaEn || Date.parse(x.atendidaEn) > corte) && !(x.estado === 'ATENDIDA' && !x.atendidaEn))
    const ahora = o.ahora === undefined ? d.alertas.filter((x) => x.estado === 'ABIERTA') : abiertasAl(ahoraMs)
    const antes = abiertasAl(finDelDia(sumarDiasISO(periodo.desde, -1)))
    const porTipo = new Map<string, number>(); for (const x of ahora) porTipo.set(x.tipo, (porTipo.get(x.tipo) ?? 0) + 1)
    out.push(base({
      clave: 'alertas', tema: 'Operación diaria', nombre: 'Alertas abiertas', enInicio: false, filtraPropietario: false,
      formula: 'Alertas del sistema que nadie atendió todavía, por tipo.',
      valor: ahora.length, texto: `${ahora.length} ${ahora.length === 1 ? 'alerta' : 'alertas'}`, variacion: variacion(ahora.length, antes.length, 'alertas', etiqHace, 0),
      detalle: [...porTipo].sort((x, y) => y[1] - x[1]).slice(0, 5).map(([k, v]) => ({ etiqueta: ETIQUETA_ALERTA[k as TipoAlerta] ?? k, valor: `${v}` })),
      datos: `${ahora.length} alertas abiertas ahora; ${antes.length} hace ${periodo.dias} días.`, href: '/alertas',
    }))
  }

  return out.map((k) => ({ ...k, variacion: juzgar(k.variacion, k.masEsMejor) }))
}

/** Los 3 indicadores de Inicio, en su orden. */
export const CLAVES_INICIO = ['exactitud', 'vencimientos', 'disponibilidad'] as const

// ── Despacho: previsto para cuando existan las salidas ──────────────────────

export interface IndicadorPrevisto { clave: string; nombre: string; definicion: string; formula: string }
/** Estos cuatro se agregan cuando existan las salidas (despacho). El diseño de Inicio y de Indicadores ya tiene su lugar. */
export const DESPACHO_PREVISTO: IndicadorPrevisto[] = [
  { clave: 'otif', nombre: 'OTIF', definicion: 'Pedidos entregados a tiempo y completos.', formula: 'Pedidos despachados en la fecha comprometida y con todas sus unidades ÷ pedidos despachados.' },
  { clave: 'nivel-servicio', nombre: 'Nivel de servicio', definicion: 'Qué parte de lo pedido se despacha.', formula: 'Unidades despachadas ÷ unidades pedidas.' },
  { clave: 'exactitud-despacho', nombre: 'Exactitud de despacho', definicion: 'Pedidos despachados sin errores de producto, lote o cantidad.', formula: 'Pedidos sin errores de producto, lote o cantidad ÷ pedidos despachados.' },
  { clave: 'tiempo-preparacion', nombre: 'Tiempo de preparación', definicion: 'Cuánto tarda un pedido desde que se recibe hasta que se despacha.', formula: 'Promedio de (despacho − recepción del pedido), en horas.' },
]

// ── Tiempo de disponibilidad (dock-to-stock) ────────────────────────────────

export interface TiempoDisponibilidad { solicitudId: string; numero: string; propietario: string; confirmadaEn: string; disponibleEn: string; horas: number }

/**
 * Por cada recepción confirmada y aprobada por Dirección Técnica: cuántas horas pasaron hasta que TODA su mercadería quedó Aprobada y verificada
 * en una posición de Aprobados. Un lote queda disponible cuando una persona distinta de quien lo movió verificó (CONFIRMADA) un movimiento que lo deja
 * en un área de Aprobados, estando ya aprobado, y después de la aprobación. La recepción queda disponible con su último lote. Si algún lote
 * todavía no está en Aprobados, la recepción no entra (no hay una hora para medir).
 */
export function tiemposDeDisponibilidad(
  solicitudes: Pick<SolicitudResumen, 'id' | 'numero' | 'propietario' | 'confirmadaEn' | 'aprobadaEn' | 'lotes'>[],
  ordenes: OrdenMovimiento[],
  posiciones: Map<string, { tipoArea: string }>,
): TiempoDisponibilidad[] {
  // para cada (producto, lote): las verificaciones que lo dejaron en Aprobados
  const llegadas = new Map<string, number[]>()
  for (const o of ordenes) {
    if (o.estado === 'ANULADO' || !o.verificadoEn) continue
    const ts = Date.parse(o.verificadoEn)
    for (const l of o.lineas) {
      if (l.verificacion !== 'CONFIRMADA' || l.estado !== 'APROBADO' || posiciones.get(l.haciaPosicionId)?.tipoArea !== 'APROBADOS') continue
      const k = `${l.productoId}|${l.lote}`
      llegadas.set(k, [...(llegadas.get(k) ?? []), ts])
    }
  }
  const out: TiempoDisponibilidad[] = []
  for (const s of solicitudes) {
    if (!s.confirmadaEn || !s.aprobadaEn || !s.lotes?.length) continue
    const conf = Date.parse(s.confirmadaEn); const aprob = Date.parse(s.aprobadaEn)
    let ultimo = 0; let completa = true
    for (const l of s.lotes) {
      const primera = (llegadas.get(`${l.productoId}|${l.lote}`) ?? []).filter((ts) => ts >= aprob).sort((a, b) => a - b)[0]
      if (primera === undefined) { completa = false; break }
      ultimo = Math.max(ultimo, primera)
    }
    if (!completa || ultimo < conf) continue
    out.push({ solicitudId: s.id, numero: s.numero, propietario: s.propietario, confirmadaEn: s.confirmadaEn, disponibleEn: new Date(ultimo).toISOString(), horas: Math.round(((ultimo - conf) / 3_600_000) * 10) / 10 })
  }
  return out
}

// ── Tendencia de 30 días ────────────────────────────────────────────────────

/** Los días de la tendencia: de hace 30 días a hoy, cada 3 días (11 puntos). */
export function diasDeSerie(hoy: string): string[] {
  const out: string[] = []
  for (let atras = 30; atras >= 0; atras -= 3) out.push(sumarDiasISO(hoy, -atras))
  return out
}

/** Indicadores que no se pueden reconstruir hacia atrás (dependen del estado de hoy y no guardan su historia): no llevan tendencia. */
const SIN_SERIE = new Set(['cobertura', 'pendientes'])

/**
 * Agrega a cada indicador su tendencia: el mismo cálculo, con la misma ventana del periodo, terminando en cada día de `diasDeSerie`.
 * `saldosPorDia` trae cómo era el stock al final de cada uno de esos días (el libro mayor); los indicadores de stock lo usan.
 */
export function conSeries(indicadores: Indicador[], d: DatosIndicadores, periodo: Periodo, o: OpcionesIndicadores, saldosPorDia: Map<string, Saldo[]>): Indicador[] {
  const dias = diasDeSerie(d.hoy)
  const porClave = new Map<string, PuntoSerie[]>()
  for (const dia of dias) {
    const saldos = dia === d.hoy ? d.panorama.saldos : saldosPorDia.get(dia)
    const dd: DatosIndicadores = { ...d, hoy: dia, panorama: { ...d.panorama, hoy: dia, saldos: saldos ?? d.panorama.saldos }, saldosAntes: [] }
    for (const k of calcularIndicadores(dd, periodoDe(dia, periodo.dias), { ...o, ahora: dia === d.hoy ? o.ahora : finDelDia(dia) })) {
      porClave.set(k.clave, [...(porClave.get(k.clave) ?? []), { dia, valor: k.sinDatos ? null : k.valor }])
    }
  }
  return indicadores.map((k) => (SIN_SERIE.has(k.clave) ? k : { ...k, serie: porClave.get(k.clave) }))
}
