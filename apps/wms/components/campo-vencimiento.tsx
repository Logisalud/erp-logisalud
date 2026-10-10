'use client'

import { useRef } from 'react'
import { CalendarDays } from 'lucide-react'
import { parsearVencimiento } from '@/domain/fechas'

/**
 * Campo de vencimiento: se puede escribir (30/06/2028, 2028-06-30 o solo 06/2028) o elegir en el calendario
 * del equipo con el botón. El calendario llena el campo con el formato dd/mm/aaaa.
 */
export function CampoVencimiento({ id, value, onChange, className = 'campo tabular', invalido = false }: {
  id: string; value: string; onChange: (v: string) => void; className?: string; invalido?: boolean
}) {
  const selector = useRef<HTMLInputElement>(null)
  const iso = parsearVencimiento(value)?.fecha ?? ''

  const abrir = () => {
    const el = selector.current
    if (!el) return
    try { el.showPicker() } catch { el.focus(); el.click() }
  }
  const elegida = (v: string) => {
    if (!v) return
    const [a, m, d] = v.split('-')
    onChange(`${d}/${m}/${a}`)
  }

  return (
    <div className="relative">
      <input id={id} className={`${className} pr-12`} value={value} onChange={(e) => onChange(e.target.value)} placeholder="30/06/2028" autoComplete="off" aria-invalid={invalido || undefined} />
      <button type="button" onClick={abrir} aria-label="Elegir la fecha en el calendario" data-testid="abrir-calendario" className="absolute right-1 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-lg text-gray-700 hover:bg-gray-100 active:bg-gray-200">
        <CalendarDays className="h-5 w-5" aria-hidden />
      </button>
      <input ref={selector} type="date" tabIndex={-1} aria-hidden value={iso} onChange={(e) => elegida(e.target.value)} data-testid="selector-fecha" className="pointer-events-none absolute bottom-0 right-0 h-px w-px opacity-0" />
    </div>
  )
}
