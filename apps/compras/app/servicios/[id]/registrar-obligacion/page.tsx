import { notFound } from 'next/navigation'
import { Encabezado } from '@/components/nav'
import { obtenerOS } from '@/services/servicios'
import { FormularioObligacionServicio } from './formulario'

export const dynamic = 'force-dynamic'

export default async function RegistrarObligacionServicio({ params }: { params: { id: string } }) {
  const os = await obtenerOS(params.id)
  if (!os) notFound()
  if (!['facturada', 'conformada'].includes(os.estado) || os.obligacion) notFound()

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <Encabezado titulo={`Registrar obligación — ${os.codigo}`} atras={{ href: `/servicios/${os.id}`, texto: os.codigo }} />

      <section className="card mb-4">
        <p className="text-sm text-gray-600">{os.proveedor?.razon_social} · {os.descripcion_servicio}</p>
      </section>

      <FormularioObligacionServicio osId={os.id} moneda={os.moneda} />
    </main>
  )
}
