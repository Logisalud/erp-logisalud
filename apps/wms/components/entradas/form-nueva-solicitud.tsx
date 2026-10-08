'use client'

import { useRouter } from 'next/navigation'
import { useMemo, useState } from 'react'
import { CircleDot, Plus, ShoppingCart, SplitSquareHorizontal, Trash2, Undo2, Users } from 'lucide-react'
import { crearSolicitudAccion } from '@/app/acciones-entradas'
import {
  AYUDA_TIPO_INGRESO, ETIQUETA_TIPO_INGRESO, TIPOS_INGRESO, validarEntradaSolicitud, validarLineaSolicitud, type EntradaLineaSolicitud,
  type EntradaSolicitud, type TipoIngreso,
} from '@/domain/entradas'
import type { OcPendiente } from '@/domain/entradas-vistas'
import { formatoFecha, parsearVencimiento } from '@/domain/fechas'
import type { Propietario } from '@/domain/tipos'
import { useAccion } from '../usar-accion'
import { Aviso } from './aviso'
import { SelectorProducto, type ProductoElegido } from './selector-producto'

const ICONO: Record<TipoIngreso, typeof Undo2> = { COMPRA_LOCAL: ShoppingCart, DEVOLUCION: Undo2, INGRESO_CLIENTE: Users }

function Campo({ id, etiqueta, children, error, ayuda }: { id: string; etiqueta: string; children: React.ReactNode; error?: string; ayuda?: string }) {
  return (
    <div><label htmlFor={id} className="etiqueta">{etiqueta}</label>{children}
      {error ? <p role="alert" className="mt-1 text-sm text-red-700" data-testid={`error-${id}`}>{error}</p> : ayuda ? <p className="mt-1 text-xs text-gray-600">{ayuda}</p> : null}</div>
  )
}

interface LineaForm { clave: number; ocItemId?: string; producto: ProductoElegido | null; lote: string; vence: string; cantidad: string }

/**
 * La Solicitud de Ingreso es lo PRIMERO: anuncia lo que va a llegar (sin inventario). En una compra, los productos y sus
 * cantidades salen de la orden de compra; aquí solo se indica el lote y el vencimiento (y se divide en varios lotes si hace falta).
 */
export function FormNuevaSolicitud({ propietarios, ocs }: { propietarios: Propietario[]; ocs: OcPendiente[] }) {
  const router = useRouter()
  const { pendiente, mensaje, ejecutar } = useAccion()
  const [tipo, setTipo] = useState<TipoIngreso | null>(null)
  const [ocId, setOcId] = useState('')
  const [propietarioId, setPropietarioId] = useState('')
  const [contraparte, setContraparte] = useState('')
  const [ruc, setRuc] = useState('')
  const [guia, setGuia] = useState('')
  const [docTipo, setDocTipo] = useState<'FACTURA' | 'BOLETA'>('FACTURA')
  const [docNumero, setDocNumero] = useState('')
  const [motivo, setMotivo] = useState('')
  const [fecha, setFecha] = useState('')
  const [lineas, setLineas] = useState<LineaForm[]>([])
  const [errores, setErrores] = useState<Record<string, string>>({})

  const logissa = propietarios.find((p) => p.esDuenoAlmacen)
  const clientes = propietarios.filter((p) => !p.esDuenoAlmacen)
  const oc = useMemo(() => ocs.find((o) => o.ocId === ocId), [ocs, ocId])
  const siguiente = (x: LineaForm[]) => Math.max(0, ...x.map((y) => y.clave)) + 1

  function elegirTipo(t: TipoIngreso) {
    setTipo(t); setErrores({}); setOcId(''); setLineas(t === 'COMPRA_LOCAL' ? [] : [{ clave: 1, producto: null, lote: '', vence: '', cantidad: '' }])
  }
  function elegirOc(id: string) {
    setOcId(id)
    const o = ocs.find((x) => x.ocId === id)
    setLineas((o?.items ?? []).filter((i) => i.saldo > 0).map((i, k) => ({ clave: k + 1, ocItemId: i.ocItemId, producto: null, lote: '', vence: '', cantidad: String(i.saldo) })))
    setErrores({})
  }
  const set = (clave: number, campo: keyof LineaForm, valor: string) => setLineas((x) => x.map((l) => (l.clave === clave ? { ...l, [campo]: valor } : l)))
  function dividir(ocItemId: string) {
    const item = oc?.items.find((i) => i.ocItemId === ocItemId)
    const ya = lineas.filter((l) => l.ocItemId === ocItemId).reduce((n, l) => n + (Number(l.cantidad) || 0), 0)
    setLineas((x) => [...x, { clave: siguiente(x), ocItemId, producto: null, lote: '', vence: '', cantidad: String(Math.max((item?.saldo ?? 0) - ya, 0) || '') }])
  }

  function entrada(): EntradaSolicitud | null {
    if (!tipo) return null
    return {
      tipo, propietarioId: tipo === 'COMPRA_LOCAL' ? (logissa?.id ?? '') : propietarioId, ocId: tipo === 'COMPRA_LOCAL' ? ocId : undefined,
      contraparteNombre: contraparte, contraparteRuc: ruc, guiaNumero: guia, motivo, fechaPrevista: fecha || undefined,
      docOriginalTipo: tipo === 'DEVOLUCION' ? docTipo : undefined, docOriginalNumero: tipo === 'DEVOLUCION' ? docNumero : undefined,
      lineas: lineas.map((l): EntradaLineaSolicitud => ({ ocItemId: l.ocItemId, productoId: l.producto?.id, lote: l.lote, vence: l.vence, cantidad: l.cantidad })),
    }
  }

  function enviar(autorizar: boolean) {
    const e = entrada()
    if (!e) return
    const prop = propietarios.find((p) => p.id === e.propietarioId)
    const v = validarEntradaSolicitud(e, prop)
    const errs: Record<string, string> = v.ok ? {} : { ...(v.errores as Record<string, string>) }
    for (const l of lineas) {
      const r = validarLineaSolicitud({ ocItemId: l.ocItemId, productoId: l.producto?.id, lote: l.lote, vence: l.vence, cantidad: l.cantidad }, e.tipo, parsearVencimiento)
      if (!r.ok) for (const [k, m] of Object.entries(r.errores)) errs[`${k}-${l.clave}`] = m as string
    }
    const repetidos = new Set<string>()
    for (const l of lineas) {
      const k = `${l.ocItemId ?? l.producto?.id}|${l.lote.trim()}`
      if (l.lote.trim() && repetidos.has(k)) errs[`lote-${l.clave}`] = 'Ese lote ya está en este producto: junta sus cantidades.'
      repetidos.add(k)
    }
    setErrores(errs)
    if (Object.keys(errs).length) return
    ejecutar(() => crearSolicitudAccion(e, autorizar), { refrescar: false, alExito: (r) => router.push(`/entradas/${r.id}`) })
  }

  const err = (k: string) => errores[k] ?? mensaje?.errores?.[k]
  const celdaLote = (l: LineaForm, i: number, conProducto: boolean) => (
    <li key={l.clave} className={`grid items-start gap-3 rounded-lg border border-gray-200 bg-gray-50 p-3 sm:grid-cols-2 ${conProducto ? 'lg:grid-cols-[1.6fr_1fr_1fr_6rem_3rem]' : 'lg:grid-cols-[1fr_1fr_6rem_3rem]'}`} data-testid="fila-solicitud">
      {conProducto && (
        <div><label htmlFor={`prod-${l.clave}`} className="etiqueta">Producto {i + 1}</label><SelectorProducto id={`prod-${l.clave}`} valor={l.producto} error={err(`producto-${l.clave}`)} onElegir={(p) => setLineas((x) => x.map((y) => (y.clave === l.clave ? { ...y, producto: p } : y)))} />
          {err(`producto-${l.clave}`) && <p role="alert" className="mt-1 text-xs text-red-700">{err(`producto-${l.clave}`)}</p>}</div>
      )}
      <div><label htmlFor={`lote-${l.clave}`} className="etiqueta">Lote</label><input id={`lote-${l.clave}`} className={`campo ${err(`lote-${l.clave}`) ? '!border-red-500' : ''}`} value={l.lote} onChange={(ev) => set(l.clave, 'lote', ev.target.value)} placeholder="Como está impreso" autoComplete="off" />{err(`lote-${l.clave}`) && <p role="alert" className="mt-1 text-xs text-red-700">{err(`lote-${l.clave}`)}</p>}</div>
      <div><label htmlFor={`vence-${l.clave}`} className="etiqueta">Vencimiento</label><input id={`vence-${l.clave}`} className={`campo tabular ${err(`vence-${l.clave}`) ? '!border-red-500' : ''}`} value={l.vence} onChange={(ev) => set(l.clave, 'vence', ev.target.value)} placeholder="30/06/2028" autoComplete="off" />
        {err(`vence-${l.clave}`) ? <p role="alert" className="mt-1 text-xs text-red-700">{err(`vence-${l.clave}`)}</p> : l.vence.trim() && parsearVencimiento(l.vence) ? <p className="mt-1 text-xs text-gray-600">{formatoFecha(parsearVencimiento(l.vence)!.fecha)}</p> : null}</div>
      <div><label htmlFor={`cant-${l.clave}`} className="etiqueta">Cantidad</label><input id={`cant-${l.clave}`} className={`campo tabular ${err(`cantidad-${l.clave}`) ? '!border-red-500' : ''}`} inputMode="numeric" value={l.cantidad} onChange={(ev) => set(l.clave, 'cantidad', ev.target.value.replace(/[^\d]/g, ''))} autoComplete="off" />{err(`cantidad-${l.clave}`) && <p role="alert" className="mt-1 text-xs text-red-700">{err(`cantidad-${l.clave}`)}</p>}</div>
      <button type="button" onClick={() => setLineas((x) => x.filter((y) => y.clave !== l.clave))} aria-label={`Quitar el lote ${l.lote || i + 1}`} className="flex h-12 w-12 items-center justify-center self-end rounded-full text-gray-700 hover:bg-gray-200"><Trash2 className="h-5 w-5" aria-hidden /></button>
    </li>
  )

  return (
    <form onSubmit={(ev) => { ev.preventDefault(); enviar(true) }} className="space-y-8" noValidate>
      <fieldset>
        <legend className="font-heading text-lg font-medium uppercase tracking-wide text-gray-800">1. ¿Qué va a llegar?</legend>
        <div className="mt-3 grid gap-3 md:grid-cols-3" role="radiogroup" aria-label="Tipo de ingreso">
          {TIPOS_INGRESO.map((t) => {
            const Icono = ICONO[t]
            const on = tipo === t
            return (
              <button key={t} type="button" role="radio" aria-checked={on} data-testid={`tipo-${t}`} onClick={() => elegirTipo(t)}
                className={`flex min-h-24 flex-col items-start gap-1.5 rounded-lg border-2 p-4 text-left transition duration-fast ${on ? 'border-logisalud-green bg-green-50' : 'border-gray-200 bg-white hover:border-gray-300'}`}>
                <span className="flex items-center gap-2 font-medium text-gray-900"><Icono className="h-5 w-5" aria-hidden />{ETIQUETA_TIPO_INGRESO[t]}{on && <CircleDot className="ml-1 h-4 w-4 text-green-700" aria-hidden />}</span>
                <span className="text-sm text-gray-600">{AYUDA_TIPO_INGRESO[t]}</span>
              </button>
            )
          })}
        </div>
        {err('tipo') && <p role="alert" className="mt-2 text-sm text-red-700">{err('tipo')}</p>}
      </fieldset>

      {tipo === 'COMPRA_LOCAL' && (
        <>
          <fieldset>
            <legend className="font-heading text-lg font-medium uppercase tracking-wide text-gray-800">2. ¿De qué orden de compra?</legend>
            <p className="mt-1 text-sm text-gray-600">Compras es dueño de la orden y de la factura. Aquí solo se lee: los productos y las cantidades salen de ella.</p>
            {ocs.length === 0 ? (
              <div className="mt-3"><Aviso tipo="info">No hay órdenes de compra con saldo por recibir. Cuando Compras emita una, aparece aquí.</Aviso></div>
            ) : (
              <ul className="mt-3 grid gap-3 lg:grid-cols-2" role="radiogroup" aria-label="Órdenes de compra">
                {ocs.map((o) => {
                  const on = ocId === o.ocId
                  return (
                    <li key={o.ocId}>
                      <button type="button" role="radio" aria-checked={on} data-testid={`oc-${o.codigo}`} onClick={() => elegirOc(o.ocId)}
                        className={`w-full rounded-lg border-2 p-4 text-left transition duration-fast ${on ? 'border-logisalud-green bg-green-50' : 'border-gray-200 bg-white hover:border-gray-300'}`}>
                        <span className="flex flex-wrap items-baseline justify-between gap-2"><span className="font-medium text-gray-900">{o.codigo}</span><span className="text-xs text-gray-600">{o.proveedorNombre}</span></span>
                        <span className="mt-2 block space-y-0.5 text-sm text-gray-800">{o.items.filter((i) => i.saldo > 0).map((i) => <span key={i.ocItemId} className="flex justify-between gap-3"><span className="truncate">{i.descripcion}</span><span className="tabular shrink-0 font-medium">{i.saldo.toLocaleString('es-PE')} por recibir</span></span>)}</span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
            {err('ocId') && <p role="alert" className="mt-2 text-sm text-red-700">{err('ocId')}</p>}
            {err('propietarioId') && <p role="alert" className="mt-2 text-sm text-red-700">{err('propietarioId')}</p>}
          </fieldset>

          {oc && (
            <fieldset className="space-y-5">
              <legend className="font-heading text-lg font-medium uppercase tracking-wide text-gray-800">3. Lote, vencimiento y cantidad</legend>
              <p className="text-sm text-gray-600">Cada producto de la orden viene con su saldo. Si llega en más de un lote, divídelo. Lo que declares aquí es lo que se espera; al recibirlo se verifica.</p>
              {oc.items.filter((i) => i.saldo > 0).map((item) => {
                const filas = lineas.filter((l) => l.ocItemId === item.ocItemId)
                const declarado = filas.reduce((n, l) => n + (Number(l.cantidad) || 0), 0)
                return (
                  <div key={item.ocItemId} className="card space-y-3" data-testid="item-oc">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0"><p className="font-medium text-gray-900">{item.descripcion}</p><p className="text-sm text-gray-600">{item.codigo} · pedidas {item.pedida.toLocaleString('es-PE')} · ya recibidas {item.recibida.toLocaleString('es-PE')}</p></div>
                      <p className="tabular text-right" data-testid="declarado-oc"><span className="block font-heading text-xl font-semibold text-gray-900">{declarado.toLocaleString('es-PE')} de {item.saldo.toLocaleString('es-PE')}</span><span className="block text-xs text-gray-600">por recibir en esta solicitud</span></p>
                    </div>
                    {declarado > item.saldo && <Aviso tipo="atencion">Declaras {declarado - item.saldo} unidades más que el saldo de la orden. Se puede continuar: Dirección Técnica lo verá y lo conversa con Compras.</Aviso>}
                    {filas.length === 0 ? (
                      <button type="button" className="btn-secondary btn-sm" onClick={() => dividir(item.ocItemId)}><Plus className="h-4 w-4" aria-hidden />Incluir este producto</button>
                    ) : (
                      <>
                        <ul className="space-y-3">{filas.map((l, i) => celdaLote(l, i, false))}</ul>
                        <button type="button" className="btn-secondary btn-sm" onClick={() => dividir(item.ocItemId)} data-testid="dividir-lote"><SplitSquareHorizontal className="h-4 w-4" aria-hidden />Dividir en otro lote</button>
                      </>
                    )}
                  </div>
                )
              })}
              {err('lineas') && <p role="alert" className="text-sm text-red-700" data-testid="error-lineas">{err('lineas')}</p>}
            </fieldset>
          )}
          {oc && (
            <fieldset className="grid gap-4 md:grid-cols-2">
              <legend className="font-heading text-lg font-medium uppercase tracking-wide text-gray-800">4. Datos del envío</legend>
              <Campo id="guia" etiqueta="Guía del proveedor (si ya la tienes)"><input id="guia" className="campo" value={guia} onChange={(e) => setGuia(e.target.value)} placeholder="T001-00123" autoComplete="off" /></Campo>
              <Campo id="fecha" etiqueta="Fecha prevista de llegada"><input id="fecha" type="date" className="campo tabular" value={fecha} onChange={(e) => setFecha(e.target.value)} /></Campo>
            </fieldset>
          )}
        </>
      )}

      {(tipo === 'DEVOLUCION' || tipo === 'INGRESO_CLIENTE') && (
        <>
          <fieldset className="space-y-4">
            <legend className="font-heading text-lg font-medium uppercase tracking-wide text-gray-800">2. Datos del documento</legend>
            <div className="grid gap-4 md:grid-cols-2">
              <Campo id="propietario" etiqueta={tipo === 'DEVOLUCION' ? '¿De quién es la mercadería?' : 'Cliente (queda como propietario)'} error={err('propietarioId')}>
                <select id="propietario" className="campo" value={propietarioId} onChange={(e) => setPropietarioId(e.target.value)}>
                  <option value="">Elige un propietario</option>
                  {(tipo === 'DEVOLUCION' ? propietarios : clientes).map((p) => <option key={p.id} value={p.id}>{p.razonSocial}</option>)}
                </select>
              </Campo>
              <Campo id="contraparte" etiqueta={tipo === 'DEVOLUCION' ? 'Cliente que devuelve' : 'Nombre del cliente en la guía'}><input id="contraparte" className="campo" value={contraparte} onChange={(e) => setContraparte(e.target.value)} autoComplete="off" /></Campo>
              <Campo id="ruc" etiqueta="RUC (11 dígitos)" error={err('contraparteRuc')}><input id="ruc" className="campo tabular" inputMode="numeric" maxLength={11} value={ruc} onChange={(e) => setRuc(e.target.value.replace(/\D/g, ''))} autoComplete="off" /></Campo>
              <Campo id="guia" etiqueta={tipo === 'INGRESO_CLIENTE' ? 'Guía del cliente' : 'Guía de la devolución'} error={err('guiaNumero')}><input id="guia" className="campo" value={guia} onChange={(e) => setGuia(e.target.value)} placeholder="T001-00123" autoComplete="off" /></Campo>
              <Campo id="fecha" etiqueta="Fecha prevista de llegada"><input id="fecha" type="date" className="campo tabular" value={fecha} onChange={(e) => setFecha(e.target.value)} /></Campo>
            </div>
            {tipo === 'DEVOLUCION' && (
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
                <p className="text-sm font-medium text-gray-900">Factura o boleta original <span className="text-red-700">*</span></p>
                <p className="text-xs text-gray-600">Sin este documento no se puede registrar la devolución.</p>
                <div className="mt-3 grid gap-4 sm:grid-cols-[10rem_1fr]">
                  <Campo id="doc-tipo" etiqueta="Tipo"><select id="doc-tipo" className="campo" value={docTipo} onChange={(e) => setDocTipo(e.target.value as 'FACTURA' | 'BOLETA')}><option value="FACTURA">Factura</option><option value="BOLETA">Boleta</option></select></Campo>
                  <Campo id="doc-numero" etiqueta="Número" error={err('docOriginal')}><input id="doc-numero" className="campo" value={docNumero} onChange={(e) => setDocNumero(e.target.value)} placeholder="F001-004412" autoComplete="off" /></Campo>
                </div>
                <div className="mt-4"><Campo id="motivo" etiqueta="Motivo de la devolución"><input id="motivo" className="campo" value={motivo} onChange={(e) => setMotivo(e.target.value)} autoComplete="off" /></Campo></div>
                <p className="mt-3 text-xs text-gray-600">Una devolución se deja en el Área de Devoluciones, en el estado Devoluciones. No pasa por Cuarentena: su Acta Organoléptica decide si va a Aprobado o a Bajas/Rechazados.</p>
              </div>
            )}
          </fieldset>

          <fieldset className="space-y-3">
            <legend className="font-heading text-lg font-medium uppercase tracking-wide text-gray-800">3. Productos, lotes y cantidades</legend>
            <ul className="space-y-3">{lineas.map((l, i) => celdaLote(l, i, true))}</ul>
            {err('lineas') && <p role="alert" className="text-sm text-red-700" data-testid="error-lineas">{err('lineas')}</p>}
            <button type="button" className="btn-secondary btn-sm" onClick={() => setLineas((x) => [...x, { clave: siguiente(x), producto: null, lote: '', vence: '', cantidad: '' }])}><Plus className="h-4 w-4" aria-hidden />Agregar otra línea</button>
          </fieldset>
        </>
      )}

      {mensaje?.tipo === 'error' && <Aviso tipo="error">{mensaje.texto}</Aviso>}
      <div className="flex flex-wrap gap-3">
        <button type="submit" className="btn-primary" disabled={!tipo || pendiente} data-testid="crear-solicitud">{pendiente ? 'Creando…' : 'Crear y autorizar'}</button>
        <button type="button" className="btn-secondary" disabled={!tipo || pendiente} onClick={() => enviar(false)} data-testid="guardar-borrador">Guardar como borrador</button>
        <button type="button" className="btn-secondary" onClick={() => router.push('/entradas')}>Cancelar</button>
      </div>
      <p className="text-xs text-gray-600">Al autorizar, la solicitud queda programada ("por llegar") y lo anunciado ya no se reescribe: si algo cambia después, se ajusta con su motivo y queda el historial.</p>
    </form>
  )
}
