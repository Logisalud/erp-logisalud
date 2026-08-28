import { notFound } from 'next/navigation'
import { Encabezado } from '@/components/nav'
import { Money } from '@/components/money'
import { obtenerObligacionParaCanje } from '@/services/financiamiento'
import { FormularioCanje } from './formulario'

export const dynamic = 'force-dynamic'

export default async function CanjearPorLetras({ params }: { params: { id: string } }) {
  const obligacion = await obtenerObligacionParaCanje(params.id)
  if (!obligacion) notFound()

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <Encabezado titulo={`Canjear ${obligacion.codigo} por letras`} atras={{ href: `/cuentas-por-pagar/${obligacion.id}`, texto: obligacion.codigo }} />

      <section className="card mb-4">
        <p className="text-sm text-gray-600">{obligacion.proveedor?.razon_social}{obligacion.numero_factura ? ` · ${obligacion.numero_factura}` : ''}</p>
        <p className="mt-1"><Money valor={obligacion.neto_a_pagar} moneda={obligacion.moneda} /></p>
      </section>

      <FormularioCanje obligacionId={obligacion.id} montoObligacion={obligacion.neto_a_pagar} />
    </main>
  )
}
