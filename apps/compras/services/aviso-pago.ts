import 'server-only'
import { crearClienteServidor } from '@logisalud/auth/server'
import { sendEmail, type EmailAttachment } from '@/services/email'
import { obtenerObligacion } from '@/services/obligaciones'
import {
  asuntoAvisoPago, destinatariosAvisoPago, renderAvisoPagoHtml, renderAvisoPagoTexto,
} from '@/domain/aviso-pago'

/**
 * Le avisa a quien pidió el pago que Tesorería ya pagó (ver
 * domain/aviso-pago.ts). Best-effort como todos los avisos: el pago ya está
 * registrado cuando esto corre, así que nada de acá puede tumbarlo.
 */

const URL_BASE_PRODUCCION = 'https://erp.logisalud.com/compras'

/** Resend acepta hasta 40 MB por correo; un voucher pesa unos cientos de KB. */
const TOPE_ADJUNTO_BYTES = 10 * 1024 * 1024

export type PagoParaAviso = {
  obligacionId: string
  montoPagado: number
  fechaPago: string
  numeroVoucher: string | null
  storagePathVoucher: string | null
}

async function correosDeQuienPidio(obligacionId: string): Promise<string[]> {
  const supabase = crearClienteServidor()
  const { data: ob } = await supabase
    .schema('cuentas_x_pagar')
    .from('obligaciones')
    .select('creador_correo, solicitud_gasto_id')
    .eq('id', obligacionId)
    .maybeSingle()
  if (!ob) return []
  let correoSolicitud: string | null = null
  if (ob.solicitud_gasto_id) {
    const { data: sol } = await supabase
      .schema('gastos')
      .from('solicitudes_gasto')
      .select('creador_correo')
      .eq('id', ob.solicitud_gasto_id)
      .maybeSingle()
    correoSolicitud = sol?.creador_correo ?? null
  }
  return destinatariosAvisoPago([ob.creador_correo, correoSolicitud])
}

async function adjuntoVoucher(codigo: string, storagePath: string | null): Promise<EmailAttachment[] | undefined> {
  if (!storagePath) return undefined
  try {
    const supabase = crearClienteServidor()
    const { data, error } = await supabase.storage.from('legajos-pagos').download(storagePath)
    if (error || !data || data.size > TOPE_ADJUNTO_BYTES) return undefined
    const extension = storagePath.match(/\.[a-zA-Z0-9]+$/)?.[0] ?? ''
    return [{ filename: `Voucher-${codigo}${extension}`, content: Buffer.from(await data.arrayBuffer()) }]
  } catch (e) {
    console.error(`[avisarPago] No se pudo adjuntar el voucher de ${codigo}:`, e)
    return undefined
  }
}

export async function avisarPago(pago: PagoParaAviso): Promise<void> {
  const destinatarios = await correosDeQuienPidio(pago.obligacionId)
  if (destinatarios.length === 0) return // una compra, un impuesto: no hay a quién avisar

  const obligacion = await obtenerObligacion(pago.obligacionId)
  if (!obligacion) return

  const attachments = await adjuntoVoucher(obligacion.codigo, pago.storagePathVoucher)
  const datos = {
    codigo: obligacion.codigo,
    origen: obligacion.origen,
    montoPagado: pago.montoPagado,
    moneda: obligacion.moneda,
    aQuien: obligacion.proveedor?.razon_social ?? obligacion.beneficiario?.nombre ?? obligacion.categoriaPagoDirecto?.nombre ?? 'Pago',
    numeroComprobante: obligacion.numero_factura,
    fechaPago: pago.fechaPago,
    numeroVoucher: pago.numeroVoucher,
    url: `${URL_BASE_PRODUCCION}/cuentas-por-pagar/${obligacion.id}`,
    voucherAdjunto: !!attachments,
  }

  const resultado = await sendEmail({
    to: destinatarios,
    subject: asuntoAvisoPago(datos),
    html: renderAvisoPagoHtml(datos),
    text: renderAvisoPagoTexto(datos),
    attachments,
  })
  if (resultado.ok) {
    console.log(`[avisarPago] ${obligacion.codigo} avisado a ${destinatarios.join(', ')} — messageId=${resultado.messageId ?? 'n/a'}`)
  } else {
    console.error(`[avisarPago] No se pudo avisar el pago de ${obligacion.codigo}: ${resultado.error}`)
  }
}

/** Envuelve `avisarPago`: el pago ya quedó guardado cuando esto corre. */
export async function avisarPagoSinRomper(pago: PagoParaAviso): Promise<void> {
  try {
    await avisarPago(pago)
  } catch (e) {
    console.error(`[avisarPago] Falló el aviso de pago de la obligación ${pago.obligacionId}:`, e)
  }
}
