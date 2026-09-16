import 'server-only'
import { crearClienteServidor, exigirUsuario, perfilActual } from '@logisalud/auth/server'
import { mapaCategoriasPagoDirecto } from '@/services/obligaciones'
import {
  ERROR_PAGO_HISTORICO_FUERA_DE_ALCANCE, puedeRegistrarsePagoHistorico,
  type EstadoObligacion,
} from '@/domain/obligacion'
import {
  puedeReemplazarConstancia, validarReemplazo, type ArchivoConstancia,
} from '@/domain/reemplazo-constancia'
import {
  puedeCorregirFechaDePago, validarCorreccionFecha,
} from '@/domain/correccion-fecha-pago'
import { anioMesStorageLima } from '@/domain/fecha'

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

  const nombreLimpio = archivo.name.replace(/[^a-zA-Z0-9._-]/g, '_')
  const path = `${anioMesStorageLima()}/${codigoObligacion}/${Date.now()}-${nombreLimpio}`

  const { error } = await supabase.storage
    .from('legajos-pagos')
    .upload(path, archivo, { contentType: archivo.type || undefined })
  if (error) {
    console.error('[subirVoucherHistorico] falló la subida:', error.message)
    return { error: `No se pudo subir la constancia: ${error.message}` }
  }
  return { path }
}


/**
 * Sube la constancia ANTES de que exista la obligación — para el checkbox
 * "Ya se pagó" del formulario de alta, donde todavía no hay código al que
 * colgarla.
 *
 * Mismo patrón (y misma deuda de huérfanos) que los comprobantes de aportes:
 * el prefijo de borrador va en el TERCER segmento, porque la policy de
 * Storage exige `YYYY/MM/<algo>/<archivo>`.
 */
export async function subirVoucherHistoricoSuelto(
  archivo: File
): Promise<{ path: string } | { error: string }> {
  if (archivo.size === 0) return { error: 'El archivo está vacío.' }
  const supabase = crearClienteServidor()

  const nombreLimpio = archivo.name.replace(/[^a-zA-Z0-9._-]/g, '_')
  const path = `${anioMesStorageLima()}/borradores-${crypto.randomUUID()}/${nombreLimpio}`

  const { error } = await supabase.storage
    .from('legajos-pagos')
    .upload(path, archivo, { contentType: archivo.type || undefined })
  if (error) {
    console.error('[subirVoucherHistoricoSuelto] falló la subida:', error.message)
    return { error: `No se pudo subir la constancia: ${error.message}` }
  }
  return { path }
}

/**
 * Reemplazar SOLO el archivo de la constancia de un pago ya registrado.
 *
 * La función no recibe fecha, monto, N° de operación ni cuenta: no puede
 * tocarlos aunque alguien fuerce el formulario. Lo único que escribe es la
 * ruta del archivo y el rastro de quién lo reemplazó.
 *
 * El archivo viejo NO se borra. Queda huérfano en Storage pero presente:
 * borrar la evidencia anterior sería lo contrario de lo que busca el rastro.
 */
export async function reemplazarConstanciaPago(input: {
  obligacionId: string
  cual: ArchivoConstancia
  motivo: string
  storagePathNuevo: string
}): Promise<void> {
  const perfil = await perfilActual()
  if (!puedeReemplazarConstancia(perfil)) {
    throw new Error('Solo Administración puede reemplazar la constancia de un pago.')
  }
  const errores = validarReemplazo({
    cual: input.cual,
    motivo: input.motivo,
    storagePathNuevo: input.storagePathNuevo,
  })
  if (errores.length > 0) throw new Error(errores[0].mensaje)

  const usuario = await exigirUsuario()
  const supabase = crearClienteServidor()

  // El pago se alcanza por la obligación, que es lo que la ficha conoce.
  const { data: aplicacion } = await supabase
    .schema('cuentas_x_pagar')
    .from('pago_aplicacion')
    .select('pago_id')
    .eq('obligacion_id', input.obligacionId)
    .maybeSingle()
  if (!aplicacion?.pago_id) throw new Error('Esta obligación no tiene un pago registrado.')

  const columna =
    input.cual === 'voucher' ? 'storage_path_voucher' : 'storage_path_detraccion'

  const { error } = await supabase
    .schema('cuentas_x_pagar')
    .from('pagos')
    .update({
      [columna]: input.storagePathNuevo,
      voucher_reemplazado_por: usuario.id,
      voucher_reemplazado_en: new Date().toISOString(),
      voucher_reemplazado_motivo: input.motivo.trim(),
      voucher_reemplazado_cual: input.cual,
    })
    .eq('id', aplicacion.pago_id)
  if (error) throw new Error(`No se pudo reemplazar la constancia: ${error.message}`)
}

/** Lo que la ficha necesita saber del pago para ofrecer la corrección. */
export type PagoParaCorregir = {
  pagoId: string
  fechaPago: string
  monto: number
  moneda: string
  /** La fecha con la que nació el pago, si ya se corrigió alguna vez. */
  fechaOriginal: string | null
}

/**
 * Busca el pago de una obligación junto con lo que hace falta para armar la
 * advertencia de cambio de mes (monto y moneda). Null si no tiene pago.
 */
export async function obtenerPagoParaCorregir(obligacionId: string): Promise<PagoParaCorregir | null> {
  const supabase = crearClienteServidor()
  const { data: aplicacion } = await supabase
    .schema('cuentas_x_pagar')
    .from('pago_aplicacion')
    .select('pago_id, monto_aplicado')
    .eq('obligacion_id', obligacionId)
    .maybeSingle()
  if (!aplicacion?.pago_id) return null

  const { data: pago } = await supabase
    .schema('cuentas_x_pagar')
    .from('pagos')
    .select('id, fecha_pago, moneda, fecha_pago_corregida_de')
    .eq('id', aplicacion.pago_id)
    .maybeSingle()
  if (!pago) return null

  return {
    pagoId: pago.id,
    fechaPago: pago.fecha_pago,
    // El monto que importa para la advertencia es el APLICADO a esta
    // obligación, no el total del pago: un pago puede cubrir varias.
    monto: Number((aplicacion as any).monto_aplicado ?? 0),
    moneda: pago.moneda,
    fechaOriginal: (pago as any).fecha_pago_corregida_de ?? null,
  }
}

/**
 * Corregir la fecha de un pago ya registrado.
 *
 * Deliberadamente SEPARADA de `reemplazarConstanciaPago`: esa función no
 * tiene ni un campo financiero en su firma, y eso es una garantía legible de
 * que no puede tocar plata. Cambiar `fecha_pago` sí la toca —reclasifica el
 * pago entre periodos— así que va por su propio camino, con su propio rastro.
 *
 * `fecha_pago_corregida_de` se escribe UNA sola vez: en la primera
 * corrección. Si el pago ya fue corregido antes, se conserva la fecha con la
 * que nació y no la intermedia (decisión explícita — ver migración 0059).
 */
export async function corregirFechaDePago(input: {
  obligacionId: string
  fechaNueva: string
  motivo: string
}): Promise<void> {
  const perfil = await perfilActual()
  if (!puedeCorregirFechaDePago(perfil)) {
    throw new Error('Solo Administración puede corregir la fecha de un pago.')
  }

  const pago = await obtenerPagoParaCorregir(input.obligacionId)
  if (!pago) throw new Error('Esta obligación no tiene un pago registrado.')

  // Se valida contra la fecha que está EN LA BASE, no contra una que venga
  // del formulario: si alguien más corrigió mientras la pantalla estaba
  // abierta, el "es la misma fecha" tiene que compararse con la real.
  const errores = validarCorreccionFecha({
    fechaNueva: input.fechaNueva,
    fechaActual: pago.fechaPago,
    motivo: input.motivo,
  })
  if (errores.length > 0) throw new Error(errores[0].mensaje)

  const usuario = await exigirUsuario()
  const supabase = crearClienteServidor()

  const { error } = await supabase
    .schema('cuentas_x_pagar')
    .from('pagos')
    .update({
      fecha_pago: input.fechaNueva,
      // Solo en la primera corrección. `?? pago.fechaPago` es lo que hace
      // que la segunda no pise la fecha de nacimiento.
      fecha_pago_corregida_de: pago.fechaOriginal ?? pago.fechaPago,
      fecha_pago_corregida_por: usuario.id,
      fecha_pago_corregida_en: new Date().toISOString(),
      fecha_pago_corregida_motivo: input.motivo.trim(),
    })
    .eq('id', pago.pagoId)
  if (error) throw new Error(`No se pudo corregir la fecha del pago: ${error.message}`)
}
