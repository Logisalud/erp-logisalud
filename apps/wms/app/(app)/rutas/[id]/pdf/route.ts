import { NextResponse } from 'next/server'
import { obtenerContexto } from '@/lib/contexto'
import { puedeVerRutas } from '@/domain/rutas'
import { repositorio } from '@/services/repositorio-actual'
import { renderLsFr4303 } from '@/services/pdf/ls-fr-43-03'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/** El PDF del formato LS-FR.43.03 de una ruta confirmada. */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const ctx = await obtenerContexto()
  if (!ctx || !puedeVerRutas(ctx.roles)) return new NextResponse('Inicia sesión con un perfil de transporte o almacén para ver el formato.', { status: 401 })
  const registro = await repositorio().registroLsFr(params.id)
  if (!registro) return new NextResponse('La ruta todavía no tiene registro: se crea al confirmarla.', { status: 404 })
  const pdf = await renderLsFr4303(registro)
  return new NextResponse(new Uint8Array(pdf), {
    headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="${registro.codigo} ${registro.rutaNumero}.pdf"`, 'Cache-Control': 'private, no-store' },
  })
}
