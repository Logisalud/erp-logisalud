import 'server-only'
import { sendEmail } from '@/services/email'
import {
  asuntoAviso,
  renderAvisoHtml,
  renderAvisoTexto,
  type DatosAviso,
  type FilaAviso,
  type TipoAviso,
} from '@/domain/aviso-email'

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

  const resultado = await sendEmail({
    to: [CORREO_CONTABILIDAD],
    cc: aviso.creadorCorreo ? [aviso.creadorCorreo] : undefined,
    subject: asuntoAviso(datos),
    html: renderAvisoHtml(datos),
    text: renderAvisoTexto(datos),
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
