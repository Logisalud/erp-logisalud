'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowRight, Building2, CircleDot, FileUp, FlaskConical, HandCoins, Loader2, Truck, X } from 'lucide-react'
import { crearOrdenManualAccion, ordenDelPedidoAccion, subirGreClienteAccion } from '@/app/acciones-salida-manual'
import {
  AYUDA_CONCILIAR, AYUDA_UBIGEO, INFO_CLASE, MOTIVOS_C, normalizarNumeroPedido, validarOrdenManual, type ClaseOrdenManual, type ClienteManual, type EntradaOrdenManual, type LineaOrdenManual,
} from '@/domain/salida-manual'
import { ETIQUETA_MOTIVO_SALIDA, type MotivoSalida } from '@/domain/salidas'
import { avanceDeSalida } from '@/domain/pasos'
import type { Propietario } from '@/domain/tipos'
import type { OrdenCreada, OrdenDelPedido } from '@/services/repositorio-salida-manual'
import { useAccion } from '../usar-accion'
import { Aviso } from '../entradas/aviso'
import { TablaLineasOrden, lineaVacia, type LineaForm, type ModoLinea } from './tabla-lineas-orden'

const ICONO: Record<ClaseOrdenManual, typeof Truck> = { A: Truck, B: Building2, C: FlaskConical }
const NOMBRE_CORTO: Record<ClaseOrdenManual, string> = { A: 'Tipo A', B: 'Tipo B', C: 'Tipo C' }

function Campo({ id, etiqueta, children, error, ayuda }: { id: string; etiqueta: string; children: React.ReactNode; error?: string; ayuda?: React.ReactNode }) {
  return (
    <div><label htmlFor={id} className="etiqueta">{etiqueta}</label>{children}
      {error ? <p role="alert" className="mt-1 text-sm text-red-700" data-testid={`error-${id}`}>{error}</p> : ayuda ? <p className="mt-1 text-xs text-gray-600">{ayuda}</p> : null}</div>
  )
}

export interface PropsFormOrdenManual {
  /** Los tipos que esta persona puede crear (cada rol ve solo los suyos). */
  clasesPermitidas: ClaseOrdenManual[]
  /** Los motivos del tipo C que puede crear. */
  motivosCPermitidos: MotivoSalida[]
  propietarios: Pick<Propietario, 'id' | 'razonSocial' | 'esDuenoAlmacen'>[]
  /**
   * Un usuario de cliente (B3) solo crea para su propio propietario: con esto el tipo B queda fijo y no se elige a quién. Hoy lo usa nuestro equipo y no se pasa; el permiso real
   * lo exige la base de datos con la sesión de la persona.
   */
  propietarioFijo?: string
  hoy: string
  /** Dónde se abre una orden creada. */
  rutaDeOrden?: (id: string) => string
}

/**
 * La pantalla «Nueva Orden de Salida»: primero se elige el tipo (A, B o C) con una frase que dice qué es y quién lo crea; después los datos del tipo y la tabla de líneas.
 * Todo el formulario vive aquí y recibe por parámetro lo que cambia entre quien lo usa: los tipos permitidos, el propietario fijo y los propietarios.
 */
export function FormOrdenManual({ clasesPermitidas, motivosCPermitidos, propietarios, propietarioFijo, hoy, rutaDeOrden = (id) => `/salidas/${id}` }: PropsFormOrdenManual) {
  const router = useRouter()
  const { pendiente, mensaje, ejecutar } = useAccion()
  const dueno = propietarios.find((p) => p.esDuenoAlmacen)
  const clientes = propietarios.filter((p) => !p.esDuenoAlmacen)
  const solo = clasesPermitidas.length === 1 ? clasesPermitidas[0] : null
  const [clase, setClase] = useState<ClaseOrdenManual | null>(solo)
  const [motivoC, setMotivoC] = useState<MotivoSalida | ''>(solo === 'C' && motivosCPermitidos.length === 1 ? motivosCPermitidos[0] : '')
  const [propietarioId, setPropietarioId] = useState(propietarioFijo ?? '')
  const [pedidoNumero, setPedidoNumero] = useState('')
  const [cliente, setCliente] = useState<ClienteManual>({ ruc: '', razonSocial: '', direccion: '', ubigeo: '', vendedor: '' })
  const [greNumero, setGreNumero] = useState('')
  const [gre, setGre] = useState<{ ref: string; nombre: string } | null>(null)
  const [subiendo, setSubiendo] = useState(false)
  const [lineas, setLineas] = useState<LineaForm[]>([lineaVacia(1)])
  const [errores, setErrores] = useState<Record<string, string>>({})
  const [duplicado, setDuplicado] = useState<OrdenDelPedido | null>(null)
  const [creadas, setCreadas] = useState<OrdenCreada[] | null>(null)
  const [token, setToken] = useState('')
  useEffect(() => { setToken(typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `t-${Date.now()}-${Math.random().toString(36).slice(2)}`) }, [])

  const modo: ModoLinea | null = clase === 'A' ? 'A' : clase === 'B' ? 'B' : clase === 'C' ? (motivoC === 'DEVOLUCION_PROVEEDOR' ? 'DEVOLUCION' : motivoC === 'MUESTRA' ? 'MUESTRA' : null) : null
  const propietarioDeLineas = clase === 'B' ? propietarioId : (dueno?.id ?? '')

  const elegirClase = (c: ClaseOrdenManual) => {
    setClase(c); setErrores({}); setLineas([lineaVacia(1)]); setDuplicado(null)
    if (c === 'C') setMotivoC(motivosCPermitidos.length === 1 ? motivosCPermitidos[0] : '')
  }
  const actualizar = useCallback((clave: number, parche: Partial<LineaForm>) => setLineas((x) => x.map((l) => (l.clave === clave ? { ...l, ...parche } : l))), [])
  const quitar = useCallback((clave: number) => setLineas((x) => (x.length > 1 ? x.filter((l) => l.clave !== clave) : x)), [])
  const agregar = () => setLineas((x) => [...x, lineaVacia(Math.max(0, ...x.map((l) => l.clave)) + 1)])

  // El aviso inmediato: ¿este número de pedido ya tiene orden? (la base de datos también lo rechaza)
  const consulta = useRef(0)
  useEffect(() => {
    if (clase !== 'A' || !normalizarNumeroPedido(pedidoNumero)) { setDuplicado(null); return }
    const n = ++consulta.current
    const t = setTimeout(async () => {
      const r = await ordenDelPedidoAccion(pedidoNumero)
      if (n === consulta.current) setDuplicado(r)
    }, 300)
    return () => clearTimeout(t)
  }, [clase, pedidoNumero])

  async function elegirArchivo(f: File | undefined) {
    if (!f) return
    setSubiendo(true); setErrores((x) => ({ ...x, greArchivo: '' }))
    const fd = new FormData(); fd.append('archivo', f)
    const r = await subirGreClienteAccion(fd)
    setSubiendo(false)
    if (r.ok) setGre({ ref: r.ref, nombre: r.nombre }); else setErrores((x) => ({ ...x, greArchivo: r.errores?.greArchivo ?? r.mensaje }))
  }

  function entrada(): EntradaOrdenManual | null {
    if (!clase) return null
    const ls: LineaOrdenManual[] = lineas.map((l) => ({
      productoId: l.producto?.id ?? '', cantidad: Number(l.cantidad),
      loteId: clase === 'A' ? (l.eleccion || undefined) : (modo === 'B' || modo === 'DEVOLUCION') ? l.validacion.loteId : undefined,
      motivo: clase === 'B' ? (l.motivo || undefined) : undefined,
    }))
    return {
      clase, motivo: clase === 'C' ? (motivoC || undefined) : undefined, propietarioId: clase === 'B' ? propietarioId : undefined,
      pedidoNumero: clase === 'A' ? pedidoNumero : undefined, cliente: clase === 'A' ? cliente : undefined,
      greNumero: clase === 'B' ? greNumero : undefined, greArchivo: clase === 'B' ? gre?.ref : undefined, lineas: ls, token,
    }
  }

  function enviar() {
    const e = entrada()
    if (!e) return
    const errs = validarOrdenManual(e, (id) => clientes.some((c) => c.id === id))
    lineas.forEach((l) => {
      if (!l.producto) errs[`producto-${l.clave}`] = 'Elige el producto.'
      if (!(Number(l.cantidad) > 0)) errs[`cantidad-${l.clave}`] = 'Escribe la cantidad.'
      if (modo === 'B' && !l.motivo) errs[`motivo-${l.clave}`] = 'Elige el motivo.'
      if ((modo === 'B' || modo === 'DEVOLUCION') && l.validacion.estado === 'validando') errs.lineas = 'Espera un momento: todavía estamos revisando un lote.'
      else if ((modo === 'B' || modo === 'DEVOLUCION') && l.validacion.estado !== 'ok') errs.lineas = 'Corrige o completa las líneas marcadas antes de crear la orden.'
    })
    if (duplicado?.tipo === 'ORDEN') errs.pedidoNumero = `El pedido ${pedidoNumero.trim()} ya tiene la Orden de Salida ${duplicado.numero}. Un pedido no puede tener dos órdenes`
    if (duplicado?.tipo === 'EN_BANDEJA') errs.pedidoNumero = `El pedido ${duplicado.pedidoNumero} ya llegó por la bandeja: créale la orden desde «Pedidos por despachar»`
    setErrores(errs)
    if (Object.keys(errs).length) {
      requestAnimationFrame(() => document.querySelector<HTMLElement>('[role="alert"]')?.scrollIntoView?.({ block: 'center', behavior: 'smooth' }))
      return
    }
    ejecutar(() => crearOrdenManualAccion(e), { refrescar: false, alExito: (r) => setCreadas(r.ordenes) })
  }

  const err = (k: string) => errores[k] || mensaje?.errores?.[k]

  if (creadas) return <ResultadoCreacion creadas={creadas} clase={clase!} rutaDeOrden={rutaDeOrden} otra={() => { setCreadas(null); setLineas([lineaVacia(1)]); setPedidoNumero(''); setGre(null); setGreNumero(''); setToken(crypto.randomUUID()); router.refresh() }} />

  return (
    <form onSubmit={(ev) => { ev.preventDefault(); enviar() }} className="space-y-8" noValidate data-testid="form-orden-manual">
      <fieldset>
        <legend className="font-heading text-lg font-medium uppercase tracking-wide text-gray-800">1. ¿Qué tipo de salida es?</legend>
        <p className="mt-1 text-sm text-gray-600">{clasesPermitidas.length === 1 ? 'Tu rol puede crear este tipo de salida.' : 'Elige uno. Solo ves los tipos que tu rol puede crear.'}</p>
        <div className={`mt-3 grid gap-3 ${clasesPermitidas.length > 1 ? 'md:grid-cols-3' : ''}`} role="radiogroup" aria-label="Tipo de salida">
          {clasesPermitidas.map((c) => {
            const Icono = ICONO[c]; const on = clase === c
            return (
              <button key={c} type="button" role="radio" aria-checked={on} data-testid={`clase-${c}`} onClick={() => elegirClase(c)}
                className={`flex min-h-28 flex-col items-start gap-1.5 rounded-lg border-2 p-4 text-left transition duration-fast ${on ? 'border-logisalud-green bg-green-50' : 'border-gray-200 bg-white hover:border-gray-300'}`}>
                <span className="flex items-center gap-2 font-medium text-gray-900"><Icono className="h-5 w-5" aria-hidden />{NOMBRE_CORTO[c]} · {INFO_CLASE[c].titulo}{on && <CircleDot className="ml-1 h-4 w-4 text-green-700" aria-hidden />}</span>
                <span className="text-sm text-gray-700">{INFO_CLASE[c].frase}</span>
                <span className="text-xs font-medium text-gray-600">{INFO_CLASE[c].quien}</span>
              </button>
            )
          })}
        </div>
        {err('clase') && <p role="alert" className="mt-2 text-sm text-red-700">{err('clase')}</p>}
      </fieldset>

      {clase === 'A' && (
        <fieldset className="space-y-4" data-testid="datos-A">
          <legend className="font-heading text-lg font-medium uppercase tracking-wide text-gray-800">2. El pedido y el cliente</legend>
          <Aviso tipo="info">El pedido ya existe en Pedidos, aunque no haya llegado por la bandeja. La orden queda ligada a ese número y Pedidos factura con la guía y los lotes que le envía el WMS.</Aviso>
          <div className="grid gap-4 md:grid-cols-2">
            <Campo id="pedido-numero" etiqueta="N.° de pedido (obligatorio)" error={err('pedidoNumero')} ayuda="Como figura en Pedidos. Un pedido no puede tener dos órdenes.">
              <input id="pedido-numero" className={`campo tabular ${err('pedidoNumero') ? '!border-red-500' : ''}`} value={pedidoNumero} onChange={(e) => setPedidoNumero(e.target.value)} autoComplete="off" placeholder="PED-2026-0412" data-testid="pedido-numero" aria-required />
            </Campo>
            <Campo id="vendedor" etiqueta="Vendedor del pedido (si lo sabes)" ayuda="A él se le avisa si falta stock: decide con el cliente."><input id="vendedor" className="campo" value={cliente.vendedor ?? ''} onChange={(e) => setCliente({ ...cliente, vendedor: e.target.value })} autoComplete="off" /></Campo>
          </div>
          {duplicado?.tipo === 'ORDEN' && (
            <Aviso tipo="atencion" testid="aviso-pedido-con-orden"><p className="font-medium">El pedido {pedidoNumero.trim()} ya tiene la Orden de Salida {duplicado.numero}.</p><p className="mt-1">Un pedido no puede tener dos órdenes. <Link href={`/salidas/${duplicado.id}`} className="font-medium underline">Abrir esa orden</Link></p></Aviso>
          )}
          {duplicado?.tipo === 'EN_BANDEJA' && (
            <Aviso tipo="atencion" testid="aviso-pedido-en-bandeja"><p className="font-medium">El pedido {duplicado.pedidoNumero} ya llegó por la bandeja.</p><p className="mt-1">Créale la orden desde «Pedidos por despachar»: ahí ya están su cliente y sus líneas. <Link href="/pedidos" className="font-medium underline">Ir a Pedidos por despachar</Link></p></Aviso>
          )}
          <div className="grid gap-4 md:grid-cols-2">
            <Campo id="ruc" etiqueta="RUC del cliente (11 números)" error={err('ruc')}><input id="ruc" className={`campo tabular ${err('ruc') ? '!border-red-500' : ''}`} inputMode="numeric" maxLength={11} value={cliente.ruc} onChange={(e) => setCliente({ ...cliente, ruc: e.target.value.replace(/\D/g, '') })} autoComplete="off" data-testid="cliente-ruc" /></Campo>
            <Campo id="razon-social" etiqueta="Razón social" error={err('razonSocial')}><input id="razon-social" className={`campo ${err('razonSocial') ? '!border-red-500' : ''}`} value={cliente.razonSocial} onChange={(e) => setCliente({ ...cliente, razonSocial: e.target.value })} autoComplete="off" data-testid="cliente-razon-social" /></Campo>
            <Campo id="direccion" etiqueta="Dirección de entrega" error={err('direccion')}><input id="direccion" className={`campo ${err('direccion') ? '!border-red-500' : ''}`} value={cliente.direccion} onChange={(e) => setCliente({ ...cliente, direccion: e.target.value })} autoComplete="off" data-testid="cliente-direccion" /></Campo>
            <Campo id="ubigeo" etiqueta="Ubigeo del distrito (6 números)" error={err('ubigeo')} ayuda={AYUDA_UBIGEO}><input id="ubigeo" className={`campo tabular ${err('ubigeo') ? '!border-red-500' : ''}`} inputMode="numeric" maxLength={6} value={cliente.ubigeo} onChange={(e) => setCliente({ ...cliente, ubigeo: e.target.value.replace(/\D/g, '') })} autoComplete="off" data-testid="cliente-ubigeo" /></Campo>
          </div>
          <p className="flex items-start gap-2 text-sm text-gray-700"><HandCoins className="mt-0.5 h-4 w-4 shrink-0 text-gray-500" aria-hidden />{AYUDA_CONCILIAR}</p>
        </fieldset>
      )}

      {clase === 'B' && (
        <fieldset className="space-y-4" data-testid="datos-B">
          <legend className="font-heading text-lg font-medium uppercase tracking-wide text-gray-800">2. El cliente y su guía</legend>
          <Aviso tipo="info">Solo se ve y se usa el stock de este cliente. No se emite guía en el WMS: se despacha con la guía de remisión que él trae. Queda registrado quién creó la orden y a nombre de quién.</Aviso>
          <div className="grid gap-4 md:grid-cols-2">
            <Campo id="propietario" etiqueta="Cliente de almacenamiento" error={err('propietarioId')}>
              <select id="propietario" className={`campo ${err('propietarioId') ? '!border-red-500' : ''}`} value={propietarioId} disabled={!!propietarioFijo} onChange={(e) => { setPropietarioId(e.target.value); setLineas([lineaVacia(1)]) }} data-testid="propietario-orden">
                <option value="">Elige el cliente</option>
                {clientes.map((p) => <option key={p.id} value={p.id}>{p.razonSocial}</option>)}
              </select>
            </Campo>
            <Campo id="gre-numero" etiqueta="N.° de la guía del cliente" error={err('greNumero')} ayuda="Serie, guion y número: T001-00001234">
              <input id="gre-numero" className={`campo tabular ${err('greNumero') ? '!border-red-500' : ''}`} value={greNumero} onChange={(e) => setGreNumero(e.target.value.toUpperCase())} autoComplete="off" placeholder="T001-00001234" data-testid="gre-numero" />
            </Campo>
          </div>
          <div>
            <p className="etiqueta">PDF de la guía del cliente</p>
            {gre ? (
              <div className="flex min-h-12 items-center justify-between gap-2 rounded-md border border-gray-300 bg-gray-50 px-3" data-testid="gre-adjunta">
                <span className="flex min-w-0 items-center gap-2 text-sm text-gray-900"><FileUp className="h-4 w-4 shrink-0 text-green-700" aria-hidden /><span className="truncate">{gre.nombre}</span></span>
                <button type="button" onClick={() => setGre(null)} aria-label="Quitar el PDF" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-gray-700 hover:bg-gray-200"><X className="h-4 w-4" aria-hidden /></button>
              </div>
            ) : (
              <label className={`flex min-h-12 cursor-pointer items-center gap-2 rounded-md border border-dashed bg-white px-3 text-sm text-gray-800 hover:bg-gray-50 ${err('greArchivo') ? 'border-red-500' : 'border-gray-400'}`}>
                {subiendo ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <FileUp className="h-4 w-4" aria-hidden />}
                {subiendo ? 'Subiendo el PDF…' : 'Adjuntar el PDF (hasta 10 MB)'}
                <input type="file" accept="application/pdf,.pdf" className="sr-only" onChange={(e) => { void elegirArchivo(e.target.files?.[0]); e.target.value = '' }} data-testid="gre-archivo" />
              </label>
            )}
            {err('greArchivo') && <p role="alert" className="mt-1 text-sm text-red-700" data-testid="error-gre-archivo">{err('greArchivo')}</p>}
          </div>
        </fieldset>
      )}

      {clase === 'C' && (
        <fieldset className="space-y-3" data-testid="datos-C">
          <legend className="font-heading text-lg font-medium uppercase tracking-wide text-gray-800">2. ¿Qué sale?</legend>
          <div className="grid gap-3 md:grid-cols-2" role="radiogroup" aria-label="Motivo de la salida sin venta">
            {MOTIVOS_C.map((m) => {
              const permitido = motivosCPermitidos.includes(m); const on = motivoC === m
              return (
                <button key={m} type="button" role="radio" aria-checked={on} disabled={!permitido} data-testid={`motivo-C-${m}`} onClick={() => { setMotivoC(m); setLineas([lineaVacia(1)]) }}
                  className={`flex min-h-20 flex-col items-start gap-1 rounded-lg border-2 p-4 text-left transition duration-fast ${on ? 'border-logisalud-green bg-green-50' : permitido ? 'border-gray-200 bg-white hover:border-gray-300' : 'cursor-not-allowed border-gray-200 bg-gray-50 text-gray-500'}`}>
                  <span className="flex items-center gap-2 font-medium">{ETIQUETA_MOTIVO_SALIDA[m]}{on && <CircleDot className="h-4 w-4 text-green-700" aria-hidden />}</span>
                  <span className="text-sm text-gray-700">{m === 'MUESTRA' ? 'Una muestra sin venta. La autoriza quien tiene el rol «autoriza salidas sin venta». El sistema propone el lote por vencimiento.' : 'Devolver mercadería a su proveedor, solo antes de que venza y según la política de canje. Indicas el lote.'}</span>
                  {!permitido && <span className="text-xs font-medium text-gray-600">Tu rol no puede crear este motivo.</span>}
                </button>
              )
            })}
          </div>
          {err('motivo') && <p role="alert" className="text-sm text-red-700">{err('motivo')}</p>}
        </fieldset>
      )}

      {clase && modo && (
        <fieldset className="space-y-3" data-testid="productos-orden">
          <legend className="font-heading text-lg font-medium uppercase tracking-wide text-gray-800">3. Productos y cantidades</legend>
          <p className="text-sm text-gray-600">
            {modo === 'A' || modo === 'MUESTRA' ? 'Busca el producto por su nombre o por cualquiera de sus códigos y escribe la cantidad. El sistema propone el lote y el vencimiento por FEFO: lo que vence primero, sin lotes vencidos ni en Reserva.'
              : modo === 'B' ? 'Busca el producto por su nombre o por cualquiera de sus códigos (también el del cliente). Escribe el lote como está en su guía: el vencimiento se completa solo y revisamos cada línea al instante. La destrucción sale solo desde Bajas.'
              : 'Indica el lote que se devuelve. Se revisa al instante: solo sale lo que aún no venció y que cumple la política de canje.'}
          </p>
          {clase === 'B' && !propietarioId
            ? <Aviso tipo="info">Elige primero el cliente de almacenamiento: así solo ves y usas su stock.</Aviso>
            : <TablaLineasOrden lineas={lineas} ctx={{ modo, propietarioId: propietarioDeLineas, hoy, errores }} actualizar={actualizar} quitar={quitar} agregar={agregar} />}
        </fieldset>
      )}

      {mensaje?.tipo === 'error' && <Aviso tipo="error" testid="error-crear-orden">{mensaje.texto}</Aviso>}
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" className="btn-primary" disabled={!modo || pendiente} data-testid="crear-orden-manual">{pendiente ? 'Creando la orden…' : 'Crear la orden de salida'}</button>
        <Link href="/salidas" className="btn-secondary">Cancelar</Link>
        {!modo && clase && <span className="text-sm text-gray-600">Elige primero lo que sale.</span>}
      </div>
      <p className="text-xs text-gray-600">Al crearla, el sistema asigna el stock y la orden sigue su camino: hoja de picking, conformidad, bultos y guía. Después de crearla verás qué sigue y quién lo hace.</p>
    </form>
  )
}

/** Éxito: qué pasó y qué sigue. */
function ResultadoCreacion({ creadas, clase, rutaDeOrden, otra }: { creadas: OrdenCreada[]; clase: ClaseOrdenManual; rutaDeOrden: (id: string) => string; otra: () => void }) {
  return (
    <div className="space-y-5" data-testid="orden-creada">
      <Aviso tipo="ok"><p className="font-medium">{creadas.length === 1 ? `Listo: la orden ${creadas[0].numero} quedó creada.` : `Listo: se crearon ${creadas.length} órdenes, una por cada motivo.`}</p></Aviso>
      <ul className="space-y-3">
        {creadas.map((o) => {
          const sig = avanceDeSalida(o.faltaStock || o.motivo === 'DESTRUCCION' ? 'SIN_STOCK' : 'ASIGNADA', o.id, { tipo: clase === 'B' ? 'CLIENTE' : undefined, destruccion: o.motivo === 'DESTRUCCION' }).siguiente
          return (
            <li key={o.id} className="card space-y-2" data-testid="orden-creada-fila">
              <p className="font-heading text-xl font-semibold tracking-wide text-gray-900"><span className="tabular">{o.numero}</span>{o.motivo ? <span className="ml-2 text-sm font-normal text-gray-600">· {ETIQUETA_MOTIVO_SALIDA[o.motivo]}</span> : null}</p>
              <p className="text-sm text-gray-800"><span className="font-medium">Sigue:</span> {o.faltaStock && clase === 'A' ? 'el vendedor del pedido decide con el cliente si se quita lo que falta o se cancela el pedido.' : sig.texto + '.'}</p>
              <p className="text-sm text-gray-700"><span className="font-medium">Lo hace:</span> {o.faltaStock && clase === 'A' ? 'el vendedor del pedido' : sig.responsable.etiqueta}</p>
              <Link href={rutaDeOrden(o.id)} className="btn-primary" data-testid="abrir-orden-creada">Abrir la orden <ArrowRight className="h-4 w-4" aria-hidden /></Link>
            </li>
          )
        })}
      </ul>
      <div className="flex flex-wrap gap-3"><button type="button" className="btn-secondary" onClick={otra} data-testid="crear-otra-orden">Crear otra orden</button><Link href="/salidas" className="btn-secondary">Ver todas las salidas</Link></div>
    </div>
  )
}
