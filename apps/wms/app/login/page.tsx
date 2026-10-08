import { FlaskConical } from 'lucide-react'
import { FormularioLogin } from '@logisalud/auth/componentes'
import { modoDemoActivo } from '@/lib/demo'
import { ROLES_DEMO } from '@/lib/sesion-demo'
import { ETIQUETA_ROL } from '@/domain/permisos'
import { entrarDemo } from '../acciones'
import { Marca } from '@/components/marca'

export const metadata = { title: 'Entrar — WMS LOGISALUD' }
export const dynamic = 'force-dynamic'

export default function LoginPage({ searchParams }: { searchParams: { volver_a?: string; error?: string } }) {
  if (!modoDemoActivo()) {
    // Solo rutas internas, para que un link armado a mano no use el login como redirección externa.
    const destino = searchParams.volver_a?.startsWith('/') && !searchParams.volver_a.startsWith('//') ? searchParams.volver_a : '/'
    return <FormularioLogin volverA={destino} errorInicial={searchParams.error} />
  }
  return (
    <main className="mx-auto flex min-h-[calc(100vh-2.25rem)] max-w-xl flex-col justify-center px-4 py-10">
      <div className="mb-6 flex items-center gap-3">
        <Marca alto={30} />
      </div>
      <h1 className="font-heading text-3xl font-semibold uppercase tracking-wide text-gray-900">Almacén</h1>
      <p className="mt-2 text-gray-700">
        Esta es una demostración con datos de prueba. Elige con qué rol quieres recorrerla; no hace falta usuario ni contraseña.
      </p>
      <p className="mt-2 inline-flex items-center gap-2 text-sm text-gray-600">
        <FlaskConical className="h-4 w-4 text-teal-600" aria-hidden />
        Nada de lo que hagas aquí se guarda ni toca ninguna base real.
      </p>
      <ul className="mt-6 space-y-3">
        {ROLES_DEMO.map(({ rol, descripcion }) => (
          <li key={rol}>
            <form action={entrarDemo}>
              <input type="hidden" name="rol" value={rol} />
              <button
                type="submit"
                data-testid={`entrar-${rol}`}
                className="flex min-h-16 w-full items-center justify-between gap-4 rounded-lg border border-gray-200 bg-white px-4 py-3 text-left shadow-xs transition duration-fast hover:border-green-400 hover:shadow-md active:scale-[0.99]"
              >
                <span>
                  <span className="block font-medium text-gray-900">{ETIQUETA_ROL[rol]}</span>
                  <span className="block text-sm text-gray-600">{descripcion}</span>
                </span>
                <span className="shrink-0 rounded-full bg-green-50 px-3 py-1 text-sm font-medium text-green-800">Entrar</span>
              </button>
            </form>
          </li>
        ))}
      </ul>
    </main>
  )
}
