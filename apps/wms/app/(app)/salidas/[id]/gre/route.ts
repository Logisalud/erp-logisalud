import { NextResponse } from 'next/server'
import { exigirContexto } from '@/lib/contexto'
import { puedeVerSalidas } from '@/domain/despacho'
import { repositorio } from '@/services/repositorio-actual'
import { entregarArchivo } from '@/services/archivos'

export const dynamic = 'force-dynamic'

/** El PDF de la guía de remisión que trajo el cliente (orden por cuenta de un cliente de almacenamiento). Hay que haber iniciado sesión y ver las salidas. */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const ctx = await exigirContexto()
  if (!puedeVerSalidas(ctx.roles)) return new NextResponse('No tienes acceso a las salidas.', { status: 403 })
  const salida = await repositorio().obtenerSalida(params.id)
  if (!salida?.greArchivo) return new NextResponse('Esta orden no tiene guía del cliente adjunta.', { status: 404 })
  const a = await entregarArchivo(salida.greArchivo)
  if (!a) return new NextResponse('El PDF no está disponible (en la demo, se pierde al reiniciar el servidor).', { status: 404 })
  if ('url' in a) return NextResponse.redirect(a.url)
  return new NextResponse(new Uint8Array(a.bytes), { headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="${encodeURIComponent(salida.greNumero ?? 'gre')}.pdf"` } })
}
