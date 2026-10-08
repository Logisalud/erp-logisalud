import { NextResponse } from 'next/server'
import { obtenerContexto } from '@/lib/contexto'
import { repositorio } from '@/services/repositorio-actual'
import { TIPO_XLSX, xlsxSolicitudIngreso } from '@/services/xlsx/documentos'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const ctx = await obtenerContexto()
  if (!ctx || ctx.roles.length === 0) return new NextResponse('Inicia sesión para descargar la solicitud.', { status: 401 })
  const sol = await repositorio().obtenerSolicitud(params.id)
  if (!sol) return new NextResponse('No encontramos esa solicitud.', { status: 404 })
  const xlsx = await xlsxSolicitudIngreso(sol)
  return new NextResponse(new Uint8Array(xlsx), {
    headers: { 'Content-Type': TIPO_XLSX, 'Content-Disposition': `attachment; filename="Solicitud ${sol.numero}.xlsx"`, 'Cache-Control': 'private, no-store' },
  })
}
