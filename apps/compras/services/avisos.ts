import 'server-only'
import { sendEmail, type EmailAttachment } from '@/services/email'
import {
  asuntoAviso,
  renderAvisoHtml,
  renderAvisoTexto,
  asuntoAnulacion,
  renderAnulacionHtml,
  renderAnulacionTexto,
  type DatosAviso,
  type DatosAnulacion,
  type FilaAviso,
  type TipoAviso,
} from '@/domain/aviso-email'
import { generarPdfOrden, obtenerDatosPdfOC, obtenerDatosPdfOS } from '@/services/pdf-documentos'

/**
 * Aviso por correo al crear un registro que compromete plata (Piezas D y K).
 *
 * Un solo punto de envío para los seis flujos (OC mercadería, OC bien, OS,
 * Pago Directo, Anticipo, Reembolso): así el destinatario, el formato y el
 * criterio de "no bloquear nunca" se definen una vez.
 *
 * Best-effort a propósito: el registro ya está guardado cuando esto corre,
 * así que un fallo de Resend no puede tumbar la operación. El resultado se
 * loguea para poder confirmarlo después en los logs de runtime de Vercel.
 */

const CORREO_CONTABILIDAD = 'contabilidad@logisalud.com'

/** URL fija de producción (CLAUDE.md: "se sirve bajo erp.logisalud.com/compras
 * vía rewrite") — esta app todavía no tiene una env var de site URL propia. */
const URL_BASE_PRODUCCION = 'https://erp.logisalud.com/compras'

export type AvisoCreacion = {
  tipo: TipoAviso
  codigo: string
  monto: number
  moneda: string
  /** Categoría (gastos) o proveedor (OC/OS) — cierra el asunto. */
  referencia: string
  filas: FilaAviso[]
  /** Ruta interna del registro, con la barra inicial (ej. `/gastos/<id>`). */
  ruta: string
  /** Correo de quien creó el registro, para la copia. */
  creadorCorreo: string | null
  /**
   * Id de la OC/OS para adjuntar su PDF — solo se usa (y solo tiene efecto)
   * cuando `tipo` es 'oc_mercaderia', 'oc_bien' u 'os'. Pago Directo,
   * Anticipo y Reembolso no generan un documento formal de este tipo, así
   * que para esos tipos este campo se ignora aunque venga cargado.
   */
  idParaPdf?: string
}

const TIPOS_CON_PDF: readonly TipoAviso[] = ['oc_mercaderia', 'oc_bien', 'os']

/** Best-effort: si el PDF falla, el aviso igual sale, sin adjunto. */
async function intentarAdjuntoPdf(aviso: AvisoCreacion): Promise<EmailAttachment[] | undefined> {
  if (!aviso.idParaPdf || !TIPOS_CON_PDF.includes(aviso.tipo)) return undefined
  try {
    const datos = aviso.tipo === 'os' ? await obtenerDatosPdfOS(aviso.idParaPdf) : await obtenerDatosPdfOC(aviso.idParaPdf)
    if (!datos) return undefined
    const buffer = await generarPdfOrden(datos)
    return [{ filename: `${aviso.codigo}.pdf`, content: buffer }]
  } catch (e) {
    console.error(`[avisarCreacion] No se pudo generar el PDF adjunto de ${aviso.tipo} ${aviso.codigo}:`, e)
    return undefined
  }
}

export async function avisarCreacion(aviso: AvisoCreacion): Promise<void> {
  const datos: DatosAviso = {
    tipo: aviso.tipo,
    codigo: aviso.codigo,
    monto: aviso.monto,
    moneda: aviso.moneda,
    referencia: aviso.referencia,
    filas: aviso.filas,
    url: `${URL_BASE_PRODUCCION}${aviso.ruta}`,
  }

  const attachments = await intentarAdjuntoPdf(aviso)

  const resultado = await sendEmail({
    to: [CORREO_CONTABILIDAD],
    cc: aviso.creadorCorreo ? [aviso.creadorCorreo] : undefined,
    subject: asuntoAviso(datos),
    html: renderAvisoHtml(datos),
    text: renderAvisoTexto(datos),
    attachments,
  })

  if (resultado.ok) {
    console.log(`[avisarCreacion] ${aviso.tipo} ${aviso.codigo} avisado — messageId=${resultado.messageId ?? 'n/a'}`)
  } else {
    console.error(`[avisarCreacion] No se pudo avisar ${aviso.tipo} ${aviso.codigo}: ${resultado.error}`)
  }
}

/**
 * Envuelve `avisarCreacion` para que ningún llamador tenga que acordarse del
 * try/catch: el aviso nunca debe romper la creación que lo dispara.
 */
export async function avisarCreacionSinRomper(aviso: AvisoCreacion): Promise<void> {
  try {
    await avisarCreacion(aviso)
  } catch (e) {
    console.error(`[avisarCreacion] Falló el aviso de ${aviso.tipo} ${aviso.codigo}:`, e)
  }
}

export type AvisoAnulacion = {
  tipo: TipoAviso
  codigo: string
  monto: number
  moneda: string
  referencia: string
  motivo: string
  anuladoPor: string
  filas: FilaAviso[]
  ruta: string
  creadorCorreo: string | null
}

/**
 * Segundo correo cuando se anula un registro que ya había avisado su
 * creación — mismos destinatarios, nunca con el PDF adjunto (a diferencia
 * de la creación de OC/OS): lo que importa acá es el motivo, no reimprimir
 * el documento.
 */
export async function avisarAnulacion(aviso: AvisoAnulacion): Promise<void> {
  const datos: DatosAnulacion = {
    tipo: aviso.tipo,
    codigo: aviso.codigo,
    monto: aviso.monto,
    moneda: aviso.moneda,
    referencia: aviso.referencia,
    motivo: aviso.motivo,
    anuladoPor: aviso.anuladoPor,
    filas: aviso.filas,
    url: `${URL_BASE_PRODUCCION}${aviso.ruta}`,
  }

  const resultado = await sendEmail({
    to: [CORREO_CONTABILIDAD],
    cc: aviso.creadorCorreo ? [aviso.creadorCorreo] : undefined,
    subject: asuntoAnulacion(datos),
    html: renderAnulacionHtml(datos),
    text: renderAnulacionTexto(datos),
  })

  if (resultado.ok) {
    console.log(`[avisarAnulacion] ${aviso.tipo} ${aviso.codigo} avisado — messageId=${resultado.messageId ?? 'n/a'}`)
  } else {
    console.error(`[avisarAnulacion] No se pudo avisar ${aviso.tipo} ${aviso.codigo}: ${resultado.error}`)
  }
}

/** Envuelve `avisarAnulacion` — la anulación ya quedó guardada cuando esto corre. */
export async function avisarAnulacionSinRomper(aviso: AvisoAnulacion): Promise<void> {
  try {
    await avisarAnulacion(aviso)
  } catch (e) {
    console.error(`[avisarAnulacion] Falló el aviso de anulación de ${aviso.tipo} ${aviso.codigo}:`, e)
  }
}
