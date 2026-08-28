import 'server-only'
import { crearClienteServidor } from '@logisalud/auth/server'

/**
 * Notas de crédito de compras.
 *
 * Es donde por fin se materializa lo que una discrepancia de Almacén dejó
 * "solicitada" (`resoluciones_discrepancia.accion_tomada =
 * 'nota_credito_solicitada'`, ver domain/recepcion.ts y
 * services/recepciones.ts) — hasta este PR esa decisión quedaba solo
 * registrada como historial, sin generar nada real.
 *
 * `recepcion_item_id` queda como referencia de trazabilidad (de qué línea
 * de discrepancia salió, si vino de ahí) pero la nota de crédito siempre se
 * aplica contra una obligación — es ahí donde reduce lo que se paga
 * (regla de negocio 9).
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
