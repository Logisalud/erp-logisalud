import { NextResponse } from 'next/server'
import { obtenerContexto } from '@/lib/contexto'
import { filtroDesdeUrl } from '@/lib/filtro-kardex'
import { repositorio } from '@/services/repositorio-actual'
import { renderKardex } from '@/services/pdf/kardex'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(req: Request) {
  const ctx = await obtenerContexto()
  if (!ctx || ctx.roles.length === 0) return new NextResponse('Inicia sesión para ver el Kardex.', { status: 401 })
  const filtro = filtroDesdeUrl(Object.fromEntries(new URL(req.url).searchParams))
  if (!filtro) return new NextResponse('Elige primero un producto.', { status: 400 })
  const repo = repositorio()
  const [filas, p, par] = await Promise.all([repo.kardex(filtro), repo.panorama(), repo.parametrosInventario()])
  const prod = p.productos.find((x) => x.id === filtro.productoId)
  const nombre = prod ? `${prod.codigo} · ${prod.descripcion}` : 'Producto'
  const pdf = await renderKardex(filas, filtro, nombre, par.kardexCodigoFormato)
  return new NextResponse(new Uint8Array(pdf), {
    headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="Kardex ${prod?.codigo ?? ''}.pdf"`, 'Cache-Control': 'private, no-store' },
  })
}
