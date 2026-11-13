import { headers } from 'next/headers'
import { NextResponse } from 'next/server'
import { ipDe, textoEspera } from '@/domain/seguimiento'
import { TEXTO_ENLACE_INVALIDO_STOCK, TEXTO_ERROR_STOCK, TEXTO_NO_DISPONIBLE_STOCK, filtroKardexCliente, nombreArchivoKardex } from '@/domain/stock-cliente'
import { repositorio } from '@/services/repositorio-actual'
import { TIPO_XLSX, xlsxKardexCliente } from '@/services/xlsx/documentos'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const texto = (mensaje: string, status: number) => new NextResponse(mensaje, { status, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer' } })

/** El Kardex del cliente en Excel (el modelo de Logisalud, una hoja por producto, sin ubicaciones). Se pide con el mismo enlace de su página; sin usuario. */
export async function GET(req: Request, { params }: { params: { token: string } }) {
  const h = headers()
  const filtro = filtroKardexCliente(Object.fromEntries(new URL(req.url).searchParams))
  let r
  try { r = await repositorio().consultarKardexCliente(decodeURIComponent(params.token).slice(0, 200), filtro, ipDe(h.get('x-forwarded-for'), h.get('x-real-ip'))) } catch { return texto(TEXTO_ERROR_STOCK, 500) }
  if (r.estado === 'NO_DISPONIBLE') return texto(TEXTO_NO_DISPONIBLE_STOCK, 503)
  if (r.estado === 'ESPERA') return texto(textoEspera(r.esperaSegundos), 429)
  if (r.estado === 'NO_ENCONTRADO') return texto(TEXTO_ENLACE_INVALIDO_STOCK, 404)
  if (r.estado !== 'OK') return texto(TEXTO_ERROR_STOCK, 500)
  const xlsx = await xlsxKardexCliente(r.cliente.nombre, r.productos, filtro, r.formato)
  const unico = filtro.productoId && r.productos.length === 1 ? r.productos[0].codigo : undefined
  return new NextResponse(new Uint8Array(xlsx), {
    headers: { 'Content-Type': TIPO_XLSX, 'Content-Disposition': `attachment; filename="${nombreArchivoKardex(r.cliente.codigo, r.hoy, unico)}"`, 'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer' },
  })
}
