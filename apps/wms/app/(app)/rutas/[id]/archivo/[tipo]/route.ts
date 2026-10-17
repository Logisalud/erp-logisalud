import { NextResponse } from 'next/server'
import { exigirContexto } from '@/lib/contexto'
import { puedeVerRutas } from '@/domain/rutas'
import { repositorio } from '@/services/repositorio-actual'
import { entregarArchivo } from '@/services/archivos'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/** Abre el escaneo firmado (`escaneo`) o el archivo del data logger (`data-logger`) de una ruta. `?v=` pide una versión anterior. Hay que haber iniciado sesión. */
export async function GET(req: Request, { params }: { params: { id: string; tipo: string } }) {
  const ctx = await exigirContexto()
  if (!puedeVerRutas(ctx.roles)) return new NextResponse('No tienes acceso a las rutas.', { status: 401 })
  const que = params.tipo === 'escaneo' ? 'ESCANEO' : params.tipo === 'data-logger' ? 'DATA_LOGGER' : null
  if (!que) return new NextResponse('Ese archivo no existe.', { status: 404 })
  const v = Number(new URL(req.url).searchParams.get('v')) || undefined
  const a = await repositorio().archivoLsFr(params.id, que, v)
  if (!a) return new NextResponse('Esta ruta todavía no tiene ese archivo.', { status: 404 })
  const e = await entregarArchivo(a.ref)
  if (!e) return new NextResponse('El archivo no está disponible (en la demo, se pierde al reiniciar el servidor).', { status: 404 })
  if ('url' in e) return NextResponse.redirect(e.url)
  return new NextResponse(new Uint8Array(e.bytes), { headers: { 'Content-Type': a.tipo || 'application/octet-stream', 'Content-Disposition': `inline; filename="${encodeURIComponent(a.nombre)}"`, 'Cache-Control': 'private, no-store' } })
}
