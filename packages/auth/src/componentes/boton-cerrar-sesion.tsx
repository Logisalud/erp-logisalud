'use client'

import { useState } from 'react'
import { crearClienteNavegador } from '../client'

/** Cerrar sesión y volver a la pantalla de login. */
export function BotonCerrarSesion({ className }: { className?: string }) {
  const [saliendo, setSaliendo] = useState(false)

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
