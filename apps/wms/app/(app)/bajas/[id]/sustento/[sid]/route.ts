import { NextResponse } from 'next/server'
import { exigirContexto } from '@/lib/contexto'
import { repositorio } from '@/services/repositorio-actual'
import { entregarArchivo } from '@/services/archivos'
import { contentTypeSustento } from '@/domain/bajas'

export const dynamic = 'force-dynamic'

/** Abre la alerta de DIGEMID o la comunicación del proveedor adjunta a una baja. Hay que haber iniciado sesión; en producción se entrega un enlace firmado. */
export async function GET(_req: Request, { params }: { params: { id: string; sid: string } }) {
  await exigirContexto()
  const orden = await repositorio().obtenerBaja(params.id)
  const sustento = orden?.lineas.flatMap((l) => l.sustentos).find((x) => x.id === params.sid)
  if (!sustento) return new NextResponse('No encontramos ese archivo.', { status: 404 })
  const a = await entregarArchivo(sustento.archivoRef)
  if (!a) return new NextResponse('El archivo no está disponible (en la demostración, se pierde al reiniciar el servidor).', { status: 404 })
  if ('url' in a) return NextResponse.redirect(a.url)
  return new NextResponse(new Uint8Array(a.bytes), { headers: { 'Content-Type': contentTypeSustento(sustento.nombreArchivo), 'Content-Disposition': `inline; filename="${encodeURIComponent(sustento.nombreArchivo)}"` } })
}
