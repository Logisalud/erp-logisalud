import { NextResponse } from 'next/server'
import { marcarPiloto } from '@/services/pdf/marca-piloto'
import { obtenerContexto } from '@/lib/contexto'
import { puedeVerSalidas } from '@/domain/despacho'
import { repositorio } from '@/services/repositorio-actual'
import { renderPreGuia } from '@/services/pdf/pre-guia'
import { modoPilotoActivo } from '@/lib/modo-piloto'
import { quienAlisto } from '@/domain/pre-guia'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/** La pre-guía de una orden en PDF (A4): el borrador que reserva el número; la guía se genera en Nubefact al enviarla. */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const ctx = await obtenerContexto()
  if (!ctx || !puedeVerSalidas(ctx.roles)) return new NextResponse('Inicia sesión con un perfil de almacén o transporte.', { status: 401 })
  const repo = repositorio()
  const [pre, guia] = await Promise.all([repo.preGuiaDe(params.id), repo.datosGuia(params.id)])
  if (!pre || !guia) return new NextResponse('Esta orden todavía no tiene pre-guía (se crea al dar la conformidad).', { status: 404 })
  // quien hizo el picking sale impreso en la constancia de recepción (quien atiende la ruta se escribe a mano)
  const salida = await repo.obtenerSalida(params.id)
  const orden = salida?.ordenPickingId ? await repo.obtenerOrdenPicking(salida.ordenPickingId) : null
  const generadaEn = new Date().toLocaleString('es-PE', { timeZone: 'America/Lima', dateStyle: 'short', timeStyle: 'short' })
  const pdf = await marcarPiloto(await renderPreGuia({ pre, guia, piloto: await modoPilotoActivo(), generadaEn, alistadoPor: quienAlisto(orden) }))
  return new NextResponse(new Uint8Array(pdf), { headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="Pre-guia ${pre.numeroCompleto}.pdf"`, 'Cache-Control': 'private, no-store' } })
}
