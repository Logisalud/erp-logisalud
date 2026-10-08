'use client'

import { useRouter } from 'next/navigation'
import { useCallback, useState, useTransition } from 'react'
import type { ResultadoAccion } from '@/services/repositorio'

export interface Mensaje { tipo: 'ok' | 'error'; texto: string; errores?: Record<string, string> }

/**
 * Ejecuta una acción del servidor, muestra su resultado y refresca la pantalla.
 * Los mensajes de error vienen ya en lenguaje de personas (los arma el dominio o la base).
 */
export function useAccion() {
  const router = useRouter()
  const [pendiente, empezar] = useTransition()
  const [mensaje, setMensaje] = useState<Mensaje | null>(null)

  function ejecutar<T extends object>(
    fn: () => Promise<ResultadoAccion<T>>,
    opciones: { exito?: string; alExito?: (r: Extract<ResultadoAccion<T>, { ok: true }>) => void; refrescar?: boolean } = {},
  ) {
    empezar(async () => {
      const r = await fn()
      if (r.ok) {
        setMensaje(opciones.exito ? { tipo: 'ok', texto: opciones.exito } : null)
        opciones.alExito?.(r as Extract<ResultadoAccion<T>, { ok: true }>)
        if (opciones.refrescar !== false) router.refresh()
      } else {
        setMensaje({ tipo: 'error', texto: r.mensaje, errores: r.errores })
      }
    })
  }
  const limpiar = useCallback(() => setMensaje(null), [])
  return { pendiente, mensaje, ejecutar, limpiar }
}
