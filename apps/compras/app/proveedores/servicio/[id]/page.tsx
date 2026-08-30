import { notFound } from 'next/navigation'
import { Encabezado } from '@/components/nav'
import { obtenerProveedorUnificado } from '@/services/proveedores-unificado'
import { DetalleProveedor } from '../../detalle-proveedor'

export const dynamic = 'force-dynamic'

/** Detalle de un proveedor de servicios — servicios.proveedores_servicio. */
export default async function DetalleProveedorServicio({ params }: { params: { id: string } }) {
  const datos = await obtenerProveedorUnificado('servicio', params.id)
  if (!datos) notFound()

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <Encabezado titulo={datos.proveedor.razonSocial} atras={{ href: '/proveedores', texto: 'Proveedores' }} />
      <DetalleProveedor proveedor={datos.proveedor} cuentas={datos.cuentas} tieneMovimientos={datos.tieneMovimientos} />
    </main>
  )
}
