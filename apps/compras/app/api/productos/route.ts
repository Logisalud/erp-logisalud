import { NextResponse, type NextRequest } from 'next/server'
import { buscarProductos } from '@/services/ordenes-compra'

export const dynamic = 'force-dynamic'

/**
 * Búsqueda de productos para el combobox del formulario de OC.
 *
 * Existe como endpoint y no como Server Action porque el combobox consulta a
 * cada tecleo con debounce: una Server Action por pulsación revalida el árbol
 * de React del formulario y pierde lo que la persona ya escribió en las otras
 * líneas.
 */
export async function GET(request: NextRequest) {
  const termino = request.nextUrl.searchParams.get('q') ?? ''
  try {
    return NextResponse.json({ productos: await buscarProductos(termino) })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message, productos: [] }, { status: 500 })
  }
}
