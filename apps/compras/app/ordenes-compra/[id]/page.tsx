import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Encabezado } from '@/components/nav'
import { Money } from '@/components/money'
import { StepperOrden, TarjetaSiguientePaso } from '@/components/stepper-orden'
import { Historial } from '@/components/historial'
import { obtenerOC } from '@/services/ordenes-compra'
import { listarObligacionesPorOC } from '@/services/obligaciones'
import { listarRecepcionesPorOC } from '@/services/recepciones'
import { obtenerHistorialOC } from '@/services/historial-orden'
import { calcularTotales, ETIQUETA_ESTADO, puedeEditarse, puedeRecibirse, puedeCerrarseParcial } from '@/domain/orden-compra'
import { diasEnEstado, ocParcialSuperaUmbral } from '@/domain/dashboard'
import { ETIQUETA_ESTADO as ETIQUETA_ESTADO_OBLIGACION } from '@/domain/obligacion'
import { PASOS_OC, pasoAlcanzadoOC, siguientePasoOC } from '@/domain/ordenes-unificadas'
import { obtenerUmbralOCParcialDias } from '@/services/dashboard'
import { BotonMarcarEnviada, BotonMarcarConfirmada, BotonCerrarConSaldoPendiente } from './acciones-estado'

export const dynamic = 'force-dynamic'

const ETIQUETA_ESTADO_RECEPCION: Record<string, string> = {
  pendiente: 'Pendiente',
  conforme: 'Conforme',
  con_discrepancia: 'Con discrepancia',
}

export default async function DetalleOC({ params }: { params: { id: string } }) {
  const oc = await obtenerOC(params.id)
  if (!oc) notFound()

  const totales = calcularTotales(
    oc.items.map((i) => ({
      cantidadPedida: Number(i.cantidad_pedida),
      precioUnitario: Number(i.precio_unitario),
    }))
  )
  const [obligaciones, recepciones, historial, umbralDias] = await Promise.all([
    listarObligacionesPorOC(oc.id),
    listarRecepcionesPorOC(oc.id),
    obtenerHistorialOC(oc.id),
    obtenerUmbralOCParcialDias(),
  ])

  const diasParcial = oc.estado === 'parcialmente_recibida' ? diasEnEstado(oc.fecha_emision, new Date().toISOString().slice(0, 10)) : 0
  const superaUmbral = oc.estado === 'parcialmente_recibida' && ocParcialSuperaUmbral(diasParcial, umbralDias)

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <Encabezado
        titulo={oc.codigo}
        atras={{ href: '/ordenes-compra', texto: 'Órdenes de compra' }}
      />

      <div className="mb-4 overflow-x-auto">
        <StepperOrden pasos={PASOS_OC} pasoAlcanzado={pasoAlcanzadoOC(oc.estado)} />
      </div>

      <div className="mb-5 flex flex-wrap items-start gap-2">
        <Link href={`/ordenes-compra/${oc.id}/imprimir`} className="btn-secondary">
          Descargar PDF
        </Link>
        {oc.estado === 'borrador' ? <BotonMarcarEnviada ocId={oc.id} /> : null}
        {oc.estado === 'enviada' ? <BotonMarcarConfirmada ocId={oc.id} /> : null}
        {puedeRecibirse(oc.estado) ? (
          <Link href={`/almacen/recepciones/nueva/${oc.id}`} className="btn-primary">
            Registrar recepción
          </Link>
        ) : null}
        {puedeCerrarseParcial(oc.estado) ? <BotonCerrarConSaldoPendiente ocId={oc.id} /> : null}
        {puedeEditarse(oc.estado) ? (
          <>
            <Link href={`/ordenes-compra/${oc.id}/editar`} className="btn-secondary">
              Editar
            </Link>
            <span className="self-center text-sm text-gray-500">
              En {ETIQUETA_ESTADO[oc.estado].toLowerCase()}: todavía se puede editar.
            </span>
          </>
        ) : (
          <span className="self-center text-sm text-gray-500">
            {ETIQUETA_ESTADO[oc.estado]}: ya no se editan las líneas.
          </span>
        )}
      </div>

      {superaUmbral ? (
        <p className="card mb-4 border-amber-300 bg-amber-50 text-sm text-amber-900">
          Lleva {diasParcial} días recibida en parte (más del umbral de {umbralDias}) — contactá al
          proveedor por el saldo, o cerrala con saldo pendiente si ya no va a llegar.
        </p>
      ) : null}

      <TarjetaSiguientePaso texto={siguientePasoOC(oc.estado)} />

      <section className="card mt-4">
        <dl className="grid grid-cols-1 gap-x-4 gap-y-1.5 text-sm sm:grid-cols-2">
          <Dato termino="Tipo" valor={oc.tipo === 'bien' ? 'Bien (no revendible)' : 'Mercadería'} />
          <Dato termino="Estado" valor={ETIQUETA_ESTADO[oc.estado]} />
          <Dato termino="Emisión" valor={oc.fecha_emision} />
          <Dato termino="Entrega estimada" valor={oc.fecha_entrega_estimada} />
          <Dato termino="Moneda" valor={oc.moneda} />
          <Dato
            termino="Condición de pago"
            valor={oc.condiciones_pago_dias != null ? `${oc.condiciones_pago_dias} días` : null}
          />
        </dl>
        {oc.notas ? <p className="mt-3 text-sm text-gray-700">{oc.notas}</p> : null}
        {oc.cierre_tipo === 'saldo_no_entregado' ? (
          <p className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            Cerrada con saldo pendiente: {oc.cierre_motivo}
          </p>
        ) : null}
      </section>

      <section className="card mt-4">
        <h2 className="font-heading text-lg">Líneas</h2>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left text-gray-500">
                <th className="pb-2 pr-3 font-medium">Producto</th>
                <th className="pb-2 pr-3 text-right font-medium">Pedido</th>
                <th className="pb-2 pr-3 text-right font-medium">Recibido</th>
                <th className="pb-2 pr-3 text-right font-medium">Precio</th>
                <th className="pb-2 text-right font-medium">Subtotal</th>
              </tr>
            </thead>
            <tbody>
              {oc.items.map((i) => (
                <tr key={i.id} className="border-b border-gray-100 last:border-0">
                  <td className="py-2 pr-3">
                    {i.producto ? (
                      <>
                        <span className="font-mono text-xs text-gray-500">{i.producto.codigo}</span>
                        <br />
                        {i.producto.descripcion}
                      </>
                    ) : (
                      i.descripcion_libre ?? 'sin descripción'
                    )}
                  </td>
                  <td className="py-2 pr-3 text-right tabular-nums">
                    {Number(i.cantidad_pedida)} {i.producto?.unidad_medida ?? ''}
                  </td>
                  <td className="py-2 pr-3 text-right tabular-nums">
                    {Number(i.cantidad_recibida)}
                  </td>
                  <td className="py-2 pr-3 text-right tabular-nums">
                    {Number(i.precio_unitario).toFixed(4)}
                  </td>
                  <td className="py-2 text-right">
                    <Money
                      valor={Number(i.cantidad_pedida) * Number(i.precio_unitario)}
                      moneda={oc.moneda}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <dl className="mt-4 ml-auto max-w-xs space-y-1 text-sm">
          <Total termino="Subtotal" valor={totales.subtotal} moneda={oc.moneda} />
          <Total termino="IGV 18%" valor={totales.igv} moneda={oc.moneda} />
          <Total termino="Total" valor={totales.total} moneda={oc.moneda} destacado />
        </dl>
      </section>

      <section className="card mt-4">
        <h2 className="font-heading text-lg">Documentos relacionados</h2>
        <ul className="mt-2 space-y-1.5 text-sm">
          <li>
            Orden: <Link href={`/ordenes-compra/${oc.id}/imprimir`} className="text-logisalud-teal underline">Ver / descargar PDF</Link>
          </li>
          {recepciones.map((r) => (
            <li key={r.id}>
              Recepción {r.fecha_recepcion}: <Link href={`/almacen/recepciones/${r.id}`} className="text-logisalud-teal underline">
                Ver recepción
              </Link> — {ETIQUETA_ESTADO_RECEPCION[r.estado] ?? r.estado}
            </li>
          ))}
          {obligaciones.length > 0 ? (
            obligaciones.map((o) => (
              <li key={o.id}>
                Factura / obligación{o.numero_factura ? ` (${o.numero_factura})` : ''}:{' '}
                <Link href={`/cuentas-por-pagar/${o.id}`} className="text-logisalud-teal underline">
                  {o.codigo}
                </Link> — {ETIQUETA_ESTADO_OBLIGACION[o.estado]}
                {o.estado === 'pagada' || o.estado === 'cerrada' ? ' (abrí la obligación para ver el voucher)' : ''}
              </li>
            ))
          ) : (
            <li className="text-gray-500">Factura / obligación: todavía no se registró.</li>
          )}
        </ul>
      </section>

      <section className="card mt-4">
        <h2 className="font-heading text-lg">Historial</h2>
        <div className="mt-2">
          <Historial eventos={historial} />
        </div>
      </section>
    </main>
  )
}

function Dato({ termino, valor }: { termino: string; valor: string | null }) {
  return (
    <div className="flex gap-2">
      <dt className="text-gray-500">{termino}:</dt>
      <dd>{valor || '—'}</dd>
    </div>
  )
}

function Total({
  termino, valor, moneda, destacado,
}: { termino: string; valor: number; moneda: string; destacado?: boolean }) {
  return (
    <div className={`flex justify-between gap-4 ${destacado ? 'border-t border-gray-200 pt-1 font-semibold' : ''}`}>
      <dt className={destacado ? '' : 'text-gray-500'}>{termino}</dt>
      <dd><Money valor={valor} moneda={moneda} /></dd>
    </div>
  )
}
