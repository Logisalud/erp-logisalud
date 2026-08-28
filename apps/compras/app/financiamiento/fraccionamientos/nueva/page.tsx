import { Encabezado } from '@/components/nav'
import { FormularioFraccionamiento } from './formulario'

export const dynamic = 'force-dynamic'

export default function NuevoFraccionamiento() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <Encabezado titulo="Nuevo fraccionamiento" atras={{ href: '/financiamiento/fraccionamientos', texto: 'Fraccionamiento SUNAT' }} />
      <FormularioFraccionamiento />
    </main>
  )
}
