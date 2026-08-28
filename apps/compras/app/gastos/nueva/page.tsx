import { Encabezado } from '@/components/nav'
import { listarCategoriasGasto } from '@/services/solicitudes-gasto'
import { TIPOS_SOLICITUD, type TipoSolicitud } from '@/domain/gasto'
import { FormularioSolicitud } from './formulario'

export const dynamic = 'force-dynamic'

function tipoValido(valor: string | undefined): TipoSolicitud | undefined {
  return TIPOS_SOLICITUD.find((t) => t === valor)
}

export default async function NuevaSolicitud({
  searchParams,
}: {
  searchParams: { tipo?: string }
}) {
  const categorias = await listarCategoriasGasto()
  const tipoPreseleccionado = tipoValido(searchParams.tipo)

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <Encabezado titulo="Nueva solicitud" atras={{ href: '/gastos', texto: 'Gastos y Anticipos' }} />

      {categorias.length === 0 ? (
        <p className="card text-sm text-gray-600">
          Todavía no hay ninguna categoría de gasto cargada. Pedile a Contabilidad que cargue al
          menos una antes de poder crear una solicitud.
        </p>
      ) : (
        <FormularioSolicitud categorias={categorias} tipoPreseleccionado={tipoPreseleccionado} />
      )}
    </main>
  )
}
