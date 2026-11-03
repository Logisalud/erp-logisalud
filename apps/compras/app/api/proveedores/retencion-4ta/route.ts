import { NextResponse, type NextRequest } from 'next/server'
import { situacionRetencion } from '@/services/retencion-4ta'

export const dynamic = 'force-dynamic'

/**
 * GET /api/proveedores/retencion-4ta?id=…&fuente=compra|servicio&fecha=YYYY-MM-DD
 * → { personaNatural, constancia: { numero, ejercicio } | null }
 *
 * Solo para MOSTRAR el desglose 92%/8% antes de confirmar un RxH en Pago
 * Directo. El servidor lo vuelve a calcular al guardar: lo que diga esto
 * nunca decide la retención.
 */
export async function GET(request: NextRequest) {
  const p = request.nextUrl.searchParams
  const id = p.get('id') ?? ''
  const fuente = p.get('fuente') === 'servicio' ? 'servicio' : 'compra'
  const fecha = /^\d{4}-\d{2}-\d{2}$/.test(p.get('fecha') ?? '') ? (p.get('fecha') as string) : new Date().toISOString().slice(0, 10)
  if (!id) return NextResponse.json({ personaNatural: false, constancia: null })
  try {
    return NextResponse.json(await situacionRetencion(fuente, id, fecha))
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message, personaNatural: false, constancia: null }, { status: 500 })
  }
}
