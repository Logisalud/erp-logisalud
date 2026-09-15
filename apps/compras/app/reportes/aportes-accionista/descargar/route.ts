import { NextResponse, type NextRequest } from 'next/server'
import { perfilActual } from '@logisalud/auth/server'
import { listarAportes, puedeVerAportes } from '@/services/aportes-accionista'
import { generarExcelAportes } from '@/lib/excel-aportes'
import { hoyLima } from '@/domain/fecha'

export const dynamic = 'force-dynamic'

/** Descarga el reporte con los mismos filtros de la pantalla. RLS ya limita
 * quién ve la tabla; el gate acá es para no devolver un archivo vacío con
 * cara de correcto a quien no corresponde. */
export async function GET(request: NextRequest) {
  if (!puedeVerAportes(await perfilActual())) {
    return new NextResponse('No autorizado', { status: 403 })
  }

  const params = request.nextUrl.searchParams
  const filas = await listarAportes({
    desde: params.get('desde') || undefined,
    hasta: params.get('hasta') || undefined,
  })

  const buffer = generarExcelAportes(filas)
  const fecha = hoyLima()
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="aportes-accionista-${fecha}.xlsx"`,
    },
  })
}
