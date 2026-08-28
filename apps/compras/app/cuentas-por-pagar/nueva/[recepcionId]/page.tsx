import { notFound } from 'next/navigation'
import { Encabezado } from '@/components/nav'
import { obtenerRecepcionParaObligar, listarTasasDetraccion } from '@/services/obligaciones'
import { FormularioObligacion } from './formulario'

export const dynamic = 'force-dynamic'

export default async function NuevaObligacion({ params }: { params: { recepcionId: string } }) {
  const recepcion = await obtenerRecepcionParaObligar(params.recepcionId)

  if (!recepcion) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-8">
        <Encabezado titulo="Registrar obligación" atras={{ href: '/almacen', texto: 'Almacén' }} />
        <p className="card text-sm text-gray-600">
          Esta recepción no existe o todavía no está conforme. Solo se puede registrar una
          obligación desde una recepción sin discrepancias pendientes.
        </p>
      </main>
    )
  }

  if (recepcion.yaTieneObligacion) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-8">
        <Encabezado titulo={recepcion.oc?.codigo ?? 'Recepción'} atras={{ href: '/almacen', texto: 'Almacén' }} />
        <p className="card text-sm text-gray-600">
          Esta recepción ya tiene una obligación registrada.
        </p>
      </main>
    )
  }

  if (recepcion.items.length === 0) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-8">
        <Encabezado titulo={recepcion.oc?.codigo ?? 'Recepción'} atras={{ href: '/almacen', texto: 'Almacén' }} />
        <p className="card text-sm text-gray-600">
          No hay ninguna línea de esta recepción pendiente de facturar.
        </p>
      </main>
    )
  }

  const tasasDetraccion = await listarTasasDetraccion()

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <Encabezado titulo={recepcion.oc?.codigo ?? 'Recepción'} atras={{ href: '/almacen', texto: 'Almacén' }} />
      <p className="mb-4 text-sm text-gray-600">
        {recepcion.oc?.proveedor?.razon_social ?? 'proveedor no legible'} — transcribí la factura
        real del proveedor. El sistema concilia automáticamente contra lo pedido y lo recibido; si
        algo no cuadra, la obligación queda observada para que la revises antes de darle
        conformidad.
      </p>
      <FormularioObligacion
        recepcionId={recepcion.id}
        moneda={recepcion.oc?.moneda ?? 'PEN'}
        items={recepcion.items}
        tasasDetraccion={tasasDetraccion}
        storagePathGuia={recepcion.storagePathGuia}
        storagePathFactura={recepcion.storagePathFactura}
      />
    </main>
  )
}
