'use client'

import { useEffect, useRef, useState } from 'react'

/** Búsqueda al escribir: espera un instante, descarta respuestas viejas y avisa si falla. */
export function useBusqueda<T>(consulta: string, buscar: (q: string) => Promise<T[]>, activa = true, espera = 180) {
  const [resultados, setResultados] = useState<T[] | null>(null)
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState(false)
  const ultima = useRef(0)
  const fn = useRef(buscar)
  fn.current = buscar

  useEffect(() => {
    if (!activa || !consulta.trim()) { setResultados(null); setCargando(false); setError(false); return }
    const id = ++ultima.current
    setCargando(true)
    const t = setTimeout(async () => {
      try {
        const r = await fn.current(consulta)
        if (id === ultima.current) { setResultados(r); setError(false) }
      } catch {
        if (id === ultima.current) setError(true)
      } finally {
        if (id === ultima.current) setCargando(false)
      }
    }, espera)
    return () => clearTimeout(t)
  }, [consulta, activa, espera])

  return { resultados, cargando, error }
}
