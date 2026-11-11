import { NextResponse } from 'next/server'
import { marcarPiloto } from '@/services/pdf/marca-piloto'
import { obtenerContexto } from '@/lib/contexto'
import { repositorio } from '@/services/repositorio-actual'
import { cajasSaldoDe } from '@/services/rotulos'
import { datosDeRotulo, fechaDeConteo, decodificarPedido, puedeImprimirRotulos, validarPedidoRotulos, type DatosRotulo } from '@/domain/rotulos'
import { hoyEnLima } from '@/domain/fechas'
import { renderRotulosSaldo } from '@/services/pdf/rotulos-saldo'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/** Los rótulos de caja saldo (LS.ET.07), dos por hoja A4: `?p=loteId:ESTADO:copias,…`. La cantidad y la firma quedan en blanco; la fecha de conteo es hoy, o la que se elija (`f=AAAA-MM-DD`, nunca futura). */
export async function GET(req: Request) {
  const ctx = await obtenerContexto()
  if (!ctx || !puedeImprimirRotulos(ctx.roles)) return new NextResponse('Inicia sesión con un perfil de almacén.', { status: 401 })
  const pedido = decodificarPedido(new URL(req.url).searchParams.get('p'))
  const error = validarPedidoRotulos(pedido)
  if (error) return new NextResponse(error, { status: 400 })
  const cajas = new Map(cajasSaldoDe(await repositorio().panorama()).map((c) => [c.clave, c]))
  const hoy = fechaDeConteo(new URL(req.url).searchParams.get('f'), hoyEnLima())
  const rotulos: DatosRotulo[] = []
  for (const x of pedido) {
    const c = cajas.get(x.clave)
    if (!c) return new NextResponse('Una de las cajas ya no tiene stock: vuelve a elegirla.', { status: 404 })
    for (let i = 0; i < x.copias; i++) rotulos.push(datosDeRotulo(c, hoy))
  }
  const pdf = await marcarPiloto(await renderRotulosSaldo(rotulos))
  return new NextResponse(new Uint8Array(pdf), { headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="Rotulos LS.ET.07.pdf"`, 'Cache-Control': 'private, no-store' } })
}
