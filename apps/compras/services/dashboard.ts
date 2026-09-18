import 'server-only'
import { crearClienteServidor } from '@logisalud/auth/server'
import {
  servicioSinConformidad,
  agruparPorMoneda,
  venceEnProximosDias,
  estaVencidaObligacion,
  anticipoSinRendirSuperaUmbral,
  diasEnEstado,
  ocParcialSuperaUmbral,
  type MontoPorMoneda,
} from '@/domain/dashboard'
import { estaVencida } from '@/domain/financiamiento'
import { listarObligaciones, type ObligacionListada } from '@/services/obligaciones'
import { obtenerObligacionesAbiertas, type FilaObligacionAbierta } from '@/services/reportes-cuentas-por-pagar-detalle'
import { buscarOrdenesFacturables } from '@/services/facturas-elegibles'
import { diasVencido } from '@/domain/reportes'
import { hoyLima, mesActualLima } from '@/domain/fecha'

/*
 * `LoopDiscrepancia` y `listarDiscrepanciasSinResolver` se retiraron el
 * 2026-09-18. Leían `recepciones_items.tipo_discrepancia` cruzado con
 * `resoluciones_discrepancia`, y el flujo de recepción de tres columnas NO
 * ESCRIBE ninguna de las dos cosas: la sección no podía tener una fila
 * nunca. Peor que vacía, llevaba a `/almacen/recepciones/[id]` a "resolver
 * la acción de cada línea", que es una pantalla que ya no existe.
 *
 * Lo que la reemplaza: la discrepancia que sí importa ahora (físico vs
 * factura) frena la obligación con `espera_nota_credito`, y eso el dashboard
 * ya lo muestra en el loop de observadas.
 */

export type LoopAnticipo = { id: string; codigo: string; monto: number; moneda: string; solicitanteNombre: string | null; diasSinRendir: number | null }

/**
 * Umbral de "anticipo pagado que sigue sin rendir" — configurable vía
 * `compras.configuracion` (clave 'anticipo_sin_rendir_alerta_dias', ver
 * 0037), mismo patrón que el de la OC parcial. Default 15 solo como red de
 * seguridad si la fila no existiera.
 */
export async function obtenerUmbralAnticipoSinRendirDias(): Promise<number> {
  const supabase = crearClienteServidor()
  const { data } = await supabase.schema('compras').from('configuracion').select('valor').eq('clave', 'anticipo_sin_rendir_alerta_dias').maybeSingle()
  const umbral = Number(data?.valor)
  return Number.isFinite(umbral) && umbral > 0 ? umbral : 15
}

/**
 * Regla 7: un anticipo pagado queda 'pendiente_rendicion' hasta que el
 * empleado sube sus comprobantes reales.
 *
 * Pieza I: el loop abierto solo lista los que pasaron el umbral — un
 * anticipo pagado ayer no es un problema, uno de hace tres semanas sí. Los
 * pagados antes de 0037 no tienen `fecha_pendiente_rendicion` y quedan
 * fuera: sin ancla no se puede afirmar cuántos días llevan.
 */
export async function listarAnticiposSinRendir(): Promise<LoopAnticipo[]> {
  const supabase = crearClienteServidor()
  const hoy = hoyLima()
  const umbralDias = await obtenerUmbralAnticipoSinRendirDias()

  const { data, error } = await supabase
    .schema('gastos')
    .from('solicitudes_gasto')
    .select('id, codigo, monto_solicitado, moneda, solicitante_id, fecha_pendiente_rendicion')
    .eq('estado', 'pendiente_rendicion')
    .order('created_at')
  if (error) throw new Error(`No se pudieron leer los anticipos sin rendir: ${error.message}`)
  if (!data || data.length === 0) return []

  const ids = [...new Set(data.map((d) => d.solicitante_id))]
  const { data: perfiles } = await supabase.from('perfiles').select('id, nombre').in('id', ids)
  const nombrePorId = new Map((perfiles ?? []).map((p: any) => [p.id, p.nombre]))

  return data
    .map((d) => ({
      id: d.id,
      codigo: d.codigo,
      monto: Number(d.monto_solicitado),
      moneda: d.moneda,
      solicitanteNombre: nombrePorId.get(d.solicitante_id) ?? null,
      diasSinRendir: d.fecha_pendiente_rendicion
        ? diasEnEstado(String(d.fecha_pendiente_rendicion).slice(0, 10), hoy)
        : null,
    }))
    .filter((a) => anticipoSinRendirSuperaUmbral(a.diasSinRendir, umbralDias))
    .sort((a, b) => (b.diasSinRendir ?? 0) - (a.diasSinRendir ?? 0))
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
  const hoy = hoyLima()

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

export type LoopOCParcial = { id: string; codigo: string; diasEnParcial: number; proveedorNombre: string | null }

/**
 * Umbral de "OC parcial hace demasiado tiempo" — configurable vía
 * `compras.configuracion` (0031_configuracion.sql), nunca hardcodeado.
 * Default 30 si la fila no existiera todavía (no debería pasar, la
 * migración la siembra, pero un fallback explícito es más seguro que
 * lanzar acá y tumbar el dashboard entero).
 */
export async function obtenerUmbralOCParcialDias(): Promise<number> {
  const supabase = crearClienteServidor()
  const { data } = await supabase.schema('compras').from('configuracion').select('valor').eq('clave', 'oc_parcial_alerta_dias').maybeSingle()
  const umbral = Number(data?.valor)
  return Number.isFinite(umbral) && umbral > 0 ? umbral : 30
}

/**
 * Regla 7 del encargo: OC parcialmente recibida hace más del umbral
 * configurado. Se calcula al vuelo, sin cron — mismo patrón que el resto de
 * lo que necesita atención, más abajo en este archivo.
 */
export async function listarOCsParcialesSobreUmbral(): Promise<LoopOCParcial[]> {
  const supabase = crearClienteServidor()
  const hoy = hoyLima()
  const umbralDias = await obtenerUmbralOCParcialDias()

  const { data: ocs, error } = await supabase
    .schema('compras')
    .from('ordenes_compra')
    .select('id, codigo, fecha_emision, proveedor_id')
    .eq('estado', 'parcialmente_recibida')
  if (error) throw new Error(`No se pudieron leer las órdenes parciales: ${error.message}`)
  if (!ocs || ocs.length === 0) return []

  const { data: proveedores } = await supabase.schema('compras').from('proveedores').select('id, razon_social').in('id', [...new Set(ocs.map((o) => o.proveedor_id))])
  const nombrePorId = new Map((proveedores ?? []).map((p: any) => [p.id, p.razon_social]))

  return ocs
    .map((o) => ({ id: o.id, codigo: o.codigo, diasEnParcial: diasEnEstado(o.fecha_emision, hoy), proveedorNombre: nombrePorId.get(o.proveedor_id) ?? null }))
    .filter((o) => ocParcialSuperaUmbral(o.diasEnParcial, umbralDias))
    .sort((a, b) => b.diasEnParcial - a.diasEnParcial)
}

export type LoopsAbiertos = {
  fraccionamientosVencidos: LoopFraccionamientoVencido[]
  obligacionesObservadas: ObligacionListada[]
  anticiposSinRendir: LoopAnticipo[]
  serviciosSinConformidad: LoopServicio[]
  ocsParcialesSobreUmbral: LoopOCParcial[]
}

/**
 * Junta todo lo que está trabado en el módulo — "Qué necesita atención"
 * en pantalla (Carta de Simplicidad regla 5).
 * Orden fijo por urgencia financiera: primero lo que tiene un riesgo con
 * fecha (perder el beneficio del fraccionamiento), después lo que bloquea
 * un pago (obligación observada), por último lo
 * que es dinero ya entregado pendiente de sustento o una entrega que se
 * está demorando.
 */
export async function obtenerLoopsAbiertos(): Promise<LoopsAbiertos> {
  const [
    fraccionamientosVencidos,
    obligacionesObservadas,
    anticiposSinRendir,
    serviciosSinConformidad,
    ocsParcialesSobreUmbral,
  ] = await Promise.all([
    listarCuotasFraccionamientoVencidas(),
    listarObligaciones('observada'),
    listarAnticiposSinRendir(),
    listarServiciosSinConformidad(),
    listarOCsParcialesSobreUmbral(),
  ])

  return { fraccionamientosVencidos, obligacionesObservadas, anticiposSinRendir, serviciosSinConformidad, ocsParcialesSobreUmbral }
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
  /** Las obligaciones vencidas y por vencer, en detalle. Antes solo vivían
   * en la pantalla "Reportes — Cuentas por Pagar", que se fusionó acá. */
  listaVencidas: FilaObligacionAbierta[]
  listaVenceProximos7Dias: FilaObligacionAbierta[]
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
  const hoy = hoyLima()

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
    // Las LISTAS, no solo los totales: son lo único que la pantalla
    // "Reportes — Cuentas por Pagar" tenía y el Dashboard no, y por eso
    // había que abrir las dos. Ya venían calculadas de `abiertas`, así que
    // exponerlas no cuesta ni una consulta más.
    listaVencidas: vencidas,
    listaVenceProximos7Dias: porVencerPronto,
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
  // El mes se saca del día de LIMA: el 30/09 a las 21:00 de Lima el lambda
  // (UTC) ya está en octubre, y el tablero mostraba "pagado este mes" en
  // cero cuando en realidad faltaban tres horas para cerrar septiembre.
  const [anio, mes] = mesActualLima().split('-').map(Number)
  const inicioMes = new Date(Date.UTC(anio, mes - 1, 1)).toISOString().slice(0, 10)
  const finMes = new Date(Date.UTC(anio, mes, 0)).toISOString().slice(0, 10)

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
