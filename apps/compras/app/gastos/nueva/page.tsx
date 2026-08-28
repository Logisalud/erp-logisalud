import Link from 'next/link'
import { perfilActual } from '@logisalud/auth/server'
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
  const perfil = await perfilActual()
  const puedeCargarCategoria = perfil?.area === 'contabilidad' || perfil?.area === 'admin'

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <Encabezado titulo="Nueva solicitud" atras={{ href: '/gastos', texto: 'Gastos y Anticipos' }} />

      {categorias.length === 0 ? (
        <div className="card space-y-3 text-sm text-gray-600">
          <p>
            Todavía no hay ninguna categoría de gasto cargada. {puedeCargarCategoria
              ? 'Carga al menos una para poder crear una solicitud.'
              : 'Pídele a Contabilidad que cargue al menos una antes de poder crear una solicitud.'}
          </p>
          {puedeCargarCategoria ? (
            <Link href="/gastos/categorias" className="btn-primary w-full sm:w-auto">
              Cargar categoría de gasto
            </Link>
          ) : null}
        </div>
      ) : (
        <FormularioSolicitud categorias={categorias} tipoPreseleccionado={tipoPreseleccionado} />
      )}
    </main>
  )
}
