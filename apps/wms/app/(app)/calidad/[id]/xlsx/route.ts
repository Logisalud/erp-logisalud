import { NextResponse } from 'next/server'
import { obtenerContexto } from '@/lib/contexto'
import { repositorio } from '@/services/repositorio-actual'
import { TIPO_XLSX, xlsxActaOrganoleptica } from '@/services/xlsx/documentos'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const ctx = await obtenerContexto()
  if (!ctx || ctx.roles.length === 0) return new NextResponse('Inicia sesión para descargar el acta.', { status: 401 })
  const acta = await repositorio().obtenerOrganoleptica(params.id)
  if (!acta) return new NextResponse('No encontramos esa acta.', { status: 404 })
  const xlsx = await xlsxActaOrganoleptica(acta)
  return new NextResponse(new Uint8Array(xlsx), {
    headers: { 'Content-Type': TIPO_XLSX, 'Content-Disposition': `attachment; filename="Acta organoléptica ${acta.numero}.xlsx"`, 'Cache-Control': 'private, no-store' },
  })
}
