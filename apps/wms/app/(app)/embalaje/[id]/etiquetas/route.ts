import { NextResponse } from 'next/server'
import { marcarPiloto } from '@/services/pdf/marca-piloto'
import { obtenerContexto } from '@/lib/contexto'
import { puedeVerSalidas } from '@/domain/despacho'
import { llevaEtiqueta } from '@/domain/pedidos-despacho'
import { repositorio } from '@/services/repositorio-actual'
import { renderEtiquetasBultos } from '@/services/pdf/etiquetas-bultos'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/** Las etiquetas de los bultos de un pedido de provincia (104,6 × 75 mm, hoja LOGISALUD de la etiquetera TSC TE200, con QR). */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const ctx = await obtenerContexto()
  if (!ctx || !puedeVerSalidas(ctx.roles)) return new NextResponse('Inicia sesión con un perfil de almacén o transporte.', { status: 401 })
  const e = await repositorio().embalajeSalida(params.id)
  if (!e) return new NextResponse('No encontramos esa salida.', { status: 404 })
  if (e.bultosVigentes.length === 0) return new NextResponse('El pedido todavía no tiene bultos: se registran al dar la conformidad.', { status: 404 })
  // 1d: la dirección de entrega sale de los mismos datos de la guía (cliente de Pedidos u orden manual)
  const datos = await repositorio().datosGuia(params.id).catch(() => null)
  if (datos && !llevaEtiqueta(datos.destinatario.ubigeo)) return new NextResponse('Este pedido va a Lima: no lleva etiquetas.', { status: 409 })
  // el n.º de guía: la vigente o, si todavía no hay, la pre-guía con su número reservado
  const guiaNumero = (await repositorio().paqueteSalida(params.id).catch(() => null))?.guia?.numero ?? (await repositorio().preGuiaDe(params.id).catch(() => null))?.numeroCompleto
  const pdf = await marcarPiloto(await renderEtiquetasBultos({
    salidaNumero: e.salidaNumero, pedidoNumero: e.pedidoNumero, cliente: datos?.destinatario.nombre ?? e.cliente, rutaNumero: e.rutaNumero, guiaNumero,
    direccion: datos?.destinatario.direccion ?? undefined, distrito: datos?.destinatario.distrito ?? undefined, ubigeo: datos?.destinatario.ubigeo ?? undefined, bultos: e.bultosVigentes,
  }))
  return new NextResponse(new Uint8Array(pdf), { headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="Etiquetas ${e.salidaNumero}.pdf"`, 'Cache-Control': 'private, no-store' } })
}
