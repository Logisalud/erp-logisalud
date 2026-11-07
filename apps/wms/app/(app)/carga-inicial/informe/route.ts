import { NextResponse } from 'next/server'
import { obtenerContexto } from '@/lib/contexto'
import { informeACsv } from '@/domain/informe-carga'
import { informeDeCarga } from '@/services/informe-carga'
import { TIPO_XLSX } from '@/services/xlsx/reportes'
import { xlsxInformeCarga } from '@/services/xlsx/informe-carga'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/** Descarga el informe de validación de la carga de ensayo: POST { texto, formato: 'csv' | 'xlsx' }. No guarda nada. */
export async function POST(req: Request) {
  const ctx = await obtenerContexto()
  if (!ctx || ctx.roles.length === 0) return new NextResponse('Inicia sesión para descargar el informe.', { status: 401 })
  let cuerpo: { texto?: unknown; formato?: unknown }
  try { cuerpo = await req.json() } catch { return new NextResponse('No se entendió lo que se envió.', { status: 400 }) }
  const texto = typeof cuerpo.texto === 'string' ? cuerpo.texto : ''
  const r = await informeDeCarga(texto, { id: ctx.usuario.id, nombre: ctx.usuario.nombre, roles: ctx.roles })
  if (!r.ok) return new NextResponse(r.mensaje, { status: r.mensaje.startsWith('No tienes') ? 403 : 400 })
  const nombre = `Informe carga de ensayo ${new Date().toLocaleDateString('en-CA', { timeZone: 'America/Lima' })}`
  if (cuerpo.formato === 'xlsx') {
    const x = await xlsxInformeCarga(r.informe)
    return new NextResponse(new Uint8Array(x), { headers: { 'Content-Type': TIPO_XLSX, 'Content-Disposition': `attachment; filename="${nombre}.xlsx"`, 'Cache-Control': 'private, no-store' } })
  }
  return new NextResponse(informeACsv(r.informe), { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${nombre}.csv"`, 'Cache-Control': 'private, no-store' } })
}
