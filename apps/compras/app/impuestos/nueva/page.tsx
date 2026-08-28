import { Encabezado } from '@/components/nav'
import { listarTiposImpuesto } from '@/services/impuestos'
import { FormularioImpuesto } from './formulario'

export const dynamic = 'force-dynamic'

export default async function NuevaObligacionTributaria() {
  const tipos = await listarTiposImpuesto()

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <Encabezado titulo="Cargar obligación tributaria" atras={{ href: '/impuestos', texto: 'Impuestos' }} />

      {tipos.length === 0 ? (
        <p className="card text-sm text-gray-600">
          Todavía no hay ningún tipo de impuesto cargado. Pedile a Contabilidad que cargue al menos
          uno antes de poder registrar una obligación tributaria.
        </p>
      ) : (
        <FormularioImpuesto tipos={tipos} />
      )}
    </main>
  )
}
