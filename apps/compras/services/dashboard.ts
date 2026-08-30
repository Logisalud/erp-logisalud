import 'server-only'
import { crearClienteServidor } from '@logisalud/auth/server'
import {
  discrepanciaAbierta,
  servicioSinConformidad,
  agruparPorMoneda,
  venceEnProximosDias,
  estaVencidaObligacion,
  type MontoPorMoneda,
} from '@/domain/dashboard'
import { estaVencida } from '@/domain/financiamiento'
import { listarObligaciones, type ObligacionListada } from '@/services/obligaciones'
import { obtenerObligacionesAbiertas } from '@/services/reportes-cuentas-por-pagar-detalle'
import { buscarOrdenesFacturables } from '@/services/facturas-elegibles'
import { diasVencido } from '@/domain/reportes'

export type LoopDiscrepancia = { recepcionId: string; ocCodigo: string; cantidadLineas: number }

/** Regla 2 + Carta de Simplicidad regla 5: líneas de recepción con discrepancia que Almacén todavía no decidió. */
export async function listarDiscrepanciasSinResolver(): Promise<LoopDiscrepancia[]> {
  const supabase = crearClienteServidor()
  const { data: items, error } = await supabase
    .schema('almacen')
    .from('recepciones_items')
    .select('id, recepcion_id, tipo_discrepancia')
    .not('tipo_discrepancia', 'is', null)
    .neq('tipo_discrepancia', 'ninguna')
  if (error) throw new Error(`No se pudieron leer las discrepancias: ${error.message}`)
  if (!items || items.length === 0) return []

  const { data: resoluciones, error: errRes } = await supabase
    .schema('almacen')
    .from('resoluciones_discrepancia')
    .select('recepcion_item_id')
    .in('recepcion_item_id', items.map((i) => i.id))
  if (errRes) throw new Error(`No se pudieron leer las resoluciones: ${errRes.message}`)
  const resueltos = new Set((resoluciones ?? []).map((r) => r.recepcion_item_id))

  const abiertas = items.filter((i) => discrepanciaAbierta(i.tipo_discrepancia, resueltos.has(i.id)))
  if (abiertas.length === 0) return []

  const porRecepcion = new Map<string, number>()
  for (const i of abiertas) porRecepcion.set(i.recepcion_id, (porRecepcion.get(i.recepcion_id) ?? 0) + 1)
  const recepcionIds = [...porRecepcion.keys()]

  const { data: recepciones } = await supabase.schema('almacen').from('recepciones').select('id, oc_id').in('id', recepcionIds)
  const ocIdPorRecepcion = new Map((recepciones ?? []).map((r) => [r.id, r.oc_id]))
  const ocIds = [...new Set(ocIdPorRecepcion.values())]
  const { data: ocs } = await supabase.schema('compras').from('ordenes_compra').select('id, codigo').in('id', ocIds)
  const codigoPorOc = new Map((ocs ?? []).map((o) => [o.id, o.codigo]))

  return recepcionIds.map((recepcionId) => ({
    recepcionId,
    ocCodigo: codigoPorOc.get(ocIdPorRecepcion.get(recepcionId) ?? '') ?? '—',
    cantidadLineas: porRecepcion.get(recepcionId)!,
  }))
}

export type LoopAnticipo = { id: string; codigo: string; monto: number; moneda: string; solicitanteNombre: string | null }

/** Regla 7: un anticipo pagado queda 'pendiente_rendicion' hasta que el empleado sube sus comprobantes reales. */
export async function listarAnticiposSinRendir(): Promise<LoopAnticipo[]> {
  const supabase = crearClienteServidor()
  const { data, error } = await supabase
    .schema('gastos')
    .from('solicitudes_gasto')
    .select('id, codigo, monto_solicitado, moneda, solicitante_id')
    .eq('estado', 'pendiente_rendicion')
    .order('created_at')
  if (error) throw new Error(`No se pudieron leer los anticipos sin rendir: ${error.message}`)
  if (!data || data.length === 0) return []

  const ids = [...new Set(data.map((d) => d.solicitante_id))]
  const { data: perfiles } = await supabase.from('perfiles').select('id, nombre').in('id', ids)
  const nombrePorId = new Map((perfiles ?? []).map((p: any) => [p.id, p.nombre]))

  return data.map((d) => ({
    id: d.id,
    codigo: d.codigo,
    monto: Number(d.monto_solicitado),
    moneda: d.moneda,
    solicitanteNombre: nombrePorId.get(d.solicitante_id) ?? null,
  }))
}

export type LoopServicio = { id: string; codigo: string; monto: number; moneda: string }

/** Regla 5: Contabilidad no puede dar conformidad a una obligación de servicio sin esto. */
export async function listarServiciosSinConformidad(): Promise<LoopServicio[]> {
  const supabase = crearClienteServidor()
  const { data: os, error } = await supabase
    .schema('servicios')
    .from('ordenes_servicio')
    .select('id, codigo, monto_estimado, moneda, estado')
  if (error) throw new Error(`No se pudieron leer las órdenes de servicio: ${error.message}`)
  if (!os || os.length === 0) return []

  const { data: conformidades } = await supabase
    .schema('servicios')
    .from('conformidad_servicio')
    .select('os_id, conforme')
    .in('os_id', os.map((o) => o.id))
  const conformesPositivas = new Set((conformidades ?? []).filter((c) => c.conforme).map((c) => c.os_id))

  return os
    .filter((o) => servicioSinConformidad(o.estado, conformesPositivas.has(o.id)))
    .map((o) => ({ id: o.id, codigo: o.codigo, monto: Number(o.monto_estimado), moneda: o.moneda }))
}

export type LoopFraccionamientoVencido = {
  cuotaId: string
  fraccionamientoId: string
  numeroExpediente: string
  numeroCuota: number
  fechaVencimiento: string
  monto: number
}

/** Regla 10: cuota vencida sin obligación generada — riesgo de perder el beneficio del fraccionamiento. */
export async function listarCuotasFraccionamientoVencidas(): Promise<LoopFraccionamientoVencido[]> {
  const supabase = crearClienteServidor()
  const hoy = new Date().toISOString().slice(0, 10)

  const { data: cuotas, error } = await supabase
    .schema('financiamiento')
    .from('fraccionamientos_sunat_cuotas')
    .select('id, fraccionamiento_id, numero_cuota, fecha_vencimiento, monto_cuota, estado')
    .eq('estado', 'pendiente')
    .is('obligacion_id', null)
  if (error) throw new Error(`No se pudieron leer las cuotas de fraccionamiento: ${error.message}`)

  const vencidas = (cuotas ?? []).filter((c) => estaVencida(c.fecha_vencimiento, hoy))
  if (vencidas.length === 0) return []

  const fraccionamientoIds = [...new Set(vencidas.map((c) => c.fraccionamiento_id))]
  const { data: fraccionamientos } = await supabase
    .schema('financiamiento')
    .from('fraccionamientos_sunat')
    .select('id, numero_expediente')
    .in('id', fraccionamientoIds)
  const expedientePorId = new Map((fraccionamientos ?? []).map((f) => [f.id, f.numero_expediente]))

  return vencidas.map((c) => ({
    cuotaId: c.id,
    fraccionamientoId: c.fraccionamiento_id,
    numeroExpediente: expedientePorId.get(c.fraccionamiento_id) ?? '—',
    numeroCuota: c.numero_cuota,
    fechaVencimiento: c.fecha_vencimiento,
    monto: Number(c.monto_cuota),
  }))
}

export type LoopsAbiertos = {
  fraccionamientosVencidos: LoopFraccionamientoVencido[]
  obligacionesObservadas: ObligacionListada[]
  discrepancias: LoopDiscrepancia[]
  anticiposSinRendir: LoopAnticipo[]
  serviciosSinConformidad: LoopServicio[]
}

/**
 * Junta los cinco loops abiertos del módulo (Carta de Simplicidad regla 5).
 * Orden fijo por urgencia financiera: primero lo que tiene un riesgo con
 * fecha (perder el beneficio del fraccionamiento), después lo que bloquea
 * un pago (obligación observada, discrepancia sin resolver), por último lo
 * que es dinero ya entregado pendiente de sustento.
 */
export async function obtenerLoopsAbiertos(): Promise<LoopsAbiertos> {
  const [fraccionamientosVencidos, obligacionesObservadas, discrepancias, anticiposSinRendir, serviciosSinConformidad] =
    await Promise.all([
      listarCuotasFraccionamientoVencidas(),
      listarObligaciones('observada'),
      listarDiscrepanciasSinResolver(),
      listarAnticiposSinRendir(),
      listarServiciosSinConformidad(),
    ])

  return { fraccionamientosVencidos, obligacionesObservadas, discrepancias, anticiposSinRendir, serviciosSinConformidad }
}

// ---------------------------------------------------------------------------
// KPIs del dashboard
// ---------------------------------------------------------------------------

export type KPIsDashboard = {
  totalPendiente: MontoPorMoneda[]
  totalVencido: MontoPorMoneda[]
  venceProximos7Dias: MontoPorMoneda[]
  facturasPendientesRevision: MontoPorMoneda[]
  ordenesAprobadasSinFactura: { cantidad: number }
  pagadoEsteMes: MontoPorMoneda[]
  obligacionesObservadas: MontoPorMoneda[]
}

/**
 * Los 7 KPIs de arriba del dashboard — cada uno linkea a la pantalla real
 * donde ese número se resuelve (Carta de Simplicidad regla 5). Todo sale de
 * `cuentas_x_pagar.obligaciones` vía obtenerObligacionesAbiertas (mismo
 * origen que el reporte de antigüedad, para no duplicar el criterio de qué
 * es "abierta") + buscarOrdenesFacturables (mismo query que /facturas/nueva)
 * + el historial de pagos ya existente. Nunca se mezcla PEN con USD.
 */
export async function obtenerKPIsDashboard(obligacionesObservadasYaCargadas?: ObligacionListada[]): Promise<KPIsDashboard> {
  const hoy = new Date().toISOString().slice(0, 10)

  const [abiertas, facturables, obligacionesObservadas, pagadoEsteMes] = await Promise.all([
    obtenerObligacionesAbiertas({}),
    buscarOrdenesFacturables({}),
    obligacionesObservadasYaCargadas ? Promise.resolve(obligacionesObservadasYaCargadas) : listarObligaciones('observada'),
    obtenerPagadoDelMesActual(),
  ])

  const totalPendiente = agruparPorMoneda(abiertas.map((o) => ({ moneda: o.moneda, monto: o.netoAPagar })))

  const vencidas = abiertas.filter((o) => estaVencidaObligacion(o.diasVencido))
  const totalVencido = agruparPorMoneda(vencidas.map((o) => ({ moneda: o.moneda, monto: o.netoAPagar })))

  const porVencerPronto = abiertas.filter((o) => venceEnProximosDias(o.diasVencido, 7))
  const venceProximos7Dias = agruparPorMoneda(porVencerPronto.map((o) => ({ moneda: o.moneda, monto: o.netoAPagar })))

  const enRevision = abiertas.filter((o) => o.estado === 'registrada')
  const facturasPendientesRevision = agruparPorMoneda(enRevision.map((o) => ({ moneda: o.moneda, monto: o.netoAPagar })))

  const observadasComoFilas = obligacionesObservadas.map((o) => ({ moneda: o.moneda, monto: Number(o.neto_a_pagar) }))
  const observadasAgrupadas = agruparPorMoneda(observadasComoFilas)

  return {
    totalPendiente,
    totalVencido,
    venceProximos7Dias,
    facturasPendientesRevision,
    ordenesAprobadasSinFactura: { cantidad: facturables.length },
    pagadoEsteMes,
    obligacionesObservadas: observadasAgrupadas,
  }
}

/**
 * Suma de `pago_aplicacion.monto_aplicado` de pagos con fecha_pago dentro
 * del mes calendario actual — mismo patrón de consulta que
 * obtenerHistorialPagos en services/reportes-cuentas-por-pagar-detalle.ts.
 */
async function obtenerPagadoDelMesActual(): Promise<MontoPorMoneda[]> {
  const supabase = crearClienteServidor()
  const ahora = new Date()
  const inicioMes = new Date(Date.UTC(ahora.getUTCFullYear(), ahora.getUTCMonth(), 1)).toISOString().slice(0, 10)
  const finMes = new Date(Date.UTC(ahora.getUTCFullYear(), ahora.getUTCMonth() + 1, 0)).toISOString().slice(0, 10)

  const { data: pagos, error } = await supabase
    .schema('cuentas_x_pagar')
    .from('pagos')
    .select('id, moneda, fecha_pago')
    .gte('fecha_pago', inicioMes)
    .lte('fecha_pago', finMes)
  if (error) throw new Error(`No se pudo calcular lo pagado este mes: ${error.message}`)
  const pagosDelMes = pagos ?? []
  if (pagosDelMes.length === 0) return []

  const { data: aplicaciones, error: errApl } = await supabase
    .schema('cuentas_x_pagar')
    .from('pago_aplicacion')
    .select('pago_id, monto_aplicado')
    .in('pago_id', pagosDelMes.map((p: any) => p.id))
  if (errApl) throw new Error(`No se pudo calcular lo pagado este mes: ${errApl.message}`)

  const monedaPorPagoId = new Map(pagosDelMes.map((p: any) => [p.id, p.moneda as string]))
  const filas = (aplicaciones ?? []).map((a: any) => ({
    moneda: monedaPorPagoId.get(a.pago_id) ?? 'PEN',
    monto: Number(a.monto_aplicado),
  }))
  return agruparPorMoneda(filas)
}
