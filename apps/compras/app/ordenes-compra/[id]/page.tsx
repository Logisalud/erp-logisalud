import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Encabezado } from '@/components/nav'
import { Money } from '@/components/money'
import { obtenerOC } from '@/services/ordenes-compra'
import { calcularTotales, ETIQUETA_ESTADO, puedeEditarse, puedeRecibirse } from '@/domain/orden-compra'

export const dynamic = 'force-dynamic'

export default async function DetalleOC({ params }: { params: { id: string } }) {
  const oc = await obtenerOC(params.id)
  if (!oc) notFound()

  const totales = calcularTotales(
    oc.items.map((i) => ({
      cantidadPedida: Number(i.cantidad_pedida),
      precioUnitario: Number(i.precio_unitario),
    }))
  )

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <Encabezado
        titulo={oc.codigo}
        atras={{ href: '/ordenes-compra', texto: 'Órdenes de compra' }}
      />

      <div className="mb-5 flex flex-wrap gap-2">
        <Link href={`/ordenes-compra/${oc.id}/imprimir`} className="btn-secondary">
          Imprimir / PDF
        </Link>
        {puedeRecibirse(oc.estado) ? (
          <Link href={`/almacen/recepciones/nueva/${oc.id}`} className="btn-primary">
            Registrar recepción
          </Link>
        ) : null}
        {puedeEditarse(oc.estado) ? (
          <span className="self-center text-sm text-gray-500">
            En {ETIQUETA_ESTADO[oc.estado].toLowerCase()}: todavía se puede editar.
          </span>
        ) : (
          <span className="self-center text-sm text-gray-500">
            {ETIQUETA_ESTADO[oc.estado]}: ya no se editan las líneas.
          </span>
        )}
      </div>

      <section className="card">
        <dl className="grid grid-cols-1 gap-x-4 gap-y-1.5 text-sm sm:grid-cols-2">
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
                    <span className="font-mono text-xs text-gray-500">
                      {i.producto?.codigo ?? '—'}
                    </span>
                    <br />
                    {i.producto?.descripcion ?? 'producto no legible'}
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
