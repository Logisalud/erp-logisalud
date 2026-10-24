'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { ArrowLeft, Check, FileDown, Minus, Pencil, Plus, RotateCcw } from 'lucide-react'
import { embalarSalidaAccion, reabrirEmbalajeAccion } from '@/app/acciones-picking'
import { MAX_BULTOS, etiquetaBulto, faltaPorColocar, repartoDeMatriz, repartoInicial, validarReparto, type EmbalajeVista, type PendienteEmbalar } from '@/domain/embalaje'
import { mesAnio } from '@/domain/salidas'
import { useAccion } from '../usar-accion'
import { useEsMovil } from '../usar-movil'
import { Aviso } from '../entradas/aviso'
import { HojaInferior } from '../hoja-inferior'
import { Qr } from '../qr'

const entero = (v: string) => Math.max(0, Math.floor(Number(v.replace(/\D/g, '')) || 0))

/** Embalaje: la tabla «lote × bulto». Todo empieza en el bulto 1; el reparto se corrige celda por celda y la suma de cada lote tiene que cerrar. */
export function EditorEmbalaje({ embalaje, puedeEmbalar }: { embalaje: EmbalajeVista; puedeEmbalar: boolean }) {
  const movil = useEsMovil()
  const { pendiente, mensaje, ejecutar } = useAccion()
  const pend = embalaje.porEmbalar
  const [n, setN] = useState(1)
  const [matriz, setMatriz] = useState<number[][]>(() => repartoInicial(pend, 1))
  const [editando, setEditando] = useState<number | null>(null)
  const [reabriendo, setReabriendo] = useState(false)
  const [motivo, setMotivo] = useState('')

  const reparto = useMemo(() => repartoDeMatriz(pend, matriz), [pend, matriz])
  const error = validarReparto(pend, reparto)
  const porBulto = Array.from({ length: n }, (_, j) => matriz.reduce((t, fila) => t + (fila[j] ?? 0), 0))

  const poner = (i: number, j: number, v: number) => setMatriz((m) => m.map((fila, k) => (k === i ? fila.map((x, c) => (c === j ? v : x)) : fila)))
  const masBultos = () => { if (n >= MAX_BULTOS) return; setN(n + 1); setMatriz((m) => m.map((f) => [...f, 0])) }
  const menosBultos = () => {
    if (n <= 1) return
    setN(n - 1); setMatriz((m) => m.map((f) => { const g = f.slice(0, -1); g[g.length - 1] += f[f.length - 1]; return g })) // lo del último bulto pasa al anterior
  }
  const embalar = () => ejecutar(() => embalarSalidaAccion(embalaje.salidaId, reparto))

  const encabezado = (
    <>
      <Link href="/embalaje" className="inline-flex items-center gap-1.5 text-sm text-gray-700 underline"><ArrowLeft className="h-4 w-4" aria-hidden />Embalaje</Link>
      <header>
        <h1 className="tabular font-heading text-3xl font-semibold uppercase tracking-wide text-gray-900">{embalaje.pedidoNumero ?? embalaje.salidaNumero}</h1>
        <p className="mt-1 text-gray-700">{embalaje.cliente ?? 'Sin cliente'} · {embalaje.salidaNumero}{embalaje.rutaNumero ? ` · Ruta ${embalaje.rutaNumero}` : ''}</p>
      </header>
    </>
  )

  // ── Ya embalado: los bultos con su QR ───────────────────────────────────────────────────────────────────────────
  if (embalaje.bultosVigentes.length > 0) {
    return (
      <div className="space-y-4" data-testid="embalaje-hecho">
        {encabezado}
        <p className="text-sm text-gray-700" role="status" data-testid="resumen-embalaje">Embalado en {embalaje.bultosVigentes.length} {embalaje.bultosVigentes.length === 1 ? 'bulto' : 'bultos'}. Imprime las etiquetas y pégalas en cada bulto.</p>
        <div className="flex flex-wrap gap-2">
          <a href={`${process.env.NEXT_PUBLIC_BASE_PATH ?? ''}/embalaje/${embalaje.salidaId}/etiquetas`} target="_blank" rel="noopener" className="btn-primary" data-testid="imprimir-etiquetas"><FileDown className="h-5 w-5" aria-hidden />Imprimir las etiquetas</a>
          <Link href={`/salidas/${embalaje.salidaId}`} className="btn-secondary" data-testid="ir-salida">Ver la salida y su documentación</Link>
          {puedeEmbalar && !reabriendo && <button type="button" className="btn-secondary" onClick={() => setReabriendo(true)} data-testid="reabrir-embalaje"><RotateCcw className="h-5 w-5" aria-hidden />Reabrir el embalaje</button>}
        </div>
        {reabriendo && (
          <div className="space-y-2 rounded-lg border border-gray-200 bg-white p-4" data-testid="form-reabrir">
            <label htmlFor="motivo-reabrir" className="etiqueta">¿Por qué se reabre? (los bultos actuales quedan anulados)</label>
            <input id="motivo-reabrir" className="campo" value={motivo} onChange={(e) => setMotivo(e.target.value)} data-testid="motivo-reabrir" />
            <div className="flex gap-2">
              <button type="button" className="btn-primary btn-sm" disabled={pendiente || !motivo.trim()} onClick={() => ejecutar(() => reabrirEmbalajeAccion(embalaje.salidaId, motivo), { alExito: () => { setReabriendo(false); setMotivo('') } })} data-testid="confirmar-reabrir">Reabrir</button>
              <button type="button" className="btn-secondary btn-sm" onClick={() => setReabriendo(false)}>Cancelar</button>
            </div>
          </div>
        )}
        {mensaje?.tipo === 'error' && <Aviso tipo="error">{mensaje.texto}</Aviso>}
        <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3" data-testid="bultos">
          {embalaje.bultosVigentes.map((b) => (
            <li key={b.id} className="flex gap-3 rounded-xl border border-gray-200 bg-white p-4" data-testid="bulto">
              <Qr codigo={b.codigo} />
              <div className="min-w-0">
                <p className="font-heading text-lg font-semibold tracking-wide text-gray-900" data-testid="bulto-etiqueta">Bulto {etiquetaBulto(b)}</p>
                <p className="tabular text-xs text-gray-600" data-testid="bulto-codigo">{b.codigo}</p>
                <ul className="mt-2 space-y-0.5 text-sm text-gray-800">{b.contenido.map((c, k) => <li key={k} className="tabular">{c.cantidad} × {c.productoCodigo} · lote {c.lote}</li>)}</ul>
              </div>
            </li>
          ))}
        </ul>
        {embalaje.bultosAnulados.length > 0 && <p className="text-sm text-gray-600" data-testid="bultos-anulados">Reparto anterior anulado: {embalaje.bultosAnulados.length} {embalaje.bultosAnulados.length === 1 ? 'bulto' : 'bultos'} ({embalaje.bultosAnulados[0].anuladoMotivo}).</p>}
      </div>
    )
  }

  // ── Por embalar ─────────────────────────────────────────────────────────────────────────────────────────────────
  const stepper = (
    <div className="flex items-center gap-3" data-testid="stepper-bultos">
      <span className="text-sm font-medium text-gray-900" id="lbl-bultos">¿Cuántos bultos?</span>
      <div className="inline-flex items-center rounded-full border border-gray-300 bg-white" role="group" aria-labelledby="lbl-bultos">
        <button type="button" onClick={menosBultos} disabled={n <= 1} aria-label="Un bulto menos" className="flex h-11 w-11 items-center justify-center rounded-l-full text-gray-800 disabled:opacity-40" data-testid="menos-bultos"><Minus className="h-5 w-5" aria-hidden /></button>
        <span className="tabular w-10 text-center text-lg font-semibold text-gray-900" data-testid="cuantos-bultos">{n}</span>
        <button type="button" onClick={masBultos} aria-label="Un bulto más" className="flex h-11 w-11 items-center justify-center rounded-r-full text-gray-800" data-testid="mas-bultos"><Plus className="h-5 w-5" aria-hidden /></button>
      </div>
    </div>
  )

  return (
    <div className="space-y-4" data-testid="editor-embalaje">
      {encabezado}
      {!embalaje.conforme && <Aviso tipo="info">El embalaje empieza cuando todo el pedido tiene la conformidad.</Aviso>}
      {embalaje.conforme && !puedeEmbalar && <Aviso tipo="info">Puedes ver el pedido; lo embala el personal de almacén.</Aviso>}
      {embalaje.conforme && puedeEmbalar && (
        <>
          <p className="max-w-3xl text-sm text-gray-700">Todo lo confirmado empieza en el bulto 1. Si usas más bultos, reparte las unidades: la suma de cada lote tiene que cerrar.</p>
          {stepper}

          <div className="hidden overflow-x-auto rounded-lg border border-gray-200 bg-white md:block">
            <table className="w-full text-[13px] xl:text-sm" data-testid="tabla-reparto">
              <caption className="sr-only">Reparto de los lotes confirmados en bultos</caption>
              <thead className="border-b border-gray-200 bg-gray-50 text-left text-gray-700"><tr>
                <th scope="col" className="px-3 py-2 font-medium">Producto y lote</th><th scope="col" className="px-3 py-2 text-right font-medium">Confirmado</th>
                {Array.from({ length: n }, (_, j) => <th key={j} scope="col" className="px-2 py-2 text-center font-medium">Bulto {j + 1}</th>)}
                <th scope="col" className="px-3 py-2 text-right font-medium">Falta</th>
              </tr></thead>
              <tbody className="divide-y divide-gray-100">
                {pend.map((p, i) => {
                  const falta = faltaPorColocar(p, matriz[i])
                  return (
                    <tr key={`${p.lineaId}-${p.loteId}`} data-testid="fila-reparto">
                      <td className="px-3 py-2"><strong className="block text-gray-900">{p.producto}</strong><span className="tabular text-gray-600">Lote {p.lote} · vence {p.vence ? mesAnio(p.vence) : '—'}</span></td>
                      <td className="tabular px-3 py-2 text-right text-gray-900">{p.cantidad.toLocaleString('es-PE')}</td>
                      {Array.from({ length: n }, (_, j) => (
                        <td key={j} className="px-2 py-2 text-center">
                          <label className="sr-only" htmlFor={`c-${i}-${j}`}>{p.producto} lote {p.lote}, bulto {j + 1}</label>
                          <input id={`c-${i}-${j}`} className="campo tabular w-20 text-right" inputMode="numeric" value={matriz[i][j]} onChange={(e) => poner(i, j, entero(e.target.value))} data-testid="celda-reparto" />
                        </td>
                      ))}
                      <td className={`tabular px-3 py-2 text-right font-medium ${falta === 0 ? 'text-green-800' : 'text-red-800'}`} data-testid="falta-fila">{falta === 0 ? '✓ 0' : falta > 0 ? `Faltan ${falta}` : `Sobran ${-falta}`}</td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot className="border-t border-gray-200 bg-gray-50 text-gray-800"><tr>
                <th scope="row" className="px-3 py-2 text-left font-medium">Unidades por bulto</th><td />
                {porBulto.map((t, j) => <td key={j} className={`tabular px-2 py-2 text-center font-medium ${t === 0 ? 'text-red-800' : ''}`}>{t === 0 ? 'Vacío' : t}</td>)}
                <td />
              </tr></tfoot>
            </table>
          </div>

          <ul className="space-y-2 md:hidden" data-testid="reparto-movil">
            {pend.map((p, i) => {
              const falta = faltaPorColocar(p, matriz[i])
              return (
                <li key={`${p.lineaId}-${p.loteId}`} className="rounded-xl border border-gray-200 bg-white" data-testid="fila-reparto-movil">
                  <button type="button" className="flex min-h-16 w-full items-center gap-3 px-3 py-3 text-left" onClick={() => setEditando(i)} data-testid="abrir-reparto">
                    <span className="min-w-0 flex-1">
                      <strong className="block truncate text-[15px] text-gray-900">{p.producto}</strong>
                      <span className="tabular block text-sm text-gray-700">Lote {p.lote} · {p.cantidad.toLocaleString('es-PE')} u</span>
                      <span className="tabular block text-sm text-gray-700">{matriz[i].map((x, j) => `B${j + 1}: ${x}`).join(' · ')}</span>
                    </span>
                    <span className={`shrink-0 text-xs font-medium ${falta === 0 ? 'text-green-800' : 'text-red-800'}`}>{falta === 0 ? '✓ Completo' : falta > 0 ? `Faltan ${falta}` : `Sobran ${-falta}`}</span>
                    <Pencil className="h-4 w-4 shrink-0 text-gray-500" aria-hidden />
                  </button>
                </li>
              )
            })}
          </ul>
          {movil && editando !== null && pend[editando] && (
            <HojaInferior titulo={`${pend[editando].producto} · lote ${pend[editando].lote}`} cerrar={() => setEditando(null)} testid="hoja-reparto">
              <p className="text-sm text-gray-700">Confirmado: <strong className="tabular text-gray-900">{pend[editando].cantidad.toLocaleString('es-PE')} u</strong>. ¿Cuántas van en cada bulto?</p>
              <ul className="space-y-2">
                {matriz[editando].map((x, j) => (
                  <li key={j} className="flex items-center justify-between gap-3">
                    <label htmlFor={`m-${j}`} className="text-gray-900">Bulto {j + 1}</label>
                    <input id={`m-${j}`} className="campo tabular w-28 text-right" inputMode="numeric" value={x} onChange={(e) => poner(editando, j, entero(e.target.value))} data-testid="celda-reparto-movil" />
                  </li>
                ))}
              </ul>
              <p className={`tabular text-sm ${faltaPorColocar(pend[editando], matriz[editando]) === 0 ? 'text-green-800' : 'text-red-800'}`} role="status">{faltaPorColocar(pend[editando], matriz[editando]) === 0 ? 'Completo' : faltaPorColocar(pend[editando], matriz[editando]) > 0 ? `Faltan ${faltaPorColocar(pend[editando], matriz[editando])} u` : `Sobran ${-faltaPorColocar(pend[editando], matriz[editando])} u`}</p>
              <button type="button" className="btn-primary w-full" onClick={() => setEditando(null)} data-testid="hoja-listo"><Check className="h-5 w-5" aria-hidden />Listo</button>
            </HojaInferior>
          )}

          {error && <p className="text-sm text-red-800" role="status" data-testid="error-reparto">{error}</p>}
          {mensaje?.tipo === 'error' && <Aviso tipo="error">{mensaje.texto}</Aviso>}
          <button type="button" className="btn-primary" disabled={!!error || pendiente} onClick={embalar} data-testid="confirmar-embalaje">{pendiente ? 'Embalando…' : `Confirmar el embalaje (${n} ${n === 1 ? 'bulto' : 'bultos'})`}</button>
        </>
      )}
    </div>
  )
}

export type { PendienteEmbalar }
