'use client'

import { Search } from 'lucide-react'
import { ETIQUETA_ESTADO } from '@/domain/estados'
import type { Estado } from '@/domain/tipos'
import { vistaPropietario } from '../../propietarios-color'

/** Un buscador grande y claro: escribir da resultados al instante, sin listas desplegables. */
export function Buscador({ id, etiqueta, ayuda, valor, onCambio, testid, autoFoco }: { id: string; etiqueta: string; ayuda?: string; valor: string; onCambio: (v: string) => void; testid: string; autoFoco?: boolean }) {
  return (
    <div>
      <label htmlFor={id} className="etiqueta">{etiqueta}</label>
      <div className="relative">
        <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-500" aria-hidden />
        <input id={id} type="search" inputMode="search" enterKeyHint="search" autoComplete="off" autoCapitalize="characters" spellCheck={false} autoFocus={autoFoco}
          className="campo !min-h-14 !pl-12 text-base md:text-lg" value={valor} onChange={(e) => onCambio(e.target.value)} data-testid={testid} aria-describedby={ayuda ? `${id}-ayuda` : undefined} />
      </div>
      {ayuda && <p id={`${id}-ayuda`} className="mt-1 text-xs text-gray-600">{ayuda}</p>}
    </div>
  )
}

export function ChipEstado({ e }: { e: Estado }) {
  return <span className="rounded-full border border-gray-300 bg-gray-50 px-2 py-0.5 text-xs font-medium text-gray-800">{ETIQUETA_ESTADO[e]}</span>
}

/** El propietario siempre con su letra y su nombre (nunca solo color). */
export function ChipPropietario({ codigo }: { codigo: string }) {
  const v = vistaPropietario(codigo)
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-gray-700">
      <span aria-hidden className="flex h-4 w-4 items-center justify-center rounded text-[10px] font-bold text-white" style={{ background: v.color }}>{v.letra}</span>{v.corto}
    </span>
  )
}

export const nUnidades = (n: number) => `${n.toLocaleString('es-PE')} u`
export const nLineas = (n: number) => `${n} ${n === 1 ? 'línea' : 'líneas'}`
