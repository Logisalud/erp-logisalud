import { NextResponse } from 'next/server'
import { obtenerContexto } from '@/lib/contexto'
import { cargarFilas } from '@/lib/reportes-datos'
import { aCsv, aplicarFiltros, esIdReporte, filtrosDeUrl, ordenarFilas, ordenDeTexto, puedeVerReporte, REPORTES } from '@/domain/reportes'
import { TIPO_XLSX, xlsxReporte } from '@/services/xlsx/reportes'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/** Descarga un reporte con los mismos filtros que se ven en pantalla: ?formato=csv|xlsx&…filtros. */
export async function GET(req: Request, { params }: { params: { id: string } }) {
  const ctx = await obtenerContexto()
  if (!ctx || ctx.roles.length === 0) return new NextResponse('Inicia sesión para descargar el reporte.', { status: 401 })
  const id = decodeURIComponent(params.id).toUpperCase()
  if (!esIdReporte(id)) return new NextResponse('Ese reporte no existe.', { status: 404 })
  if (!puedeVerReporte(id, ctx.roles)) return new NextResponse('No tienes acceso a este reporte.', { status: 403 })
  const url = new URL(req.url)
  const formato = url.searchParams.get('formato') === 'xlsx' ? 'xlsx' : 'csv'
  const def = REPORTES[id]
  const filtros = filtrosDeUrl(def, Object.fromEntries(url.searchParams))
  // Lo mismo que se ve en pantalla: mismos filtros y mismo orden.
  const filas = ordenarFilas(def, aplicarFiltros(def, await cargarFilas(id, { id: ctx.usuario.id, nombre: ctx.usuario.nombre, roles: ctx.roles }), filtros), ordenDeTexto(def, url.searchParams.get('orden')))
  const nombre = `${def.titulo} ${new Date().toLocaleDateString('en-CA', { timeZone: 'America/Lima' })}`
  if (formato === 'xlsx') {
    const x = await xlsxReporte(def, filas, filtros)
    return new NextResponse(new Uint8Array(x), { headers: { 'Content-Type': TIPO_XLSX, 'Content-Disposition': `attachment; filename="${nombre}.xlsx"`, 'Cache-Control': 'private, no-store' } })
  }
  return new NextResponse(aCsv(def, filas), { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${nombre}.csv"`, 'Cache-Control': 'private, no-store' } })
}
