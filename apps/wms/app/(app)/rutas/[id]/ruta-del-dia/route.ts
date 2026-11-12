import { NextResponse } from 'next/server'
import { marcarPiloto } from '@/services/pdf/marca-piloto'
import { obtenerContexto } from '@/lib/contexto'
import { puedeVerRutas } from '@/domain/rutas'
import { armarRutaDelDia, guiaPorSalida } from '@/domain/ruta-del-dia'
import { repositorio } from '@/services/repositorio-actual'
import { renderRutaDelDia } from '@/services/pdf/ruta-del-dia'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/** La hoja de la ruta del día en PDF (A4 horizontal): lo que Roberto le entrega al transportista. */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const ctx = await obtenerContexto()
  if (!ctx || !puedeVerRutas(ctx.roles)) return new NextResponse('Inicia sesión con un perfil de transporte o almacén.', { status: 401 })
  const repo = repositorio()
  const ruta = await repo.obtenerRuta(params.id)
  if (!ruta) return new NextResponse('No encontramos esa ruta.', { status: 404 })
  // el serie-número de cada orden: la guía enviada manda sobre la pre-guía
  const pdf = await marcarPiloto(await renderRutaDelDia(armarRutaDelDia(ruta, guiaPorSalida(await repo.listarGuias()))))
  return new NextResponse(new Uint8Array(pdf), { headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="Ruta del dia ${ruta.numero}.pdf"`, 'Cache-Control': 'private, no-store' } })
}
