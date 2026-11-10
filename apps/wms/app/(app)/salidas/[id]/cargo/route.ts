import { NextResponse } from 'next/server'
import { exigirContexto } from '@/lib/contexto'
import { puedeVerSalidas } from '@/domain/despacho'
import { tipoContenidoCargo } from '@/domain/entrega-transportista'
import { repositorio } from '@/services/repositorio-actual'
import { entregarArchivo } from '@/services/archivos'

export const dynamic = 'force-dynamic'

/** El cargo firmado de la entrega al transportista del cliente (foto o PDF). Hay que haber iniciado sesión y ver las salidas. */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const ctx = await exigirContexto()
  if (!puedeVerSalidas(ctx.roles)) return new NextResponse('No tienes acceso a las salidas.', { status: 403 })
  const salida = await repositorio().obtenerSalida(params.id)
  const cargo = salida?.entrega?.cargoArchivo
  if (!cargo) return new NextResponse('Esta entrega no tiene cargo adjunto.', { status: 404 })
  const a = await entregarArchivo(cargo)
  if (!a) return new NextResponse('El archivo no está disponible (en la demo, se pierde al reiniciar el servidor).', { status: 404 })
  if ('url' in a) return NextResponse.redirect(a.url)
  const nombre = salida?.entrega?.cargoNombre ?? 'cargo'
  return new NextResponse(new Uint8Array(a.bytes), { headers: { 'Content-Type': tipoContenidoCargo(nombre), 'Content-Disposition': `inline; filename="${encodeURIComponent(nombre)}"` } })
}
