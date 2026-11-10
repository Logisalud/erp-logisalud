import { NextResponse } from 'next/server'
import { exigirContexto } from '@/lib/contexto'
import { repositorio } from '@/services/repositorio-actual'
import { entregarArchivo } from '@/services/archivos'

export const dynamic = 'force-dynamic'

/** Abre el documento del dictamen del DT del cliente (el que llegó por correo). Hay que haber iniciado sesión; en producción se entrega un enlace firmado de pocos minutos. */
export async function GET(_req: Request, { params }: { params: { id: string; dictamenId: string } }) {
  await exigirContexto()
  const acta = await repositorio().obtenerOrganoleptica(decodeURIComponent(params.id))
  const d = acta?.dictamenes?.find((x) => x.id === params.dictamenId)
  if (!d?.documentoRef) return new NextResponse('No encontramos el documento de ese dictamen.', { status: 404 })
  const a = await entregarArchivo(d.documentoRef)
  if (!a) return new NextResponse('El archivo no está disponible (en la demostración se pierde al reiniciar el servidor).', { status: 404 })
  if ('url' in a) return NextResponse.redirect(a.url)
  const tipo = /\.png$/i.test(d.documentoNombre ?? '') ? 'image/png' : /\.jpe?g$/i.test(d.documentoNombre ?? '') ? 'image/jpeg' : 'application/pdf'
  return new NextResponse(new Uint8Array(a.bytes), { headers: { 'Content-Type': tipo, 'Content-Disposition': `inline; filename="${encodeURIComponent(d.documentoNombre ?? 'dictamen')}"` } })
}
