import { NextResponse } from 'next/server'
import { obtenerContexto } from '@/lib/contexto'
import { repositorio } from '@/services/repositorio-actual'
import { renderActaOrganoleptica } from '@/services/pdf/acta-organoleptica'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const ctx = await obtenerContexto()
  if (!ctx || ctx.roles.length === 0) return new NextResponse('Inicia sesión para ver el acta.', { status: 401 })
  const acta = await repositorio().obtenerOrganoleptica(params.id)
  if (!acta) return new NextResponse('No encontramos esa acta.', { status: 404 })
  const pdf = await renderActaOrganoleptica(acta)
  return new NextResponse(new Uint8Array(pdf), {
    headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="Acta organoléptica ${acta.numero}.pdf"`, 'Cache-Control': 'private, no-store' },
  })
}
