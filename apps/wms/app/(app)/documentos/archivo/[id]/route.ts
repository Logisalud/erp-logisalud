import { NextResponse } from 'next/server'
import { exigirContexto } from '@/lib/contexto'
import { repositorio } from '@/services/repositorio-actual'
import { entregarArchivo } from '@/services/archivos'

export const dynamic = 'force-dynamic'

/** Descarga (o abre) un documento. Hay que haber iniciado sesión; en producción se entrega un enlace firmado de pocos minutos. */
export async function GET(req: Request, { params }: { params: { id: string } }) {
  await exigirContexto()
  const doc = (await repositorio().panoramaDocumentos()).documentos.find((d) => d.id === params.id)
  if (!doc) return new NextResponse('No encontramos ese documento.', { status: 404 })
  const a = await entregarArchivo(doc.archivoRef)
  if (!a) return new NextResponse('El archivo de este documento no está disponible (en la demo, se pierde al reiniciar el servidor).', { status: 404 })
  if ('url' in a) return NextResponse.redirect(a.url)
  return new NextResponse(new Uint8Array(a.bytes), { headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="${encodeURIComponent(doc.nombreArchivo)}"` } })
}
