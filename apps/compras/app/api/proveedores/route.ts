import { NextResponse, type NextRequest } from 'next/server'
import { listarProveedores, type TipoProveedor } from '@/services/proveedores'

export const dynamic = 'force-dynamic'

const TIPOS_VALIDOS: TipoProveedor[] = ['mercaderia', 'bien', 'ambos']

/**
 * Búsqueda de proveedores para el combobox de los formularios de OC y pago
 * directo — mismo motivo que /api/productos: el combobox consulta a cada
 * tecleo con debounce, y una Server Action por pulsación pierde lo que la
 * persona ya escribió en otros campos del formulario.
 */
export async function GET(request: NextRequest) {
  const termino = request.nextUrl.searchParams.get('q') ?? ''
  const tipoParam = request.nextUrl.searchParams.get('tipo')
  const tipo = TIPOS_VALIDOS.includes(tipoParam as TipoProveedor) ? (tipoParam as TipoProveedor) : undefined
  try {
    const proveedores = await listarProveedores({ busqueda: termino, tipo })
    return NextResponse.json({
      proveedores: proveedores.map((p) => ({
        id: p.id,
        nombre: `${p.razon_social} — RUC ${p.ruc}`,
        condicionPagoDias: p.condicion_pago_dias,
        moneda: p.moneda_principal,
      })),
    })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message, proveedores: [] }, { status: 500 })
  }
}
