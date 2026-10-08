'use client'

import { useState } from 'react'
import { LogOut } from 'lucide-react'
import { crearClienteNavegador } from '@logisalud/auth/client'

const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? ''

/** Cierra la sesión real (Supabase) y vuelve al login del WMS (con basePath). */
export function BotonSalirReal({ className = '' }: { className?: string }) {
  const [saliendo, setSaliendo] = useState(false)
  return (
    <button
      type="button"
      disabled={saliendo}
      className={className}
      onClick={async () => {
        setSaliendo(true)
        await crearClienteNavegador().auth.signOut()
        window.location.assign(`${BASE}/login`)
      }}
    >
      <LogOut className="h-4 w-4" aria-hidden />
      <span className="txt">{saliendo ? 'Saliendo…' : 'Cerrar sesión'}</span>
    </button>
  )
}
