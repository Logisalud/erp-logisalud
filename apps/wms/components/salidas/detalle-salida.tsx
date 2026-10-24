'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { ArrowLeft, ClipboardList, Pencil, TriangleAlert } from 'lucide-react'
import { generarOrdenPickingAccion } from '@/app/acciones-picking'
import { mesAnio } from '@/domain/salidas'
import { ETAPAS_CONFORMES, esSalidaConfirmada, type LineaSalidaVista, type SalidaVista } from '@/domain/despacho'
import type { PaqueteSalida } from '@/domain/documentacion'
import type { Rol } from '@/domain/tipos'
import { useAccion } from '../usar-accion'
import { useEsMovil } from '../usar-movil'
import { Aviso } from '../entradas/aviso'
import { HojaInferior } from '../hoja-inferior'
import { ChipEtapa } from './chip-etapa'
import { AvancePasos } from '../guia/avance-pasos'
import { avanceDeSalida } from '@/domain/pasos'
import { PanelDocumentacion } from './panel-documentacion'
import type { DatosGuia, EventoPedidos, ModoNubefact } from '@/domain/guia-electronica'
import { EditorLotes } from './editor-lotes'
import { EtiquetasOrigen } from './etiquetas-origen'
import { CancelarOrden } from './cancelar-orden'
import { ETIQUETA_CREADA_DESDE } from '@/domain/salida-manual'
import { ETIQUETA_MOTIVO_SALIDA } from '@/domain/salidas'
import { FaltaDeStock } from './falta-de-stock'
import { DevolverPicado } from './devolver-picado'
import { EntregaTransportista } from './entrega-transportista'
import { CorreoProveedor } from './correo-proveedor'
import type { EstadoCorrelativo } from '@/domain/numeracion-guias'

const Lotes = ({ l }: { l: LineaSalidaVista }) => l.asignacion.length === 0
  ? <span className="text-gray-500">Sin lotes</span>
  : <ul className="space-y-0.5">{l.asignacion.map((a) => <li key={a.loteId} className="tabular"><Link href={`/lotes/${a.loteId}`} className="underline underline-offset-2" data-testid="lote-enlace">{a.lote}</Link> <span className="text-gray-600">· vence {a.vence ? mesAnio(a.vence) : '—'}</span> × <strong>{a.cantidad.toLocaleString('es-PE')}</strong></li>)}</ul>

export function DetalleSalida({ salida, puedeEditar, puedePreparar, paquete, guia, roles, usuario = '' }: { salida: SalidaVista; usuario?: string; puedeEditar: boolean; puedePreparar: boolean; paquete: PaqueteSalida | null; guia: { datos: DatosGuia | null; modo: ModoNubefact; hoy: string; eventos: EventoPedidos[]; numeracion?: EstadoCorrelativo | null }; roles: readonly Rol[] }) {
  const router = useRouter()
  const movil = useEsMovil()
  const { pendiente, mensaje, ejecutar } = useAccion()
  const [editando, setEditando] = useState<string | null>(null)
  const lineas = salida.lineasDetalle
  const actual = lineas.find((l) => l.id === editando)
  const puedeGenerar = puedePreparar && salida.estado === 'ABIERTA' && !salida.ordenPickingId && lineas.some((l) => l.estado === 'ASIGNADA') && lineas.every((l) => l.estado === 'ASIGNADA' || l.estado === 'CANCELADA')
  const generar = () => ejecutar(() => generarOrdenPickingAccion(salida.id), { refrescar: false, alExito: (r) => router.push(`/picking/${r.id}`) })
  const cerrar = () => setEditando(null)
  const editor = (l: LineaSalidaVista) => <EditorLotes key={l.id} linea={l} cerrar={cerrar} />

  return (
    <div className="space-y-5" data-testid="detalle-salida">
      <div><Link href="/salidas" className="inline-flex items-center gap-1.5 text-sm text-gray-700 underline"><ArrowLeft className="h-4 w-4" aria-hidden />Todas las salidas</Link></div>
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1.5">
          <h1 className="tabular font-heading text-3xl font-semibold uppercase tracking-wide text-gray-900">{salida.numero}</h1>
          <p className="text-gray-700">Pedido {salida.pedidoNumero ?? '—'} · {salida.cliente ?? 'Sin cliente'}{salida.rutaNumero ? ` · Ruta ${salida.rutaNumero}` : ''}</p>
          <EtiquetasOrigen datos={salida} conTipo />
          <p className="text-sm text-gray-800" data-testid="factura-estado">
            Factura: {salida.facturaEstado === 'FACTURADA' ? <strong>facturada {salida.factura}</strong> : <strong>pendiente</strong>}
            <span className="text-gray-600"> · la emite Pedidos; aquí solo se mira</span>
          </p>
        </div>
        <ChipEtapa etapa={salida.etapa} />
      </header>

      <AvancePasos avance={avanceDeSalida(salida.etapa, salida.id, { sinEmbalaje: !salida.requiereEmbalaje, guiaEnEspera: paquete?.guia?.estadoSunat === 'PENDIENTE' && paquete.guia.origen !== 'PANEL', guiaPanel: guia.datos?.guiaModo === 'PANEL', faltaGuiaVigente: salida.faltaGuiaVigente, tipo: salida.tipo, destruccion: salida.motivo === 'DESTRUCCION', sinRuta: salida.tipo === 'CLIENTE' ? undefined : !salida.rutaNumero, porRuta: salida.origen === 'MANUAL' && salida.tipo !== 'CLIENTE', vendedor: salida.vendedor, sinPedido: salida.conPedido === false, devolucion: salida.devolucion, devolucionHref: salida.devoluciones?.find((d) => d.movimientoId)?.movimientoId ? `/movimientos/${salida.devoluciones.find((d) => d.movimientoId)!.movimientoId}` : undefined })} roles={roles} />

      {(salida.origen === 'MANUAL' || salida.creadaDesde === 'BANDEJA') && (
        <section className="rounded-lg border border-gray-200 bg-white p-4" aria-labelledby="h-origen" data-testid="origen-orden">
          <h2 id="h-origen" className="font-heading text-xl font-medium tracking-wide text-gray-900">De dónde viene esta orden</h2>
          <dl className="mt-2 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
            <div><dt className="text-gray-600">Cómo nació</dt><dd className="text-gray-900">{salida.creadaDesde ? ETIQUETA_CREADA_DESDE[salida.creadaDesde] : '—'}</dd></div>
            <div><dt className="text-gray-600">Creada por</dt><dd className="text-gray-900">{salida.creadaPor}{salida.enNombreDe ? ` en nombre de ${salida.enNombreDe}` : ''}</dd></div>
            {salida.motivo && <div><dt className="text-gray-600">Motivo</dt><dd className="text-gray-900">{ETIQUETA_MOTIVO_SALIDA[salida.motivo]}</dd></div>}
            {salida.clienteManual && <>
              <div><dt className="text-gray-600">{salida.tipo === 'PROVEEDOR' ? 'Proveedor' : salida.tipo === 'MUESTRA' ? 'Recibe la muestra' : 'Cliente (escrito a mano)'}</dt><dd className="text-gray-900">{salida.clienteManual.razonSocial} · {salida.clienteManual.tipoDocumento === 'DNI' ? 'DNI' : 'RUC'} <span className="tabular" data-testid="documento-destinatario">{salida.clienteManual.ruc}</span></dd></div>
              <div><dt className="text-gray-600">Entrega</dt><dd className="text-gray-900">{salida.clienteManual.direccion} · ubigeo <span className="tabular">{salida.clienteManual.ubigeo}</span></dd></div>
              {salida.clienteManual.vendedor && <div><dt className="text-gray-600">Vendedor del pedido</dt><dd className="text-gray-900">{salida.clienteManual.vendedor}</dd></div>}
            </>}
            {salida.greNumero && <div><dt className="text-gray-600">Guía del cliente (GRE)</dt><dd className="text-gray-900"><span className="tabular" data-testid="gre-del-cliente">{salida.greNumero}</span>{salida.greArchivo && <> · <Link href={`/salidas/${salida.id}/gre`} target="_blank" className="underline" data-testid="ver-gre-cliente">Ver el PDF</Link></>}</dd></div>}
          </dl>
          {salida.porConciliar && <div className="mt-3"><Aviso tipo="info" testid="aviso-por-conciliar">Esta orden está <strong>por conciliar con Pedidos</strong>: cuando Pedidos y el WMS estén conectados, se comprobará que el pedido existe y que el cliente coincide. Si el pedido llega por la bandeja, se une a esta orden sin crear otra.</Aviso></div>}
        </section>
      )}

      {lineas.some((l) => l.apartadaDeFefo) && <Aviso tipo="atencion" testid="aviso-fuera-fefo">Algún lote se apartó de la propuesta FEFO. Queda registrado con tu nombre; no necesitas explicar el motivo.</Aviso>}
      {salida.pedidoCancelado && <Aviso tipo="error" testid="pedido-cancelado-aviso"><p className="font-medium">Pedidos canceló este pedido.</p><p>Motivo: {salida.pedidoCancelado.motivo || 'sin motivo'}{salida.pedidoCancelado.por ? ` · lo canceló ${salida.pedidoCancelado.por}` : ''}.{salida.estado === 'CANCELADA' ? ' La orden se canceló y todo quedó libre.' : ''}</p></Aviso>}
      {lineas.some((l) => l.estado === 'SIN_STOCK') && <Aviso tipo="error">Hay líneas sin stock suficiente. Mientras falte, no se puede generar el picking: abajo dice por qué falta y quién decide.</Aviso>}
      {(salida.faltantes?.length ?? 0) > 0 && <FaltaDeStock faltantes={salida.faltantes!} vendedor={salida.vendedor} aviso={salida.avisoVendedor} pedidoNumero={salida.pedidoNumero} />}
      {(salida.devoluciones?.length ?? 0) > 0 && <DevolverPicado salidaId={salida.id} devoluciones={salida.devoluciones!} roles={roles} cancelacionPendiente={salida.cancelacionPendiente} motivo={salida.pedidoCancelado?.motivo ?? salida.motivoCancelacion} />}
      {salida.faltaGuiaVigente && <Aviso tipo="atencion" testid="falta-guia-vigente"><p className="font-medium">Guía anulada, falta guía vigente.</p><p>La orden ya salió y el stock no se tocó. Emite la guía nueva en «Documentación final». Si la mercadería vuelve al almacén, entra como una devolución.</p></Aviso>}
      {mensaje?.tipo === 'error' && <Aviso tipo="error">{mensaje.texto}</Aviso>}

      <section aria-labelledby="h-lineas">
        <h2 id="h-lineas" className="mb-2 font-heading text-xl font-medium tracking-wide text-gray-900">Productos y lotes</h2>
        <div className="hidden overflow-x-auto rounded-lg border border-gray-200 bg-white md:block">
          <table className="w-full text-[13px] xl:text-sm" data-testid="tabla-lineas-salida">
            <caption className="sr-only">Líneas de la salida con sus lotes</caption>
            <thead className="border-b border-gray-200 bg-gray-50 text-left text-gray-700"><tr>
              <th scope="col" className="px-3 py-2 font-medium">Producto</th><th scope="col" className="px-3 py-2 text-right font-medium">Pedido</th>
              <th scope="col" className="px-3 py-2 font-medium">Lotes asignados</th><th scope="col" className="px-3 py-2 font-medium">Estado</th><th scope="col" className="px-3 py-2"><span className="sr-only">Editar</span></th>
            </tr></thead>
            <tbody className="divide-y divide-gray-100">
              {lineas.map((l) => (
                <FilaTabla key={l.id} l={l} puedeEditar={puedeEditar} abierta={editando === l.id && !movil} abrir={() => setEditando(l.id)} editor={editor} />
              ))}
            </tbody>
          </table>
        </div>
        <ul className="space-y-2 md:hidden" data-testid="lineas-salida-movil">
          {lineas.map((l) => (
            <li key={l.id} className="rounded-xl border border-gray-200 bg-white" data-testid="linea-salida-movil">
              <button type="button" className="flex min-h-16 w-full items-center gap-3 px-3 py-3 text-left disabled:opacity-100" disabled={!puedeEditar || !l.editable} onClick={() => setEditando(l.id)} data-testid="abrir-linea">
                <span className="min-w-0 flex-1">
                  <strong className="block truncate text-[15px] text-gray-900">{l.producto}</strong>
                  <span className="mt-1 block text-sm text-gray-700"><Lotes l={l} /></span>
                  {l.apartadaDeFefo && <span className="mt-1 inline-flex items-center gap-1 text-xs text-amber-900"><TriangleAlert className="h-3.5 w-3.5" aria-hidden />Fuera de FEFO</span>}
                </span>
                <span className="tabular shrink-0 text-sm font-medium text-gray-900">{l.cantidad.toLocaleString('es-PE')} u</span>
                {puedeEditar && l.editable && <Pencil className="h-4 w-4 shrink-0 text-gray-500" aria-hidden />}
              </button>
            </li>
          ))}
        </ul>
        {movil && actual && <HojaInferior titulo={actual.producto} cerrar={cerrar} testid="hoja-lotes">{editor(actual)}</HojaInferior>}
      </section>

      <section className="flex flex-wrap items-center gap-3" aria-label="Siguiente paso">
        {puedeGenerar && <button type="button" className="btn-primary" onClick={generar} disabled={pendiente} data-testid="generar-picking"><ClipboardList className="h-5 w-5" aria-hidden />{pendiente ? 'Generando…' : 'Generar orden de picking'}</button>}
        {salida.ordenPickingId && <Link href={`/picking/${salida.ordenPickingId}`} className="btn-secondary" data-testid="ir-picking">Ver el picking ({salida.ordenNumero})</Link>}
        {salida.ordenPickingId && <Link href={`/conformidad/${salida.ordenPickingId}`} className="btn-secondary" data-testid="ir-conformidad">Ver la conformidad</Link>}
        {ETAPAS_CONFORMES.includes(salida.etapa) && <Link href={`/embalaje/${salida.id}`} className="btn-secondary" data-testid="ir-embalaje">Embalaje y bultos</Link>}
        {puedePreparar && salida.estado === 'ABIERTA' && !salida.ordenPickingId && (salida.origen === 'MANUAL' || salida.creadaDesde === 'BANDEJA') && <CancelarOrden salidaId={salida.id} numero={salida.numero} />}
      </section>

      {paquete && (paquete.conforme || paquete.guia || paquete.guiasAnuladas.length > 0) && <PanelDocumentacion salioYa={esSalidaConfirmada(salida.etapa)} paquete={paquete} roles={roles} datos={guia.datos} modo={guia.modo} hoy={guia.hoy} eventos={guia.eventos} numeracion={guia.numeracion} greCliente={salida.tipo === 'CLIENTE' ? { numero: salida.greNumero, salidaId: salida.id, conArchivo: !!salida.greArchivo } : undefined} />}

      {salida.tipo === 'PROVEEDOR' && <CorreoProveedor salida={salida} guiaNumero={paquete?.guia?.numero} />}

      <EntregaTransportista salida={salida} roles={roles} usuario={usuario} />

      {salida.cambios.length > 0 && (
        <section aria-labelledby="h-cambios" data-testid="cambios-salida">
          <h2 id="h-cambios" className="mb-2 font-heading text-xl font-medium tracking-wide text-gray-900">Cambios de lote</h2>
          <ul className="divide-y divide-gray-100 rounded-lg border border-gray-200 bg-white text-sm">
            {salida.cambios.map((c, i) => (
              <li key={i} className="px-4 py-3"><span className="text-gray-900">{c.por}</span> cambió <span className="tabular">{c.anterior}</span> → <span className="tabular">{c.nueva}</span>{c.distintoDeFefo && <span className="ml-2 text-amber-900">(fuera de FEFO)</span>}</li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}

function FilaTabla({ l, puedeEditar, abierta, abrir, editor }: { l: LineaSalidaVista; puedeEditar: boolean; abierta: boolean; abrir: () => void; editor: (l: LineaSalidaVista) => React.ReactNode }) {
  return (
    <>
      <tr data-testid="fila-linea-salida">
        <td className="px-3 py-3"><strong className="block text-gray-900">{l.producto}</strong><span className="tabular text-gray-600">{l.productoCodigo}</span></td>
        <td className="tabular px-3 py-3 text-right text-gray-900">{l.cantidad.toLocaleString('es-PE')} u</td>
        <td className="px-3 py-3 text-gray-800"><Lotes l={l} />{l.apartadaDeFefo && <span className="mt-1 inline-flex items-center gap-1 text-xs text-amber-900" data-testid="fuera-fefo"><TriangleAlert className="h-3.5 w-3.5" aria-hidden />Fuera de FEFO</span>}</td>
        <td className="px-3 py-3 text-gray-700">{l.estado === 'CANCELADA' ? 'Quitada por el pedido' : l.cantidadNueva === 0 ? 'Se quita: falta devolver lo picado' : l.estado === 'SIN_STOCK' ? 'Sin stock' : l.editable ? 'Lista para picking' : l.estado === 'ASIGNADA' ? 'Asignada' : 'En proceso'}</td>
        <td className="px-3 py-3 text-right">{puedeEditar && l.editable && !abierta && <button type="button" className="btn-secondary btn-sm" onClick={abrir} data-testid="editar-lotes"><Pencil className="h-4 w-4" aria-hidden />Cambiar lotes</button>}</td>
      </tr>
      {abierta && <tr className="bg-gray-50" data-testid="fila-editor"><td colSpan={5} className="px-4 py-4"><div className="max-w-3xl">{editor(l)}</div></td></tr>}
    </>
  )
}
