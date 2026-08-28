import { Encabezado } from '@/components/nav'
import { perfilActual } from '@logisalud/auth/server'
import { listarTiposImpuesto } from '@/services/impuestos'
import { FormularioTipoImpuesto } from './formulario'

export const dynamic = 'force-dynamic'

/** Contabilidad/admin agregan tipos de impuesto acá — sin esto, la única forma era una migración. */
export default async function TiposImpuesto() {
  const perfil = await perfilActual()
  const puedeEscribir = perfil?.area === 'contabilidad' || perfil?.area === 'admin'
  const tipos = await listarTiposImpuesto()

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <Encabezado titulo="Tipos de impuesto" atras={{ href: '/impuestos', texto: 'Impuestos' }} />

      {puedeEscribir ? (
        <div className="mb-6">
          <FormularioTipoImpuesto />
        </div>
      ) : (
        <p className="card mb-6 text-sm text-gray-600">
          Solo Contabilidad puede agregar tipos de impuesto nuevos.
        </p>
      )}

      <section>
        <h2 className="font-heading mb-2 text-lg">Tipos activos</h2>
        {tipos.length === 0 ? (
          <p className="card text-sm text-gray-600">Todavía no hay ningún tipo cargado.</p>
        ) : (
          <ul className="space-y-2">
            {tipos.map((t) => (
              <li key={t.id} className="card">
                <span className="font-medium">{t.nombre}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  )
}
