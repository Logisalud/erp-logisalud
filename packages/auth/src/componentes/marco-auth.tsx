import type { ReactNode } from 'react'

/**
 * Marco visual compartido por las pantallas de autenticación. Mobile-first:
 * el vendedor entra desde el celular.
 */
export function MarcoAuth({
  titulo,
  descripcion,
  children,
}: {
  titulo: string
  descripcion?: string
  children: ReactNode
}) {
  return (
    <main className="min-h-screen bg-gray-50 flex flex-col items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div
          className="rounded-t-lg px-6 py-7 text-center"
          style={{ background: 'linear-gradient(135deg, #4BB168 0%, #4ABCC2 100%)' }}
        >
          <p className="font-heading text-2xl font-semibold tracking-wide text-white">LOGISALUD</p>
          <p className="mt-1 text-sm text-white/90">ERP</p>
        </div>

        <div className="rounded-b-lg border border-t-0 border-gray-200 bg-white px-6 py-7">
          <h1 className="font-heading text-xl text-gray-900">{titulo}</h1>
          {descripcion ? <p className="mt-1.5 text-sm text-gray-600">{descripcion}</p> : null}
          <div className="mt-5">{children}</div>
        </div>
      </div>
    </main>
  )
}

export function Etiqueta({ children, htmlFor }: { children: ReactNode; htmlFor: string }) {
  return (
    <label htmlFor={htmlFor} className="block text-sm font-medium text-gray-800">
      {children}
    </label>
  )
}

export const CLASES_INPUT =
  'mt-1.5 w-full min-h-12 rounded-md border border-gray-300 px-3 text-gray-900 ' +
  'placeholder:text-gray-400 focus:border-logisalud-green focus:outline-none focus:ring-1 focus:ring-logisalud-green'

export const CLASES_BOTON =
  'w-full min-h-12 rounded-md bg-logisalud-green px-4 font-medium text-white ' +
  'transition hover:shadow-md disabled:cursor-not-allowed disabled:opacity-60'

export function Aviso({ tono, children }: { tono: 'error' | 'ok'; children: ReactNode }) {
  const estilos =
    tono === 'error'
      ? 'border-red-200 bg-red-50 text-red-800'
      : 'border-green-200 bg-green-50 text-green-800'
  return (
    <p role="status" className={`mt-4 rounded-md border px-3 py-2.5 text-sm ${estilos}`}>
      {children}
    </p>
  )
}
