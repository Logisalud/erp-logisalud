'use client'

import { useRouter } from 'next/navigation'
import { useMemo, useState } from 'react'
import { CircleDot, Plus, ShoppingCart, Trash2, Truck, Undo2, Users } from 'lucide-react'
import { crearIngresoAccion } from '@/app/acciones-entradas'
import { AYUDA_TIPO_INGRESO, ETIQUETA_TIPO_INGRESO, TIPOS_INGRESO, validarEntradaIngreso, type EntradaIngreso, type TipoIngreso } from '@/domain/entradas'
import type { RecepcionCompra } from '@/domain/entradas-vistas'
import type { Propietario } from '@/domain/tipos'
import { formatoFecha } from '@/domain/fechas'
import { useAccion } from '../usar-accion'
import { Aviso } from './aviso'
import { SelectorProducto, type ProductoElegido } from './selector-producto'

const ICONO: Record<TipoIngreso, typeof Truck> = { COMPRA_LOCAL: ShoppingCart, DEVOLUCION: Undo2, INGRESO_CLIENTE: Users }

function Campo ({ id, etiqueta, children, error, ayuda }: { id: string; etiqueta: string; children: React.ReactNode; error?: string; ayuda?: string }) {
  return (
    <div><label htmlFor={id} className="etiqueta">{etiqueta}</label>{children}
      {error ? <p role="alert" className="mt-1 text-sm text-red-700" data-testid={`error-${id}`}>{error}</p> : ayuda ? <p className="mt-1 text-xs text-gray-600">{ayuda}</p> : null}</div>
  )
}

interface LineaForm { clave: number; producto: ProductoElegido | null; cantidad: string }

export function FormNuevoIngreso({ propietarios, recepciones }: { propietarios: Propietario[]; recepciones: RecepcionCompra[] }) {
  const router = useRouter()
  const { pendiente, mensaje, ejecutar } = useAccion()
  const [tipo, setTipo] = useState<TipoIngreso | null>(null)
  const [recepcionId, setRecepcionId] = useState('')
  const [propietarioId, setPropietarioId] = useState('')
  const [contraparte, setContraparte] = useState('')
  const [ruc, setRuc] = useState('')
  const [guia, setGuia] = useState('')
  const [docTipo, setDocTipo] = useState<'FACTURA' | 'BOLETA'>('FACTURA')
  const [docNumero, setDocNumero] = useState('')
  const [motivo, setMotivo] = useState('')
  const [lineas, setLineas] = useState<LineaForm[]>([{ clave: 1, producto: null, cantidad: '' }])
  const [errores, setErrores] = useState<Record<string, string>>({})

  const logissa = propietarios.find((p) => p.esDuenoAlmacen)
  const clientes = propietarios.filter((p) => !p.esDuenoAlmacen)
  const disponibles = useMemo(() => recepciones.filter((r) => !r.ingresoId), [recepciones])
  const yaIngresadas = recepciones.length - disponibles.length

  function entrada(): EntradaIngreso | null {
    if (!tipo) return null
    return {
      tipo,
      propietarioId: tipo === 'COMPRA_LOCAL' ? (logissa?.id ?? '') : propietarioId,
      compraRecepcionId: tipo === 'COMPRA_LOCAL' ? recepcionId : undefined,
      contraparteNombre: contraparte, contraparteRuc: ruc, guiaNumero: guia, motivo,
      docOriginalTipo: tipo === 'DEVOLUCION' ? docTipo : undefined, docOriginalNumero: tipo === 'DEVOLUCION' ? docNumero : undefined,
      lineas: tipo === 'COMPRA_LOCAL' ? undefined : lineas.filter((l) => l.producto || l.cantidad).map((l) => ({ productoId: l.producto?.id ?? '', cantidadReferencia: l.cantidad })),
    }
  }

  function enviar(ev: React.FormEvent) {
    ev.preventDefault()
    const e = entrada()
    if (!e) return
    const prop = propietarios.find((p) => p.id === e.propietarioId)
    const v = validarEntradaIngreso(e, prop)
    if (!v.ok) { setErrores(v.errores as Record<string, string>); return }
    setErrores({})
    ejecutar(() => crearIngresoAccion(e), { refrescar: false, alExito: (r) => router.push(`/entradas/${r.id}`) })
  }

  const err = (k: string) => errores[k] ?? mensaje?.errores?.[k]
  return (
    <form onSubmit={enviar} className="space-y-8" noValidate>
      <fieldset>
        <legend className="font-heading text-lg font-medium uppercase tracking-wide text-gray-800">1. ¿Qué llegó?</legend>
        <div className="mt-3 grid gap-3 md:grid-cols-3" role="radiogroup" aria-label="Tipo de ingreso">
          {TIPOS_INGRESO.map((t) => {
            const Icono = ICONO[t]
            const on = tipo === t
            return (
              <button key={t} type="button" role="radio" aria-checked={on} data-testid={`tipo-${t}`} onClick={() => { setTipo(t); setErrores({}) }}
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
        <fieldset>
          <legend className="font-heading text-lg font-medium uppercase tracking-wide text-gray-800">2. ¿Cuál recepción de Compras?</legend>
          <p className="mt-1 text-sm text-gray-600">Compras ya registró estas recepciones. Cada una es un ingreso distinto; la cantidad de referencia sale de ahí.{yaIngresadas > 0 && ` (${yaIngresadas} ya tienen su ingreso.)`}</p>
          {disponibles.length === 0 ? (
            <div className="mt-3"><Aviso tipo="info">No hay recepciones de Compras esperando ingreso. Cuando Compras registre una, aparece aquí.</Aviso></div>
          ) : (
            <ul className="mt-3 grid gap-3 lg:grid-cols-2" role="radiogroup" aria-label="Recepciones de Compras">
              {disponibles.map((r) => {
                const on = recepcionId === r.recepcionId
                return (
                  <li key={r.recepcionId}>
                    <button type="button" role="radio" aria-checked={on} data-testid={`recepcion-${r.ocCodigo}`} onClick={() => setRecepcionId(r.recepcionId)}
                      className={`w-full rounded-lg border-2 p-4 text-left transition duration-fast ${on ? 'border-logisalud-green bg-green-50' : 'border-gray-200 bg-white hover:border-gray-300'}`}>
                      <span className="flex flex-wrap items-baseline justify-between gap-2"><span className="font-medium text-gray-900">{r.ocCodigo}</span><span className="text-xs text-gray-600">{formatoFecha(r.fecha)} · guía {r.guias ?? 's/n'}</span></span>
                      <span className="block text-sm text-gray-700">{r.proveedorNombre}</span>
                      <span className="mt-2 block space-y-0.5 text-sm text-gray-800">{r.lineas.map((l) => <span key={l.productoId} className="flex justify-between gap-3"><span className="truncate">{l.descripcion}</span><span className="tabular shrink-0 font-medium">{l.cantidad.toLocaleString('es-PE')}</span></span>)}</span>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
          {err('compraRecepcionId') && <p role="alert" className="mt-2 text-sm text-red-700">{err('compraRecepcionId')}</p>}
          {err('propietarioId') && <p role="alert" className="mt-2 text-sm text-red-700">{err('propietarioId')}</p>}
        </fieldset>
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
              </div>
            )}
          </fieldset>

          <fieldset className="space-y-3">
            <legend className="font-heading text-lg font-medium uppercase tracking-wide text-gray-800">3. Productos y cantidades de la guía</legend>
            <ul className="space-y-3">
              {lineas.map((l, i) => (
                <li key={l.clave} className="grid items-start gap-3 sm:grid-cols-[1fr_9rem_3rem]">
                  <div><label htmlFor={`prod-${l.clave}`} className="etiqueta">Producto {i + 1}</label><SelectorProducto id={`prod-${l.clave}`} valor={l.producto} onElegir={(p) => setLineas((x) => x.map((y) => (y.clave === l.clave ? { ...y, producto: p } : y)))} /></div>
                  <div><label htmlFor={`cant-${l.clave}`} className="etiqueta">Cantidad</label><input id={`cant-${l.clave}`} className="campo tabular" inputMode="numeric" value={l.cantidad} onChange={(e) => setLineas((x) => x.map((y) => (y.clave === l.clave ? { ...y, cantidad: e.target.value.replace(/[^\d]/g, '') } : y)))} autoComplete="off" /></div>
                  {lineas.length > 1 && <button type="button" onClick={() => setLineas((x) => x.filter((y) => y.clave !== l.clave))} aria-label={`Quitar el producto ${i + 1}`} className="mt-7 flex h-12 w-12 items-center justify-center rounded-full text-gray-700 hover:bg-gray-100"><Trash2 className="h-5 w-5" aria-hidden /></button>}
                </li>
              ))}
            </ul>
            {err('lineas') && <p role="alert" className="text-sm text-red-700" data-testid="error-lineas">{err('lineas')}</p>}
            <button type="button" className="btn-secondary btn-sm" onClick={() => setLineas((x) => [...x, { clave: Math.max(...x.map((y) => y.clave)) + 1, producto: null, cantidad: '' }])}><Plus className="h-4 w-4" aria-hidden />Agregar otro producto</button>
          </fieldset>
        </>
      )}

      {mensaje?.tipo === 'error' && <Aviso tipo="error">{mensaje.texto}</Aviso>}
      <div className="flex flex-wrap gap-3">
        <button type="submit" className="btn-primary" disabled={!tipo || pendiente} data-testid="crear-ingreso">{pendiente ? 'Creando…' : 'Crear ingreso'}</button>
        <button type="button" className="btn-secondary" onClick={() => router.push('/entradas')}>Cancelar</button>
      </div>
    </form>
  )
}
