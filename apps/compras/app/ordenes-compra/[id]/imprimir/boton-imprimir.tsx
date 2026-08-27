'use client'

/** `window.print()` necesita el navegador, así que este pedacito es cliente. */
export function BotonImprimir() {
  return (
    <button type="button" onClick={() => window.print()} className="btn-primary">
      Imprimir / Guardar PDF
    </button>
  )
}
