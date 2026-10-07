'use client'

import { TriangleAlert } from 'lucide-react'

// Error ≠ castigo: qué pasó, por qué (si lo sabemos) y qué hacer.
export default function ErrorPantalla({ reset }: { error: Error; reset: () => void }) {
  return (
    <div role="alert" className="mx-auto max-w-md py-16 text-center">
      <TriangleAlert className="mx-auto h-10 w-10 text-amber-600" aria-hidden />
      <h1 className="mt-4 font-heading text-2xl font-semibold uppercase tracking-wide text-gray-900">No pudimos cargar esta pantalla</h1>
      <p className="mt-2 text-gray-700">Puede ser la conexión o un problema del servidor. Tu información no se perdió. Vuelve a intentarlo.</p>
      <button type="button" onClick={reset} className="btn-primary mt-6">Reintentar</button>
    </div>
  )
}
