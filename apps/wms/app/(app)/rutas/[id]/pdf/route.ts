import { NextResponse } from 'next/server'
import { marcarPiloto } from '@/services/pdf/marca-piloto'
import { obtenerContexto } from '@/lib/contexto'
import { puedeVerRutas } from '@/domain/rutas'
import { repositorio } from '@/services/repositorio-actual'
import { hojaDigemidDisponible, soloEntregadas, TEXTO_HOJA_DIGEMID_AL_FINAL } from '@/domain/ls-fr-43-03'
import { renderLsFr4303 } from '@/services/pdf/ls-fr-43-03'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/** El PDF del formato LS-FR.43.03 de una ruta confirmada. */
export async function GET(req: Request, { params }: { params: { id: string } }) {
  const ctx = await obtenerContexto()
  if (!ctx || !puedeVerRutas(ctx.roles)) return new NextResponse('Inicia sesión con un perfil de transporte o almacén para ver el formato.', { status: 401 })
  const registro = await repositorio().registroLsFr(params.id)
  if (!registro) return new NextResponse('La ruta todavía no tiene registro: se crea al confirmarla.', { status: 404 })
  // `?digemid=1`: la hoja para DIGEMID es la misma ruta sin lo que no se entregó
  const paraDigemid = new URL(req.url).searchParams.get('digemid') === '1'
  if (paraDigemid) {
    const ruta = await repositorio().obtenerRuta(params.id)
    if (!ruta || !hojaDigemidDisponible(ruta.estado)) return new NextResponse(`La hoja para DIGEMID aún no está disponible. ${TEXTO_HOJA_DIGEMID_AL_FINAL}`, { status: 409 })
  }
  const pdf = await marcarPiloto(await renderLsFr4303(paraDigemid ? soloEntregadas(registro) : registro))
  return new NextResponse(new Uint8Array(pdf), {
    headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="${registro.codigo} ${registro.rutaNumero}${paraDigemid ? ' DIGEMID' : ''}.pdf"`, 'Cache-Control': 'private, no-store' },
  })
}
