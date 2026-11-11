import { NextResponse } from 'next/server'
import { marcarPiloto } from '@/services/pdf/marca-piloto'
import { obtenerContexto } from '@/lib/contexto'
import { puedeImprimirPaquete, seleccionDePaquete } from '@/domain/documentacion'
import { repositorio } from '@/services/repositorio-actual'
import { armarPaquetePdf } from '@/services/pdf/paquete-documental'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/** El paquete documental de los pedidos marcados de la ruta (o de toda la ruta, sin selección), un pedido tras otro en el orden de las paradas, en un solo PDF. */
export async function GET(req: Request, { params }: { params: { id: string } }) {
  const ctx = await obtenerContexto()
  if (!ctx || !puedeImprimirPaquete(ctx.roles)) return new NextResponse('Solo el Jefe de Transporte y Dirección Técnica imprimen el paquete.', { status: 401 })
  const repo = repositorio()
  const todas = await repo.salidasDeRuta(params.id)
  if (todas.length === 0) return new NextResponse('La ruta todavía no tiene pedidos con salida.', { status: 404 })
  // `?s=id1,id2`: solo los pedidos marcados; sin `s` va toda la ruta
  const ids = seleccionDePaquete(new URL(req.url).searchParams.get('s'), todas) ?? todas
  if (ids.length === 0) return new NextResponse('Marca al menos un pedido para imprimir su paquete.', { status: 400 })
  const paquetes = (await Promise.all(ids.map((id) => repo.paqueteSalida(id)))).filter((p): p is NonNullable<typeof p> => !!p)
  const docs = (await repo.panoramaDocumentos()).documentos
  const pdf = await marcarPiloto(await armarPaquetePdf(paquetes, (id) => docs.find((d) => d.id === id)?.archivoRef))
  return new NextResponse(new Uint8Array(pdf), { headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="Paquete ruta.pdf"`, 'Cache-Control': 'private, no-store' } })
}
