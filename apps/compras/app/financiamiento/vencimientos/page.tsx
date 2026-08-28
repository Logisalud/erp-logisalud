import { Encabezado } from '@/components/nav'
import { listarVencimientosProximos } from '@/services/financiamiento'
import { SelectorVencimientos } from './selector'

export const dynamic = 'force-dynamic'

export default async function VencimientosProximos() {
  const vencimientos = await listarVencimientosProximos()

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <Encabezado titulo="Vencimientos próximos" atras={{ href: '/financiamiento', texto: 'Financiamiento' }} />

      <p className="mb-4 text-sm text-gray-600">
        Cuotas de préstamo, cuotas de fraccionamiento SUNAT y letras por pagar que vencen en los
        próximos 7 días y todavía no tienen una obligación generada. Elegí las que correspondan y
        generá su obligación — de ahí siguen el embudo normal de Cuentas por Pagar.
      </p>

      {vencimientos.length === 0 ? (
        <p className="card text-sm text-gray-600">No hay ningún vencimiento próximo sin obligación.</p>
      ) : (
        <SelectorVencimientos vencimientos={vencimientos} />
      )}
    </main>
  )
}
