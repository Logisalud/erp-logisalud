import { Encabezado } from '@/components/nav'
import { obtenerOCParaFacturaDirecta } from '@/services/facturas-pendientes'
import { listarTasasDetraccion } from '@/services/obligaciones'
import { FormularioFacturaCompra } from './formulario'

export const dynamic = 'force-dynamic'

export default async function RegistrarFacturaDirecta({ params }: { params: { ocId: string } }) {
  const [oc, tasasDetraccion] = await Promise.all([
    obtenerOCParaFacturaDirecta(params.ocId),
    listarTasasDetraccion(),
  ])

  if (!oc) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-8">
        <Encabezado titulo="Registrar factura" atras={{ href: '/facturas/nueva/por-oc', texto: 'Facturas por orden de compra' }} />
        <p className="card text-sm text-gray-600">No se encontró esta orden de compra.</p>
      </main>
    )
  }

  if (oc.items.length === 0) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-8">
        <Encabezado titulo={oc.codigo} atras={{ href: '/facturas/nueva/por-oc', texto: 'Facturas por orden de compra' }} />
        <p className="card text-sm text-gray-600">No hay ninguna línea de esta orden pendiente de facturar.</p>
      </main>
    )
  }

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <Encabezado titulo={oc.codigo} atras={{ href: '/facturas/nueva/por-oc', texto: 'Facturas por orden de compra' }} />
      <p className="mb-4 text-sm text-gray-600">
        {oc.proveedor?.razon_social ?? 'proveedor no legible'} — transcribe la factura real. Si todavía no hay
        recepción que la respalde, queda esperando a que llegue la mercadería; si ya la hay, el sistema concilia
        de una y crea la obligación por el monto verificado.
      </p>
      <FormularioFacturaCompra
        ocId={oc.id}
        ocCodigo={oc.codigo}
        moneda={oc.moneda}
        items={oc.items}
        tasasDetraccion={tasasDetraccion}
      />
    </main>
  )
}
