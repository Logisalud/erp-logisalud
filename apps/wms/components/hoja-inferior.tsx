'use client'

import { useEffect, type ReactNode } from 'react'
import { X } from 'lucide-react'

/** Hoja que sube desde abajo en el teléfono (cierra con Escape y con la X; bloquea el scroll del fondo). */
export function HojaInferior({ titulo, cerrar, children, testid = 'hoja' }: { titulo: string; cerrar: () => void; children: ReactNode; testid?: string }) {
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => { if (e.key === 'Escape') cerrar() }
    document.addEventListener('keydown', tecla)
    document.body.style.overflow = 'hidden'
    return () => { document.removeEventListener('keydown', tecla); document.body.style.overflow = '' }
  }, [cerrar])
  return (
    <div className="fixed inset-0 z-50 flex items-end bg-gray-900/40" role="dialog" aria-modal="true" aria-label={titulo} data-testid={testid}>
      <div className="flex max-h-[92dvh] w-full flex-col rounded-t-2xl bg-white pb-[env(safe-area-inset-bottom)]">
        <div className="flex items-center justify-between gap-2 border-b border-gray-200 px-4 py-3">
          <h3 className="min-w-0 truncate font-heading text-lg font-medium tracking-wide text-gray-900">{titulo}</h3>
          <button type="button" onClick={cerrar} aria-label="Cerrar" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-gray-700 active:bg-gray-100" data-testid="hoja-cerrar"><X className="h-5 w-5" aria-hidden /></button>
        </div>
        <div className="space-y-3 overflow-y-auto px-4 py-4">{children}</div>
      </div>
    </div>
  )
}
