'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Trash2, Send } from 'lucide-react'
import { prepararMovimientoAccion } from '@/app/acciones-inventario'
import type { LineaPreparar } from '@/domain/inventario'
import type { Asignacion, Estado, Origen, Posicion } from '@/domain/tipos'
import { areaAdmite, posicionAcepta } from '@/domain/zonas'
import { ETIQUETA_ESTADO } from '@/domain/estados'
import { useAccion } from '../usar-accion'
import { Aviso } from '../entradas/aviso'

export interface CeldaOrigen {
  clave: string
  etiqueta: string
  posicionId: string
  loteId: string
  estado: Estado
  procedenciaId: string
  propietarioId: string
  origen: Origen
  disponible: number
}

/** Prepara un movimiento: elige las unidades, el lugar de destino y la cantidad. No mueve nada todavía. */
export function FormMovimiento({ celdas, posiciones, asignaciones, hoy }: { celdas: CeldaOrigen[]; posiciones: Posicion[]; asignaciones: Asignacion[]; hoy: string }) {
  const router = useRouter()
  const { pendiente, mensaje, ejecutar } = useAccion()
  const [clave, setClave] = useState('')
  const [hacia, setHacia] = useState('')
  const [cantidad, setCantidad] = useState('')
  const [lineas, setLineas] = useState<(LineaPreparar & { etiqueta: string; destino: string })[]>([])
  const [motivo, setMotivo] = useState('')
  const [error, setError] = useState<string | null>(null)

  const celda = celdas.find((c) => c.clave === clave)
  const destinos = useMemo(() => !celda ? [] : posiciones
    .filter((p) => p.activa && p.id !== celda.posicionId && areaAdmite(p.tipoArea, celda.estado, celda.origen) && posicionAcepta(p, celda.propietarioId, asignaciones, hoy))
    .sort((a, b) => a.codigo.localeCompare(b.codigo, 'es', { numeric: true })), [celda, posiciones, asignaciones, hoy])

  const yaPedido = (c: CeldaOrigen) => lineas.filter((l) => l.desdePosicionId === c.posicionId && l.loteId === c.loteId && l.estado === c.estado && l.procedenciaId === c.procedenciaId).reduce((n, l) => n + l.cantidad, 0)

  function agregar() {
    setError(null)
    const n = Number(cantidad)
    if (!celda) return setError('Elige qué unidades vas a mover.')
    if (!hacia) return setError('Elige el lugar de destino.')
    if (!Number.isInteger(n) || n <= 0) return setError('Escribe una cantidad entera mayor que cero.')
    if (n > celda.disponible - yaPedido(celda)) return setError(`Ahí solo hay ${celda.disponible - yaPedido(celda)} unidades disponibles.`)
    const dest = posiciones.find((p) => p.id === hacia)!
    setLineas([...lineas, { desdePosicionId: celda.posicionId, haciaPosicionId: hacia, loteId: celda.loteId, estado: celda.estado, procedenciaId: celda.procedenciaId, cantidad: n, etiqueta: celda.etiqueta, destino: dest.codigo }])
    setCantidad(''); setHacia('')
  }

  return (
    <div className="space-y-5">
      <fieldset className="card space-y-4">
        <legend className="font-heading text-lg font-medium uppercase tracking-wide text-gray-800">Qué se mueve</legend>
        <div>
          <label htmlFor="mov-celda" className="etiqueta">Unidades (producto · lote · ubicación actual)</label>
          <select id="mov-celda" className="campo" value={clave} onChange={(e) => { setClave(e.target.value); setHacia('') }} data-testid="mov-origen">
            <option value="">Elige unidades…</option>
            {celdas.map((c) => <option key={c.clave} value={c.clave}>{c.etiqueta} · {c.disponible - yaPedido(c)} u</option>)}
          </select>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          <div>
            <label htmlFor="mov-hacia" className="etiqueta">Hacia</label>
            <select id="mov-hacia" className="campo" value={hacia} onChange={(e) => setHacia(e.target.value)} disabled={!celda} data-testid="mov-destino">
              <option value="">{celda ? 'Elige el destino…' : 'Primero elige las unidades'}</option>
              {destinos.map((p) => <option key={p.id} value={p.id}>{p.codigo}</option>)}
            </select>
            {celda && <p className="mt-1 text-xs text-gray-600">Solo se ofrecen lugares donde las unidades en {ETIQUETA_ESTADO[celda.estado]} pueden quedar. Mover no cambia el estado.</p>}
          </div>
          <div>
            <label htmlFor="mov-cantidad" className="etiqueta">Cantidad</label>
            <input id="mov-cantidad" className="campo tabular" inputMode="numeric" value={cantidad} onChange={(e) => setCantidad(e.target.value.replace(/\D/g, ''))} autoComplete="off" data-testid="mov-cantidad" />
          </div>
          <div className="flex items-end"><button type="button" className="btn-secondary w-full" onClick={agregar} data-testid="mov-agregar"><Plus className="h-5 w-5" aria-hidden />Agregar a la lista</button></div>
        </div>
        {error && <p role="alert" className="text-sm text-red-700" data-testid="mov-error">{error}</p>}
      </fieldset>

      <section aria-label="Lo que se va a mover" className="card">
        <h2 className="font-heading text-lg font-medium uppercase tracking-wide text-gray-800">Lista del movimiento</h2>
        {lineas.length === 0 ? <p className="mt-2 text-sm text-gray-600" data-testid="mov-lista-vacia">Todavía no agregaste nada.</p> : (
          <ul className="mt-2 divide-y divide-gray-100" data-testid="mov-lista">
            {lineas.map((l, i) => (
              <li key={i} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2.5">
                <span className="min-w-0 flex-1 text-sm text-gray-900">{l.etiqueta} <span aria-hidden>→</span> <strong className="tabular">{l.destino}</strong></span>
                <span className="tabular font-medium">{l.cantidad} u</span>
                <button type="button" className="inline-flex min-h-10 items-center gap-1 rounded-md px-2 text-sm text-gray-700 hover:bg-gray-100" onClick={() => setLineas(lineas.filter((_, k) => k !== i))} aria-label={`Quitar ${l.etiqueta}`}><Trash2 className="h-4 w-4" aria-hidden />Quitar</button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="card space-y-3">
        <div>
          <label htmlFor="mov-motivo" className="etiqueta">Motivo <span className="text-red-700">*</span></label>
          <input id="mov-motivo" className="campo" value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Por ejemplo: acercar al despacho" autoComplete="off" data-testid="mov-motivo" />
        </div>
        <p className="text-sm text-gray-600">Esto solo lo prepara. El Jefe de Almacén lo autoriza, alguien lo mueve y <strong>otra persona</strong> verifica que quedó donde dice el sistema.</p>
        <button type="button" className="btn-primary" disabled={pendiente || lineas.length === 0 || !motivo.trim()} data-testid="mov-preparar"
          onClick={() => ejecutar(() => prepararMovimientoAccion(lineas.map(({ etiqueta: _e, destino: _d, ...l }) => { void _e; void _d; return l }), motivo), { exito: 'Movimiento preparado.', refrescar: false, alExito: (r) => router.push(`/movimientos/${r.id}`) })}>
          <Send className="h-5 w-5" aria-hidden />{pendiente ? 'Preparando…' : 'Preparar el movimiento'}
        </button>
        {mensaje && <Aviso tipo={mensaje.tipo === 'ok' ? 'ok' : 'error'}>{mensaje.texto}</Aviso>}
      </div>
    </div>
  )
}
