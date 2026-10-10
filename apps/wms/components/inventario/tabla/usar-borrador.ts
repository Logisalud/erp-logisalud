'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { borradorTieneContenido, clavesBorrador, leerBorrador, type BorradorMovimiento } from '@/domain/movimiento-tabla'

/**
 * Guarda el borrador del movimiento en ESTE dispositivo mientras se arma, para recuperarlo si se corta la conexión o se cierra la app.
 * Nunca guarda nada «como ejecutado»: solo lo que la persona estaba escribiendo. Si el almacenamiento no está disponible, la pantalla sigue igual.
 */
export function useBorrador(usuarioId: string) {
  const clave = clavesBorrador(usuarioId)
  const [recuperado, setRecuperado] = useState<BorradorMovimiento | null>(null)
  const [listo, setListo] = useState(false)
  const temporizador = useRef<ReturnType<typeof setTimeout>>()

  // Al abrir: ¿había un borrador a medias?
  useEffect(() => {
    try {
      const b = leerBorrador(window.localStorage.getItem(clave))
      if (b && borradorTieneContenido(b)) setRecuperado(b)
    } catch { /* sin almacenamiento: se arma desde cero */ }
    setListo(true)
  }, [clave])

  const guardar = useCallback((b: BorradorMovimiento) => {
    clearTimeout(temporizador.current)
    temporizador.current = setTimeout(() => {
      try {
        if (borradorTieneContenido(b)) window.localStorage.setItem(clave, JSON.stringify({ ...b, guardadoEn: new Date().toISOString() }))
        else window.localStorage.removeItem(clave)
      } catch { /* cuota llena o modo privado: no se interrumpe el trabajo */ }
    }, 250)
  }, [clave])

  const descartar = useCallback(() => {
    clearTimeout(temporizador.current)
    try { window.localStorage.removeItem(clave) } catch { /* nada */ }
    setRecuperado(null)
  }, [clave])

  return { recuperado, listo, guardar, descartar, soltarRecuperado: () => setRecuperado(null) }
}

/** ¿Hay conexión? El borrador se guarda igual; esto solo permite avisar. */
export function useEnLinea() {
  const [enLinea, setEnLinea] = useState(true)
  useEffect(() => {
    setEnLinea(navigator.onLine)
    const si = () => setEnLinea(true); const no = () => setEnLinea(false)
    window.addEventListener('online', si); window.addEventListener('offline', no)
    return () => { window.removeEventListener('online', si); window.removeEventListener('offline', no) }
  }, [])
  return enLinea
}
