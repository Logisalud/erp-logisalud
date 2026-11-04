import { NextResponse } from 'next/server'
import { createHash } from 'node:crypto'
import { obtenerContexto } from '@/lib/contexto'
import { repositorio } from '@/services/repositorio-actual'
import { leerArchivo } from '@/services/archivos'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/** La imagen de la firma dibujada del transportista. Se entrega solo si su huella SHA-256 coincide con la guardada en el acta. */
export async function GET(_req: Request, { params }: { params: { id: string; actaId: string } }) {
  const ctx = await obtenerContexto()
  if (!ctx || ctx.roles.length === 0) return new NextResponse('Inicia sesión para ver la firma.', { status: 401 })
  const sol = await repositorio().obtenerSolicitud(params.id)
  const f = sol?.actas.find((a) => a.id === params.actaId)?.firmas.find((x) => x.rol === 'TRANSPORTISTA')
  if (!f) return new NextResponse('No encontramos esa firma.', { status: 404 })
  let bytes: Buffer | null = null
  if (f.imagen) bytes = Buffer.from(f.imagen.replace(/^data:image\/png;base64,/, ''), 'base64')
  else if (f.imagenRef) {
    bytes = await leerArchivo(f.imagenRef)
    if (bytes && createHash('sha256').update(bytes).digest('hex') !== f.imagenHash) return new NextResponse('La imagen de la firma no coincide con su huella.', { status: 409 })
  }
  if (!bytes) return new NextResponse('No encontramos la imagen de la firma.', { status: 404 })
  return new NextResponse(new Uint8Array(bytes), { headers: { 'Content-Type': 'image/png', 'Cache-Control': 'private, no-store' } })
}
