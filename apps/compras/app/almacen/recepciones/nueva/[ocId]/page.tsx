import { notFound } from 'next/navigation'
import { Encabezado } from '@/components/nav'
import { obtenerOCParaRecibir } from '@/services/recepciones'
import { puedeRecibirse } from '@/domain/orden-compra'
import { FormularioRecepcion } from './formulario'

export const dynamic = 'force-dynamic'

export default async function NuevaRecepcion({ params }: { params: { ocId: string } }) {
  const oc = await obtenerOCParaRecibir(params.ocId)
  if (!oc) notFound()

  if (!puedeRecibirse(oc.estado)) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-8">
        <Encabezado titulo={oc.codigo} atras={{ href: '/almacen/recepciones/nueva', texto: 'Elegir otra orden' }} />
        <p className="card text-sm text-gray-600">
          Esta orden ya no admite recepciones nuevas.
        </p>
      </main>
    )
  }

  if (oc.items.length === 0) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-8">
        <Encabezado titulo={oc.codigo} atras={{ href: '/almacen/recepciones/nueva', texto: 'Elegir otra orden' }} />
        <p className="card text-sm text-gray-600">
          Esta orden ya no tiene productos con saldo pendiente por recibir.
        </p>
      </main>
    )
  }

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <Encabezado titulo={oc.codigo} atras={{ href: '/almacen/recepciones/nueva', texto: 'Elegir otra orden' }} />
      <p className="mb-4 text-sm text-gray-600">
        {oc.proveedor?.razon_social ?? 'proveedor no legible'} — subí la guía y la factura, y
        revisá por línea lo que declara la factura y lo que llegó de verdad. El sistema calcula
        el total y genera la obligación sola.
      </p>
      <FormularioRecepcion
        ocId={oc.id}
        ocCodigo={oc.codigo}
        moneda={oc.moneda}
        items={oc.items}
      />
    </main>
  )
}
