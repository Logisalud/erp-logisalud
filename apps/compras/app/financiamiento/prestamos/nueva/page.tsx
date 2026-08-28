import { Encabezado } from '@/components/nav'
import { FormularioPrestamo } from './formulario'

export const dynamic = 'force-dynamic'

export default function NuevoPrestamo() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <Encabezado titulo="Nuevo préstamo" atras={{ href: '/financiamiento/prestamos', texto: 'Préstamos' }} />
      <FormularioPrestamo />
    </main>
  )
}
