import { Encabezado } from '@/components/nav'
import { perfilActual } from '@logisalud/auth/server'
import { listarCategoriasGasto } from '@/services/solicitudes-gasto'
import { FormularioCategoria } from './formulario'

export const dynamic = 'force-dynamic'

/** Contabilidad/admin agregan categorías acá — sin esto, la única forma era una migración. */
export default async function CategoriasGasto() {
  const perfil = await perfilActual()
  const puedeEscribir = perfil?.area === 'contabilidad' || perfil?.area === 'admin'
  const categorias = await listarCategoriasGasto()

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <Encabezado titulo="Categorías de gasto" atras={{ href: '/gastos', texto: 'Gastos y Anticipos' }} />

      {puedeEscribir ? (
        <div className="mb-6">
          <FormularioCategoria />
        </div>
      ) : (
        <p className="card mb-6 text-sm text-gray-600">
          Solo Contabilidad puede agregar categorías nuevas.
        </p>
      )}

      <section>
        <h2 className="font-heading mb-2 text-lg">Categorías activas</h2>
        {categorias.length === 0 ? (
          <p className="card text-sm text-gray-600">Todavía no hay ninguna categoría cargada.</p>
        ) : (
          <ul className="space-y-2">
            {categorias.map((c) => (
              <li key={c.id} className="card">
                <span className="font-medium">{c.nombre}</span>
                {c.cuenta_contable ? <p className="mt-0.5 text-sm text-gray-600">Cuenta contable: {c.cuenta_contable}</p> : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  )
}
