import { NextResponse } from 'next/server'
import { obtenerContexto } from '@/lib/contexto'
import { puedeImprimirPaquete } from '@/domain/documentacion'
import { repositorio } from '@/services/repositorio-actual'
import { armarPaquetePdf } from '@/services/pdf/paquete-documental'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/** El paquete documental de toda la ruta (un pedido tras otro, en el orden de las paradas) en un solo PDF. */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const ctx = await obtenerContexto()
  if (!ctx || !puedeImprimirPaquete(ctx.roles)) return new NextResponse('Solo el Jefe de Transporte y Dirección Técnica imprimen el paquete.', { status: 401 })
  const repo = repositorio()
  const ids = await repo.salidasDeRuta(params.id)
  if (ids.length === 0) return new NextResponse('La ruta todavía no tiene pedidos con salida.', { status: 404 })
  const paquetes = (await Promise.all(ids.map((id) => repo.paqueteSalida(id)))).filter((p): p is NonNullable<typeof p> => !!p)
  const docs = (await repo.panoramaDocumentos()).documentos
  const pdf = await armarPaquetePdf(paquetes, (id) => docs.find((d) => d.id === id)?.archivoRef)
  return new NextResponse(new Uint8Array(pdf), { headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="Paquete ruta.pdf"`, 'Cache-Control': 'private, no-store' } })
}
