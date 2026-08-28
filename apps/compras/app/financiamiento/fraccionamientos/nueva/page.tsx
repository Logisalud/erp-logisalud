import { Encabezado } from '@/components/nav'
import { listarTiposImpuesto } from '@/services/impuestos'
import { FormularioFraccionamiento } from './formulario'

export const dynamic = 'force-dynamic'

export default async function NuevoFraccionamiento() {
  const tiposImpuesto = await listarTiposImpuesto()

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <Encabezado titulo="Nuevo fraccionamiento" atras={{ href: '/financiamiento/fraccionamientos', texto: 'Fraccionamiento SUNAT' }} />
      <FormularioFraccionamiento tiposImpuesto={tiposImpuesto} />
    </main>
  )
}
