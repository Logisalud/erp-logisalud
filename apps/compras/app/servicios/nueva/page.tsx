import { Encabezado } from '@/components/nav'
import { listarProveedoresServicio } from '@/services/servicios'
import { FormularioOS } from './formulario'

export const dynamic = 'force-dynamic'

export default async function NuevaOS() {
  const proveedores = await listarProveedoresServicio()

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <Encabezado titulo="Nueva orden de servicio" atras={{ href: '/servicios', texto: 'Servicios' }} />

      {proveedores.length === 0 ? (
        <p className="card text-sm text-gray-600">
          Todavía no hay ningún proveedor de servicio cargado. Pedile a Compras o Contabilidad que
          cargue al menos uno antes de poder crear una orden.
        </p>
      ) : (
        <FormularioOS proveedores={proveedores} />
      )}
    </main>
  )
}
