import 'server-only'
import { asuntoAvisoGuia, destinatariosDeAviso, htmlAvisoGuia, textoAvisoGuia, type EventoAvisoGuia } from '@/domain/aviso-guia'
import { modoPilotoActivo } from '@/lib/modo-piloto'
import { correoConfigurado, enviarCorreo } from './correo/resend'
import { repositorio } from './repositorio-actual'

/**
 * Le avisa por correo a quien factura (AVISO_FACTURACION_CORREOS, lista separada por comas): la pre-guía de un pedido ya tiene su número («puedes facturar»), la guía se registró a mano en el panel,
 * o la pre-guía se canceló porque el pedido ya no sale («NO factures»). Sin esa lista o sin RESEND_API_KEY/RESEND_FROM el aviso está apagado.
 * Es de mejor esfuerzo: un fallo se anota en el registro del servidor y NUNCA frena la operación que lo pidió.
 */
export async function avisarGuia(evento: EventoAvisoGuia, salidaId: string, guiaNumero: string, motivo?: string, numeroAnterior?: string): Promise<{ enviado: boolean; motivo?: string }> {
  try {
    const para = destinatariosDeAviso(process.env.AVISO_FACTURACION_CORREOS)
    if (para.length === 0 || !correoConfigurado()) return { enviado: false, motivo: 'apagado' }
    const repo = repositorio()
    const [paquete, salida] = await Promise.all([repo.paqueteSalida(salidaId), repo.obtenerSalida(salidaId)])
    const d = {
      evento, guiaNumero, pedidoNumero: paquete?.pedidoNumero, ordenNumero: paquete?.salidaNumero ?? salida?.numero ?? '—', cliente: paquete?.cliente, ruc: paquete?.ruc,
      bultos: paquete?.guia?.bultos, lineas: paquete?.items.map((i) => ({ producto: i.producto, lote: i.lote, cantidad: i.cantidad })), motivo, numeroAnterior, piloto: await modoPilotoActivo(),
    }
    const r = await enviarCorreo({ para, asunto: asuntoAvisoGuia(d), texto: textoAvisoGuia(d), html: htmlAvisoGuia(d), clave: `guia-${evento.toLowerCase()}-${numeroAnterior ?? ''}-${guiaNumero}` })
    if (!r.ok) console.error(`[aviso de guía] no se envió (${evento} ${guiaNumero}): ${r.motivo}`)
    return r.ok ? { enviado: true } : { enviado: false, motivo: r.motivo }
  } catch (e) {
    console.error(`[aviso de guía] error (${evento} ${guiaNumero}):`, e instanceof Error ? e.message : e)
    return { enviado: false, motivo: 'error' }
  }
}
