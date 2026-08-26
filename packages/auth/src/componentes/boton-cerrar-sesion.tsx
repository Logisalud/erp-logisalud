'use client'

import { useState } from 'react'
import { crearClienteNavegador } from '../client'

/**
 * Cerrar sesión. Solo tiene sentido con el login activado: en modo de prueba
 * el middleware vuelve a iniciar la sesión de la cuenta designada en la
 * request siguiente, así que el botón no se muestra.
 */
export function BotonCerrarSesion({ className }: { className?: string }) {
  const [saliendo, setSaliendo] = useState(false)

  if (process.env.NEXT_PUBLIC_REQUIRE_LOGIN !== 'true') return null

  return (
    <button
      type="button"
      disabled={saliendo}
      onClick={async () => {
        setSaliendo(true)
        await crearClienteNavegador().auth.signOut()
        window.location.assign('/login')
      }}
      className={className ?? 'text-sm text-gray-600 underline hover:text-gray-900'}
    >
      {saliendo ? 'Saliendo…' : 'Cerrar sesión'}
    </button>
  )
}
