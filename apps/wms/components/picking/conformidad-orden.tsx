'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, Check, TriangleAlert } from 'lucide-react'
import { conformarOrdenAccion, designarPickerAccion, lotesParaEditarAccion } from '@/app/acciones-picking'
import {
  ETIQUETA_RESULTADO_LINEA, MAX_BULTOS_CONFORMIDAD, RESULTADOS_LINEA, motivoNoPuedeConformar, validarConformidadOrden,
  type LineaPickingVista, type LoteEditable, type OrdenPickingVista, type PersonaPicking, type ResultadoLineaConformidad, type ResultadoLineaOrden,
} from '@/domain/despacho'
import { mesAnio } from '@/domain/salidas'
import type { Rol } from '@/domain/tipos'
import { useAccion } from '../usar-accion'
import { Aviso } from '../entradas/aviso'
import { CHIP_NEUTRO, CHIP_OK } from '../estilos-opcion'

interface Decision { resultado: ResultadoLineaOrden; loteId?: string; cantidad?: string; nota?: string }

const entero = (v: string) => Math.floor(Number(v.replace(/\D/g, '')) || 0)

/**
 * La conformidad de TODA la orden en una sola tabla: quien la da (otra persona, no quien picó) revisa lo picado contra la Orden de Salida.
 * Si todo coincide, «Conforme» con un click; si no, por línea: otro lote (el vencimiento se actualiza solo), menos cantidad o no encontrado.
 * Registra el número de bultos (caja master). Al conformar, el stock pasa a Despacho.
 */
export function ConformidadOrden({ orden, roles, personaId, personal, puedeDesignar }: {
  orden: OrdenPickingVista; roles: readonly Rol[]; personaId: string; personal: PersonaPicking[]; puedeDesignar: boolean
}) {
  const { pendiente, mensaje, ejecutar } = useAccion()
  const lineas = useMemo(() => [...orden.lineasDetalle].sort((a, b) => a.ordenRecorrido - b.ordenRecorrido), [orden.lineasDetalle])
  const pendientes = lineas.filter((l) => l.conformidad === 'PENDIENTE')
  const hecha = pendientes.length === 0
  const [decisiones, setDecisiones] = useState<Record<string, Decision>>({})
  const [bultos, setBultos] = useState('')
  const [nota, setNota] = useState('')
  const [hecho, setHecho] = useState<string | null>(null)
  const motivoBloqueo = motivoNoPuedeConformar(roles, personaId, orden.pickerId, !orden.pickerId)

  const resultados: ResultadoLineaConformidad[] = pendientes.map((l) => {
    const d = decisiones[l.id] ?? { resultado: 'CONFORME' as const }
    return { ordenLineaId: l.id, resultado: d.resultado, loteId: d.loteId, cantidad: d.cantidad ? entero(d.cantidad) : undefined, nota: d.nota }
  })
  const error = validarConformidadOrden(pendientes.map((l) => ({ id: l.id, cantidad: l.cantidad, lote: l.lote })), resultados, bultos ? entero(bultos) : null)
  const conAjustes = resultados.filter((r) => r.resultado !== 'CONFORME').length
  const poner = (id: string, d: Partial<Decision>) => setDecisiones((m) => ({ ...m, [id]: { ...(m[id] ?? { resultado: 'CONFORME' as const }), ...d } }))

  const enviar = () => ejecutar(() => conformarOrdenAccion(orden.id, resultados, entero(bultos), nota || undefined), {
    alExito: (r) => setHecho(
      `Conformidad registrada: ${r.unidades.toLocaleString('es-PE')} unidades en ${r.bultos} ${r.bultos === 1 ? 'bulto' : 'bultos'}, ya en Despacho. Siguiente: ${r.requiereEmbalaje ? 'embalaje del pedido (va a provincia), después la guía y la carga' : 'el Jefe de Transporte asigna la ruta y emite la guía'}.`),
  })

  return (
    <div className="space-y-4" data-testid="orden-conformidad">
      <Link href="/conformidad" className="inline-flex items-center gap-1.5 text-sm text-gray-700 underline"><ArrowLeft className="h-4 w-4" aria-hidden />Conformidad de despacho</Link>
      <header>
        <h1 className="tabular font-heading text-3xl font-semibold uppercase tracking-wide text-gray-900">{orden.salidaNumero}</h1>
        <p className="mt-1 text-gray-700">Pedido {orden.pedidoNumero ?? '—'} · {orden.cliente ?? 'Sin cliente'}{orden.rutaNumero ? ` · Ruta ${orden.rutaNumero}` : ''}</p>
        <p className="mt-1 text-sm text-gray-700" data-testid="quien-pico">{orden.pickerId ? <>Pickeó <strong>{orden.picker ?? 'la persona indicada'}</strong>.</> : 'Todavía no se indicó quién pickeó.'}</p>
      </header>

      {hecho && <Aviso tipo="ok" testid="conformidad-hecha">{hecho}</Aviso>}
      {!hecho && hecha && <Aviso tipo="ok" testid="conformidad-ya-dada">Esta orden ya tiene su conformidad{orden.bultosConformidad ? `: ${orden.bultosConformidad} ${orden.bultosConformidad === 1 ? 'bulto' : 'bultos'}` : ''}.</Aviso>}
      {!hecha && !orden.pickerId && <PickerSelector orden={orden} personal={personal} puedeDesignar={puedeDesignar} />}
      {!hecha && motivoBloqueo && orden.pickerId && <Aviso tipo="info" testid="aviso-conformidad-bloqueada">{motivoBloqueo}.</Aviso>}
      {mensaje?.tipo === 'error' && <Aviso tipo="error">{mensaje.texto}</Aviso>}

      <div className="hidden overflow-x-auto rounded-lg border border-gray-200 bg-white md:block">
        <table className="w-full text-[13px] xl:text-sm" data-testid="tabla-conformidad">
          <caption className="sr-only">Líneas de la Orden de Salida con su resultado</caption>
          <thead className="border-b border-gray-200 bg-gray-50 text-left text-gray-700"><tr>
            <th scope="col" className="px-3 py-2 font-medium">Ubicación</th><th scope="col" className="px-3 py-2 font-medium">Producto</th><th scope="col" className="px-3 py-2 font-medium">Lote · vence</th>
            <th scope="col" className="px-3 py-2 text-right font-medium">Cant.</th><th scope="col" className="px-3 py-2 font-medium">Resultado</th>
          </tr></thead>
          <tbody className="divide-y divide-gray-100">
            {lineas.map((l) => <Fila key={l.id} l={l} d={decisiones[l.id]} poner={poner} bloqueada={hecha || !!motivoBloqueo} tabla />)}
          </tbody>
        </table>
      </div>
      <ul className="space-y-2 md:hidden" data-testid="lineas-conformidad-movil">
        {lineas.map((l) => <li key={l.id} className="rounded-xl border border-gray-200 bg-white p-3"><Fila l={l} d={decisiones[l.id]} poner={poner} bloqueada={hecha || !!motivoBloqueo} tabla={false} /></li>)}
      </ul>

      {orden.ajustes.length > 0 && (
        <section aria-labelledby="h-ajustes" data-testid="ajustes-conformidad">
          <h2 id="h-ajustes" className="mb-1 font-heading text-lg font-medium tracking-wide text-gray-900">Lo que se ajustó en la conformidad</h2>
          <ul className="divide-y divide-gray-100 rounded-lg border border-gray-200 bg-white text-sm">
            {orden.ajustes.map((a, i) => (
              <li key={i} className="px-4 py-2.5">
                {a.tipo === 'OTRO_LOTE' && <>Otro lote: <span className="tabular">{a.loteAntes}</span> → <strong className="tabular">{a.loteDespues}</strong> ({a.cantidadDespues} u)</>}
                {a.tipo === 'MENOS' && <>Menos cantidad en <span className="tabular">{a.loteAntes}</span>: {a.cantidadAntes} → <strong>{a.cantidadDespues}</strong></>}
                {a.tipo === 'NO_ENCONTRADO' && <>No se encontró <span className="tabular">{a.loteAntes}</span> ({a.cantidadAntes} u)</>}
                <span className="text-gray-600"> · {a.por}{a.nota ? ` · «${a.nota}»` : ''}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {!hecha && !motivoBloqueo && (
        <section className="space-y-3 rounded-xl border border-gray-200 bg-white p-4" aria-label="Dar la conformidad" data-testid="cierre-conformidad">
          <div className="grid gap-3 sm:grid-cols-[12rem_1fr]">
            <div>
              <label htmlFor="bultos" className="etiqueta">Número de bultos</label>
              <input id="bultos" inputMode="numeric" className="campo tabular" value={bultos} onChange={(e) => setBultos(e.target.value.replace(/\D/g, '').slice(0, 2))} placeholder={`1 a ${MAX_BULTOS_CONFORMIDAD}`} data-testid="bultos" />
              <p className="mt-1 text-xs text-gray-600">Cajas master: es lo que va en la guía.</p>
            </div>
            <div>
              <label htmlFor="nota-conformidad" className="etiqueta">Nota (opcional)</label>
              <input id="nota-conformidad" className="campo" value={nota} onChange={(e) => setNota(e.target.value)} data-testid="nota-conformidad" />
            </div>
          </div>
          {error && bultos !== '' && <p className="text-sm text-red-800" role="alert" data-testid="error-conformidad">{error}</p>}
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" className="btn-primary min-h-14" disabled={pendiente || !!error} onClick={enviar} data-testid="dar-conformidad">
              <Check className="h-5 w-5" aria-hidden />{pendiente ? 'Registrando…' : conAjustes === 0 ? 'Todo conforme' : `Dar la conformidad (${conAjustes} ${conAjustes === 1 ? 'ajuste' : 'ajustes'})`}
            </button>
            {!error ? <p className="text-sm text-gray-700">Las unidades pasan a Despacho.</p> : bultos === '' && <p className="text-sm text-gray-700">Escribe el número de bultos para registrar la conformidad.</p>}
          </div>
        </section>
      )}
    </div>
  )
}

function PickerSelector({ orden, personal, puedeDesignar }: { orden: OrdenPickingVista; personal: PersonaPicking[]; puedeDesignar: boolean }) {
  const { pendiente, mensaje, ejecutar } = useAccion()
  const [id, setId] = useState('')
  if (!puedeDesignar) return <Aviso tipo="info" testid="falta-picker">Falta indicar quién pickeó (lo hace el auxiliar o el jefe al imprimir la orden). Sin eso no se puede dar la conformidad.</Aviso>
  return (
    <div className="space-y-2 rounded-xl border border-amber-300 bg-amber-50 p-4" data-testid="designar-picker">
      <label htmlFor="picker" className="etiqueta">¿Quién hizo el picking?</label>
      <div className="flex flex-wrap gap-2">
        <select id="picker" className="campo max-w-xs" value={id} onChange={(e) => setId(e.target.value)} data-testid="elegir-picker">
          <option value="">Elige a la persona…</option>
          {personal.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
        </select>
        <button type="button" className="btn-primary btn-sm" disabled={pendiente || !id} onClick={() => ejecutar(() => designarPickerAccion(orden.id, id), { exito: 'Anotado. Siguiente: otra persona da la conformidad.' })} data-testid="guardar-picker">Guardar</button>
      </div>
      {mensaje && <Aviso tipo={mensaje.tipo === 'ok' ? 'ok' : 'error'}>{mensaje.texto}</Aviso>}
    </div>
  )
}

/** Una línea: en la tabla (PC) cada dato va en su celda; en el teléfono se apila. */
function Fila({ l, d, poner, bloqueada, tabla }: { l: LineaPickingVista; d?: Decision; poner: (id: string, x: Partial<Decision>) => void; bloqueada: boolean; tabla: boolean }) {
  const pendiente = l.conformidad === 'PENDIENTE'
  const resultado = d?.resultado ?? 'CONFORME'
  const ya = l.conformidad === 'CONFORME'
  const cuerpo = (
    <>
      {ya && l.cantidad === 0 && <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs ${CHIP_NEUTRO}`} data-testid="linea-sin-unidades">Sin unidades: {l.notaConformidad ?? 'ajustada'}</span>}
      {ya && l.cantidad > 0 && <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${CHIP_OK}`} data-testid="estado-conforme"><Check className="h-3.5 w-3.5" aria-hidden />Conforme · {l.verificador}</span>}
      {pendiente && !bloqueada && (
        <div className="space-y-2">
          <label className="sr-only" htmlFor={`res-${l.id}`}>Resultado de {l.producto}</label>
          <select id={`res-${l.id}`} className="campo max-w-[14rem]" value={resultado} onChange={(e) => poner(l.id, { resultado: e.target.value as ResultadoLineaOrden, loteId: undefined, cantidad: undefined })} data-testid="resultado-linea">
            {RESULTADOS_LINEA.map((r) => <option key={r} value={r}>{ETIQUETA_RESULTADO_LINEA[r]}</option>)}
          </select>
          {resultado === 'OTRO_LOTE' && <OtroLote l={l} d={d} poner={poner} />}
          {resultado === 'MENOS' && (
            <div className="flex items-center gap-2"><label className="text-xs text-gray-700" htmlFor={`cant-${l.id}`}>Encontraste</label>
              <input id={`cant-${l.id}`} inputMode="numeric" className="campo tabular w-24" value={d?.cantidad ?? ''} onChange={(e) => poner(l.id, { cantidad: e.target.value.replace(/\D/g, '') })} data-testid="cantidad-encontrada" />
              <span className="text-xs text-gray-700">de {l.cantidad}</span></div>
          )}
          {resultado !== 'CONFORME' && <input aria-label="Nota de la línea" className="campo" placeholder="Nota (opcional)" value={d?.nota ?? ''} onChange={(e) => poner(l.id, { nota: e.target.value })} data-testid="nota-linea" />}
        </div>
      )}
      {pendiente && bloqueada && <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs ${CHIP_NEUTRO}`}>Por conformar</span>}
    </>
  )
  if (tabla) {
    return (
      <tr data-testid="linea-conformidad" data-estado={l.conformidad} className="align-top">
        <td className="tabular px-3 py-3 font-medium text-gray-900">{l.ubicacion}</td>
        <td className="px-3 py-3"><strong className="block text-gray-900">{l.producto}</strong><span className="tabular text-gray-600">{l.productoCodigo}</span></td>
        <td className="tabular px-3 py-3 text-gray-800"><strong>{l.lote}</strong> · {l.vence ? mesAnio(l.vence) : '—'}</td>
        <td className="tabular px-3 py-3 text-right text-gray-900">{l.cantidad.toLocaleString('es-PE')}</td>
        <td className="px-3 py-3">{cuerpo}</td>
      </tr>
    )
  }
  return (
    <div data-testid="linea-conformidad-movil" data-estado={l.conformidad} className="space-y-2">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="tabular text-sm font-semibold text-gray-900">{l.ubicacion}</p>
          <p className="text-[15px] text-gray-900">{l.producto}</p>
          <p className="tabular text-sm text-gray-700">Lote <strong>{l.lote}</strong> · vence {l.vence ? mesAnio(l.vence) : '—'}</p>
        </div>
        <p className="tabular shrink-0 text-right"><strong className="block text-2xl text-gray-900">{l.cantidad.toLocaleString('es-PE')}</strong><span className="text-xs text-gray-600">unidades</span></p>
      </div>
      {cuerpo}
    </div>
  )
}

/** El lote que se encontró en lugar del asignado: el vencimiento se actualiza solo; si no es el que vence primero, solo se avisa. */
function OtroLote({ l, d, poner }: { l: LineaPickingVista; d?: Decision; poner: (id: string, x: Partial<Decision>) => void }) {
  const [opciones, setOpciones] = useState<LoteEditable[] | null>(null)
  useEffect(() => { let vivo = true; lotesParaEditarAccion(l.lineaId).then((o) => { if (vivo) setOpciones(o.filter((x) => x.loteId !== l.loteId)) }); return () => { vivo = false } }, [l.lineaId, l.loteId])
  const elegido = opciones?.find((x) => x.loteId === d?.loteId)
  const primero = opciones && [...opciones].sort((a, b) => (a.vence ?? '9999').localeCompare(b.vence ?? '9999'))[0]
  return (
    <div className="space-y-1.5" data-testid="otro-lote">
      {opciones === null ? <p className="text-xs text-gray-600" role="status">Buscando lotes…</p> : opciones.length === 0
        ? <p className="flex items-center gap-1.5 text-xs text-amber-900"><TriangleAlert className="h-3.5 w-3.5" aria-hidden />No hay otro lote disponible de este producto.</p>
        : (
          <>
            <label className="sr-only" htmlFor={`lote-${l.id}`}>Lote que encontraste</label>
            <select id={`lote-${l.id}`} className="campo max-w-[18rem]" value={d?.loteId ?? ''} onChange={(e) => poner(l.id, { loteId: e.target.value || undefined })} data-testid="elegir-otro-lote">
              <option value="">Elige el lote…</option>
              {opciones.map((o) => <option key={o.loteId} value={o.loteId}>{o.lote} · vence {o.vence ? mesAnio(o.vence) : '—'} · hay {o.disponible}</option>)}
            </select>
          </>
        )}
      {elegido && <p className="tabular text-xs text-gray-800" data-testid="vence-otro-lote">Vence {elegido.vence ? mesAnio(elegido.vence) : '—'}{elegido.diasDeVida != null ? ` (${elegido.diasDeVida} días)` : ''}.</p>}
      {elegido && primero && elegido.loteId !== primero.loteId && primero.vence && elegido.vence && elegido.vence > primero.vence && (
        <p className="flex items-center gap-1.5 text-xs text-amber-900" data-testid="aviso-no-vence-primero"><TriangleAlert className="h-3.5 w-3.5" aria-hidden />No es el lote que vence primero. Queda registrado con tu nombre.</p>
      )}
    </div>
  )
}
