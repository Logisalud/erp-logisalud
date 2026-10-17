import Link from 'next/link'
import { Encabezado } from '@/components/nav'
import { BadgeFaltaCuenta } from '@/components/badge-falta-cuenta'
import { cuentasPorPersona, listarPersonasSinUsuario, puedeAdministrarPersonas } from '@/services/beneficiarios'
import { FormularioAltaPersona } from './formulario-alta'

export const dynamic = 'force-dynamic'

/**
 * Vendedores y demás personas a las que se les arma un anticipo sin que
 * tengan usuario (migración 0081). Contabilidad la mantiene: nombre, DNI y
 * la cuenta donde Tesorería les deposita.
 */
export default async function PersonasSinUsuario() {
  const [personas, cuentas, puedeEscribir] = await Promise.all([
    listarPersonasSinUsuario({ soloActivas: false }),
    cuentasPorPersona(),
    puedeAdministrarPersonas(),
  ])
  const activas = personas.filter((p) => p.activo)
  const inactivas = personas.filter((p) => !p.activo)

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <Encabezado titulo="Vendedores y personas sin usuario" atras={{ href: '/', texto: 'Compras y Pagos' }} />

      <p className="card mb-4 text-sm text-gray-600">
        Personas a las que se les puede armar un anticipo (por ejemplo, viáticos de un vendedor)
        aunque no entren al sistema. El anticipo se les deposita en la cuenta que cargues aquí.
      </p>

      {puedeEscribir ? (
        <div className="mb-6">
          <FormularioAltaPersona />
        </div>
      ) : (
        <p className="card mb-6 text-sm text-gray-600">Solo Contabilidad puede agregar o editar personas.</p>
      )}

      <Lista titulo="En la lista" personas={activas} cuentas={cuentas} enlazar={puedeEscribir} />
      {inactivas.length > 0 ? (
        <div className="mt-6">
          <Lista titulo="Desactivadas" personas={inactivas} cuentas={cuentas} enlazar={puedeEscribir} />
        </div>
      ) : null}
    </main>
  )
}

function Lista({
  titulo, personas, cuentas, enlazar,
}: {
  titulo: string
  personas: { id: string; nombre: string; dni: string | null }[]
  cuentas: Map<string, number>
  enlazar: boolean
}) {
  return (
    <section>
      <h2 className="font-heading mb-2 text-lg">{titulo}</h2>
      {personas.length === 0 ? (
        <p className="card text-sm text-gray-600">Todavía no hay nadie.</p>
      ) : (
        <ul className="space-y-2">
          {personas.map((p) => {
            const contenido = (
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="font-medium">{p.nombre}</p>
                  <p className="text-sm text-gray-600">{p.dni ? `DNI ${p.dni}` : 'Sin DNI'}</p>
                </div>
                {(cuentas.get(p.id) ?? 0) === 0 ? <BadgeFaltaCuenta /> : null}
              </div>
            )
            return (
              <li key={p.id}>
                {enlazar ? (
                  <Link href={`/personas-sin-usuario/${p.id}`} className="card block hover:shadow-sm">{contenido}</Link>
                ) : (
                  <div className="card">{contenido}</div>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
