import { NextResponse } from 'next/server'
import { obtenerContexto } from '@/lib/contexto'
import { nombreArchivoActa, actaRecepcionEsBorrador } from '@/domain/borrador-documento'
import { repositorio } from '@/services/repositorio-actual'
import { TIPO_XLSX, xlsxActaRecepcion } from '@/services/xlsx/documentos'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(req: Request, { params }: { params: { id: string; actaId: string } }) {
  const ctx = await obtenerContexto()
  if (!ctx || ctx.roles.length === 0) return new NextResponse('Inicia sesión para descargar el acta.', { status: 401 })
  const sol = await repositorio().obtenerSolicitud(params.id)
  const acta = sol?.actas.find((a) => a.id === params.actaId)
  // La solicitud existe pero todavía no tiene esa acta (por ejemplo, su recepción no empezó): en vez de un error, la pantalla de la solicitud explica qué falta y ofrece «Iniciar recepción».
  if (sol && !acta) return NextResponse.redirect(new URL(`${process.env.NEXT_PUBLIC_BASE_PATH ?? ''}/entradas/${sol.id}?acta=sin-recepcion#acta`, req.url), 303)
  if (!acta) return new NextResponse('No encontramos esa acta.', { status: 404 })
  const xlsx = await xlsxActaRecepcion(acta)
  return new NextResponse(new Uint8Array(xlsx), {
    headers: { 'Content-Type': TIPO_XLSX, 'Content-Disposition': `attachment; filename="${nombreArchivoActa(`Acta ${acta.numero}`, actaRecepcionEsBorrador(acta), 'xlsx')}"`, 'Cache-Control': 'private, no-store' },
  })
}
