import 'server-only'
import { crearClienteServidor, exigirUsuario } from '@logisalud/auth/server'
import { mapaCategoriasPagoDirecto } from '@/services/obligaciones'
import {
  ERROR_PAGO_HISTORICO_FUERA_DE_ALCANCE, puedeRegistrarsePagoHistorico,
  type EstadoObligacion,
} from '@/domain/obligacion'

/**
 * Registrar un pago que YA OCURRIÓ — solo para el backlog anterior al ERP.
 *
 * POR QUÉ NO ES UN FLAG EN `ejecutarPago`: esa función no significa
 * "registrar un pago", significa "Tesorería ejecuta un desembolso hoy". Además
 * de escribir el pago, cierra el ciclo de otros cinco módulos
 * (marcarSolicitudPagada, marcarReposicionPagada, marcarVencimientoPagado,
 * marcarImpuestoPagado, marcarServicioPagado) y exige que la obligación esté
 * en una propuesta APROBADA. Un flag que rompiera esas tres guardas sería una
 * forma de saltarse la aprobación de propuesta para CUALQUIER obligación, no
 * solo para el backlog.
 *
 * Esta función, en cambio, no puede usarse fuera del backlog: valida la
 * categoría contra la base y no hay parámetro que lo desactive.
 *
 * TAMPOCO llama a ningún `marcar*Pagado`: un pago del backlog no cierra el
 * ciclo de ninguna solicitud, reposición, letra ni impuesto. Nació suelto y
 * muere suelto.
 *
 * Sin transacción, como todo el módulo: si algo falla entre el insert del
 * pago y el update de la obligación, el mensaje lo dice en vez de fingir que
 * salió bien.
 */
export type BorradorPagoHistorico = {
  obligacionId: string
  /** La fecha REAL del voucher, nunca `now()`: son pagos de hace meses y con
   * la fecha de hoy el historial y los reportes por período quedarían
   * inservibles. */
  fechaPago: string
  numeroOperacion: string | null
  /** Ya subido en su propio request — acá llega la ruta, no el archivo. */
  storagePathVoucher: string | null
}

export async function registrarPagoHistorico(
  borrador: BorradorPagoHistorico
): Promise<{ id: string }> {
  if (!borrador.fechaPago) throw new Error('Pon la fecha real en que se pagó.')
  const usuario = await exigirUsuario()
  const supabase = crearClienteServidor()

  const { data: obligacion, error } = await supabase
    .schema('cuentas_x_pagar')
    .from('obligaciones')
    .select('id, codigo, origen, estado, moneda, neto_a_pagar, categoria_pago_directo_id')
    .eq('id', borrador.obligacionId)
    .maybeSingle()
  if (error || !obligacion) throw new Error('No se encontró la obligación.')
  if (obligacion.origen !== 'gasto_directo') {
    throw new Error(ERROR_PAGO_HISTORICO_FUERA_DE_ALCANCE)
  }

  // La categoría se resuelve CONTRA LA BASE, nunca desde el formulario —
  // mismo criterio que la exención del tope: un campo del cliente sería una
  // forma de saltarse conformidad y propuesta para cualquier obligación.
  const categorias = await mapaCategoriasPagoDirecto([obligacion.categoria_pago_directo_id])
  const categoriaNombre = categorias.get(obligacion.categoria_pago_directo_id ?? '') ?? null
  if (!puedeRegistrarsePagoHistorico(obligacion.estado as EstadoObligacion, categoriaNombre)) {
    throw new Error(ERROR_PAGO_HISTORICO_FUERA_DE_ALCANCE)
  }

  const { data: pago, error: errPago } = await supabase
    .schema('cuentas_x_pagar')
    .from('pagos')
    .insert({
      fecha_pago: borrador.fechaPago,
      moneda: obligacion.moneda,
      monto_total: obligacion.neto_a_pagar,
      numero_voucher: borrador.numeroOperacion,
      storage_path_voucher: borrador.storagePathVoucher,
      ejecutado_por: usuario.id,
    })
    .select('id')
    .single()
  if (errPago) throw new Error(`No se pudo registrar el pago: ${errPago.message}`)

  const { error: errAplic } = await supabase
    .schema('cuentas_x_pagar')
    .from('pago_aplicacion')
    .insert({
      pago_id: pago.id,
      obligacion_id: obligacion.id,
      monto_aplicado: obligacion.neto_a_pagar,
    })
  if (errAplic) {
    throw new Error(
      `El pago se creó pero no se pudo aplicar a la obligación: ${errAplic.message}`
    )
  }

  const { error: errEstado } = await supabase
    .schema('cuentas_x_pagar')
    .from('obligaciones')
    .update({ estado: 'pagada' })
    .eq('id', obligacion.id)
  if (errEstado) {
    throw new Error(
      `El pago quedó registrado pero la obligación no pasó a "pagada": ${errEstado.message}`
    )
  }

  return { id: pago.id }
}

/**
 * Sube el voucher apenas se elige, en su propio request.
 *
 * Mismo patrón que los comprobantes de aportes: si el archivo viajara en el
 * mismo submit que la cotización ya adjunta, dos fotos de celular pasarían
 * del límite de body y el envío se rechazaría sin dejar error que mostrar.
 *
 * El path respeta `path_legajo_valido` (`YYYY/MM/<algo>/<archivo>`), que es
 * lo que exige la policy de Storage — ver el fix del 2026-09-14.
 */
export async function subirVoucherHistorico(
  codigoObligacion: string,
  archivo: File
): Promise<{ path: string } | { error: string }> {
  if (archivo.size === 0) return { error: 'El archivo está vacío.' }
  const supabase = crearClienteServidor()

  const ahora = new Date()
  const yyyy = String(ahora.getFullYear())
  const mm = String(ahora.getMonth() + 1).padStart(2, '0')
  const nombreLimpio = archivo.name.replace(/[^a-zA-Z0-9._-]/g, '_')
  const path = `${yyyy}/${mm}/${codigoObligacion}/${Date.now()}-${nombreLimpio}`

  const { error } = await supabase.storage
    .from('legajos-pagos')
    .upload(path, archivo, { contentType: archivo.type || undefined })
  if (error) {
    console.error('[subirVoucherHistorico] falló la subida:', error.message)
    return { error: `No se pudo subir la constancia: ${error.message}` }
  }
  return { path }
}
