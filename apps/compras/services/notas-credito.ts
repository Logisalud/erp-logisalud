import 'server-only'
import { crearClienteServidor, perfilActual } from '@logisalud/auth/server'
import { anioMesStorageLima } from '@/domain/fecha'
import {
  puedeRegistrarNotaCreditoDeRecepcion, validarNotaCreditoDeRecepcion,
} from '@/domain/nota-credito-recepcion'

/**
 * Notas de crédito de compras.
 *
 * Es donde se materializa el Caso A de la recepción de tres columnas: llegó
 * menos de lo que el proveedor facturó, la obligación nació por el monto
 * facturado (es lo que legalmente se debe hasta que haya NC) y quedó frenada
 * con `espera_nota_credito = true`. `registrarNotaCreditoDeRecepcion` es la
 * única salida de ese estado.
 *
 * `recepcion_item_id` queda como referencia de trazabilidad (de qué línea
 * salió, si vino de una) pero la nota de crédito siempre se aplica contra
 * una obligación — es ahí donde reduce lo que se paga (regla de negocio 9).
 */
export type NotaCredito = {
  id: string
  numero_nc: string | null
  motivo: string
  monto: number
  moneda: string
  fecha_emision: string | null
  aplicada: boolean
}

export async function registrarNotaCredito(input: {
  obligacionId: string
  proveedorId: string
  monto: number
  moneda: string
  motivo: string
  numeroNc?: string | null
  fechaEmision?: string | null
  recepcionItemId?: string | null
  storagePath?: string | null
}): Promise<{ id: string }> {
  if (input.monto <= 0) throw new Error('El monto de la nota de crédito tiene que ser mayor a 0.')

  const supabase = crearClienteServidor()
  const { data, error } = await supabase
    .schema('compras')
    .from('notas_credito')
    .insert({
      obligacion_id: input.obligacionId,
      proveedor_id: input.proveedorId,
      recepcion_item_id: input.recepcionItemId ?? null,
      numero_nc: input.numeroNc ?? null,
      motivo: input.motivo,
      monto: input.monto,
      moneda: input.moneda,
      fecha_emision: input.fechaEmision ?? null,
      storage_path: input.storagePath ?? null,
      aplicada: false,
    })
    .select('id')
    .single()

  if (error) throw new Error(`No se pudo registrar la nota de crédito: ${error.message}`)
  return data
}

/**
 * Regla 9: al marcar `aplicada = true`, el monto a pagar de la obligación
 * se reduce en ese valor — pero recién al ARMAR LA PROPUESTA (ver
 * services/propuestas.ts, que suma las notas aplicadas de cada obligación
 * al calcular `monto_a_pagar`). Marcar `aplicada` acá no reescribe
 * `neto_a_pagar` de la obligación: ese campo es una columna generada desde
 * `base_imponible`/`monto_detraccion`, la resta de NC es un cálculo aparte
 * que solo importa en el momento de proponer el pago.
 */
export async function aplicarNotaCredito(id: string): Promise<void> {
  const supabase = crearClienteServidor()
  const { error } = await supabase.schema('compras').from('notas_credito').update({ aplicada: true }).eq('id', id)
  if (error) throw new Error(`No se pudo aplicar la nota de crédito: ${error.message}`)
}

/**
 * Registra Y aplica la NC que estaba frenando una obligación del Caso A, y
 * con eso libera el pago.
 *
 * Es el cierre del ciclo que abre la recepción de tres columnas: llegó menos
 * de lo facturado, la obligación nació por lo facturado con
 * `espera_nota_credito = true`, y esto es lo que la vuelve pagable.
 *
 * Lo único que recibe del formulario son los datos de la NC. El total contra
 * el que se valida el monto, la moneda y el proveedor los lee de la base: si
 * viajaran en el FormData, alguien podría declarar un total inflado para
 * colar una NC más grande que la deuda.
 *
 * Reusa `registrarNotaCredito` y `aplicarNotaCredito` en vez de escribir la
 * fila a mano: las dos ya existían y la regla 9 (cómo la NC reduce lo que se
 * paga) vive ahí. Lo único propio de esta función es bajar el flag.
 *
 * Sin transacción, como todo el módulo. El orden importa: la NC primero y el
 * flag después. Si falla a mitad queda una NC registrada y la obligación
 * todavía frenada — recuperable, y del lado seguro (no se libera un pago que
 * no debía liberarse).
 */
export async function registrarNotaCreditoDeRecepcion(input: {
  obligacionId: string
  monto: number
  motivo: string
  numeroNc: string
  fechaEmision: string
  storagePath: string | null
}): Promise<{ notaCreditoId: string }> {
  const perfil = await perfilActual()
  if (!puedeRegistrarNotaCreditoDeRecepcion(perfil)) {
    throw new Error('Solo Contabilidad puede registrar la nota de crédito de una recepción.')
  }

  const supabase = crearClienteServidor()
  const { data: obligacion, error: errLectura } = await supabase
    .schema('cuentas_x_pagar')
    .from('obligaciones')
    .select('id, total, moneda, proveedor_id, espera_nota_credito')
    .eq('id', input.obligacionId)
    .maybeSingle()
  if (errLectura) throw new Error(`No se pudo leer la obligación: ${errLectura.message}`)
  if (!obligacion) throw new Error('No se encontró la obligación.')
  if (!obligacion.espera_nota_credito) {
    throw new Error('Esta obligación no está esperando ninguna nota de crédito.')
  }
  if (!obligacion.proveedor_id) {
    throw new Error('Esta obligación no le paga a un proveedor de compras: no se le puede aplicar una nota de crédito de recepción.')
  }

  const errores = validarNotaCreditoDeRecepcion({
    monto: input.monto,
    totalObligacion: Number(obligacion.total),
    moneda: obligacion.moneda,
    monedaObligacion: obligacion.moneda,
    motivo: input.motivo,
    numeroNc: input.numeroNc,
    fechaEmision: input.fechaEmision,
    storagePath: input.storagePath,
  })
  if (errores.length > 0) throw new Error(errores.map((e) => e.mensaje).join(' '))

  const { id } = await registrarNotaCredito({
    obligacionId: input.obligacionId,
    proveedorId: obligacion.proveedor_id,
    monto: input.monto,
    moneda: obligacion.moneda,
    motivo: input.motivo,
    numeroNc: input.numeroNc,
    fechaEmision: input.fechaEmision,
    storagePath: input.storagePath,
  })

  await aplicarNotaCredito(id)

  // El freno se levanta acá y en ningún otro lugar: es lo único que vuelve
  // la obligación elegible para propuesta de pago
  // (ver services/propuestas.ts::listarObligacionesConformes).
  const { error } = await supabase
    .schema('cuentas_x_pagar')
    .from('obligaciones')
    .update({ espera_nota_credito: false })
    .eq('id', input.obligacionId)
  if (error) {
    throw new Error(
      `La nota de crédito quedó registrada y aplicada, pero no se pudo liberar la obligación: ${error.message}`
    )
  }

  return { notaCreditoId: id }
}

/**
 * Sube el PDF o la foto de la nota de crédito. EN SU PROPIO REQUEST, igual
 * que la guía y la factura de la recepción: un archivo de celular junto con
 * el resto del formulario pasa el límite de body de una Server Action, y eso
 * se manifiesta como "el botón no hace nada" (ver next.config.js).
 *
 * Mismo bucket que el resto del legajo de compras, así que
 * `obtenerUrlLegajoPagoDirecto` ya sabe firmar el link para verla.
 */
export async function subirNotaCreditoDeRecepcion(
  codigoObligacion: string,
  archivo: File
): Promise<{ path: string } | { error: string }> {
  if (!archivo || archivo.size === 0) return { error: 'El archivo está vacío.' }
  const supabase = crearClienteServidor()
  const nombreLimpio = archivo.name.replace(/[^a-zA-Z0-9._-]/g, '_')
  const path = `${anioMesStorageLima()}/${codigoObligacion}/nota-credito-${Date.now()}-${nombreLimpio}`
  const { error } = await supabase.storage
    .from('legajos-compras')
    .upload(path, archivo, { contentType: archivo.type || undefined })
  if (error) {
    console.error('[subirNotaCreditoDeRecepcion]', error.message)
    return { error: `No se pudo subir la nota de crédito: ${error.message}` }
  }
  return { path }
}
