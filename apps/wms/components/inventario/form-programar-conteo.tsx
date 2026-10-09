'use client'

import { normalizar } from '@/domain/busqueda'
import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ClipboardCheck, Search } from 'lucide-react'
import { programarConteoAccion } from '@/app/acciones-inventario'
import { useAccion } from '../usar-accion'
import { Aviso } from '../entradas/aviso'
import { PILDORA_ACTIVA, PILDORA_DESHABILITADA, PILDORA_INACTIVA } from '@/components/estilos-opcion'

export interface PosicionContable { id: string; codigo: string; area: string; unidades: number; ocupada?: string }

/** El Jefe elige qué ubicaciones se cuentan esta vez. Mientras dure el conteo esas ubicaciones no se mueven. */
export function FormProgramarConteo({ posiciones }: { posiciones: PosicionContable[] }) {
  const router = useRouter()
  const { pendiente, mensaje, ejecutar } = useAccion()
  const [q, setQ] = useState('')
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [nota, setNota] = useState('')
  const visibles = useMemo(() => posiciones.filter((p) => normalizar(`${p.codigo} ${p.area}`).includes(normalizar(q))).slice(0, 60), [posiciones, q])
  const alternar = (id: string) => setSel((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n })
  return (
    <section className="card space-y-4" aria-labelledby="prog" data-testid="form-programar-conteo">
      <div>
        <h2 id="prog" className="font-heading text-lg font-medium uppercase tracking-wide text-gray-800">Programar un conteo</h2>
        <p className="mt-1 text-sm text-gray-600">Elige las ubicaciones de esta vez (tres conteos pequeños por semana). El contador verá producto, lote, vencimiento y ubicación, pero <strong>no</strong> la cantidad que dice el sistema.</p>
      </div>
      <div className="relative md:w-72">
        <label htmlFor="q-conteo" className="sr-only">Buscar ubicación</label>
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" aria-hidden />
        <input id="q-conteo" className="campo !pl-9" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar ubicación (A-15.1)" autoComplete="off" data-testid="conteo-buscar" />
      </div>
      <ul className="grid max-h-64 gap-1.5 overflow-auto sm:grid-cols-2 lg:grid-cols-3" data-testid="conteo-posiciones">
        {visibles.map((p) => (
          <li key={p.id}>
            <label className={`flex min-h-11 cursor-pointer items-center gap-2.5 rounded-md border px-3 py-2 text-sm ${p.ocupada ? PILDORA_DESHABILITADA : sel.has(p.id) ? PILDORA_ACTIVA : PILDORA_INACTIVA}`}>
              <input type="checkbox" className="h-4 w-4" checked={sel.has(p.id)} disabled={!!p.ocupada} onChange={() => alternar(p.id)} data-testid={`conteo-pos-${p.codigo}`} />
              <span className="tabular font-medium">{p.codigo}</span><span className="text-xs text-gray-600">{p.ocupada ?? `${p.unidades} u`}</span>
            </label>
          </li>
        ))}
        {visibles.length === 0 && <li className="text-sm text-gray-600">Ninguna ubicación con stock coincide.</li>}
      </ul>
      <div>
        <label htmlFor="nota-conteo" className="etiqueta">Nota (opcional)</label>
        <input id="nota-conteo" className="campo" value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Por ejemplo: rotación de la semana 41" autoComplete="off" />
      </div>
      <button type="button" className="btn-primary" disabled={pendiente || sel.size === 0} data-testid="conteo-programar"
        onClick={() => ejecutar(() => programarConteoAccion([...sel], nota.trim() || undefined), { exito: 'Conteo programado.', refrescar: false, alExito: (r) => router.push(`/conteos/${r.id}`) })}>
        <ClipboardCheck className="h-5 w-5" aria-hidden />{pendiente ? 'Programando…' : `Programar el conteo (${sel.size})`}
      </button>
      {mensaje && <Aviso tipo={mensaje.tipo === 'ok' ? 'ok' : 'error'}>{mensaje.texto}</Aviso>}
    </section>
  )
}
