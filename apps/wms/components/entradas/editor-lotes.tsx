'use client'

import { useState } from 'react'
import { CheckCircle2, Plus, Save, Trash2, TriangleAlert } from 'lucide-react'
import { guardarLotesAccion } from '@/app/acciones-entradas'
import { progresoLinea, textoProgreso, validarEntradaLote } from '@/domain/entradas'
import type { LineaVista, PosicionDestino } from '@/domain/entradas-vistas'
import { formatoFecha, parsearVencimiento } from '@/domain/fechas'
import { ChipRS } from '../chips'
import { situacionRS } from '@/domain/regulatorio'
import { useAccion } from '../usar-accion'
import { Aviso } from './aviso'

interface Fila { clave: number; codigo: string; cantidad: string; vence: string; posicionId: string }

const aTexto = (iso: string) => iso.split('-').reverse().join('/')

function filasIniciales(l: LineaVista, defecto: string): Fila[] {
  if (l.lotes.length === 0) return [{ clave: 1, codigo: '', cantidad: '', vence: '', posicionId: defecto }]
  return l.lotes.map((x, i) => ({ clave: i + 1, codigo: x.codigo, cantidad: String(x.cantidad), vence: x.venceTexto ?? aTexto(x.vence), posicionId: x.posicionId }))
}

/** Reparte la cantidad de referencia de un producto en lotes. "4 de 6" se actualiza mientras escribes. */
export function EditorLotes({ ingresoId, linea, posiciones, editable, hoy }: { ingresoId: string; linea: LineaVista; posiciones: PosicionDestino[]; editable: boolean; hoy: string }) {
  const defecto = posiciones[0]?.id ?? ''
  const [filas, setFilas] = useState<Fila[]>(() => filasIniciales(linea, defecto))
  const [erroresFila, setErroresFila] = useState<Record<string, string>>({})
  const { pendiente, mensaje, ejecutar } = useAccion()

  const registrado = filas.map((f) => ({ cantidad: Number(f.cantidad) > 0 ? Number(f.cantidad) : 0 }))
  const p = progresoLinea(linea.cantidadReferencia, registrado)
  const sit = situacionRS(linea.rsVence, hoy)
  const cambiado = JSON.stringify(filas.map((f) => [f.codigo, f.cantidad, f.vence, f.posicionId])) !== JSON.stringify(filasIniciales(linea, defecto).map((f) => [f.codigo, f.cantidad, f.vence, f.posicionId]))

  function guardar() {
    const errs: Record<string, string> = {}
    filas.forEach((f) => {
      const r = validarEntradaLote({ codigo: f.codigo, cantidad: f.cantidad, vence: f.vence, posicionId: f.posicionId }, parsearVencimiento)
      if (!r.ok) for (const [k, v] of Object.entries(r.errores)) errs[`${k}-${f.clave}`] = v as string
    })
    setErroresFila(errs)
    if (Object.keys(errs).length) return
    ejecutar(() => guardarLotesAccion(ingresoId, linea.id, filas.map((f) => ({ codigo: f.codigo, cantidad: f.cantidad, vence: f.vence, posicionId: f.posicionId }))), { exito: 'Lotes guardados.' })
  }

  const set = (clave: number, campo: keyof Fila, valor: string) => setFilas((x) => x.map((f) => (f.clave === clave ? { ...f, [campo]: valor } : f)))
  const e = (campo: string, clave: number) => erroresFila[`${campo}-${clave}`]

  return (
    <section className="card" aria-labelledby={`l-${linea.id}`} data-testid="linea-ingreso">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 id={`l-${linea.id}`} className="font-heading text-lg font-medium uppercase tracking-wide text-gray-900">{linea.descripcion}</h3>
          <p className="text-sm text-gray-600">{linea.codigo}{linea.registroSanitario ? ` · RS ${linea.registroSanitario}` : ''}</p>
          <div className="mt-1.5"><ChipRS situacion={sit} /></div>
        </div>
        <div className="text-right" data-testid="progreso-linea">
          <p className="tabular font-heading text-2xl font-semibold text-gray-900">{textoProgreso(p)}</p>
          <p className={`flex items-center justify-end gap-1 text-xs font-medium ${p.estado === 'CUADRA' ? 'text-green-800' : p.estado === 'SOBRAN' ? 'text-red-800' : 'text-gray-600'}`}>
            {p.estado === 'CUADRA' ? <><CheckCircle2 className="h-3.5 w-3.5" aria-hidden />Cuadra con la referencia</> : p.estado === 'SOBRAN' ? <><TriangleAlert className="h-3.5 w-3.5" aria-hidden />Sobran {-p.faltan}</> : <>Faltan {p.faltan.toLocaleString('es-PE')} por repartir</>}
          </p>
        </div>
      </header>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-gray-100" role="img" aria-label={`${textoProgreso(p)} unidades repartidas en lotes`}>
        <div className={`h-full rounded-full transition-all duration-base ${p.estado === 'SOBRAN' ? 'bg-red-600' : 'bg-logisalud-green'}`} style={{ width: `${Math.min(100, linea.cantidadReferencia ? (p.registrado / linea.cantidadReferencia) * 100 : 0)}%` }} />
      </div>

      {!editable ? (
        <ul className="mt-4 divide-y divide-gray-100 text-sm" data-testid="lotes-lectura">
          {linea.lotes.map((l) => (
            <li key={l.id} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-2.5">
              <span className="font-medium text-gray-900">Lote {l.codigo}</span>
              <span className="text-gray-700">vence {formatoFecha(l.vence)}{l.venceTexto ? ` (escrito ${l.venceTexto})` : ''}</span>
              <span className="tabular text-gray-900">{l.cantidad.toLocaleString('es-PE')} und. · {l.posicionCodigo}</span>
            </li>
          ))}
        </ul>
      ) : (
        <div className="mt-4 space-y-3">
          <ul className="space-y-3">
            {filas.map((f, i) => {
              const parsed = f.vence.trim() ? parsearVencimiento(f.vence) : null
              return (
                <li key={f.clave} className="grid items-start gap-3 rounded-lg border border-gray-200 bg-gray-50 p-3 sm:grid-cols-2 lg:grid-cols-[1.2fr_6rem_1.2fr_12rem_3rem]" data-testid="fila-lote">
                  <div><label htmlFor={`cod-${linea.id}-${f.clave}`} className="etiqueta">Lote {filas.length > 1 ? i + 1 : ''}</label><input id={`cod-${linea.id}-${f.clave}`} className={`campo ${e('codigo', f.clave) ? '!border-red-500' : ''}`} value={f.codigo} onChange={(ev) => set(f.clave, 'codigo', ev.target.value)} placeholder="Como está impreso" autoComplete="off" />{e('codigo', f.clave) && <p role="alert" className="mt-1 text-xs text-red-700">{e('codigo', f.clave)}</p>}</div>
                  <div><label htmlFor={`can-${linea.id}-${f.clave}`} className="etiqueta">Cantidad</label><input id={`can-${linea.id}-${f.clave}`} className={`campo tabular ${e('cantidad', f.clave) ? '!border-red-500' : ''}`} inputMode="numeric" value={f.cantidad} onChange={(ev) => set(f.clave, 'cantidad', ev.target.value.replace(/[^\d]/g, ''))} autoComplete="off" />{e('cantidad', f.clave) && <p role="alert" className="mt-1 text-xs text-red-700">{e('cantidad', f.clave)}</p>}</div>
                  <div><label htmlFor={`ven-${linea.id}-${f.clave}`} className="etiqueta">Vencimiento</label><input id={`ven-${linea.id}-${f.clave}`} className={`campo tabular ${e('vence', f.clave) ? '!border-red-500' : ''}`} value={f.vence} onChange={(ev) => set(f.clave, 'vence', ev.target.value)} placeholder="30/06/2028" autoComplete="off" />
                    {e('vence', f.clave) ? <p role="alert" className="mt-1 text-xs text-red-700">{e('vence', f.clave)}</p> : parsed ? <p className="mt-1 text-xs text-gray-600">{/^\d{1,2}\/\d{4}$|^\d{4}-\d{2}$/.test(f.vence.trim()) ? `Solo mes y año: se guarda como último día, ${formatoFecha(parsed.fecha)}` : formatoFecha(parsed.fecha)}</p> : <p className="mt-1 text-xs text-gray-600">La fecha completa que muestra el producto.</p>}</div>
                  <div><label htmlFor={`pos-${linea.id}-${f.clave}`} className="etiqueta">Se deja en</label><select id={`pos-${linea.id}-${f.clave}`} className="campo" value={f.posicionId} onChange={(ev) => set(f.clave, 'posicionId', ev.target.value)}>{posiciones.map((o) => <option key={o.id} value={o.id}>{o.codigo} · Cuarentena</option>)}</select></div>
                  {filas.length > 1 && <button type="button" onClick={() => setFilas((x) => x.filter((y) => y.clave !== f.clave))} aria-label={`Quitar el lote ${i + 1}`} className="flex h-12 w-12 items-center justify-center self-end rounded-full text-gray-700 hover:bg-gray-200"><Trash2 className="h-5 w-5" aria-hidden /></button>}
                </li>
              )
            })}
          </ul>
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" className="btn-secondary btn-sm" onClick={() => setFilas((x) => [...x, { clave: Math.max(...x.map((y) => y.clave)) + 1, codigo: '', cantidad: p.faltan > 0 ? String(p.faltan) : '', vence: '', posicionId: x[x.length - 1]?.posicionId ?? defecto }])}><Plus className="h-4 w-4" aria-hidden />Agregar otro lote</button>
            <button type="button" className="btn-primary btn-sm" onClick={guardar} disabled={pendiente || !cambiado} data-testid="guardar-lotes"><Save className="h-4 w-4" aria-hidden />{pendiente ? 'Guardando…' : 'Guardar lotes'}</button>
            {cambiado && !pendiente && <span className="text-xs text-amber-900">Hay cambios sin guardar.</span>}
          </div>
          {mensaje && <Aviso tipo={mensaje.tipo === 'ok' ? 'ok' : 'error'}>{mensaje.texto}</Aviso>}
        </div>
      )}
    </section>
  )
}
