'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { CalendarX2, Plus, Search, SearchX, Send, Trash2 } from 'lucide-react'
import { solicitarBajaAccion, stockParaBajaAccion } from '@/app/acciones-bajas'
import { ETIQUETA_ESTADO_BAJABLE, ETIQUETA_MOTIVO_BAJA, MOTIVOS_BAJA, SUSTENTO_DE_MOTIVO, fechaCorta, type MotivoBaja, type StockParaBaja } from '@/domain/bajas'
import { useAccion } from '../usar-accion'
import { Aviso } from '../entradas/aviso'

interface Prop { id: string; codigo: string; razonSocial: string; esDuenoAlmacen: boolean }
interface LineaForm { clave: string; fila: StockParaBaja; cantidad: string; motivo: MotivoBaja | ''; detalle: string }

const claveDe = (f: StockParaBaja) => `${f.posicionId}|${f.loteId}|${f.estado}`

export function FormNuevaBaja({ propietarios, propietarioInicial, consultaInicial }: { propietarios: Prop[]; propietarioInicial?: string; consultaInicial: string }) {
  const router = useRouter()
  const { pendiente, mensaje, ejecutar } = useAccion()
  const [propietario, setPropietario] = useState(propietarios.find((p) => p.id === propietarioInicial || p.codigo === propietarioInicial)?.id ?? propietarios.find((p) => p.esDuenoAlmacen)?.id ?? propietarios[0]?.id ?? '')
  const [consulta, setConsulta] = useState(consultaInicial)
  const [resultados, setResultados] = useState<StockParaBaja[] | null>(null)
  const [fallo, setFallo] = useState<string | null>(null)
  const [lineas, setLineas] = useState<LineaForm[]>([])
  const [nota, setNota] = useState('')
  const seq = useRef(0)

  // Búsqueda en el servidor (con descarte de respuestas viejas): lo vencido sale primero.
  useEffect(() => {
    if (!propietario) return
    const n = ++seq.current
    setResultados(null); setFallo(null)
    const t = setTimeout(async () => {
      try {
        const r = await stockParaBajaAccion(propietario, consulta)
        if (n === seq.current) setResultados(r)
      } catch { if (n === seq.current) setFallo('No pudimos buscar el stock. Revisa tu conexión y vuelve a intentarlo.') }
    }, 250)
    return () => clearTimeout(t)
  }, [propietario, consulta])

  function cambiarPropietario(id: string) { setPropietario(id); setLineas([]) }
  function agregar(f: StockParaBaja) {
    if (lineas.some((l) => l.clave === claveDe(f))) return
    setLineas((ls) => [...ls, { clave: claveDe(f), fila: f, cantidad: String(f.disponible), motivo: f.vencido ? 'VENCIDO' : '', detalle: '' }])
  }
  const cambiar = (clave: string, cambio: Partial<LineaForm>) => setLineas((ls) => ls.map((l) => (l.clave === clave ? { ...l, ...cambio } : l)))
  const quitar = (clave: string) => setLineas((ls) => ls.filter((l) => l.clave !== clave))

  const problemas = lineas.map((l) => {
    const c = Number(l.cantidad)
    if (!l.motivo) return 'Elige el motivo.'
    if (!Number.isInteger(c) || c <= 0) return 'La cantidad debe ser mayor que cero.'
    if (c > l.fila.disponible) return `Solo hay ${l.fila.disponible.toLocaleString('es-PE')} disponibles.`
    if (l.motivo === 'VENCIDO' && !l.fila.vencido) return 'Este lote todavía no venció: elige otro motivo.'
    return null
  })
  const listo = lineas.length > 0 && problemas.every((p) => !p)
  const errores = mensaje?.errores ?? {}

  function enviar() {
    ejecutar(() => solicitarBajaAccion({
      propietarioId: propietario, nota: nota.trim() || undefined,
      lineas: lineas.map((l) => ({ loteId: l.fila.loteId, posicionId: l.fila.posicionId, estado: l.fila.estado, cantidad: Number(l.cantidad), motivo: l.motivo as MotivoBaja, detalle: l.detalle.trim() || undefined })),
    }), { refrescar: false, alExito: (r) => router.push(`/bajas/${r.id}?nueva=1`) })
  }

  return (
    <div className="space-y-6">
      <section className="card space-y-4" aria-labelledby="paso-1">
        <h2 id="paso-1" className="font-heading text-lg font-medium uppercase tracking-wide text-gray-800">1. ¿De quién es el stock?</h2>
        <div className="max-w-md">
          <label htmlFor="propietario" className="etiqueta">Propietario</label>
          <select id="propietario" className="campo" value={propietario} onChange={(e) => cambiarPropietario(e.target.value)} data-testid="propietario-baja">
            {propietarios.map((p) => <option key={p.id} value={p.id}>{p.codigo} · {p.razonSocial}</option>)}
          </select>
          <p className="mt-1 text-xs text-gray-600">Una baja es de un solo propietario. Si tienes stock de dos, haz dos bajas.</p>
        </div>
      </section>

      <section className="card space-y-4" aria-labelledby="paso-2">
        <h2 id="paso-2" className="font-heading text-lg font-medium uppercase tracking-wide text-gray-800">2. Busca lo que se da de baja</h2>
        <div className="relative max-w-xl">
          <label htmlFor="buscar-stock" className="etiqueta">Producto, lote o ubicación</label>
          <Search className="pointer-events-none absolute left-3 top-[2.45rem] h-4 w-4 text-gray-500" aria-hidden />
          <input id="buscar-stock" type="search" className="campo pl-9" value={consulta} onChange={(e) => setConsulta(e.target.value)} placeholder="Ej.: paracetamol, L2501 o F-1.2" autoComplete="off" data-testid="buscar-stock-baja" />
        </div>
        <p className="text-sm text-gray-600">Aquí aparece lo que está Aprobado, en Cuarentena o en Devoluciones. Lo vencido sale primero. Lo que ya está en Bajas no se vuelve a dar de baja.</p>

        {fallo ? <Aviso tipo="error">{fallo}</Aviso>
          : resultados === null ? <p className="text-sm text-gray-600" role="status" data-testid="buscando-stock">Buscando el stock…</p>
          : resultados.length === 0 ? (
            <div className="rounded-lg border border-dashed border-gray-300 px-4 py-8 text-center" data-testid="sin-stock-baja">
              <SearchX className="mx-auto h-8 w-8 text-gray-400" aria-hidden />
              <p className="mt-2 font-medium text-gray-900">No encontramos stock para dar de baja</p>
              <p className="mx-auto mt-1 max-w-md text-sm text-gray-600">{consulta.trim() ? 'Prueba con otra palabra, o con el código del lote.' : 'Este propietario no tiene stock disponible para una baja.'}</p>
            </div>
          ) : (
            <ul className="divide-y divide-gray-100 overflow-hidden rounded-lg border border-gray-200" data-testid="resultados-stock-baja">
              {resultados.map((f) => {
                const ya = lineas.some((l) => l.clave === claveDe(f))
                return (
                  <li key={claveDe(f)} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3" data-testid="resultado-stock-baja">
                    <span className="min-w-0">
                      <span className="block truncate font-medium text-gray-900">{f.producto}</span>
                      <span className="block text-sm text-gray-700">Lote {f.lote} · {f.vence ? `vence ${fechaCorta(f.vence)}` : 'sin vencimiento'} · {f.posicion} · {ETIQUETA_ESTADO_BAJABLE[f.estado]} · {f.disponible.toLocaleString('es-PE')} und. disponibles</span>
                      {f.vencido && <span className="mt-1 inline-flex items-center gap-1.5 rounded-full border border-red-200 bg-red-50 px-2.5 py-1 text-xs font-medium text-red-800"><CalendarX2 className="h-3.5 w-3.5" aria-hidden />Vencido</span>}
                    </span>
                    <button type="button" className="btn-secondary btn-sm" disabled={ya} onClick={() => agregar(f)} data-testid="agregar-stock-baja"><Plus className="h-4 w-4" aria-hidden />{ya ? 'Ya agregado' : 'Agregar'}</button>
                  </li>
                )
              })}
            </ul>
          )}
      </section>

      <section className="card space-y-4" aria-labelledby="paso-3">
        <h2 id="paso-3" className="font-heading text-lg font-medium uppercase tracking-wide text-gray-800">3. Cantidad y motivo de cada línea <span className="tabular rounded-full bg-gray-100 px-2 py-0.5 text-sm text-gray-700">{lineas.length}</span></h2>
        {lineas.length === 0 ? <p className="text-sm text-gray-600" data-testid="sin-lineas-baja">Todavía no agregaste nada. Toca «Agregar» en lo que encuentres arriba.</p> : (
          <ul className="space-y-3" data-testid="lineas-baja">
            {lineas.map((l, i) => (
              <li key={l.clave} className="rounded-lg border border-gray-200 p-3.5" data-testid="linea-baja">
                <div className="flex items-start justify-between gap-3">
                  <p className="min-w-0 text-sm"><span className="block font-medium text-gray-900">{l.fila.producto}</span><span className="text-gray-700">Lote {l.fila.lote} · {l.fila.posicion} · {ETIQUETA_ESTADO_BAJABLE[l.fila.estado]}{l.fila.vence ? ` · vence ${fechaCorta(l.fila.vence)}` : ''}</span></p>
                  <button type="button" className="btn-secondary btn-sm shrink-0" onClick={() => quitar(l.clave)} aria-label={`Quitar el lote ${l.fila.lote}`}><Trash2 className="h-4 w-4" aria-hidden />Quitar</button>
                </div>
                <div className="mt-3 grid gap-3 sm:grid-cols-[8rem_1fr]">
                  <div>
                    <label htmlFor={`cant-${i}`} className="etiqueta">Cantidad</label>
                    <input id={`cant-${i}`} inputMode="numeric" className="campo tabular" value={l.cantidad} onChange={(e) => cambiar(l.clave, { cantidad: e.target.value.replace(/\D/g, '') })} data-testid="cantidad-baja" />
                    <p className="mt-1 text-xs text-gray-600">Hasta {l.fila.disponible.toLocaleString('es-PE')}</p>
                  </div>
                  <div>
                    <label htmlFor={`mot-${i}`} className="etiqueta">Motivo</label>
                    <select id={`mot-${i}`} className="campo" value={l.motivo} onChange={(e) => cambiar(l.clave, { motivo: e.target.value as MotivoBaja })} data-testid="motivo-baja">
                      <option value="">Elige el motivo…</option>
                      {MOTIVOS_BAJA.map((m) => <option key={m} value={m} disabled={m === 'VENCIDO' && !l.fila.vencido}>{ETIQUETA_MOTIVO_BAJA[m]}{m === 'VENCIDO' && !l.fila.vencido ? ' (el lote no venció)' : ''}</option>)}
                    </select>
                    {l.motivo && <p className="mt-1 text-xs text-gray-700">Sustento que se pide: {SUSTENTO_DE_MOTIVO[l.motivo]}</p>}
                  </div>
                </div>
                <div className="mt-3">
                  <label htmlFor={`det-${i}`} className="etiqueta">Detalle (opcional)</label>
                  <input id={`det-${i}`} className="campo" value={l.detalle} onChange={(e) => cambiar(l.clave, { detalle: e.target.value })} placeholder="Ej.: cajas mojadas por goteo" autoComplete="off" maxLength={200} />
                </div>
                {problemas[i] && <p className="mt-2 text-sm text-red-800" role="alert" data-testid="problema-linea-baja">{problemas[i]}</p>}
              </li>
            ))}
          </ul>
        )}
        <div>
          <label htmlFor="nota-baja" className="etiqueta">Nota para Dirección Técnica (opcional)</label>
          <textarea id="nota-baja" rows={2} className="campo py-2" value={nota} onChange={(e) => setNota(e.target.value)} maxLength={400} />
        </div>
      </section>

      {mensaje && mensaje.tipo === 'error' && <Aviso tipo="error">{mensaje.texto}{errores.nota ? ` ${errores.nota}` : ''}</Aviso>}
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className="btn-primary" disabled={pendiente || !listo} onClick={enviar} data-testid="solicitar-baja"><Send className="h-5 w-5" aria-hidden />{pendiente ? 'Enviando…' : 'Pedir la baja'}</button>
        <p className="text-sm text-gray-600">{listo ? 'Siguiente: reúnes el sustento de cada línea y Dirección Técnica la autoriza.' : lineas.length === 0 ? 'Agrega al menos una línea.' : 'Completa la cantidad y el motivo de cada línea.'}</p>
      </div>
    </div>
  )
}
