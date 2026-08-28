import { Encabezado } from '@/components/nav'
import { listarCategoriasGasto } from '@/services/solicitudes-gasto'
import { FormularioSolicitud } from './formulario'

export const dynamic = 'force-dynamic'

export default async function NuevaSolicitud() {
  const categorias = await listarCategoriasGasto()

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <Encabezado titulo="Nueva solicitud" atras={{ href: '/gastos', texto: 'Gastos y Anticipos' }} />

      {categorias.length === 0 ? (
        <p className="card text-sm text-gray-600">
          Todavía no hay ninguna categoría de gasto cargada. Pedile a Contabilidad que cargue al
          menos una antes de poder crear una solicitud.
        </p>
      ) : (
        <FormularioSolicitud categorias={categorias} />
      )}
    </main>
  )
}
