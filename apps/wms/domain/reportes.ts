// Reportes del WMS (Batch 3b): inventario, ocupación por propietario, recepciones, calidad, movimientos, exactitud y auditoría.
// Cada reporte es una definición (columnas y filtros) más una función pura que arma sus filas. Los filtros, las vistas guardadas y la exportación
// (CSV y Excel) son los mismos para todos; el teléfono muestra cada fila como una tarjeta, no como una tabla.
import { normalizar } from './busqueda'
import { ETIQUETA_ESTADO } from './estados'
import { ETIQUETA_ESTADO_SOLICITUD, ETIQUETA_TIPO_INGRESO } from './entradas'
import { ETIQUETA_DIFERENCIA_RECEPCION, type SolicitudResumen } from './entradas-vistas'
import { ETIQUETA_ESTADO_ORDEN, ETIQUETA_VERIFICACION_LINEA, type OrdenMovimiento, type ReporteVista } from './inventario'
import type { FilaExactitud } from './operacion'
import { exactitudDeFilas } from './operacion'
import { filasDeStock, type Panorama } from './panorama'
import { puede } from './permisos'
import type { EventoAuditoria, Rol } from './tipos'
import { asignacionVigente, AREAS_COMPARTIDAS, ETIQUETA_AREA } from './zonas'

export type IdReporte = ReporteVista
export type Valor = string | number | null
export type FilaReporte = Record<string, Valor>

export interface Columna {
  clave: string
  etiqueta: string
  tipo?: 'texto' | 'numero' | 'fecha' | 'porcentaje'
  /** Se suma en el pie del reporte. */
  suma?: boolean
  /** Lo que identifica la fila en la tarjeta del teléfono. */
  titulo?: boolean
  /** A dónde lleva el valor (por ejemplo, del lote a su Kardex). */
  enlace?: (f: FilaReporte) => string | null
}

/** Una fila compacta para el teléfono (sin desplazamiento horizontal): título, un par de líneas y un valor al final. */
export interface FilaMovil { titulo: string; lineas: string[]; fin?: string; aviso?: string; enlace?: string }

export type FiltroDef =
  | { clave: string; etiqueta: string; tipo: 'texto'; /** Solo busca en estas columnas (por defecto, en todas). */ campos?: string[] }
  | { clave: string; etiqueta: string; tipo: 'seleccion'; campo: string; /** No se dibuja como control (lo maneja otra parte de la pantalla). */ oculto?: boolean }
  | { clave: string; etiqueta: string; tipo: 'desde' | 'hasta'; campo: string }
  /** Número máximo (por ejemplo, días para vencer hasta 90). */
  | { clave: string; etiqueta: string; tipo: 'maximo'; campo: string }

export interface DefinicionReporte {
  id: IdReporte
  titulo: string
  descripcion: string
  columnas: Columna[]
  filtros: FiltroDef[]
  /** Para qué sirve y con qué frecuencia mirarlo (se muestra bajo el título). */
  uso: string
  /** Orden con que abre el reporte (por defecto, el de las filas tal como llegan). */
  ordenInicial?: Orden
  /** Cómo se ve cada fila en el teléfono; si falta, una tarjeta con todos los campos. */
  movil?: (f: FilaReporte) => FilaMovil
}
export interface Orden { clave: string; asc: boolean }

const texto = (clave: string, etiqueta: string, opciones: Partial<Columna> = {}): Columna => ({ clave, etiqueta, tipo: 'texto', ...opciones })
const numero = (clave: string, etiqueta: string, opciones: Partial<Columna> = {}): Columna => ({ clave, etiqueta, tipo: 'numero', ...opciones })
const fecha = (clave: string, etiqueta: string): Columna => ({ clave, etiqueta, tipo: 'fecha' })
const buscar: FiltroDef = { clave: 'q', etiqueta: 'Buscar', tipo: 'texto' }

export const REPORTES: Record<IdReporte, DefinicionReporte> = {
  VENCIMIENTOS: {
    id: 'VENCIMIENTOS', titulo: 'Vencimientos', descripcion: 'Una fila por lote y ubicación, de lo que ya venció a lo que vence más tarde. No incluye lo que está en Bajas/Rechazados.', uso: 'Para actuar a tiempo sobre lo que vence. Se mira a diario.',
    ordenInicial: { clave: 'dias', asc: true },
    columnas: [texto('producto', 'Producto', { titulo: true }), texto('codigo', 'Código'), { ...texto('lote', 'Lote'), enlace: (f) => (f.productoId && f.loteId ? `/kardex?producto=${f.productoId}&lote=${f.loteId}` : null) }, fecha('vence', 'Vence'), numero('dias', 'Días para vencer'), texto('tramo', 'Tramo'), texto('propietario', 'Propietario'), texto('ubicacion', 'Ubicación'), texto('estado', 'Estado sanitario'), numero('cantidad', 'Unidades', { suma: true })],
    filtros: [
      { clave: 'tramo', etiqueta: 'Tramo', tipo: 'seleccion', campo: 'tramo', oculto: true },
      { clave: 'diasHasta', etiqueta: 'Vence en (días) hasta', tipo: 'maximo', campo: 'dias' },
      { clave: 'propietario', etiqueta: 'Propietario', tipo: 'seleccion', campo: 'propietario' },
      { clave: 'estado', etiqueta: 'Estado sanitario', tipo: 'seleccion', campo: 'estado' },
      { clave: 'producto', etiqueta: 'Producto', tipo: 'texto', campos: ['producto', 'codigo'] },
      { clave: 'ubicacion', etiqueta: 'Ubicación', tipo: 'texto', campos: ['ubicacion'] },
      buscar,
    ],
    movil: (f) => ({
      titulo: String(f.producto), lineas: [`Lote ${f.lote} · ${f.ubicacion}`, textoVence(f.dias === null ? null : Number(f.dias), String(f.vence ?? ''))], fin: `${Number(f.cantidad).toLocaleString('es-PE')} u`,
      aviso: f.tramo === TRAMO_VENCIDO ? 'Vencido' : undefined, enlace: f.productoId && f.loteId ? `/kardex?producto=${f.productoId}&lote=${f.loteId}` : undefined,
    }),
  },
  INVENTARIO: {
    id: 'INVENTARIO', titulo: 'Inventario', descripcion: 'Qué hay, dónde está, de quién es y en qué estado.', uso: 'Para saber cuánto stock hay de cada producto y lote. Se mira a diario.',
    columnas: [texto('producto', 'Producto', { titulo: true }), texto('lote', 'Lote'), fecha('vence', 'Vence'), texto('propietario', 'Propietario'), texto('ubicacion', 'Ubicación'), texto('area', 'Área'), texto('estado', 'Estado'), numero('cantidad', 'Unidades', { suma: true })],
    filtros: [buscar, { clave: 'propietario', etiqueta: 'Propietario', tipo: 'seleccion', campo: 'propietario' }, { clave: 'estado', etiqueta: 'Estado', tipo: 'seleccion', campo: 'estado' }, { clave: 'area', etiqueta: 'Área', tipo: 'seleccion', campo: 'area' }, { clave: 'venceHasta', etiqueta: 'Vence hasta', tipo: 'hasta', campo: 'vence' }],
  },
  OCUPACION: {
    id: 'OCUPACION', titulo: 'Ocupación por propietario', descripcion: 'Cuántas ubicaciones tiene asignadas cada propietario y cuántas usa.', uso: 'Para ver si el espacio de cada propietario alcanza o sobra. Se mira cada semana.',
    columnas: [texto('propietario', 'Propietario', { titulo: true }), numero('asignadas', 'Ubicaciones asignadas', { suma: true }), numero('conStock', 'Con stock', { suma: true }), numero('libres', 'Libres', { suma: true }), { clave: 'ocupacion', etiqueta: 'Ocupación', tipo: 'porcentaje' }, numero('unidades', 'Unidades', { suma: true }), numero('unidadesCompartidas', 'En áreas compartidas', { suma: true })],
    filtros: [buscar, { clave: 'propietario', etiqueta: 'Propietario', tipo: 'seleccion', campo: 'propietario' }],
  },
  RECEPCIONES: {
    id: 'RECEPCIONES', titulo: 'Recepciones', descripcion: 'Las solicitudes de ingreso y su avance.', uso: 'Para seguir lo que llega y lo que falta cerrar. Se mira a diario.',
    columnas: [texto('numero', 'Solicitud', { titulo: true }), fecha('fecha', 'Creada'), fecha('confirmada', 'Recepción confirmada'), texto('tipo', 'Tipo'), texto('propietario', 'Propietario'), texto('contraparte', 'Proveedor o cliente'), texto('referencia', 'Referencia'), texto('estado', 'Estado'), texto('acta', 'Acta'), numero('productos', 'Productos', { suma: true }), numero('unidades', 'Unidades', { suma: true }), texto('diferencias', 'Con diferencia'), texto('tiposDif', 'Tipo de diferencia')],
    filtros: [buscar, { clave: 'tipo', etiqueta: 'Tipo', tipo: 'seleccion', campo: 'tipo' }, { clave: 'estado', etiqueta: 'Estado', tipo: 'seleccion', campo: 'estado' }, { clave: 'diferencias', etiqueta: 'Con diferencia', tipo: 'seleccion', campo: 'diferencias' }, { clave: 'propietario', etiqueta: 'Propietario', tipo: 'seleccion', campo: 'propietario' }, { clave: 'desde', etiqueta: 'Confirmada desde', tipo: 'desde', campo: 'confirmada' }, { clave: 'hasta', etiqueta: 'Confirmada hasta', tipo: 'hasta', campo: 'confirmada' }],
  },
  CALIDAD: {
    id: 'CALIDAD', titulo: 'Calidad', descripcion: 'Lo que pide atención de calidad: Cuarentena, dados de baja, por trasladar y lotes vencidos o por vencer.', uso: 'Para que ningún lote quede olvidado en Cuarentena ni venza sin aviso. Se mira a diario.',
    columnas: [texto('producto', 'Producto', { titulo: true }), texto('lote', 'Lote'), fecha('vence', 'Vence'), numero('dias', 'Días para vencer'), texto('propietario', 'Propietario'), texto('ubicacion', 'Ubicación'), texto('estado', 'Estado'), texto('situacion', 'Situación'), numero('cantidad', 'Unidades', { suma: true })],
    filtros: [buscar, { clave: 'situacion', etiqueta: 'Situación', tipo: 'seleccion', campo: 'situacion' }, { clave: 'propietario', etiqueta: 'Propietario', tipo: 'seleccion', campo: 'propietario' }],
  },
  MOVIMIENTOS: {
    id: 'MOVIMIENTOS', titulo: 'Movimientos', descripcion: 'Cada línea de cada movimiento interno, con quién lo ejecutó y quién lo verificó.', uso: 'Para revisar quién movió qué y qué quedó sin verificar. Se mira a diario.',
    columnas: [texto('numero', 'Movimiento', { titulo: true }), fecha('fecha', 'Fecha'), texto('ejecutor', 'Ejecutado por'), texto('verificador', 'Verificado por'), texto('estado', 'Estado'), texto('producto', 'Producto'), texto('lote', 'Lote'), texto('propietario', 'Propietario'), texto('desde', 'Desde'), texto('hacia', 'Hacia'), numero('cantidad', 'Unidades', { suma: true })],
    filtros: [buscar, { clave: 'estado', etiqueta: 'Estado de la línea', tipo: 'seleccion', campo: 'estado' }, { clave: 'propietario', etiqueta: 'Propietario', tipo: 'seleccion', campo: 'propietario' }, { clave: 'desde', etiqueta: 'Desde', tipo: 'desde', campo: 'fecha' }, { clave: 'hasta', etiqueta: 'Hasta', tipo: 'hasta', campo: 'fecha' }],
  },
  EXACTITUD: {
    id: 'EXACTITUD', titulo: 'Exactitud del inventario', descripcion: 'Qué tan bien coincide lo que dice el sistema con lo que se cuenta, en los conteos cerrados.', uso: 'Para saber si el inventario es confiable. Se mira cada semana.',
    columnas: [texto('conteo', 'Conteo', { titulo: true }), fecha('cerrado', 'Cerrado'), texto('ubicacion', 'Ubicación'), texto('producto', 'Producto'), texto('lote', 'Lote'), texto('propietario', 'Propietario'), numero('sistema', 'Sistema', { suma: true }), numero('primero', 'Primer conteo'), numero('contado', 'Contado final', { suma: true }), numero('diferencia', 'Diferencia'), texto('resultado', 'Resultado'), texto('causa', 'Causa')],
    filtros: [buscar, { clave: 'diferencia', etiqueta: 'Diferencia', tipo: 'seleccion', campo: 'conDiferencia' }, { clave: 'propietario', etiqueta: 'Propietario', tipo: 'seleccion', campo: 'propietario' }, { clave: 'desde', etiqueta: 'Desde', tipo: 'desde', campo: 'cerrado' }, { clave: 'hasta', etiqueta: 'Hasta', tipo: 'hasta', campo: 'cerrado' }],
  },
  AUDITORIA: {
    id: 'AUDITORIA', titulo: 'Auditoría', descripcion: 'Quién hizo qué, cuándo y por qué. Nada se edita ni se borra.', uso: 'Para revisar cambios sensibles. Se mira cuando hace falta o en cada auditoría.',
    columnas: [fecha('fecha', 'Fecha'), texto('hora', 'Hora'), texto('actor', 'Quién', { titulo: true }), texto('evento', 'Qué'), texto('entidad', 'Sobre'), texto('referencia', 'Referencia'), texto('motivo', 'Motivo')],
    filtros: [buscar, { clave: 'entidad', etiqueta: 'Sobre', tipo: 'seleccion', campo: 'entidad' }, { clave: 'desde', etiqueta: 'Desde', tipo: 'desde', campo: 'fecha' }, { clave: 'hasta', etiqueta: 'Hasta', tipo: 'hasta', campo: 'fecha' }],
  },
}
export const ORDEN_REPORTES: IdReporte[] = ['VENCIMIENTOS', 'INVENTARIO', 'OCUPACION', 'RECEPCIONES', 'CALIDAD', 'MOVIMIENTOS', 'EXACTITUD', 'AUDITORIA']
export const esIdReporte = (x: string): x is IdReporte => x in REPORTES

const GESTION: Rol[] = ['jefe_almacen', 'reemplazo_jefe', 'direccion_tecnica', 'admin_wms', 'auditoria_lectura']
/** Quién puede abrir cada reporte (la base de datos vuelve a comprobarlo en la exactitud). */
export function puedeVerReporte(id: IdReporte, roles: readonly Rol[]): boolean {
  if (roles.length === 0) return false
  if (id === 'EXACTITUD') return roles.some((r) => GESTION.includes(r))
  if (id === 'AUDITORIA') return puede(roles, 'auditar')
  return true
}

// ── Cómo se arma cada reporte ───────────────────────────────────────────────

const dia = (iso: string) => iso.slice(0, 10)
const limaDia = (ts: string) => new Date(ts).toLocaleDateString('en-CA', { timeZone: 'America/Lima' })
const limaHora = (ts: string) => new Date(ts).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Lima' })
const diasEntre = (desde: string, hasta: string) => Math.round((Date.parse(`${hasta}T12:00:00Z`) - Date.parse(`${desde}T12:00:00Z`)) / 86_400_000)
export const DIAS_ALERTA_VENCIMIENTO = 90


// ── Vencimientos: tramos configurables (por defecto 3, 6 y 12 meses) ────────

export const TRAMO_VENCIDO = 'Vencido'
export const TRAMO_SIN_FECHA = 'Sin fecha'
const mesesDe = (dias: number): number | null => (dias === 365 ? 12 : dias % 30 === 0 ? dias / 30 : null)

/** Las etiquetas de los tramos, en orden: «Vencido», «0–3 meses», «3–6 meses», «6–12 meses», «Más de 12 meses» y «Sin fecha». */
export function etiquetasTramos(tramosDias: number[]): string[] {
  const enMeses = tramosDias.every((t) => t >= 90 && mesesDe(t) !== null)
  const u = (n: number) => (enMeses ? `${mesesDe(n)}` : `${n}`)
  const unidad = enMeses ? 'meses' : 'días'
  const out = [TRAMO_VENCIDO]
  let previo: number | null = null
  for (const t of tramosDias) { out.push(previo === null ? `0–${u(t)} ${unidad}` : `${u(previo)}–${u(t)} ${unidad}`); previo = t }
  out.push(`Más de ${u(previo ?? 0)} ${unidad}`, TRAMO_SIN_FECHA)
  return out
}

export function tramoDeDias(dias: number | null, tramosDias: number[], etiquetas: string[] = etiquetasTramos(tramosDias)): string {
  if (dias === null) return TRAMO_SIN_FECHA
  if (dias < 0) return TRAMO_VENCIDO
  const i = tramosDias.findIndex((t) => dias <= t)
  return etiquetas[1 + (i === -1 ? tramosDias.length : i)]
}

export const textoVence = (dias: number | null, vence?: string): string => {
  if (dias === null) return 'Sin fecha de vencimiento'
  if (dias < 0) return `Vencido hace ${Math.abs(dias)} ${Math.abs(dias) === 1 ? 'día' : 'días'}`
  if (dias === 0) return 'Vence hoy'
  return `Vence en ${dias} ${dias === 1 ? 'día' : 'días'}${vence ? ` (${valorTexto({ clave: 'v', etiqueta: '', tipo: 'fecha' }, vence)})` : ''}`
}

export function filasVencimientos(p: Panorama, tramosDias: number[]): FilaReporte[] {
  const etiquetas = etiquetasTramos(tramosDias)
  return filasDeStock(p).filter((f) => f.saldo.cantidad > 0 && f.saldo.estado !== 'BAJAS_RECHAZADOS').map((f): FilaReporte => {
    const dias = f.lote.vence ? diasEntre(p.hoy, f.lote.vence) : null
    return {
      producto: f.producto.descripcion, codigo: f.producto.codigo, lote: f.lote.codigo, vence: f.lote.vence ?? null, dias, tramo: tramoDeDias(dias, tramosDias, etiquetas), propietario: f.propietario.codigo,
      ubicacion: f.posicion.codigo, estado: ETIQUETA_ESTADO[f.saldo.estado], cantidad: f.saldo.cantidad, productoId: f.producto.id, loteId: f.lote.id,
    }
  })
}

export interface ChipTramo { tramo: string; lotes: number; unidades: number }
/** Total de lotes y unidades por tramo, en el orden de los tramos (un lote en varias ubicaciones cuenta una vez). */
export function totalesPorTramo(filas: FilaReporte[], orden: string[]): ChipTramo[] {
  return orden.map((tramo) => {
    const de = filas.filter((f) => f.tramo === tramo)
    return { tramo, lotes: new Set(de.map((f) => `${f.productoId}|${f.loteId}`)).size, unidades: de.reduce((n, f) => n + (Number(f.cantidad) || 0), 0) }
  })
}

export function filasInventario(p: Panorama): FilaReporte[] {
  return filasDeStock(p).filter((f) => f.saldo.cantidad > 0).map((f) => ({
    producto: `${f.producto.codigo} · ${f.producto.descripcion}`, lote: f.lote.codigo, vence: f.lote.vence ?? null, propietario: f.propietario.codigo, ubicacion: f.posicion.codigo,
    area: ETIQUETA_AREA[f.posicion.tipoArea], estado: ETIQUETA_ESTADO[f.saldo.estado], cantidad: f.saldo.cantidad,
  })).sort((a, b) => String(a.producto).localeCompare(String(b.producto), 'es') || String(a.vence ?? '9999').localeCompare(String(b.vence ?? '9999')) || String(a.ubicacion).localeCompare(String(b.ubicacion), 'es', { numeric: true }))
}

export function filasOcupacion(p: Panorama): FilaReporte[] {
  const conStock = new Map<string, number>()
  for (const s of p.saldos) if (s.cantidad > 0) conStock.set(s.posicionId, (conStock.get(s.posicionId) ?? 0) + s.cantidad)
  const pos = new Map(p.posiciones.map((x) => [x.id, x]))
  return p.propietarios.map((o): FilaReporte => {
    const asignadas = new Set(p.asignaciones.filter((a) => a.propietarioId === o.id && asignacionVigente(a, p.hoy) && pos.get(a.posicionId)?.activa).map((a) => a.posicionId))
    const usadas = [...asignadas].filter((id) => conStock.has(id)).length
    const unidades = p.saldos.filter((s) => s.propietarioId === o.id && s.cantidad > 0 && asignadas.has(s.posicionId)).reduce((n, s) => n + s.cantidad, 0)
    const compartidas = p.saldos.filter((s) => s.propietarioId === o.id && s.cantidad > 0 && AREAS_COMPARTIDAS.has(pos.get(s.posicionId)?.tipoArea as never)).reduce((n, s) => n + s.cantidad, 0)
    return { propietario: o.codigo, asignadas: asignadas.size, conStock: usadas, libres: asignadas.size - usadas, ocupacion: asignadas.size ? Math.round((usadas / asignadas.size) * 1000) / 10 : null, unidades, unidadesCompartidas: compartidas }
  }).filter((f) => Number(f.asignadas) > 0 || Number(f.unidadesCompartidas) > 0).sort((a, b) => String(a.propietario).localeCompare(String(b.propietario), 'es'))
}

export function filasRecepciones(sols: SolicitudResumen[]): FilaReporte[] {
  return sols.map((s) => ({
    numero: s.numero, fecha: dia(s.creadoEn), tipo: ETIQUETA_TIPO_INGRESO[s.tipo], propietario: s.propietario, contraparte: s.contraparte ?? null, referencia: s.referencia ?? null,
    estado: ETIQUETA_ESTADO_SOLICITUD[s.estado], acta: s.actaNumero ?? null, productos: s.productos, unidades: s.unidades, diferencias: s.conDiferencias ? 'Sí' : 'No',
    confirmada: s.confirmadaEn ? limaDia(s.confirmadaEn) : null, tiposDif: s.tiposDiferencia.length ? s.tiposDiferencia.map((t) => ETIQUETA_DIFERENCIA_RECEPCION[t]).join(', ') : null,
  })).sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)) || String(b.numero).localeCompare(String(a.numero)))
}

export function filasCalidad(p: Panorama): FilaReporte[] {
  const out: FilaReporte[] = []
  for (const f of filasDeStock(p)) {
    if (f.saldo.cantidad <= 0) continue
    const dias = f.lote.vence ? diasEntre(p.hoy, f.lote.vence) : null
    let situacion: string | null = null
    if (dias !== null && dias < 0) situacion = 'Vencido'
    else if (f.saldo.estado === 'CUARENTENA') situacion = 'En Cuarentena'
    else if (f.saldo.estado === 'BAJAS_RECHAZADOS') situacion = 'Dado de baja'
    else if (f.saldo.estado === 'APROBADO' && (f.posicion.tipoArea === 'CUARENTENA' || f.posicion.tipoArea === 'RECEPCION')) situacion = 'Aprobado, por trasladar'
    else if (dias !== null && dias <= DIAS_ALERTA_VENCIMIENTO) situacion = `Vence en ${DIAS_ALERTA_VENCIMIENTO} días o menos`
    if (!situacion) continue
    out.push({ producto: `${f.producto.codigo} · ${f.producto.descripcion}`, lote: f.lote.codigo, vence: f.lote.vence ?? null, dias, propietario: f.propietario.codigo, ubicacion: f.posicion.codigo, estado: ETIQUETA_ESTADO[f.saldo.estado], situacion, cantidad: f.saldo.cantidad })
  }
  return out.sort((a, b) => String(a.situacion).localeCompare(String(b.situacion), 'es') || Number(a.dias ?? 99999) - Number(b.dias ?? 99999))
}

export function filasMovimientos(ordenes: OrdenMovimiento[]): FilaReporte[] {
  return ordenes.flatMap((o) => o.lineas.map((l): FilaReporte => ({
    numero: o.numero, fecha: limaDia(o.ejecutadoEn), ejecutor: o.ejecutor, verificador: o.verificador ?? null,
    estado: o.estado === 'ANULADO' ? ETIQUETA_ESTADO_ORDEN.ANULADO : ETIQUETA_VERIFICACION_LINEA[l.verificacion], producto: l.producto, lote: l.lote, propietario: l.propietario, desde: l.desde, hacia: l.hacia, cantidad: l.cantidad,
  }))).sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)) || String(b.numero).localeCompare(String(a.numero)))
}

export function filasExactitud(filas: FilaExactitud[]): FilaReporte[] {
  return filas.map((f) => ({
    conteo: f.conteo, cerrado: limaDia(f.cerradoEn), ubicacion: f.posicion, producto: f.producto, lote: f.lote, propietario: f.propietario, sistema: f.cantidadSistema, primero: f.primerConteo, contado: f.cantidadContada,
    diferencia: f.diferencia, resultado: f.resultado || null, causa: f.causa ?? null, conDiferencia: f.diferencia === 0 ? 'Sin diferencia' : 'Con diferencia',
  }))
}

export function filasAuditoria(eventos: EventoAuditoria[]): FilaReporte[] {
  return eventos.map((e) => ({ fecha: limaDia(e.ts), hora: limaHora(e.ts), actor: e.actor, evento: e.detalle ?? e.evento, entidad: e.entidad, referencia: e.entidadId ?? null, motivo: e.motivo ?? null }))
}

// ── Filtros, resumen y exportación (iguales para todos los reportes) ────────

export type Filtros = Record<string, string>

/** Aplica los filtros: texto (sin tildes ni mayúsculas, en cualquier columna), selección exacta y rangos de fecha. */
export function aplicarFiltros(def: DefinicionReporte, filas: FilaReporte[], filtros: Filtros): FilaReporte[] {
  return filas.filter((f) => def.filtros.every((d) => {
    const v = (filtros[d.clave] ?? '').trim()
    if (!v) return true
    if (d.tipo === 'texto') return normalizar((d.campos ? d.campos.map((c) => f[c]) : Object.values(f)).filter((x) => x !== null && x !== undefined).join(' ')).includes(normalizar(v))
    const campo = f[d.campo]
    if (d.tipo === 'seleccion') return String(campo ?? '') === v
    if (campo === null || campo === undefined || campo === '') return false
    if (d.tipo === 'maximo') return Number(campo) <= Number(v)
    return d.tipo === 'desde' ? String(campo) >= v : String(campo) <= v
  }))
}

/** Ordena por una columna; lo que no tiene valor va siempre al final, sea cual sea el sentido. */
export function ordenarFilas(def: DefinicionReporte, filas: FilaReporte[], orden?: Orden | null): FilaReporte[] {
  const o = orden ?? def.ordenInicial
  const col = o && def.columnas.find((c) => c.clave === o.clave)
  if (!o || !col) return filas
  const vacio = (v: Valor | undefined) => v === null || v === undefined || v === ''
  return [...filas].sort((a, b) => {
    const x = a[col.clave], y = b[col.clave]
    if (vacio(x) && vacio(y)) return 0
    if (vacio(x)) return 1
    if (vacio(y)) return -1
    const c = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), 'es', { numeric: true })
    return o.asc ? c : -c
  })
}

/** «dias:asc» → { clave: 'dias', asc: true }; solo columnas del reporte. */
export function ordenDeTexto(def: DefinicionReporte, t: string | undefined | null): Orden | null {
  const [clave, dir] = (t ?? '').split(':')
  return def.columnas.some((c) => c.clave === clave) ? { clave, asc: dir !== 'desc' } : null
}
export const ordenATexto = (o: Orden) => `${o.clave}:${o.asc ? 'asc' : 'desc'}`

/** Las opciones de un filtro de selección, tomadas de los datos. */
export function opcionesDe(filas: FilaReporte[], campo: string): string[] {
  return [...new Set(filas.map((f) => f[campo]).filter((x): x is string | number => x !== null && x !== undefined && x !== '').map(String))].sort((a, b) => a.localeCompare(b, 'es', { numeric: true }))
}

export interface ResumenReporte { filas: number; sumas: { etiqueta: string; total: number }[]; extra?: string }
export function resumenDe(def: DefinicionReporte, filas: FilaReporte[]): ResumenReporte {
  const sumas = def.columnas.filter((c) => c.suma).map((c) => ({ etiqueta: c.etiqueta, total: filas.reduce((n, f) => n + (Number(f[c.clave]) || 0), 0) }))
  let extra: string | undefined
  if (def.id === 'EXACTITUD' && filas.length) {
    const e = exactitudDeFilas(filas.map((f) => ({ primerConteo: Number(f.primero), cantidadSistema: Number(f.sistema) })))
    extra = `Exactitud: ${(e.porcentaje ?? 0).toLocaleString('es-PE', { maximumFractionDigits: 1 })} % (${e.exactas} de ${e.lineas} líneas coincidieron en el primer conteo)`
  }
  return { filas: filas.length, sumas, extra }
}

export function valorTexto(c: Columna, v: Valor): string {
  if (v === null || v === undefined || v === '') return '—'
  if (c.tipo === 'numero') return Number(v).toLocaleString('es-PE')
  if (c.tipo === 'porcentaje') return `${Number(v).toLocaleString('es-PE', { maximumFractionDigits: 1 })} %`
  if (c.tipo === 'fecha') { const [a, m, d] = String(v).split('-'); return a && m && d ? `${d}/${m}/${a}` : String(v) }
  return String(v)
}

const celdaCsv = (x: string) => (/[",\n\r;]/.test(x) ? `"${x.replace(/"/g, '""')}"` : x)
/** CSV con BOM (Excel lo abre con tildes) y comas; las fechas en AAAA-MM-DD para ordenar bien. */
export function aCsv(def: DefinicionReporte, filas: FilaReporte[]): string {
  const cab = def.columnas.map((c) => celdaCsv(c.etiqueta)).join(',')
  const cuerpo = filas.map((f) => def.columnas.map((c) => { const v = f[c.clave]; return celdaCsv(v === null || v === undefined ? '' : String(v)) }).join(','))
  return `﻿${[cab, ...cuerpo].join('\r\n')}\r\n`
}

export function describirFiltros(def: DefinicionReporte, filtros: Filtros): string {
  const partes = def.filtros.map((d) => (filtros[d.clave]?.trim() ? `${d.etiqueta}: ${filtros[d.clave].trim()}` : '')).filter(Boolean)
  return partes.length ? partes.join(' · ') : 'Sin filtros'
}

/** Filtros que vienen de la URL: solo las claves del reporte, como texto. */
export function filtrosDeUrl(def: DefinicionReporte, params: Record<string, string | string[] | undefined>): Filtros {
  const out: Filtros = {}
  for (const d of def.filtros) { const v = params[d.clave]; const t = Array.isArray(v) ? v[0] : v; if (t && t.trim()) out[d.clave] = t.trim().slice(0, 120) }
  return out
}
