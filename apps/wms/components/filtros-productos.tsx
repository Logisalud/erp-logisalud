'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { Search } from 'lucide-react'

const VALIDACIONES = [
  ['', 'Todas'], ['PENDIENTE', 'Por validar'], ['OBSERVADO', 'Con observación'], ['VALIDADO', 'Validadas'],
] as const
const RS = [
  ['', 'Todos'], ['VENCIDO', 'Vencido'], ['POR_VENCER', 'Por vencer'], ['VIGENTE', 'Vigente'], ['SIN_DATO', 'Sin registro'],
] as const

export function FiltrosProductos({ q, validacion, rs }: { q: string; validacion?: string; rs?: string }) {
  const router = useRouter()
  const [texto, setTexto] = useState(q)

  const ir = (nuevo: { q?: string; validacion?: string; rs?: string }) => {
    const p = new URLSearchParams()
    const v = { q: texto, validacion, rs, ...nuevo }
    if (v.q?.trim()) p.set('q', v.q.trim())
    if (v.validacion) p.set('validacion', v.validacion)
    if (v.rs) p.set('rs', v.rs)
    const qs = p.toString()
    router.replace(qs ? `/productos?${qs}` : '/productos', { scroll: false })
  }

  useEffect(() => {
    if (texto.trim() === q) return
    const id = setTimeout(() => ir({ q: texto }), 250)
    return () => clearTimeout(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [texto])

  return (
    <div className="flex flex-col gap-3 md:flex-row md:items-end">
      <div className="relative md:w-80">
        <label htmlFor="q-productos" className="sr-only">Buscar producto</label>
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" aria-hidden />
        <input id="q-productos" data-testid="q-productos" value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Nombre, código o registro sanitario" className="campo !pl-9" autoComplete="off" />
      </div>
      <div>
        <label htmlFor="f-validacion" className="etiqueta">Validación</label>
        <select id="f-validacion" className="campo md:w-48" value={validacion ?? ''} onChange={(e) => ir({ validacion: e.target.value })}>
          {VALIDACIONES.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
        </select>
      </div>
      <div>
        <label htmlFor="f-rs" className="etiqueta">Registro sanitario</label>
        <select id="f-rs" className="campo md:w-48" value={rs ?? ''} onChange={(e) => ir({ rs: e.target.value })}>
          {RS.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
        </select>
      </div>
    </div>
  )
}
