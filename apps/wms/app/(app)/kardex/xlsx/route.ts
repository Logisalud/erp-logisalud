import { NextResponse } from 'next/server'
import { obtenerContexto } from '@/lib/contexto'
import { filtroDesdeUrl } from '@/lib/filtro-kardex'
import { repositorio } from '@/services/repositorio-actual'
import { TIPO_XLSX, xlsxKardex } from '@/services/xlsx/documentos'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(req: Request) {
  const ctx = await obtenerContexto()
  if (!ctx || ctx.roles.length === 0) return new NextResponse('Inicia sesión para descargar el Kardex.', { status: 401 })
  const filtro = filtroDesdeUrl(Object.fromEntries(new URL(req.url).searchParams))
  if (!filtro) return new NextResponse('Elige primero un producto.', { status: 400 })
  const repo = repositorio()
  const [filas, p, par] = await Promise.all([repo.kardex(filtro), repo.panorama(), repo.parametrosInventario()])
  const prod = p.productos.find((x) => x.id === filtro.productoId)
  const xlsx = await xlsxKardex(filas, filtro, prod ? `${prod.codigo} · ${prod.descripcion}` : 'Producto', par.kardexCodigoFormato)
  return new NextResponse(new Uint8Array(xlsx), {
    headers: { 'Content-Type': TIPO_XLSX, 'Content-Disposition': `attachment; filename="Kardex ${prod?.codigo ?? ''}.xlsx"`, 'Cache-Control': 'private, no-store' },
  })
}
