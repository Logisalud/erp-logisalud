import { NextResponse } from 'next/server'
import { obtenerContexto } from '@/lib/contexto'
import { puedeVerSalidas } from '@/domain/despacho'
import { repositorio } from '@/services/repositorio-actual'
import { renderHojaPicking } from '@/services/pdf/hoja-picking'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/** La hoja de picking para imprimir (líneas en el orden del recorrido). */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const ctx = await obtenerContexto()
  if (!ctx || !puedeVerSalidas(ctx.roles)) return new NextResponse('Inicia sesión con un perfil de almacén o transporte.', { status: 401 })
  const orden = await repositorio().obtenerOrdenPicking(params.id)
  if (!orden) return new NextResponse('No encontramos esa orden de picking.', { status: 404 })
  const pdf = await renderHojaPicking(orden)
  return new NextResponse(new Uint8Array(pdf), { headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="Picking ${orden.numero}.pdf"`, 'Cache-Control': 'private, no-store' } })
}
