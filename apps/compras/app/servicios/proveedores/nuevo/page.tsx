import { Encabezado } from '@/components/nav'
import { FormularioProveedorServicio } from './formulario'

export const dynamic = 'force-dynamic'

/** Acceso abierto a toda persona logueada mientras dure
 * `compras.flags.acceso_abierto_temporal` (mismo criterio que la policy RLS
 * `proveedores_servicio_acceso_temporal`) — sin gate por área acá. */
export default async function NuevoProveedorServicio() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <Encabezado titulo="Registrar proveedor de servicio" atras={{ href: '/servicios/nueva', texto: 'Nueva orden de servicio' }} />
      <FormularioProveedorServicio />
    </main>
  )
}
