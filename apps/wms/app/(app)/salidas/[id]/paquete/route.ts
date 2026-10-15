import { NextResponse } from 'next/server'
import { obtenerContexto } from '@/lib/contexto'
import { puedeImprimirPaquete } from '@/domain/documentacion'
import { repositorio } from '@/services/repositorio-actual'
import { armarPaquetePdf } from '@/services/pdf/paquete-documental'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/** El paquete documental de un pedido en un solo PDF (carátula + documentos de los lotes exactos). */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const ctx = await obtenerContexto()
  if (!ctx || !puedeImprimirPaquete(ctx.roles)) return new NextResponse('Solo el Jefe de Transporte y Dirección Técnica imprimen el paquete.', { status: 401 })
  const repo = repositorio()
  const paquete = await repo.paqueteSalida(params.id)
  if (!paquete) return new NextResponse('No encontramos esa salida.', { status: 404 })
  const docs = (await repo.panoramaDocumentos()).documentos
  const pdf = await armarPaquetePdf([paquete], (id) => docs.find((d) => d.id === id)?.archivoRef)
  return new NextResponse(new Uint8Array(pdf), { headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="Paquete ${paquete.salidaNumero}.pdf"`, 'Cache-Control': 'private, no-store' } })
}
