import { BotonCerrarSesion } from '@logisalud/auth/componentes'
import { perfilActual, usuarioActual } from '@logisalud/auth/server'

export const dynamic = 'force-dynamic'

/**
 * Portada del módulo. Todavía no hay pantallas: esto confirma que el shell
 * responde, que el login funciona y que la sesión llega al servidor con un
 * perfil que RLS puede evaluar.
 */
export default async function Inicio() {
  const usuario = await usuarioActual()
  const perfil = await perfilActual()

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-heading text-2xl">Compras y Pagos</h1>
          <p className="mt-1 text-sm text-gray-600">ERP LOGISALUD</p>
        </div>
        <BotonCerrarSesion />
      </header>

      <section className="card mt-6">
        <h2 className="font-heading text-lg">Sesión</h2>
        <dl className="mt-3 space-y-1.5 text-sm">
          <div className="flex gap-2">
            <dt className="text-gray-500">Correo:</dt>
            <dd>{usuario?.email ?? '— sin sesión —'}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="text-gray-500">Nombre:</dt>
            <dd>{perfil?.nombre ?? '— sin perfil en public.perfiles —'}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="text-gray-500">Área:</dt>
            <dd>{perfil?.area ?? '—'}</dd>
          </div>
        </dl>
        {usuario && !perfil ? (
          <p className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-900">
            Tu cuenta existe pero no tiene fila en <code>public.perfiles</code>, así que las
            políticas RLS te van a negar todo. Corré <code>scripts/seed-usuarios.ts</code>.
          </p>
        ) : null}
      </section>

      <section className="card mt-4">
        <h2 className="font-heading text-lg">Pantallas</h2>
        <p className="mt-2 text-sm text-gray-600">
          Ninguna construida todavía. El modelo de datos y las políticas RLS de los 8 contextos
          ya están aplicados; falta la interfaz.
        </p>
      </section>
    </main>
  )
}
