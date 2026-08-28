import { Encabezado } from '@/components/nav'
import { listarMisCuentasBancarias } from '@/services/empleado-cuentas-bancarias'
import { FormularioCuentaBancaria } from './formulario'

export const dynamic = 'force-dynamic'

export default async function MiCuentaBancaria() {
  const cuentas = await listarMisCuentasBancarias()

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <Encabezado titulo="Mi cuenta bancaria" atras={{ href: '/', texto: 'Compras y Pagos' }} />
      <FormularioCuentaBancaria cuentas={cuentas} />
    </main>
  )
}
