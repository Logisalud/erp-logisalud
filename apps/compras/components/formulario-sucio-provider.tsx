'use client'

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'

type ContextoFormularioSucio = {
  /** true si algún formulario de la pantalla actual tiene cambios sin guardar. */
  sucio: boolean
  /** Un formulario llama esto cuando el usuario edita algo (sucio true) o justo después de guardar bien (sucio false). */
  marcarSucio: (sucio: boolean) => void
  /**
   * Pide navegar a algo (un router.push, un Link) — si hay cambios sin
   * guardar, abre el modal de confirmación en vez de navegar directo. Si no
   * hay nada sucio, ejecuta `ejecutar` de una.
   */
  solicitarNavegacion: (ejecutar: () => void) => void
}

const Contexto = createContext<ContextoFormularioSucio | null>(null)

/**
 * Guard de salida para formularios con cambios sin guardar — mirror del
 * patrón de PilaNavegacionProvider (context global, un solo provider en
 * app/layout.tsx). No usa router.back() ni confirm() nativo: intercepta la
 * navegación real (Atrás / Menú principal del Encabezado, o cualquier
 * <Link>/router.push que pase por solicitarNavegacion) y muestra un modal
 * propio. También cubre el cierre/refresh de pestaña con beforeunload.
 */
export function FormularioSucioProvider({ children }: { children: React.ReactNode }) {
  const [sucio, setSucio] = useState(false)
  const [modalAbierto, setModalAbierto] = useState(false)
  const pendienteRef = useRef<(() => void) | null>(null)

  const marcarSucio = useCallback((valor: boolean) => setSucio(valor), [])

  const solicitarNavegacion = useCallback(
    (ejecutar: () => void) => {
      if (sucio) {
        pendienteRef.current = ejecutar
        setModalAbierto(true)
      } else {
        ejecutar()
      }
    },
    [sucio]
  )

  useEffect(() => {
    if (!sucio) return
    function onBeforeUnload(e: BeforeUnloadEvent) {
      e.preventDefault()
      e.returnValue = ''
      return ''
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [sucio])

  function seguirEditando() {
    pendienteRef.current = null
    setModalAbierto(false)
  }

  function salirSinGuardar() {
    const ejecutar = pendienteRef.current
    pendienteRef.current = null
    setModalAbierto(false)
    setSucio(false)
    ejecutar?.()
  }

  return (
    <Contexto.Provider value={{ sucio, marcarSucio, solicitarNavegacion }}>
      {children}
      {modalAbierto ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="card w-full max-w-sm bg-white">
            <h2 className="font-heading text-lg">¿Seguro que quieres volver al menú principal?</h2>
            <p className="mt-2 text-sm text-gray-600">Los cambios que no hayas guardado se perderán.</p>
            <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button type="button" onClick={seguirEditando} className="btn-secondary">
                Seguir editando
              </button>
              <button type="button" onClick={salirSinGuardar} className="btn-primary bg-red-600 hover:bg-red-700">
                Salir sin guardar
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </Contexto.Provider>
  )
}

export function useFormularioSucio(): ContextoFormularioSucio {
  const ctx = useContext(Contexto)
  if (!ctx) throw new Error('useFormularioSucio debe usarse dentro de FormularioSucioProvider')
  return ctx
}

/**
 * Atajo para un <form> completo: un solo `onChange` en el `<form>` (los
 * eventos de sus inputs burbujean) marca sucio apenas alguien toca algo.
 *
 * `onSubmit` limpia el estado apenas se envía el formulario, sin esperar a
 * que termine la Server Action — si guarda bien y hace `redirect()`, la
 * pantalla cambia y no hace falta nada más; si el formulario se queda en la
 * misma pantalla tras guardar bien (ej. "Dirección y observaciones" en la
 * ficha de proveedor, que no navega a ningún lado), igual queda limpio. Sin
 * este `onSubmit`, el aviso de "¿seguro que quieres salir?" podía
 * dispararse durante el propio guardado exitoso — mientras la Server Action
 * todavía está en vuelo el formulario sigue "sucio" y cualquier intento de
 * navegar en ese instante (incluido el redirect final) lo disparaba.
 *
 * Si la Server Action devuelve un `estadoAccion` (validación falló, no hubo
 * redirect ni cambio de pantalla) se vuelve a marcar sucio: los cambios
 * siguen sin guardarse.
 */
export function useMarcarSucioAlEditar(estadoAccion?: unknown) {
  const { marcarSucio } = useFormularioSucio()

  useEffect(() => {
    return () => marcarSucio(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (estadoAccion != null) marcarSucio(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [estadoAccion])

  return {
    onChange: () => marcarSucio(true),
    onSubmit: () => marcarSucio(false),
  }
}
