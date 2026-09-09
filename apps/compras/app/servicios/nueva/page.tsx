import Link from 'next/link'
import { Encabezado } from '@/components/nav'
import { listarProveedoresServicio } from '@/services/servicios'
import { FormularioOS } from './formulario'

export const dynamic = 'force-dynamic'

export default async function NuevaOS() {
  const proveedores = await listarProveedoresServicio()
  // Acceso abierto a toda persona logueada mientras dure
  // `compras.flags.acceso_abierto_temporal` (mismo criterio que la policy
  // RLS `proveedores_servicio_acceso_temporal`).
  const puedeRegistrarProveedor = true

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <Encabezado titulo="Nueva orden de servicio" atras={{ href: '/servicios', texto: 'Servicios' }} />

      {proveedores.length === 0 ? (
        <div className="card space-y-3 text-sm text-gray-600">
          <p>
            Todavía no hay ningún proveedor de servicio cargado. {puedeRegistrarProveedor
              ? 'Registra el primero para poder crear una orden.'
              : 'Pídele a Compras o Contabilidad que cargue al menos uno antes de poder crear una orden.'}
          </p>
          {puedeRegistrarProveedor ? (
            <Link href="/servicios/proveedores/nuevo" className="btn-primary w-full sm:w-auto">
              Registrar proveedor de servicio
            </Link>
          ) : null}
        </div>
      ) : (
        <>
          <FormularioOS proveedores={proveedores} />
          {puedeRegistrarProveedor ? (
            <Link href="/servicios/proveedores/nuevo" className="mt-3 inline-block text-sm text-logisalud-teal underline">
              Registrar otro proveedor de servicio
            </Link>
          ) : null}
        </>
      )}
    </main>
  )
}
