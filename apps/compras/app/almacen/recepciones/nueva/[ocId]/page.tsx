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
    <main className="mx-auto max-w-2xl px-4 py-8">
      <Encabezado titulo={oc.codigo} atras={{ href: '/almacen/recepciones/nueva', texto: 'Elegir otra orden' }} />
      <p className="mb-4 text-sm text-gray-600">
        {oc.proveedor?.razon_social ?? 'proveedor no legible'} — cargá lo que llegó
        físicamente línea por línea. El sistema clasifica automáticamente si hay alguna
        discrepancia contra lo pedido.
      </p>
      <FormularioRecepcion ocId={oc.id} items={oc.items} />
    </main>
  )
}
