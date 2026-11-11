import 'server-only'
import { asuntoAvisoGuia, destinatariosDeAviso, htmlAvisoGuia, textoAvisoGuia } from '@/domain/aviso-guia'
import { modoPilotoActivo } from '@/lib/modo-piloto'
import { correoConfigurado, enviarCorreo } from './correo/resend'
import { repositorio } from './repositorio-actual'

/**
 * «La guía de este pedido ya está lista: puede facturar». Se manda por Resend a quien factura (AVISO_FACTURACION_CORREOS, lista separada por comas).
 * Sin esa lista o sin RESEND_API_KEY/RESEND_FROM el aviso está apagado. Es de mejor esfuerzo: un fallo se anota en el registro del servidor y NUNCA frena la guía.
 */
export async function avisarGuiaLista(salidaId: string, guiaNumero: string, origen: 'WMS' | 'PANEL'): Promise<{ enviado: boolean; motivo?: string }> {
  try {
    const para = destinatariosDeAviso(process.env.AVISO_FACTURACION_CORREOS)
    if (para.length === 0 || !correoConfigurado()) return { enviado: false, motivo: 'apagado' }
    const repo = repositorio()
    const [paquete, salida] = await Promise.all([repo.paqueteSalida(salidaId), repo.obtenerSalida(salidaId)])
    const d = {
      guiaNumero, pedidoNumero: paquete?.pedidoNumero, ordenNumero: paquete?.salidaNumero ?? salida?.numero ?? '—', cliente: paquete?.cliente, ruc: paquete?.ruc,
      bultos: paquete?.guia?.bultos, origen, piloto: await modoPilotoActivo(),
    }
    const r = await enviarCorreo({ para, asunto: asuntoAvisoGuia(d), texto: textoAvisoGuia(d), html: htmlAvisoGuia(d), clave: `guia-lista-${guiaNumero}` })
    if (!r.ok) console.error(`[aviso de guía lista] no se envió (${guiaNumero}): ${r.motivo}`)
    return r.ok ? { enviado: true } : { enviado: false, motivo: r.motivo }
  } catch (e) {
    console.error(`[aviso de guía lista] error (${guiaNumero}):`, e instanceof Error ? e.message : e)
    return { enviado: false, motivo: 'error' }
  }
}
