import { NextResponse } from 'next/server'
import { obtenerContexto } from '@/lib/contexto'
import { repositorio } from '@/services/repositorio-actual'
import { renderOrdenBaja } from '@/services/pdf/orden-baja'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/** La Orden de Baja LS-FR.56.01 en PDF. Emitida: el contenido guardado al autorizar (no cambia). Antes: un borrador con los datos de hoy, marcado como tal. */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const ctx = await obtenerContexto()
  if (!ctx || ctx.roles.length === 0) return new NextResponse('Inicia sesión para ver la Orden de Baja.', { status: 401 })
  const r = await repositorio().contenidoBaja(params.id)
  if (!r) return new NextResponse('No encontramos esa Orden de Baja.', { status: 404 })
  const pdf = await renderOrdenBaja(r.contenido, r.borrador, r.estado, r.hash)
  return new NextResponse(new Uint8Array(pdf), {
    headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="Orden de baja ${r.contenido.numero}.pdf"`, 'Cache-Control': 'private, no-store' },
  })
}
