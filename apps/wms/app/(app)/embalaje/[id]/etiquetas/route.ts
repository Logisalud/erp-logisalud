import { NextResponse } from 'next/server'
import { obtenerContexto } from '@/lib/contexto'
import { puedeVerSalidas } from '@/domain/despacho'
import { repositorio } from '@/services/repositorio-actual'
import { renderEtiquetasBultos } from '@/services/pdf/etiquetas-bultos'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/** Las etiquetas de los bultos de un pedido (100 × 150 mm, con QR). */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const ctx = await obtenerContexto()
  if (!ctx || !puedeVerSalidas(ctx.roles)) return new NextResponse('Inicia sesión con un perfil de almacén o transporte.', { status: 401 })
  const e = await repositorio().embalajeSalida(params.id)
  if (!e) return new NextResponse('No encontramos esa salida.', { status: 404 })
  if (e.bultosVigentes.length === 0) return new NextResponse('El pedido todavía no está embalado.', { status: 404 })
  const pdf = await renderEtiquetasBultos({ salidaNumero: e.salidaNumero, pedidoNumero: e.pedidoNumero, cliente: e.cliente, rutaNumero: e.rutaNumero, bultos: e.bultosVigentes })
  return new NextResponse(new Uint8Array(pdf), { headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="Etiquetas ${e.salidaNumero}.pdf"`, 'Cache-Control': 'private, no-store' } })
}
