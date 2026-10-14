'use client'

import { useEffect, useMemo, useState } from 'react'
import { Plus, TriangleAlert, X } from 'lucide-react'
import { editarAsignacionAccion, lotesParaEditarAccion } from '@/app/acciones-picking'
import { mesAnio, textoAvisoFefo } from '@/domain/salidas'
import type { LineaSalidaVista, LoteEditable } from '@/domain/despacho'
import { useAccion } from '../usar-accion'
import { Aviso } from '../entradas/aviso'

interface Fila { clave: number; loteId: string; cantidad: string }

const etiquetaLote = (l: LoteEditable) => `${l.lote} · vence ${l.vence ? mesAnio(l.vence) : 'sin fecha'} · ${l.ubicacion}${l.ubicaciones > 1 ? ` (+${l.ubicaciones - 1})` : ''} · hay ${l.disponible}${l.sugerido ? ' · sugerido' : ''}`

/** Cambiar los lotes de una línea antes del picking: tabla de «lote + cantidad», sin pedir motivo. El FEFO es la sugerencia; apartarse avisa pero no bloquea. */
export function EditorLotes({ linea, cerrar }: { linea: LineaSalidaVista; cerrar: () => void }) {
  const { pendiente, mensaje, ejecutar } = useAccion()
  const [lotes, setLotes] = useState<LoteEditable[] | null>(null)
  const [filas, setFilas] = useState<Fila[]>(() => linea.asignacion.map((a, i) => ({ clave: i, loteId: a.loteId, cantidad: String(a.cantidad) })))
  const [sig, setSig] = useState(100)

  useEffect(() => { let vivo = true; lotesParaEditarAccion(linea.id).then((l) => { if (vivo) setLotes(l) }); return () => { vivo = false } }, [linea.id])

  const porId = useMemo(() => new Map((lotes ?? []).map((l) => [l.loteId, l])), [lotes])
  const num = (f: Fila) => Math.max(0, Math.floor(Number(f.cantidad) || 0))
  const total = filas.reduce((t, f) => t + num(f), 0)
  const falta = linea.cantidad - total
  const elegidos = new Set(filas.map((f) => f.loteId))
  const avisos = filas.flatMap((f) => {
    const l = porId.get(f.loteId)
    if (!l?.vence) return []
    const antes = (lotes ?? []).find((v) => !elegidos.has(v.loteId) && !!v.vence && v.vence < l.vence!)
    return antes ? [{ lote: l.lote, texto: textoAvisoFefo({ loteId: l.loteId, codigo: l.lote, antesCodigo: antes.lote, antesVence: antes.vence! }) }] : []
  })
  const excede = filas.some((f) => num(f) > (porId.get(f.loteId)?.disponible ?? Infinity))
  const repetido = elegidos.size !== filas.length
  const listo = lotes !== null && filas.length > 0 && falta === 0 && !excede && !repetido && filas.every((f) => f.loteId && num(f) > 0)

  const cambiar = (clave: number, p: Partial<Fila>) => setFilas((fs) => fs.map((f) => (f.clave === clave ? { ...f, ...p } : f)))
  const agregar = () => {
    const libre = (lotes ?? []).find((l) => !elegidos.has(l.loteId))
    if (!libre) return
    setFilas((fs) => [...fs, { clave: sig, loteId: libre.loteId, cantidad: String(Math.max(0, Math.min(falta, libre.disponible))) }])
    setSig(sig + 1)
  }
  const guardar = () => ejecutar(() => editarAsignacionAccion(linea.id, filas.map((f) => ({ loteId: f.loteId, cantidad: num(f) }))), { alExito: cerrar })

  if (lotes === null) return <p className="text-sm text-gray-700" role="status" data-testid="editor-cargando">Buscando los lotes disponibles…</p>
  return (
    <div className="space-y-3" data-testid="editor-lotes">
      <p className="text-sm text-gray-700">Pedido: <strong className="tabular text-gray-900">{linea.cantidad.toLocaleString('es-PE')} u</strong>. Elige el lote de cada celda y su cantidad; lo sugerido sigue el vencimiento más próximo (FEFO).</p>
      <ul className="space-y-2">
        {filas.map((f, i) => {
          const l = porId.get(f.loteId)
          return (
            <li key={f.clave} className="grid grid-cols-[1fr_2.75rem] items-center gap-2 sm:grid-cols-[1fr_6rem_2.75rem]" data-testid="fila-lote">
              <div className="col-span-2 min-w-0 sm:col-span-1">
                <label className="sr-only" htmlFor={`lote-${f.clave}`}>Lote {i + 1}</label>
                <select id={`lote-${f.clave}`} className="campo" value={f.loteId} onChange={(e) => cambiar(f.clave, { loteId: e.target.value })} data-testid="elegir-lote">
                  {lotes.map((x) => <option key={x.loteId} value={x.loteId}>{etiquetaLote(x)}</option>)}
                </select>
              </div>
              <div>
                <label className="sr-only" htmlFor={`cant-${f.clave}`}>Cantidad del lote {i + 1}</label>
                <input id={`cant-${f.clave}`} className="campo tabular text-right" inputMode="numeric" value={f.cantidad} onChange={(e) => cambiar(f.clave, { cantidad: e.target.value.replace(/\D/g, '') })} data-testid="cantidad-lote" />
              </div>
              <button type="button" disabled={filas.length === 1} onClick={() => setFilas((fs) => fs.filter((x) => x.clave !== f.clave))} aria-label={`Quitar el lote ${l?.lote ?? i + 1}`} className="flex h-12 w-11 items-center justify-center rounded-md text-gray-700 hover:bg-gray-100 disabled:opacity-40" data-testid="quitar-lote"><X className="h-5 w-5" aria-hidden /></button>
            </li>
          )
        })}
      </ul>
      <button type="button" className="btn-secondary btn-sm" onClick={agregar} disabled={elegidos.size >= lotes.length} data-testid="agregar-lote"><Plus className="h-4 w-4" aria-hidden />Agregar lote</button>

      <p className={`tabular text-sm ${falta === 0 ? 'text-green-800' : 'text-red-800'}`} role="status" data-testid="suma-lotes">
        {falta === 0 ? `Completo: ${total.toLocaleString('es-PE')} u` : falta > 0 ? `Faltan ${falta.toLocaleString('es-PE')} u para completar el pedido` : `Sobran ${(-falta).toLocaleString('es-PE')} u`}
      </p>
      {excede && <Aviso tipo="error">Una cantidad supera lo que hay disponible en el lote.</Aviso>}
      {repetido && <Aviso tipo="error">Un lote está repetido: súmalo en una sola celda.</Aviso>}
      {avisos.map((a) => (
        <p key={a.lote} className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-950" data-testid="aviso-fefo"><TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /><span><strong>{a.lote}:</strong> {a.texto}. Puedes seguir; el cambio queda registrado.</span></p>
      ))}
      {mensaje?.tipo === 'error' && <Aviso tipo="error">{mensaje.texto}</Aviso>}
      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn-primary" onClick={guardar} disabled={!listo || pendiente} data-testid="guardar-lotes">{pendiente ? 'Guardando…' : 'Guardar lotes'}</button>
        <button type="button" className="btn-secondary" onClick={cerrar} data-testid="cancelar-lotes">Cancelar</button>
      </div>
    </div>
  )
}
