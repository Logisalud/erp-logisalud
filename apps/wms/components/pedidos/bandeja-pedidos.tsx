'use client'

import Link from 'next/link'
import { Fragment, useMemo, useState } from 'react'
import { Ban, ChevronDown, ChevronRight, CircleDashed, FilePlus2, FileCheck2, History, Inbox, ListPlus, RefreshCw, SearchX, TriangleAlert, X } from 'lucide-react'
import { actualizarBandejaAccion, revisarCambioPedidoAccion, simularCambioEnPedidosAccion } from '@/app/acciones-pedidos'
import { crearOrdenDePedidoAccion, crearOrdenesPendientesAccion } from '@/app/acciones-salida-manual'
import type { CambioSimulado } from '@/services/repositorio-cambio-pedido'
import { BotonCopiarAviso } from '../salidas/boton-copiar-aviso'
import {
  ETIQUETA_ESTADO_BANDEJA, FILTROS_BANDEJA_VACIOS, contarPorEstado, filtrarBandeja, hace,
  type EstadoBandeja, type FiltrosBandeja, type PedidoBandeja,
} from '@/domain/pedidos-despacho'
import { formatoFechaHora } from '@/domain/fechas'
import type { BandejaPedidos } from '@/services/repositorio-pedidos'
import { CHIP_AVISO, CHIP_NEUTRO, CHIP_OK, PILDORA_ACTIVA, PILDORA_INACTIVA_HOVER } from '../estilos-opcion'
import { useAccion } from '../usar-accion'
import { Aviso } from '../entradas/aviso'
import { Buscador } from '../inventario/mover/piezas'

const ESTADOS: EstadoBandeja[] = ['CAMBIO_POR_REVISAR', 'POR_PLANIFICAR', 'EN_SALIDA', 'CANCELADO_EN_PEDIDOS']
const ROJO = 'border-red-200 bg-red-50 text-red-800'
const base = 'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium leading-none whitespace-nowrap'

/** El estado siempre con texto + ícono (nunca solo color). */
function ChipBandeja({ estado }: { estado: EstadoBandeja }) {
  const m = {
    POR_PLANIFICAR: { cls: CHIP_NEUTRO, Icono: CircleDashed },
    EN_SALIDA: { cls: CHIP_OK, Icono: FileCheck2 },
    CAMBIO_POR_REVISAR: { cls: CHIP_AVISO, Icono: TriangleAlert },
    CANCELADO_EN_PEDIDOS: { cls: ROJO, Icono: Ban },
  }[estado]
  return <span className={`${base} ${m.cls}`} data-testid="chip-estado-pedido"><m.Icono className="h-3.5 w-3.5" aria-hidden />{ETIQUETA_ESTADO_BANDEJA[estado]}</span>
}

const fechaDia = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString('es-PE', { day: 'numeric', month: 'short', timeZone: 'UTC' })

const SIMULACIONES: { cambio: CambioSimulado; texto: string }[] = [
  { cambio: 'REDUCIR', texto: 'Reducir una línea' }, { cambio: 'QUITAR', texto: 'Quitar una línea' }, { cambio: 'AGREGAR', texto: 'Agregar una línea' },
  { cambio: 'CANCELAR', texto: 'Cancelar el pedido' }, { cambio: 'FACTURAR', texto: 'Registrar la factura' },
]

/** Controles de la fuente demo: «Pedidos» cambia el pedido para ver cómo la Orden de Salida se actualiza sola. Solo existen en la demostración. */
function SimularEnPedidos({ p }: { p: PedidoBandeja }) {
  const { pendiente, mensaje, ejecutar } = useAccion()
  // Un pedido cancelado ya no se puede cambiar, pero el resultado de lo que se acaba de hacer (la cancelación misma) sigue a la vista: al refrescarse los datos no desaparece de golpe.
  const cancelado = p.estado === 'CANCELADO_EN_PEDIDOS'
  if (cancelado && !mensaje) return null
  return (
    <div className="space-y-2 rounded-md border border-dashed border-gray-300 bg-gray-50 p-3" data-testid="simular-en-pedidos">
      <p className="text-sm font-medium text-gray-900">Probar como si fueras Pedidos <span className="font-normal text-gray-600">(solo en la demostración)</span></p>
      <div className="flex flex-wrap gap-2">
        {!cancelado && SIMULACIONES.map((x) => (
          <button key={x.cambio} type="button" className="btn-secondary btn-sm" disabled={pendiente} onClick={() => ejecutar(() => simularCambioEnPedidosAccion(p.pedidoId, x.cambio), { exito: `Pedidos cambió el pedido (${x.texto.toLowerCase()}). La orden de salida se actualizó sola.` })} data-testid={`simular-${x.cambio}`}>{x.texto}</button>
        ))}
      </div>
      {mensaje?.tipo === 'error' && <Aviso tipo="error" testid="simular-error">{mensaje.texto}</Aviso>}
      {mensaje?.tipo === 'ok' && <Aviso tipo="ok" testid="simular-ok">{mensaje.texto}</Aviso>}
    </div>
  )
}

function Detalle({ p, puedeRevisar, puedeCrear, creando, crear, demo }: { p: PedidoBandeja; puedeRevisar: boolean; puedeCrear: boolean; creando: boolean; crear: (p: PedidoBandeja) => void; demo: boolean }) {
  const { pendiente, mensaje, ejecutar } = useAccion()
  const sinCatalogo = p.lineas.filter((l) => !l.enCatalogo)
  const dato = (titulo: string, valor?: string) => valor ? <div><dt className="text-xs font-medium text-gray-600">{titulo}</dt><dd className="text-sm text-gray-900">{valor}</dd></div> : null
  return (
    <div className="space-y-4 px-4 py-4 md:px-6" data-testid="detalle-pedido">
      {p.estado === 'CANCELADO_EN_PEDIDOS' && (
        <Aviso tipo="error" testid="pedido-cancelado">
          <p className="font-medium">Pedidos canceló este pedido.</p>
          <p>Motivo: {p.motivoCancelacion ?? 'sin motivo'}{p.canceladoPor ? ` · lo canceló ${p.canceladoPor}` : ''}.{p.salida ? ` Su orden de salida ${p.salida} se canceló y liberó todo (si ya había picking, primero se devuelve lo picado).` : ''}</p>
        </Aviso>
      )}
      {p.avisoVendedor && (
        <Aviso tipo="atencion" testid="pedido-falta-stock">
          <p className="font-medium">Falta stock en este pedido: decide el vendedor{p.vendedor ? ` ${p.vendedor}` : ''}, en Pedidos.</p>
          <p className="mt-1">Quitar o reducir la línea (lo que falta se cancela) o cancelar el pedido.</p>
          <div className="mt-2"><BotonCopiarAviso texto={p.avisoVendedor} testid="copiar-aviso-bandeja" /></div>
        </Aviso>
      )}
      {p.estado === 'CAMBIO_POR_REVISAR' && (
        <Aviso tipo="atencion" testid="pedido-cambio">
          <p className="font-medium">Este pedido cambió en Pedidos (versión {p.version}).</p>
          {p.cambios.length > 0 && <ul className="mt-1 list-disc space-y-0.5 pl-5" data-testid="pedido-cambios">{p.cambios.map((c) => <li key={c}>{c}</li>)}</ul>}
          {p.salida && <p className="mt-1">Ya tiene la salida {p.salida}: revísala antes del picking.</p>}
          {puedeRevisar && (
            <button type="button" className="btn-secondary btn-sm mt-3" disabled={pendiente} onClick={() => ejecutar(() => revisarCambioPedidoAccion(p.pedidoId), { exito: 'Cambio revisado.' })} data-testid="pedido-revisar-cambio">
              {pendiente ? 'Guardando…' : 'Ya lo revisé'}
            </button>
          )}
        </Aviso>
      )}
      {mensaje?.tipo === 'error' && <Aviso tipo="error">{mensaje.texto}</Aviso>}
      {p.estado === 'POR_PLANIFICAR' && puedeCrear && (
        <div className="flex flex-wrap items-center gap-3" data-testid="crear-orden-bloque">
          <button type="button" className="btn-secondary" onClick={() => crear(p)} disabled={creando} data-testid="crear-orden-pedido"><FilePlus2 className="h-5 w-5" aria-hidden />{creando ? 'Creando la orden…' : 'Crear orden de salida'}</button>
          <p className="max-w-xl text-sm text-gray-700">Reserva el stock por vencimiento ahora, sin esperar a armar la ruta. Después, la ruta usa esta misma orden.</p>
        </div>
      )}
      {p.salida && p.salidaId && <p className="text-sm text-gray-800">Orden de salida: <Link href={`/salidas/${p.salidaId}`} className="tabular font-medium underline" data-testid="abrir-orden-pedido">{p.salida}</Link></p>}
      <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2 xl:grid-cols-4">
        {dato('Dirección de entrega', p.direccion)}
        {dato('Ventana de cita', p.ventanaCita)}
        {dato('Vehículo calificado', p.vehiculoCalificado)}
        {dato('Vendedor', p.vendedor)}
        {dato('Condición de pago', p.condicionPago)}
        {dato('Factura', p.factura)}
        {dato('Importado', formatoFechaHora(p.importadoEn))}
      </dl>
      {p.observaciones && <p className="text-sm text-gray-800"><span className="font-medium">Observaciones: </span>{p.observaciones}</p>}
      <div className="overflow-x-auto rounded-md border border-gray-200">
        <table className="w-full text-sm" data-testid="lineas-pedido">
          <caption className="sr-only">Líneas del pedido {p.numero}</caption>
          <thead className="border-b border-gray-200 bg-gray-50 text-left text-gray-700"><tr><th scope="col" className="px-3 py-2 font-medium">Producto</th><th scope="col" className="px-3 py-2 text-right font-medium">Cantidad</th></tr></thead>
          <tbody className="divide-y divide-gray-100">
            {p.lineas.map((l) => (
              <tr key={l.lineaId}>
                <td className="px-3 py-2"><span className="tabular font-medium text-gray-900">{l.productoCodigo}</span><span className="ml-2 text-gray-700">{l.descripcion}</span>
                  {!l.enCatalogo && <span className={`${base} ${CHIP_AVISO} ml-2`} data-testid="linea-sin-catalogo"><TriangleAlert className="h-3.5 w-3.5" aria-hidden />No está en el catálogo del WMS</span>}</td>
                <td className="tabular px-3 py-2 text-right font-medium text-gray-900">{l.cantidad.toLocaleString('es-PE')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {demo && <SimularEnPedidos p={p} />}
      {sinCatalogo.length > 0 && <p className="text-sm text-gray-700">Hay {sinCatalogo.length === 1 ? 'un producto' : `${sinCatalogo.length} productos`} que el WMS no conoce: no se podrá asignar stock hasta que Dirección Técnica lo dé de alta.</p>}
    </div>
  )
}

/** La bandeja de pedidos por despachar: tabla en PC y tablet, filas compactas en el teléfono; el detalle se abre en la misma fila. */
export function BandejaPedidosVista({ bandeja, puedeActualizar, puedeCrearOrdenes = false, demo = false }: { bandeja: BandejaPedidos; puedeActualizar: boolean; puedeCrearOrdenes?: boolean; demo?: boolean }) {
  const { pendiente, mensaje, ejecutar } = useAccion()
  const unica = useAccion()
  const todas = useAccion()
  const [creando, setCreando] = useState<string | null>(null)
  const [creada, setCreada] = useState<{ pedido: string; id: string; numero: string; faltaStock: boolean; yaExistia: boolean } | null>(null)
  const [lote, setLote] = useState<{ texto: string; errores: { pedido: string; motivo: string }[]; ok: boolean } | null>(null)
  const [f, setF] = useState<FiltrosBandeja>(FILTROS_BANDEJA_VACIOS)
  const [abierto, setAbierto] = useState<string | null>(null)
  const [resumen, setResumen] = useState<string | null>(null)
  const todos = bandeja.pedidos
  const visibles = useMemo(() => filtrarBandeja(todos, f), [todos, f])
  const cuenta = useMemo(() => contarPorEstado(todos), [todos])
  const { ultimoIntento, ultimaExitosa } = bandeja
  const fallo = ultimoIntento && !ultimoIntento.ok ? ultimoIntento : null

  const actualizar = () => ejecutar(() => actualizarBandejaAccion(), {
    alExito: (r) => {
      const x = r.resumen
      const partes = [
        x.nuevos ? `${x.nuevos} ${x.nuevos === 1 ? 'pedido nuevo' : 'pedidos nuevos'}` : '',
        x.nuevasVersiones ? `${x.nuevasVersiones} con versión nueva` : '',
        x.descartados.length ? `${x.descartados.length} ${x.descartados.length === 1 ? 'descartado' : 'descartados'} por venir mal (${x.descartados.map((d) => `${d.referencia ?? 'sin número'}: ${d.motivo.replace(/\.$/, '')}`).join('; ')})` : '',
      ].filter(Boolean)
      setResumen(partes.length ? `Bandeja actualizada: ${partes.join(', ')}.` : 'Bandeja al día: no hay nada nuevo en Pedidos.')
    },
  })

  const crearUna = (p: PedidoBandeja) => {
    setCreando(p.pedidoId); setCreada(null); setLote(null)
    unica.ejecutar(() => crearOrdenDePedidoAccion(p.pedidoId), { alExito: (r) => { setCreando(null); setCreada({ pedido: p.numero, id: r.id, numero: r.numero, faltaStock: r.faltaStock, yaExistia: r.yaExistia }) } })
  }
  const crearTodas = () => {
    setCreada(null); setLote(null)
    todas.ejecutar(() => crearOrdenesPendientesAccion(), {
      alExito: (r) => {
        const x = r.resumen
        const partes = [x.creadas ? `${x.creadas} ${x.creadas === 1 ? 'orden creada' : 'órdenes creadas'}` : '', x.unidas ? `${x.unidas} ${x.unidas === 1 ? 'pedido se unió' : 'pedidos se unieron'} a una orden manual que ya existía` : '',
          x.conFaltaStock ? `${x.conFaltaStock} con falta de stock (decide el vendedor del pedido)` : ''].filter(Boolean)
        setLote({ texto: partes.length ? `Listo: ${partes.join(', ')}.` : 'No había pedidos por planificar sin orden.', errores: x.errores, ok: x.errores.length === 0 })
      },
    })
  }
  const toggle = (id: string) => setAbierto((a) => (a === id ? null : id))
  const hayFiltros = !!f.q || !!f.estado

  return (
    <div className="space-y-4" data-testid="bandeja-pedidos">
      {/* Estado de la conexión con Pedidos y acción principal */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-gray-200 bg-white p-4">
        <div className="min-w-0 text-sm" data-testid="bandeja-ultima">
          {ultimaExitosa
            ? <p className="text-gray-800"><History className="mr-1.5 inline h-4 w-4 text-gray-500" aria-hidden />Última actualización <strong className="font-medium">{hace(ultimaExitosa.en)}</strong> · {ultimaExitosa.por} · desde {ultimaExitosa.origen}</p>
            : <p className="text-gray-700">Todavía no se ha actualizado desde Pedidos.</p>}
        </div>
        {puedeActualizar
          ? <button type="button" className="btn-primary" onClick={actualizar} disabled={pendiente} data-testid="actualizar-bandeja"><RefreshCw className={`h-5 w-5 ${pendiente ? 'animate-spin' : ''}`} aria-hidden />{pendiente ? 'Consultando Pedidos…' : 'Actualizar desde Pedidos'}</button>
          : <p className="text-sm text-gray-600">Solo el Jefe de Transporte y el Jefe de Almacén actualizan la bandeja.</p>}
      </div>

      <div className="rounded-lg border border-gray-200 bg-white p-4" data-testid="como-iniciar-salida">
        <h2 className="font-heading text-lg font-medium tracking-wide text-gray-900">Cómo se inicia una orden de salida</h2>
        <ol className="mt-2 grid gap-3 text-sm text-gray-800 md:grid-cols-3">
          <li><strong className="block text-gray-900">1. Desde aquí</strong>Con «Crear orden de salida» en un pedido, o con el botón de todos los pedidos por planificar. Reserva el stock por vencimiento.</li>
          <li><strong className="block text-gray-900">2. Al armar una ruta</strong>Cuando un pedido entra a una ruta y no tiene orden, la ruta la crea. Si ya la tiene, usa esa.</li>
          <li><strong className="block text-gray-900">3. A mano</strong>Para ventas que no llegaron por esta bandeja, salidas por cuenta de un cliente o sin venta. <Link href="/salidas/nueva" className="font-medium underline" data-testid="ir-nueva-salida">Nueva Orden de Salida</Link></li>
        </ol>
        <p className="mt-2 text-xs text-gray-600">Un pedido nunca tiene dos órdenes: si ya hay una manual con su número, el pedido se une a ella.</p>
        {puedeCrearOrdenes && cuenta.POR_PLANIFICAR > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-gray-100 pt-3">
            <button type="button" className="btn-primary" onClick={crearTodas} disabled={todas.pendiente || unica.pendiente} data-testid="crear-ordenes-todas"><ListPlus className="h-5 w-5" aria-hidden />{todas.pendiente ? 'Creando las órdenes…' : `Crear las órdenes de todos los pedidos por planificar (${cuenta.POR_PLANIFICAR})`}</button>
            <p className="text-sm text-gray-700">Lo que no se pueda crear (por ejemplo, un producto que el WMS no conoce) se te dice por qué.</p>
          </div>
        )}
      </div>
      {unica.mensaje?.tipo === 'error' && <Aviso tipo="error" testid="crear-orden-error"><p className="font-medium">No se pudo crear la orden.</p><p>{unica.mensaje.texto}</p></Aviso>}
      {todas.mensaje?.tipo === 'error' && <Aviso tipo="error" testid="crear-ordenes-error"><p className="font-medium">No se pudieron crear las órdenes.</p><p>{todas.mensaje.texto}</p></Aviso>}
      {creada && !unica.mensaje && (
        <Aviso tipo="ok" testid="crear-orden-ok">
          <p className="font-medium">{creada.yaExistia ? `El pedido ${creada.pedido} ya tenía su orden ${creada.numero}.` : `Listo: la orden ${creada.numero} del pedido ${creada.pedido} quedó creada con el stock asignado.`}</p>
          <p className="mt-1">{creada.faltaStock ? 'A alguna línea le falta stock: decide el vendedor del pedido con el cliente.' : 'Sigue: designar a quien hace el picking y generar la hoja (Jefe de Transporte).'} <Link href={`/salidas/${creada.id}`} className="font-medium underline">Abrir la orden</Link></p>
        </Aviso>
      )}
      {lote && !todas.mensaje && (
        <Aviso tipo={lote.ok ? 'ok' : 'atencion'} testid="crear-ordenes-resumen">
          <p className="font-medium">{lote.texto}</p>
          {lote.errores.length > 0 && <ul className="mt-1 list-disc space-y-0.5 pl-5" data-testid="crear-ordenes-errores">{lote.errores.map((e) => <li key={e.pedido}><strong>{e.pedido}:</strong> {e.motivo}</li>)}</ul>}
          <p className="mt-1"><Link href="/salidas" className="font-medium underline">Ver las salidas</Link></p>
        </Aviso>
      )}

      {mensaje?.tipo === 'error' && <Aviso tipo="error" testid="bandeja-error"><p className="font-medium">No se pudo actualizar.</p><p>{mensaje.texto}</p><p className="mt-1">La bandeja sigue con lo ya importado.</p></Aviso>}
      {!mensaje && fallo && <Aviso tipo="atencion" testid="bandeja-fallo-previo"><p>El último intento de actualizar ({hace(fallo.en)}) falló: {fallo.mensaje}</p><p className="mt-1">La bandeja sigue con lo ya importado.</p></Aviso>}
      {resumen && !mensaje && <Aviso tipo="ok" testid="bandeja-resumen">{resumen}</Aviso>}

      {todos.length === 0 ? (
        <div className="rounded-lg border border-gray-200 bg-white px-6 py-14 text-center" data-testid="bandeja-vacia">
          <Inbox className="mx-auto h-10 w-10 text-gray-400" aria-hidden />
          <p className="mt-3 font-medium text-gray-900">Todavía no hay pedidos importados</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-gray-600">Cuando Pedidos deje pedidos listos para operaciones, aparecerán aquí al actualizar.</p>
        </div>
      ) : (
        <>
          <div className="space-y-3 rounded-lg border border-gray-200 bg-white p-4">
            <Buscador id="q-ped" etiqueta="Buscar pedidos" ayuda="Por número, cliente, RUC, distrito o producto." valor={f.q} onCambio={(q) => setF((a) => ({ ...a, q }))} testid="ped-buscar" />
            <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filtrar por estado">
              {ESTADOS.map((e) => (
                <button key={e} type="button" aria-pressed={f.estado === e} onClick={() => setF((a) => ({ ...a, estado: a.estado === e ? '' : e }))}
                  className={`min-h-11 rounded-full border px-4 text-sm font-medium ${f.estado === e ? PILDORA_ACTIVA : PILDORA_INACTIVA_HOVER}`} data-testid={`ped-filtro-${e}`}>
                  {ETIQUETA_ESTADO_BANDEJA[e]} <span className="tabular">({cuenta[e]})</span>
                </button>
              ))}
              {hayFiltros && <button type="button" className="btn-secondary btn-sm" onClick={() => setF(FILTROS_BANDEJA_VACIOS)} data-testid="ped-limpiar"><X className="h-4 w-4" aria-hidden />Quitar filtros</button>}
            </div>
          </div>

          <p className="text-sm text-gray-700" aria-live="polite" data-testid="ped-conteo">{visibles.length === todos.length ? `${todos.length} ${todos.length === 1 ? 'pedido' : 'pedidos'}` : `${visibles.length} de ${todos.length} pedidos`}</p>

          {visibles.length === 0 ? (
            <div className="rounded-lg border border-gray-200 bg-white px-6 py-12 text-center" data-testid="ped-sin-resultados">
              <SearchX className="mx-auto h-9 w-9 text-gray-400" aria-hidden />
              <p className="mt-3 font-medium text-gray-900">Ningún pedido coincide</p>
              <p className="mt-1 text-sm text-gray-600">Prueba con otra palabra o quita los filtros.</p>
              <button type="button" className="btn-secondary mt-4" onClick={() => setF(FILTROS_BANDEJA_VACIOS)}>Quitar filtros</button>
            </div>
          ) : (
            <>
              {/* PC y tablet: tabla */}
              <div className="hidden overflow-x-auto rounded-lg border border-gray-200 bg-white md:block">
                <table className="w-full text-[13px] xl:text-sm" data-testid="tabla-pedidos">
                  <caption className="sr-only">Pedidos por despachar</caption>
                  <thead className="border-b border-gray-200 bg-gray-50 text-left text-gray-700">
                    <tr>
                      <th scope="col" className="w-10 px-2 py-2"><span className="sr-only">Detalle</span></th>
                      <th scope="col" className="px-2 py-2 font-medium">Pedido</th>
                      <th scope="col" className="px-2 py-2 font-medium">Cliente</th>
                      <th scope="col" className="px-2 py-2 font-medium">Entrega</th>
                      <th scope="col" className="px-2 py-2 text-right font-medium">Líneas y unidades</th>
                      <th scope="col" className="px-2 py-2 font-medium">Fecha</th>
                      <th scope="col" className="px-2 py-2 font-medium">Estado</th>
                      <th scope="col" className="px-2 py-2 font-medium">Orden de salida</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {visibles.map((p) => {
                      const on = abierto === p.pedidoId
                      return (
                        <Fragment key={p.pedidoId}>
                          <tr className={`cursor-pointer hover:bg-gray-50 ${on ? 'bg-gray-50' : ''}`} onClick={() => toggle(p.pedidoId)} data-testid="fila-pedido">
                            <td className="px-2 py-3">
                              <button type="button" aria-expanded={on} aria-controls={`det-${p.pedidoId}`} onClick={(e) => { e.stopPropagation(); toggle(p.pedidoId) }} className="inline-flex h-10 w-10 items-center justify-center rounded hover:bg-gray-100" aria-label={`${on ? 'Cerrar' : 'Abrir'} el detalle de ${p.numero}`} data-testid="abrir-pedido">
                                {on ? <ChevronDown className="h-5 w-5" aria-hidden /> : <ChevronRight className="h-5 w-5" aria-hidden />}
                              </button>
                            </td>
                            <td className="px-2 py-3"><span className="tabular whitespace-nowrap font-heading text-sm font-semibold tracking-wide text-gray-900">{p.numero}</span>{p.version > 1 && <span className={`${base} ${CHIP_NEUTRO} ml-2`} data-testid="chip-version">v{p.version}</span>}</td>
                            <td className="px-2 py-3"><span className="block font-medium text-gray-900">{p.cliente}</span>{p.ruc && <span className="tabular block text-xs text-gray-600">RUC {p.ruc}</span>}</td>
                            <td className="px-2 py-3 text-gray-800">{p.distrito ?? '—'}{p.ventanaCita && <span className="block text-xs text-gray-600">{p.ventanaCita}</span>}</td>
                            <td className="tabular px-2 py-3 text-right text-gray-800">{p.lineas.length} {p.lineas.length === 1 ? 'línea' : 'líneas'}<span className="hidden xl:inline"> · </span><span className="block font-medium text-gray-900 xl:inline">{p.unidades.toLocaleString('es-PE')} u</span></td>
                            <td className="tabular whitespace-nowrap px-2 py-3 text-gray-800">{fechaDia(p.fecha)}</td>
                            <td className="px-2 py-3"><ChipBandeja estado={p.estado} /></td>
                            <td className="px-2 py-3" onClick={(e) => e.stopPropagation()}>
                              {p.salida && p.salidaId ? <Link href={`/salidas/${p.salidaId}`} className="tabular text-xs font-medium text-green-800 underline" data-testid="orden-del-pedido">{p.salida}</Link>
                                : p.estado === 'POR_PLANIFICAR' && puedeCrearOrdenes ? <button type="button" className="btn-secondary btn-sm" onClick={() => crearUna(p)} disabled={unica.pendiente || todas.pendiente} data-testid="crear-orden-fila" aria-label={`Crear la orden de salida del pedido ${p.numero}`}>{creando === p.pedidoId && unica.pendiente ? 'Creando…' : 'Crear orden de salida'}</button>
                                : <span className="text-xs text-gray-500">—</span>}
                            </td>
                          </tr>
                          {on && <tr id={`det-${p.pedidoId}`}><td colSpan={8} className="bg-white p-0"><Detalle p={p} puedeRevisar={puedeActualizar} puedeCrear={puedeCrearOrdenes} creando={creando === p.pedidoId && unica.pendiente} crear={crearUna} demo={demo} /></td></tr>}
                        </Fragment>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              {/* Teléfono: una fila compacta por pedido; el detalle se abre debajo, sin desplazamiento horizontal */}
              <ul className="divide-y divide-gray-100 overflow-hidden rounded-lg border border-gray-200 bg-white md:hidden" data-testid="lista-pedidos-movil">
                {visibles.map((p) => {
                  const on = abierto === p.pedidoId
                  return (
                    <li key={p.pedidoId} data-testid="fila-pedido-movil">
                      <button type="button" onClick={() => toggle(p.pedidoId)} aria-expanded={on} className="block w-full space-y-1 px-4 py-3 text-left active:bg-gray-50" data-testid="abrir-pedido-movil">
                        <span className="flex items-center justify-between gap-2"><span className="tabular font-heading text-lg font-semibold tracking-wide text-gray-900">{p.numero}{p.version > 1 && <span className="ml-2 text-sm font-normal text-gray-600">v{p.version}</span>}</span><ChipBandeja estado={p.estado} /></span>
                        <span className="block font-medium text-gray-900">{p.cliente}</span>
                        <span className="tabular block text-sm text-gray-700">{p.lineas.length} {p.lineas.length === 1 ? 'línea' : 'líneas'} · {p.unidades.toLocaleString('es-PE')} u · {fechaDia(p.fecha)}{p.distrito ? ` · ${p.distrito}` : ''}</span>
                      </button>
                      {on && <div className="border-t border-gray-100 bg-gray-50/50"><Detalle p={p} puedeRevisar={puedeActualizar} puedeCrear={puedeCrearOrdenes} creando={creando === p.pedidoId && unica.pendiente} crear={crearUna} demo={demo} /></div>}
                    </li>
                  )
                })}
              </ul>
            </>
          )}
        </>
      )}
    </div>
  )
}
