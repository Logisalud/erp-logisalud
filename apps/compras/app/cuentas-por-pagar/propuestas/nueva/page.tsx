import { Encabezado } from '@/components/nav'
import { listarObligacionesConformes } from '@/services/propuestas'
import { FormularioPropuesta } from './formulario'

export const dynamic = 'force-dynamic'

export default async function NuevaPropuesta() {
  const obligaciones = await listarObligacionesConformes()

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <Encabezado titulo="Nueva propuesta de pago" atras={{ href: '/cuentas-por-pagar/propuestas', texto: 'Propuestas' }} />

      {obligaciones.length === 0 ? (
        <p className="card text-sm text-gray-600">
          No hay ninguna obligación conforme todavía. Contabilidad tiene que darle conformidad a
          alguna antes de armar una propuesta.
        </p>
      ) : (
        <>
          <p className="mb-4 text-sm text-gray-600">
            Elige las obligaciones que van en este lote — Gerencia va a aprobar el lote entero de
            una sola vez, nunca obligación por obligación.
          </p>
          <FormularioPropuesta obligaciones={obligaciones} />
        </>
      )}
    </main>
  )
}
