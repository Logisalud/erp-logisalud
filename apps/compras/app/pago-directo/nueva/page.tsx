import { Encabezado } from '@/components/nav'
import { listarCategoriasPagoDirecto } from '@/services/obligaciones'
import { FormularioPagoDirecto } from './formulario'

export const dynamic = 'force-dynamic'

/** "Pago directo" — factura de un proveedor SIN Orden de Compra ni Orden de
 * Servicio (luz, agua, peajes, notaría…). Acceso abierto a toda persona
 * logueada mientras dure `compras.flags.acceso_abierto_temporal` (mismo
 * criterio que la policy RLS `obligaciones_acceso_temporal`) — cualquiera
 * puede pedir que la empresa pague directo, Contabilidad revisa y da
 * conformidad después. */
export default async function NuevoPagoDirecto() {
  const categorias = await listarCategoriasPagoDirecto()

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <Encabezado titulo="Pago directo" atras={{ href: '/pedir-pago', texto: '¿Cómo es tu situación?' }} />
      <p className="mb-4 text-sm text-gray-600">
        Factura de un proveedor sin Orden de Compra ni Orden de Servicio — luz, agua, peajes,
        notaría, seguros, courier y el resto de las categorías de excepción. Transcribe la
        factura real; Contabilidad revisa y da conformidad antes de que entre a una propuesta
        de pago.
      </p>
      <FormularioPagoDirecto categorias={categorias} />
    </main>
  )
}
