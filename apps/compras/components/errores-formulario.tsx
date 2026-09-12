'use client'

import { useEffect, useRef } from 'react'

export type ErrorDeCampo = { campo: string; mensaje: string }

/**
 * Los errores de servidor de un formulario largo, visibles desde donde la
 * persona está parada.
 *
 * El problema que resuelve (reportado en el formulario de gastos, 2026-09-12):
 * el aviso de error vivía solo arriba de todo y el botón "Enviar" está abajo
 * de todo. En un celular, apretar Enviar no movía nada y el mensaje quedaba a
 * dos pantallazos de scroll hacia arriba — se veía idéntico a un botón roto.
 * El usuario principal de este flujo es justamente el vendedor desde el
 * celular.
 *
 * Dos piezas, y las dos hacen falta:
 *  - `<AvisoErrores>` se pinta arriba Y al lado del botón, así que el error
 *    aparece donde sea que esté mirando.
 *  - `useScrollAlPrimerError` lleva el foco a lo que hay que corregir: al
 *    CAMPO si el error es de un campo, y al aviso si es un error general
 *    (que no se corrige en el formulario — ahí lo único que corresponde es
 *    leerlo).
 */
export function AvisoErrores({
  errores, id,
}: { errores: readonly ErrorDeCampo[] | undefined; id?: string }) {
  if (!errores || errores.length === 0) return null
  const general = errores.find((e) => e.campo === 'general')
  const deCampo = errores.filter((e) => e.campo !== 'general')

  return (
    <div
      id={id}
      role="alert"
      className="rounded-md border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-900"
    >
      {general ? <p>{general.mensaje}</p> : null}
      {deCampo.length > 0 ? (
        <p className={general ? 'mt-1' : undefined}>
          {deCampo.length === 1
            ? 'Falta corregir un campo: '
            : `Faltan corregir ${deCampo.length} campos: `}
          {deCampo.map((e) => e.mensaje).join(' · ')}
        </p>
      ) : null}
    </div>
  )
}

/**
 * Lleva la pantalla al primer error apenas el servidor responde.
 *
 * `estado` tiene que ser el objeto que devuelve la Server Action: cada envío
 * devuelve uno nuevo, así que reintentar con el mismo error vuelve a
 * disparar el scroll (si comparáramos por contenido, el segundo intento
 * fallido no movería nada y parecería colgado otra vez).
 */
export function useScrollAlPrimerError(
  estado: { errores: ErrorDeCampo[] } | null,
  idDelAviso: string
) {
  const primeraVez = useRef(true)

  useEffect(() => {
    // En el montaje inicial no hay nada que anunciar.
    if (primeraVez.current) {
      primeraVez.current = false
      return
    }
    const errores = estado?.errores
    if (!errores || errores.length === 0) return

    const deCampo = errores.find((e) => e.campo !== 'general')
    const destino = deCampo
      ? document.querySelector<HTMLElement>(`[name="${CSS.escape(deCampo.campo)}"]`)
      : document.getElementById(idDelAviso)
    if (!destino) return

    destino.scrollIntoView({ behavior: 'smooth', block: 'center' })
    // Solo enfocamos un campo: robar el foco hacia un aviso de texto le
    // sacaría el teclado a quien está escribiendo sin darle nada a cambio.
    if (deCampo) destino.focus({ preventScroll: true })
  }, [estado, idDelAviso])
}
