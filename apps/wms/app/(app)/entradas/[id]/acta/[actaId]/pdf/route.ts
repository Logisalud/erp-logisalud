import { NextResponse } from 'next/server'
import { marcarPiloto } from '@/services/pdf/marca-piloto'
import { obtenerContexto } from '@/lib/contexto'
import { nombreArchivoActa, actaRecepcionEsBorrador } from '@/domain/borrador-documento'
import { repositorio } from '@/services/repositorio-actual'
import { renderActaRecepcion } from '@/services/pdf/acta-recepcion'
import { leerArchivo } from '@/services/archivos'
import { createHash } from 'node:crypto'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(req: Request, { params }: { params: { id: string; actaId: string } }) {
  const ctx = await obtenerContexto()
  if (!ctx || ctx.roles.length === 0) return new NextResponse('Inicia sesión para ver el acta.', { status: 401 })
  const sol = await repositorio().obtenerSolicitud(params.id)
  const acta = sol?.actas.find((a) => a.id === params.actaId)
  // La solicitud existe pero todavía no tiene esa acta (por ejemplo, su recepción no empezó): en vez de un error, la pantalla de la solicitud explica qué falta y ofrece «Iniciar recepción».
  if (sol && !acta) return NextResponse.redirect(new URL(`${process.env.NEXT_PUBLIC_BASE_PATH ?? ''}/entradas/${sol.id}?acta=sin-recepcion#acta`, req.url), 303)
  if (!acta) return new NextResponse('No encontramos esa acta.', { status: 404 })
  // Las firmas dibujadas viven en el Storage: se leen y solo se imprimen si su huella coincide con la del acta.
  const imagenes: Record<string, string> = {}
  for (const f of acta.firmas) {
    if (!f.imagenRef) continue
    const bytes = await leerArchivo(f.imagenRef)
    if (bytes && createHash('sha256').update(bytes).digest('hex') === f.imagenHash) imagenes[f.imagenRef] = `data:image/png;base64,${bytes.toString('base64')}`
  }
  const pdf = await marcarPiloto(await renderActaRecepcion(acta, imagenes))
  return new NextResponse(new Uint8Array(pdf), {
    headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="${nombreArchivoActa(`Acta ${acta.numero}`, actaRecepcionEsBorrador(acta), 'pdf')}"`, 'Cache-Control': 'private, no-store' },
  })
}
