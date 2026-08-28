import 'server-only'
import { listarPropuestas } from '@/services/propuestas'
import { listarRecepciones } from '@/services/recepciones'
import { obtenerLoopsAbiertos, type LoopsAbiertos } from '@/services/dashboard'

export type ResumenTesoreria = { propuestasListasParaPagar: number }

/** Propuestas ya aprobadas por Gerencia — lo que Tesorería puede pagar hoy. */
export async function obtenerResumenTesoreria(): Promise<ResumenTesoreria> {
  const propuestas = await listarPropuestas()
  return { propuestasListasParaPagar: propuestas.filter((p) => p.estado === 'aprobada').length }
}

export type ResumenAlmacen = { recepcionesPendientes: number }

export async function obtenerResumenAlmacen(): Promise<ResumenAlmacen> {
  const recepciones = await listarRecepciones()
  return {
    recepcionesPendientes: recepciones.filter((r) => r.estado === 'pendiente' || r.estado === 'con_discrepancia').length,
  }
}

export type ResumenGerencia = { propuestasPorAprobar: number }

export async function obtenerResumenGerencia(): Promise<ResumenGerencia> {
  const propuestas = await listarPropuestas()
  return { propuestasPorAprobar: propuestas.filter((p) => p.estado === 'pendiente_aprobacion').length }
}

export type ResumenContabilidad = { totalPendientes: number; loops: LoopsAbiertos }

/** La cola de Contabilidad ES el Dashboard — mismo dato, ahora es lo primero que ve al entrar. */
export async function obtenerResumenContabilidad(): Promise<ResumenContabilidad> {
  const loops = await obtenerLoopsAbiertos()
  const totalPendientes =
    loops.fraccionamientosVencidos.length +
    loops.obligacionesObservadas.length +
    loops.discrepancias.length +
    loops.anticiposSinRendir.length +
    loops.serviciosSinConformidad.length
  return { totalPendientes, loops }
}
