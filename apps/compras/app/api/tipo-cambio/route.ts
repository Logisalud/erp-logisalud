import { NextResponse, type NextRequest } from 'next/server'
import { tipoCambioSunat } from '@/services/tipo-cambio-sunat'

export const dynamic = 'force-dynamic'

/**
 * GET /api/tipo-cambio?fecha=YYYY-MM-DD → { venta } (SUNAT, venta) para esa
 * fecha, o { venta: null } si no se pudo traer. Lo usa el formulario de
 * solicitud en dólares para proponer el valor por defecto.
 */
export async function GET(request: NextRequest) {
  const venta = await tipoCambioSunat(request.nextUrl.searchParams.get('fecha') ?? '')
  return NextResponse.json({ venta })
}
