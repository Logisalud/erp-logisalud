import Link from 'next/link'
import { crearClienteServidor, perfilActual, usuarioActual } from '@logisalud/auth/server'
import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

type Modulo = {
  id: string
  nombre: string
  descripcion: string
  ruta: string
  disponible: boolean
}

/**
 * Pantalla de módulos: lo primero que ve una persona después de entrar.
 *
 * Qué tarjetas aparecen sale de `public.modulo_areas_permitidas`, no del
 * código. Cambiar quién ve Cobranzas es un insert o un delete, no un deploy
 * — que es justo lo que hace falta mientras siga pendiente la autorización
 * de las rutas de Cobranzas.
 */
export default async function PantallaModulos() {
  const usuario = await usuarioActual()
  if (!usuario) redirect('/login')

  const perfil = await perfilActual()
  const supabase = crearClienteServidor()

  // Sin perfil no hay área, y sin área no hay módulo que mostrar. Pasa con
  // quien entra sin estar en public.usuarios_esperados: el trigger no le
  // crea perfil y RLS le niega todo. Se le dice, no se le muestra un
  // blanco.
  let modulos: Modulo[] = []
  let fallo = false

  if (perfil?.area) {
    const { data, error } = await supabase
      .from('modulos')
      .select('id, nombre, descripcion, ruta, disponible, modulo_areas_permitidas!inner(area)')
      .eq('modulo_areas_permitidas.area', perfil.area)
      .order('orden')

    if (error) {
      // Sin esto, un error de consulta se vería igual que "no tenés
      // permisos" — que es exactamente el bug que tuvimos con los admins.
      console.error('[modulos] falló la consulta:', error.message)
      fallo = true
    }
    modulos = (data ?? []) as unknown as Modulo[]
  }

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8 sm:py-12">
      <header className="mb-8">
        <h1 className="font-oswald text-3xl uppercase tracking-wide text-gray-900">
          ERP Logisalud
        </h1>
        <p className="mt-1 text-sm text-gray-600">
          {perfil?.nombre ? `Hola, ${perfil.nombre}.` : 'Hola.'} Elegí a dónde entrar.
        </p>
      </header>

      {modulos.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white p-6">
          {fallo ? (
            <>
              <p className="text-gray-900">No pudimos cargar tus módulos.</p>
              <p className="mt-2 text-sm text-gray-600">
                Es un problema nuestro, no de tus permisos. Recargá la página; si
                sigue igual, avisale a soporte.
              </p>
            </>
          ) : !perfil ? (
            <>
              <p className="text-gray-900">Tu cuenta todavía no tiene perfil.</p>
              <p className="mt-2 text-sm text-gray-600">
                Entraste bien, pero nadie te asignó un área. Escribile a tu
                administrador para que te la cargue.
              </p>
            </>
          ) : (
            <>
              <p className="text-gray-900">Todavía no tenés acceso a ningún módulo.</p>
              <p className="mt-2 text-sm text-gray-600">
                Tu área es <strong>{perfil.area}</strong>. Escribile a tu
                administrador para que te habilite lo que necesites.
              </p>
            </>
          )}
        </div>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2">
          {modulos.map((m) => (
            <li
              key={m.id}
              className={`flex flex-col rounded-xl border bg-white p-5 ${
                m.disponible
                  ? 'border-gray-200 hover:border-gray-300 hover:shadow-sm transition'
                  : 'border-gray-200 opacity-60'
              }`}
            >
              <h2 className="font-oswald text-xl uppercase tracking-wide text-gray-900">
                {m.nombre}
              </h2>
              <p className="mt-1 grow text-sm text-gray-600">{m.descripcion}</p>

              {m.disponible ? (
                <Link
                  href={m.ruta}
                  className="mt-4 inline-flex min-h-12 items-center justify-center rounded-lg px-4 font-medium text-white"
                  style={{ backgroundColor: '#4BB168' }}
                >
                  Entrar
                </Link>
              ) : (
                <span className="mt-4 inline-flex min-h-12 items-center justify-center rounded-lg border border-gray-200 px-4 text-sm font-medium text-gray-500">
                  Próximamente
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}
