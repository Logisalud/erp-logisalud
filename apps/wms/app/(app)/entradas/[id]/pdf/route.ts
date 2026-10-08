import { NextResponse } from 'next/server'
import { obtenerContexto } from '@/lib/contexto'
import { repositorio } from '@/services/repositorio-actual'
import { renderSolicitudIngreso } from '@/services/pdf/solicitud-ingreso'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const ctx = await obtenerContexto()
  if (!ctx || ctx.roles.length === 0) return new NextResponse('Inicia sesión para ver la solicitud.', { status: 401 })
  const sol = await repositorio().obtenerSolicitud(params.id)
  if (!sol) return new NextResponse('No encontramos esa solicitud.', { status: 404 })
  const pdf = await renderSolicitudIngreso(sol)
  return new NextResponse(new Uint8Array(pdf), {
    headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="Solicitud ${sol.numero}.pdf"`, 'Cache-Control': 'private, no-store' },
  })
}
