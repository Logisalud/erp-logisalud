import { NextResponse, type NextRequest } from 'next/server'
import { obtenerSabanaMaestra } from '@/services/reportes-sabana'
import { generarSabanaExcel } from '@/lib/excel-sabana'
import { ORIGENES_OBLIGACION, type OrigenObligacion } from '@/domain/reportes'

export const dynamic = 'force-dynamic'

/**
 * Descarga la sábana maestra en .xlsx — mismos filtros por searchParams que
 * la pantalla /reportes/sabana-maestra, mismo servicio de datos: no hay dos
 * lógicas distintas, solo dos renderers (tabla en pantalla vs. buffer xlsx).
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams
  const origenParam = params.get('origen')
  const origen = (ORIGENES_OBLIGACION as readonly string[]).includes(origenParam ?? '')
    ? (origenParam as OrigenObligacion)
    : undefined

  const filas = await obtenerSabanaMaestra({
    origen,
    proveedorId: params.get('proveedorId') || undefined,
    fechaDesde: params.get('desde') || undefined,
    fechaHasta: params.get('hasta') || undefined,
  })

  const buffer = generarSabanaExcel(filas)
  const fecha = new Date().toISOString().slice(0, 10)
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="sabana-maestra-${fecha}.xlsx"`,
    },
  })
}
