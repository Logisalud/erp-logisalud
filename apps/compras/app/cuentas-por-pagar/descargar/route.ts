import { NextResponse, type NextRequest } from 'next/server'
import { listarVistaCuentasPorPagar } from '@/services/obligaciones'
import { generarExcelCuentasPorPagar } from '@/lib/excel-cuentas-por-pagar'
import {
  nombreDelRecorte, resolverFiltroCuentasPorPagar,
} from '@/domain/filtros-cuentas-por-pagar'

export const dynamic = 'force-dynamic'

/**
 * Descarga la vista actual de /cuentas-por-pagar en .xlsx — mismos
 * searchParams, mismo resolutor de filtro y mismo servicio de datos que la
 * pantalla. No hay dos lógicas: hay dos renderers.
 *
 * RLS sigue mandando: la ruta usa el cliente del usuario, así que nadie baja
 * en Excel lo que no puede ver en pantalla.
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams
  const filtro = resolverFiltroCuentasPorPagar({
    estado: params.get('estado') ?? undefined,
    categoria: params.get('categoria') ?? undefined,
    listas: params.get('listas') ?? undefined,
  })

  const filas = await listarVistaCuentasPorPagar(filtro)
  const buffer = generarExcelCuentasPorPagar(filas)
  const fecha = new Date().toISOString().slice(0, 10)
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="cuentas-por-pagar-${nombreDelRecorte(filtro)}-${fecha}.xlsx"`,
    },
  })
}
