'use client'

import { createContext, useCallback, useContext, useState } from 'react'
import {
  agregarPaso,
  retroceder as retrocederPila,
  leerPilaGuardada,
  guardarPila,
  type PasoNavegacion,
} from '@/lib/pila-navegacion'

type ContextoPila = {
  pila: PasoNavegacion[]
  registrarPaso: (paso: PasoNavegacion) => void
  retroceder: () => void
}

const Contexto = createContext<ContextoPila | null>(null)

/** Envuelve toda la app (ver app/layout.tsx) — la pila vive mientras dure la
 * pestaña (sessionStorage), no el historial del navegador. */
export function PilaNavegacionProvider({ children }: { children: React.ReactNode }) {
  const [pila, setPila] = useState<PasoNavegacion[]>(() => leerPilaGuardada())

  const registrarPaso = useCallback((paso: PasoNavegacion) => {
    setPila((actual) => {
      const siguiente = agregarPaso(actual, paso)
      if (siguiente !== actual) guardarPila(siguiente)
      return siguiente
    })
  }, [])

  const retroceder = useCallback(() => {
    setPila((actual) => {
      const siguiente = retrocederPila(actual)
      guardarPila(siguiente)
      return siguiente
    })
  }, [])

  return <Contexto.Provider value={{ pila, registrarPaso, retroceder }}>{children}</Contexto.Provider>
}

export function usePilaNavegacion(): ContextoPila {
  const ctx = useContext(Contexto)
  if (!ctx) throw new Error('usePilaNavegacion debe usarse dentro de PilaNavegacionProvider')
  return ctx
}
