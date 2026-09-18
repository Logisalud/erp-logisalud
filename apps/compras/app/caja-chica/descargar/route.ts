import { NextResponse } from 'next/server'
import { perfilActual } from '@logisalud/auth/server'
import { listarMovimientosParaReporte } from '@/services/caja-chica'
import { generarExcelCajaChica } from '@/lib/excel-reporte-caja-chica'
import { hoyLima } from '@/domain/fecha'

export const dynamic = 'force-dynamic'

/**
 * Baja el detalle de gastos de Caja Chica con los filtros puestos — mismo
 * patrón que /cuentas-por-pagar/descargar: el Excel trae exactamente las
 * filas que se están viendo, porque las pide por el mismo camino.
 */
export async function GET(request: Request) {
  const perfil = await perfilActual()
  if (perfil?.area !== 'contabilidad' && perfil?.area !== 'admin') {
    return new NextResponse('Este reporte es de Contabilidad.', { status: 403 })
  }

  const url = new URL(request.url)
  const filas = await listarMovimientosParaReporte({
    fondoId: url.searchParams.get('fondo') ?? undefined,
    desde: url.searchParams.get('desde') ?? undefined,
    hasta: url.searchParams.get('hasta') ?? undefined,
  })

  const buffer = generarExcelCajaChica(filas)
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="caja-chica-${hoyLima()}.xlsx"`,
    },
  })
}
