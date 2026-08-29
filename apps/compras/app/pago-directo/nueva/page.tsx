import { redirect } from 'next/navigation'
import { Encabezado } from '@/components/nav'
import { perfilActual } from '@logisalud/auth/server'
import { listarCategoriasPagoDirecto, listarTasasDetraccion } from '@/services/obligaciones'
import { FormularioPagoDirecto } from './formulario'

export const dynamic = 'force-dynamic'

/** "Pago directo" — factura de un proveedor SIN Orden de Compra ni Orden de
 * Servicio (luz, agua, peajes, notaría…). Solo Contabilidad/admin puede
 * registrar obligaciones (mismo criterio que el resto de Cuentas por
 * Pagar — RLS `obligaciones_escritura`). */
export default async function NuevoPagoDirecto() {
  const perfil = await perfilActual()
  if (perfil?.area !== 'contabilidad' && perfil?.area !== 'admin') redirect('/pedir-pago')

  const [categorias, tasasDetraccion] = await Promise.all([
    listarCategoriasPagoDirecto(),
    listarTasasDetraccion(),
  ])

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <Encabezado titulo="Pago directo" atras={{ href: '/pedir-pago', texto: '¿Cómo es tu situación?' }} />
      <p className="mb-4 text-sm text-gray-600">
        Factura de un proveedor sin Orden de Compra ni Orden de Servicio — luz, agua, peajes,
        notaría, seguros, courier y el resto de las categorías de excepción. Transcribí la
        factura real; Contabilidad revisa y da conformidad antes de que entre a una propuesta
        de pago.
      </p>
      <FormularioPagoDirecto categorias={categorias} tasasDetraccion={tasasDetraccion} />
    </main>
  )
}
