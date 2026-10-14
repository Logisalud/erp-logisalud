'use client'

import { useEffect, useState } from 'react'

/** ¿Pantalla de teléfono (menos de 768 px)? Falso hasta que hidrata. */
export function useEsMovil() {
  const [movil, setMovil] = useState(false)
  useEffect(() => {
    const q = window.matchMedia('(max-width: 767px)')
    const f = () => setMovil(q.matches)
    f()
    q.addEventListener('change', f)
    return () => q.removeEventListener('change', f)
  }, [])
  return movil
}
