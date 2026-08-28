import { notFound } from 'next/navigation'
import { Encabezado } from '@/components/nav'
import { obtenerFondo } from '@/services/caja-chica'
import { listarCategoriasGasto } from '@/services/solicitudes-gasto'
import { FormularioMovimiento } from './formulario'

export const dynamic = 'force-dynamic'

export default async function NuevoMovimiento({ params }: { params: { id: string } }) {
  const fondo = await obtenerFondo(params.id)
  if (!fondo) notFound()

  const categorias = await listarCategoriasGasto()

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <Encabezado titulo="Registrar gasto" atras={{ href: `/caja-chica/fondos/${fondo.id}`, texto: fondo.descripcion ?? 'Fondo' }} />

      {categorias.length === 0 ? (
        <p className="card text-sm text-gray-600">
          Todavía no hay ninguna categoría de gasto cargada. Pídele a Contabilidad que cargue al
          menos una antes de poder registrar un gasto.
        </p>
      ) : (
        <FormularioMovimiento fondoId={fondo.id} categorias={categorias} />
      )}
    </main>
  )
}
