// Carga inicial como «cambio de sistema» (OS-7, respuestas de Dirección Técnica 2026-10-17, §10; decisión D-110).
// El stock de Odoo entra directo a su estado y ubicación, SIN acta organoléptica ni recepción: Aprobados en su ubicación, Bajas en Bajas y Cuarentena en Cuarentena.
// El libro mayor deja el recorrido real (ingreso por carga inicial en Cuarentena → liberación → ubicación final) y Dirección Técnica valida con UNA sola confirmación.
// Puro: lo usan la demo, las pantallas y las pruebas. La base de datos (`wms.validar_carga_inicial` y `wms.confirmar_carga_inicial`, migración 0027) aplica las mismas reglas y manda.
import type { Estado, Rol } from './tipos'
import type { FilaCargaInicial, FilaHistoriaLote } from './inventario'

/** Estados con los que entra el stock de Odoo. Los demás (Retenido, Reservado, etc.) no vienen de una carga: nacen de procesos del WMS. */
export const ESTADOS_CARGA: readonly Estado[] = ['APROBADO', 'CUARENTENA', 'BAJAS_RECHAZADOS']
export const ETIQUETA_ESTADO_CARGA: Record<string, string> = { APROBADO: 'Aprobado', CUARENTENA: 'Cuarentena', BAJAS_RECHAZADOS: 'Bajas / Rechazados' }

/** Administración (y Dirección Técnica) suben y revisan la carga; solo Dirección Técnica la valida con su confirmación. */
export const puedeSubirCargaInicial = (roles: readonly Rol[]) => roles.includes('admin_wms') || roles.includes('direccion_tecnica')
export const puedeConfirmarCargaInicial = (roles: readonly Rol[]) => roles.includes('direccion_tecnica')

/** Cómo se escribe el estado en el archivo → el estado del sistema (admite Aprobados, Bajas, etc.). */
export function estadoDeArchivo(texto: string): string {
  const t = texto.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toUpperCase().replace(/[\s/]+/g, '_')
  const alias: Record<string, string> = {
    APROBADO: 'APROBADO', APROBADOS: 'APROBADO', CUARENTENA: 'CUARENTENA', BAJAS: 'BAJAS_RECHAZADOS', BAJA: 'BAJAS_RECHAZADOS', BAJAS_RECHAZADOS: 'BAJAS_RECHAZADOS', RECHAZADO: 'BAJAS_RECHAZADOS', RECHAZADOS: 'BAJAS_RECHAZADOS',
  }
  return alias[t] ?? t
}

/** Los pasos que deja una fila en el libro mayor según su estado final (los mismos textos que escribe la base de datos). */
export function recorridoCarga(estado: string): string[] {
  if (estado === 'APROBADO') return ['Ingreso por carga inicial en Cuarentena', 'Liberación a Aprobado (sin acta organoléptica)', 'Ubicación final']
  if (estado === 'BAJAS_RECHAZADOS') return ['Ingreso por carga inicial en Cuarentena', 'Baja a Bajas / Rechazados (sin acta organoléptica)', 'Ubicación final en Bajas']
  return ['Ingreso por carga inicial en Cuarentena']
}

/** Errores propios de la fila, sin mirar el catálogo: todo lote lleva código de lote y fecha de vencimiento, y el estado tiene que ser uno de los que se cargan. */
export function erroresDeFilaCarga(f: FilaCargaInicial): string[] {
  const e: string[] = []
  if (!f.lote.trim()) e.push('Falta el código de lote: todo lote necesita código de lote y fecha de vencimiento')
  if (!f.vence.trim()) e.push('Falta la fecha de vencimiento: todo lote necesita código de lote y fecha de vencimiento')
  else if (!/^\d{4}-\d{2}-\d{2}$/.test(f.vence) || Number.isNaN(Date.parse(f.vence))) e.push('La fecha de vencimiento no es válida')
  const est = f.estado.trim().toUpperCase()
  if (est && !ESTADOS_CARGA.includes(est as Estado)) e.push(`El estado «${f.estado}» no se carga: usa Aprobado, Cuarentena o Bajas/Rechazados`)
  return e
}

export interface ResumenCarga { aprobado: number; cuarentena: number; bajas: number; total: number }

/** Unidades por estado final de la carga (para decirle a Dirección Técnica qué va a validar). */
export function resumenCarga(filas: readonly Pick<FilaCargaInicial, 'estado' | 'cantidad'>[]): ResumenCarga {
  const r: ResumenCarga = { aprobado: 0, cuarentena: 0, bajas: 0, total: 0 }
  for (const f of filas) {
    const n = Number(f.cantidad) || 0
    const e = f.estado.trim().toUpperCase()
    if (e === 'APROBADO') r.aprobado += n; else if (e === 'BAJAS_RECHAZADOS') r.bajas += n; else r.cuarentena += n
    r.total += n
  }
  return r
}

export interface PasoDeCargaEnHistoria { carga: string; paso: number; total: number; texto: string }

/**
 * En la historia de un lote, marca cada partida que viene de una carga inicial con su paso del recorrido
 * («Carga inicial CI-2026-00001 · paso 2 de 3 · Liberación»). Las partidas de otros orígenes no entran.
 */
export function pasosDeCargaEnHistoria(filas: readonly Pick<FilaHistoriaLote, 'partidaId' | 'tipo' | 'referencia' | 'estado'>[]): Map<number, PasoDeCargaEnHistoria> {
  const grupos = new Map<string, typeof filas[number][]>()
  for (const f of filas) {
    if (!f.referencia || !/^CI-/.test(f.referencia) || !['CARGA_INICIAL', 'CAMBIO_ESTADO', 'MOVIMIENTO'].includes(f.tipo)) continue
    grupos.set(f.referencia, [...(grupos.get(f.referencia) ?? []), f])
  }
  const salida = new Map<number, PasoDeCargaEnHistoria>()
  for (const [carga, fs] of grupos) {
    const total = fs.some((f) => f.tipo !== 'CARGA_INICIAL') ? 3 : 1
    for (const f of fs) {
      if (f.tipo === 'CARGA_INICIAL') salida.set(f.partidaId, { carga, paso: 1, total, texto: 'Ingreso por carga inicial en Cuarentena' })
      else if (f.tipo === 'CAMBIO_ESTADO') salida.set(f.partidaId, { carga, paso: 2, total, texto: f.estado === 'BAJAS_RECHAZADOS' ? 'Baja a Bajas / Rechazados' : 'Liberación' })
      else salida.set(f.partidaId, { carga, paso: 3, total, texto: 'Ubicación final' })
    }
  }
  return salida
}

export const NOTA_RECORRIDO_KARDEX = 'Carga inicial: el stock de Odoo ingresa en Cuarentena y, sin acta organoléptica, se libera y pasa a su ubicación final (o a Bajas). El recorrido completo está en la historia del lote.'
