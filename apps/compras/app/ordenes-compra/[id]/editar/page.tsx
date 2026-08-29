import { notFound, redirect } from 'next/navigation'
import { Encabezado } from '@/components/nav'
import { obtenerOC } from '@/services/ordenes-compra'
import { obtenerProveedor } from '@/services/proveedores'
import { puedeEditarse } from '@/domain/orden-compra'
import { FormularioEditarOC } from './formulario'

export const dynamic = 'force-dynamic'

export default async function EditarOC({ params }: { params: { id: string } }) {
  const oc = await obtenerOC(params.id)
  if (!oc) notFound()
  if (!puedeEditarse(oc.estado)) redirect(`/ordenes-compra/${oc.id}`)

  const datosProveedor = await obtenerProveedor(oc.proveedor_id)

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <Encabezado
        titulo={`Editar ${oc.codigo}`}
        atras={{ href: `/ordenes-compra/${oc.id}`, texto: oc.codigo }}
      />
      <FormularioEditarOC
        oc={oc}
        proveedorActual={{
          id: oc.proveedor_id,
          nombre: datosProveedor
            ? `${datosProveedor.proveedor.razon_social} — RUC ${datosProveedor.proveedor.ruc}`
            : '',
          condicionPagoDias: datosProveedor?.proveedor.condicion_pago_dias ?? 0,
          moneda: datosProveedor?.proveedor.moneda_principal ?? oc.moneda,
        }}
      />
    </main>
  )
}
