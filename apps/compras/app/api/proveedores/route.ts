import { NextResponse, type NextRequest } from 'next/server'
import { listarProveedores, type TipoProveedor } from '@/services/proveedores'
import { buscarProveedoresUnificado } from '@/services/proveedores-unificado'

export const dynamic = 'force-dynamic'

const TIPOS_VALIDOS: TipoProveedor[] = ['mercaderia', 'bien', 'ambos']

/**
 * Búsqueda de proveedores para el combobox de los formularios de OC y pago
 * directo — mismo motivo que /api/productos: el combobox consulta a cada
 * tecleo con debounce, y una Server Action por pulsación pierde lo que la
 * persona ya escribió en otros campos del formulario.
 *
 * Con `tipo` (OC de mercadería/bien): solo compras.proveedores, como
 * siempre. Sin `tipo` (Pago Directo, que puede pagarle a cualquiera —
 * notaría, seguros, courier son proveedores de SERVICIO): busca en las dos
 * tablas con buscarProveedoresUnificado y devuelve `fuente` en cada opción,
 * para que el formulario sepa a cuál de las dos referenciar.
 */
export async function GET(request: NextRequest) {
  const termino = request.nextUrl.searchParams.get('q') ?? ''
  const tipoParam = request.nextUrl.searchParams.get('tipo')
  const tipo = TIPOS_VALIDOS.includes(tipoParam as TipoProveedor) ? (tipoParam as TipoProveedor) : undefined
  try {
    if (!tipo) {
      const proveedores = await buscarProveedoresUnificado({ busqueda: termino })
      return NextResponse.json({
        proveedores: proveedores.map((p) => ({
          id: p.id,
          nombre: `${p.razonSocial} — RUC ${p.ruc}`,
          condicionPagoDias: p.condicionPagoDias,
          moneda: p.monedaPrincipal,
          fuente: p.fuente,
        })),
      })
    }
    const proveedores = await listarProveedores({ busqueda: termino, tipo })
    return NextResponse.json({
      proveedores: proveedores.map((p) => ({
        id: p.id,
        nombre: `${p.razon_social} — RUC ${p.ruc}`,
        condicionPagoDias: p.condicion_pago_dias,
        moneda: p.moneda_principal,
        fuente: 'compra' as const,
      })),
    })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message, proveedores: [] }, { status: 500 })
  }
}
