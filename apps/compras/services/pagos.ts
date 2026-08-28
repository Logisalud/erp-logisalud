import 'server-only'
import { crearClienteServidor, exigirUsuario } from '@logisalud/auth/server'
import { marcarSolicitudPagada } from '@/services/solicitudes-gasto'
import { marcarReposicionPagada } from '@/services/caja-chica'
import { marcarVencimientoPagado } from '@/services/financiamiento'
import { marcarImpuestoPagado } from '@/services/impuestos'
import { marcarServicioPagado } from '@/services/servicios'

export type BorradorPago = {
  obligacionId: string
  fechaPago: string
  cuentaBancariaProveedorId: string | null
  cuentaBancariaEmpleadoId: string | null
  numeroVoucher: string | null
  archivoVoucher: File | null
  archivoDetraccion: File | null
}

/**
 * Tesorería ejecuta el pago de una obligación que quedó `en_propuesta` en
 * una propuesta ya `aprobada` por Gerencia.
 *
 * Un pago acá es por obligación, no por propuesta entera: distintas
 * obligaciones de la misma propuesta pueden ir a proveedores (y cuentas
 * bancarias) distintos, así que cada una lleva su propio voucher — Tesorería
 * "sube vouchers" (plural) en el mapa de roles del documento maestro.
 */
export async function ejecutarPago(borrador: BorradorPago): Promise<{ id: string }> {
  const usuario = await exigirUsuario()
  const supabase = crearClienteServidor()

  const { data: obligacion, error: errOb } = await supabase
    .schema('cuentas_x_pagar')
    .from('obligaciones')
    .select('id, codigo, estado, moneda, neto_a_pagar')
    .eq('id', borrador.obligacionId)
    .maybeSingle()
  if (errOb || !obligacion) throw new Error('No se encontró la obligación.')
  if (obligacion.estado !== 'en_propuesta') {
    throw new Error('Solo se puede pagar una obligación que está en una propuesta.')
  }

  const { data: detalle, error: errDet } = await supabase
    .schema('cuentas_x_pagar')
    .from('propuesta_detalle')
    .select('propuesta_id, monto_a_pagar, propuestas_pago:propuesta_id(estado)')
    .eq('obligacion_id', borrador.obligacionId)
    .maybeSingle()
  if (errDet || !detalle) throw new Error('Esta obligación no tiene una propuesta asociada.')

  const propuesta = Array.isArray((detalle as any).propuestas_pago)
    ? (detalle as any).propuestas_pago[0]
    : (detalle as any).propuestas_pago
  if (propuesta?.estado !== 'aprobada') {
    throw new Error('La propuesta de esta obligación todavía no está aprobada por Gerencia.')
  }

  // "El voucher cierra el ciclo" (Fase 1.9): el comprobante real del banco,
  // no solo el número a mano — sube best-effort, igual que
  // solicitudes-gasto.subirComprobante: si el upload falla (red, tamaño), el
  // pago igual se registra, Tesorería puede reintentar el archivo después.
  const storagePathVoucher = await subirLegajoPago(obligacion.codigo, borrador.archivoVoucher)
  const storagePathDetraccion = await subirLegajoPago(obligacion.codigo, borrador.archivoDetraccion)

  const { data: pago, error: errPago } = await supabase
    .schema('cuentas_x_pagar')
    .from('pagos')
    .insert({
      fecha_pago: borrador.fechaPago,
      moneda: obligacion.moneda,
      monto_total: detalle.monto_a_pagar,
      cuenta_bancaria_proveedor_id: borrador.cuentaBancariaProveedorId,
      cuenta_bancaria_empleado_id: borrador.cuentaBancariaEmpleadoId,
      numero_voucher: borrador.numeroVoucher,
      storage_path_voucher: storagePathVoucher,
      storage_path_detraccion: storagePathDetraccion,
      ejecutado_por: usuario.id,
    })
    .select('id')
    .single()
  if (errPago) throw new Error(`No se pudo registrar el pago: ${errPago.message}`)

  const { error: errAplic } = await supabase
    .schema('cuentas_x_pagar')
    .from('pago_aplicacion')
    .insert({ pago_id: pago.id, obligacion_id: borrador.obligacionId, monto_aplicado: detalle.monto_a_pagar })
  if (errAplic) {
    await supabase.schema('cuentas_x_pagar').from('pagos').delete().eq('id', pago.id)
    throw new Error(`No se pudo aplicar el pago a la obligación: ${errAplic.message}`)
  }

  const { error: errUpd } = await supabase.schema('cuentas_x_pagar').from('obligaciones').update({ estado: 'pagada' }).eq('id', borrador.obligacionId)
  if (errUpd) throw new Error(`El pago se registró pero no se pudo marcar la obligación como pagada: ${errUpd.message}`)

  // Si esta obligación nació de una solicitud de gasto (regla 6), propaga el
  // pago a su estado: un anticipo queda pendiente de rendir, gasto_directo y
  // reembolso se cierran solos. No hace nada si la obligación es de compra.
  await marcarSolicitudPagada(borrador.obligacionId)

  // Igual que arriba, pero para una reposición de caja chica: al pagarse,
  // el fondo queda repuesto y el ciclo se cierra directo (no hace nada si
  // la obligación no nació de una reposición).
  await marcarReposicionPagada(borrador.obligacionId)

  // Igual que arriba, para una cuota de préstamo/fraccionamiento SUNAT o
  // una letra por pagar, y para una carga de impuestos — cada una no hace
  // nada si la obligación no nació de ese origen.
  await marcarVencimientoPagado(borrador.obligacionId)
  await marcarImpuestoPagado(borrador.obligacionId)

  // Igual que arriba, para una orden de servicio: al pagarse su obligación,
  // la orden queda cerrada (no hace nada si la obligación no es de origen
  // 'servicio').
  await marcarServicioPagado(borrador.obligacionId)

  return { id: pago.id }
}

async function subirLegajoPago(codigoObligacion: string, archivo: File | null): Promise<string | null> {
  if (!archivo || archivo.size === 0) return null
  const supabase = crearClienteServidor()
  const ahora = new Date()
  const yyyy = String(ahora.getFullYear())
  const mm = String(ahora.getMonth() + 1).padStart(2, '0')
  const nombreLimpio = archivo.name.replace(/[^a-zA-Z0-9._-]/g, '_')
  const path = `${yyyy}/${mm}/${codigoObligacion}/${Date.now()}-${nombreLimpio}`
  const { error } = await supabase.storage
    .from('legajos-pagos')
    .upload(path, archivo, { contentType: archivo.type || undefined })
  return error ? null : path
}

/** URL firmada para ver el voucher o el comprobante de detracción de un pago. */
export async function obtenerUrlLegajoPago(storagePath: string): Promise<string> {
  const supabase = crearClienteServidor()
  const { data, error } = await supabase.storage.from('legajos-pagos').createSignedUrl(storagePath, 60)
  if (error || !data) throw new Error('No se pudo generar el link del archivo.')
  return data.signedUrl
}
