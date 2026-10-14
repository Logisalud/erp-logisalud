import { notFound, redirect } from 'next/navigation'
import { Encabezado } from '@/components/nav'
import { obtenerPersonaSinUsuario, puedeAdministrarPersonas } from '@/services/beneficiarios'
import { listarCuentasBancariasDePersona } from '@/services/empleado-cuentas-bancarias'
import { FormularioCuentaBancaria } from '@/app/mi-cuenta-bancaria/formulario'
import { crearCuentaPersonaAction, eliminarCuentaPersonaAction } from '../actions'
import { FormularioPersona } from './formulario'

export const dynamic = 'force-dynamic'

export default async function FichaPersonaSinUsuario({ params }: { params: { id: string } }) {
  if (!(await puedeAdministrarPersonas())) redirect('/personas-sin-usuario')
  const persona = await obtenerPersonaSinUsuario(params.id)
  if (!persona) notFound()
  const cuentas = await listarCuentasBancariasDePersona(persona.id)

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <Encabezado titulo={persona.nombre} atras={{ href: '/personas-sin-usuario', texto: 'Vendedores y personas sin usuario' }} />

      <FormularioPersona persona={persona} />

      <h2 className="font-heading mb-2 mt-6 text-lg">Cuenta bancaria</h2>
      <FormularioCuentaBancaria
        cuentas={cuentas}
        accionCrear={crearCuentaPersonaAction.bind(null, persona.id)}
        accionEliminar={eliminarCuentaPersonaAction.bind(null, persona.id)}
        textoVacio="Todavía no tiene cuenta bancaria. Se le puede armar el anticipo igual, pero Tesorería no va a poder pagárselo hasta que la cargues."
      />
    </main>
  )
}
