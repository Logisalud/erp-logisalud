import { NextResponse } from 'next/server'
import { obtenerContexto } from '@/lib/contexto'
import { nombreArchivoActa, organolepticaEsBorrador } from '@/domain/borrador-documento'
import { repositorio } from '@/services/repositorio-actual'
import { extraOrganoleptica } from '@/services/formatos/extra-organoleptica'
import { TIPO_XLSX, xlsxActaOrganoleptica } from '@/services/xlsx/documentos'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const ctx = await obtenerContexto()
  if (!ctx || ctx.roles.length === 0) return new NextResponse('Inicia sesión para descargar el acta.', { status: 401 })
  const acta = await repositorio().obtenerOrganoleptica(params.id)
  if (!acta) return new NextResponse('No encontramos esa acta.', { status: 404 })
  const xlsx = await xlsxActaOrganoleptica(acta, await extraOrganoleptica(acta))
  return new NextResponse(new Uint8Array(xlsx), {
    headers: { 'Content-Type': TIPO_XLSX, 'Content-Disposition': `attachment; filename="${nombreArchivoActa(`Acta organoléptica ${acta.numero}`, organolepticaEsBorrador(acta), 'xlsx')}"`, 'Cache-Control': 'private, no-store' },
  })
}
