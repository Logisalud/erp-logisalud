import { NextResponse } from 'next/server'
import { obtenerContexto } from '@/lib/contexto'
import { repositorio } from '@/services/repositorio-actual'
import { renderActaRecepcion } from '@/services/pdf/acta-recepcion'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(_req: Request, { params }: { params: { id: string; actaId: string } }) {
  const ctx = await obtenerContexto()
  if (!ctx || ctx.roles.length === 0) return new NextResponse('Inicia sesión para ver el acta.', { status: 401 })
  const ing = await repositorio().obtenerIngreso(params.id)
  const acta = ing?.actas.find((a) => a.id === params.actaId)
  if (!acta) return new NextResponse('No encontramos esa acta.', { status: 404 })
  const pdf = await renderActaRecepcion(acta)
  return new NextResponse(new Uint8Array(pdf), {
    headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="Acta ${acta.numero}.pdf"`, 'Cache-Control': 'private, no-store' },
  })
}
