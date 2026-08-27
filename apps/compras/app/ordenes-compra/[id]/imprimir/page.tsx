import { notFound } from 'next/navigation'
import { obtenerOC } from '@/services/ordenes-compra'
import { obtenerProveedor } from '@/services/proveedores'
import { calcularTotales } from '@/domain/orden-compra'
import { BotonImprimir } from './boton-imprimir'

export const dynamic = 'force-dynamic'

/**
 * La OC lista para mandarle al proveedor.
 *
 * Se imprime desde el navegador ("Guardar como PDF") en vez de generar el PDF
 * en el servidor: es el mismo patrón que ya usa cobranzas en /v/[token], no
 * agrega una dependencia de render de PDF, y el resultado es un archivo que la
 * persona ve antes de mandar. El `@media print` de abajo esconde los botones.
 */
export default async function ImprimirOC({ params }: { params: { id: string } }) {
  const oc = await obtenerOC(params.id)
  if (!oc) notFound()

  const datosProveedor = await obtenerProveedor(oc.proveedor_id)
  const proveedor = datosProveedor?.proveedor
  const cuenta =
    datosProveedor?.cuentas.find((c) => c.id === oc.cuenta_bancaria_id) ??
    datosProveedor?.cuentas.find((c) => c.es_principal) ??
    null

  const totales = calcularTotales(
    oc.items.map((i) => ({
      cantidadPedida: Number(i.cantidad_pedida),
      precioUnitario: Number(i.precio_unitario),
    }))
  )
  const simbolo = oc.moneda === 'USD' ? '$' : 'S/'
  const importe = (n: number) =>
    `${simbolo} ${n.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

  return (
    <main className="mx-auto max-w-[820px] bg-white p-8 print:p-0">
      <div className="mb-6 flex gap-2 print:hidden">
        <BotonImprimir />
        <a href={`/ordenes-compra/${oc.id}`} className="btn-secondary">Volver</a>
      </div>

      <header className="flex items-start justify-between border-b-2 border-logisalud-green pb-4">
        <div>
          <p className="font-heading text-2xl tracking-wide text-logisalud-green">LOGISALUD</p>
          <p className="text-xs text-gray-600">Orden de compra</p>
        </div>
        <div className="text-right">
          <p className="font-heading text-xl">{oc.codigo}</p>
          <p className="text-xs text-gray-600">Emisión: {oc.fecha_emision}</p>
          {oc.fecha_entrega_estimada ? (
            <p className="text-xs text-gray-600">Entrega: {oc.fecha_entrega_estimada}</p>
          ) : null}
        </div>
      </header>

      <section className="mt-5 grid grid-cols-2 gap-6 text-sm">
        <div>
          <p className="text-xs font-semibold uppercase text-gray-500">Proveedor</p>
          <p className="mt-1 font-medium">{proveedor?.razon_social ?? '—'}</p>
          <p className="text-gray-700">RUC {proveedor?.ruc ?? '—'}</p>
          {proveedor?.contacto_nombre ? (
            <p className="text-gray-700">{proveedor.contacto_nombre}</p>
          ) : null}
          {proveedor?.contacto_email ? (
            <p className="text-gray-700">{proveedor.contacto_email}</p>
          ) : null}
        </div>
        <div>
          <p className="text-xs font-semibold uppercase text-gray-500">Condiciones</p>
          <p className="mt-1 text-gray-700">Moneda: {oc.moneda}</p>
          <p className="text-gray-700">
            Pago:{' '}
            {oc.condiciones_pago_dias != null
              ? oc.condiciones_pago_dias === 0
                ? 'contado'
                : `${oc.condiciones_pago_dias} días`
              : '—'}
          </p>
          {cuenta ? (
            <>
              <p className="mt-2 text-xs font-semibold uppercase text-gray-500">Abono</p>
              <p className="text-gray-700">
                {cuenta.banco} · {cuenta.moneda}
              </p>
              <p className="font-mono text-xs text-gray-700">CCI {cuenta.cci}</p>
            </>
          ) : null}
        </div>
      </section>

      <table className="mt-6 w-full text-sm">
        <thead>
          <tr className="border-y border-gray-300 text-left">
            <th className="py-1.5 pr-2 font-semibold">Código</th>
            <th className="py-1.5 pr-2 font-semibold">Descripción</th>
            <th className="py-1.5 pr-2 text-right font-semibold">Cant.</th>
            <th className="py-1.5 pr-2 text-right font-semibold">P. unit.</th>
            <th className="py-1.5 text-right font-semibold">Importe</th>
          </tr>
        </thead>
        <tbody>
          {oc.items.map((i) => (
            <tr key={i.id} className="border-b border-gray-200">
              <td className="py-1.5 pr-2 font-mono text-xs">{i.producto?.codigo ?? '—'}</td>
              <td className="py-1.5 pr-2">
                {i.producto?.descripcion ?? '—'}
                {i.producto?.unidad_medida ? (
                  <span className="text-gray-500"> ({i.producto.unidad_medida})</span>
                ) : null}
              </td>
              <td className="py-1.5 pr-2 text-right tabular-nums">{Number(i.cantidad_pedida)}</td>
              <td className="py-1.5 pr-2 text-right tabular-nums">
                {Number(i.precio_unitario).toFixed(4)}
              </td>
              <td className="py-1.5 text-right tabular-nums">
                {importe(Number(i.cantidad_pedida) * Number(i.precio_unitario))}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="mt-4 ml-auto w-56 text-sm">
        <div className="flex justify-between"><span className="text-gray-600">Subtotal</span><span className="tabular-nums">{importe(totales.subtotal)}</span></div>
        <div className="flex justify-between"><span className="text-gray-600">IGV 18%</span><span className="tabular-nums">{importe(totales.igv)}</span></div>
        <div className="mt-1 flex justify-between border-t border-gray-300 pt-1 font-semibold"><span>Total</span><span className="tabular-nums">{importe(totales.total)}</span></div>
      </div>

      {oc.notas ? (
        <section className="mt-6 text-sm">
          <p className="text-xs font-semibold uppercase text-gray-500">Notas</p>
          <p className="mt-1 whitespace-pre-line text-gray-700">{oc.notas}</p>
        </section>
      ) : null}

      <footer className="mt-10 border-t border-gray-200 pt-3 text-xs text-gray-500">
        Documento generado por el ERP de Logisalud. {oc.codigo}.
      </footer>
    </main>
  )
}
