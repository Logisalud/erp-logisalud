import { notFound } from 'next/navigation'
import { Encabezado } from '@/components/nav'
import { Money } from '@/components/money'
import Link from 'next/link'
import { obtenerObligacion } from '@/services/obligaciones'
import { listarLetrasDeObligacion } from '@/services/financiamiento'
import { ETIQUETA_ESTADO } from '@/domain/obligacion'
import { ETIQUETA_ESTADO_VENCIMIENTO } from '@/domain/financiamiento'
import { BotonConformidad } from './conformidad'
import { NotasCredito } from './notas-credito'

export const dynamic = 'force-dynamic'

export default async function DetalleObligacion({ params }: { params: { id: string } }) {
  const obligacion = await obtenerObligacion(params.id)
  if (!obligacion) notFound()

  const puedeDarConformidad = obligacion.estado === 'registrada' || obligacion.estado === 'observada'
  const puedeCanjearPorLetras =
    obligacion.origen === 'compra' &&
    !!obligacion.proveedor &&
    !['pagada', 'canjeada_por_letra', 'en_propuesta'].includes(obligacion.estado)
  const letras = obligacion.estado === 'canjeada_por_letra' ? await listarLetrasDeObligacion(obligacion.id) : []

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <Encabezado titulo={obligacion.codigo} atras={{ href: '/cuentas-por-pagar', texto: 'Cuentas por Pagar' }} />

      <section className="card">
        <dl className="grid grid-cols-1 gap-x-4 gap-y-1.5 text-sm sm:grid-cols-2">
          <Dato
            termino={obligacion.proveedor ? 'Proveedor' : 'Beneficiario'}
            valor={obligacion.proveedor?.razon_social ?? obligacion.beneficiario?.nombre ?? null}
          />
          <Dato termino="Estado" valor={ETIQUETA_ESTADO[obligacion.estado]} />
          <Dato termino="N° factura" valor={obligacion.numero_factura} />
          <Dato termino="Fecha de factura" valor={obligacion.fecha_factura} />
          <Dato termino="Vencimiento del pago" valor={obligacion.fecha_vencimiento_real} />
          <Dato termino="Origen" valor={obligacion.origen} />
        </dl>
        {obligacion.observaciones ? (
          <p className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-900">
            {obligacion.observaciones}
          </p>
        ) : null}
        {obligacion.oc ? (
          <p className="mt-2 text-sm text-gray-600">
            Orden de compra: <a href={`/ordenes-compra/${obligacion.oc.id}`} className="text-logisalud-teal underline">{obligacion.oc.codigo}</a>
          </p>
        ) : null}
        {obligacion.recepcion ? (
          <p className="mt-1 text-sm text-gray-600">
            Documentos de la recepción:{' '}
            {obligacion.recepcion.storage_path_guia_recibida ? 'guía ✓' : 'guía —'}
            {' · '}
            {obligacion.recepcion.storage_path_factura_proveedor ? 'factura ✓' : 'factura —'}
          </p>
        ) : null}

        {puedeDarConformidad ? <BotonConformidad obligacionId={obligacion.id} /> : null}
        {puedeCanjearPorLetras ? (
          <Link href={`/financiamiento/letras/canjear/${obligacion.id}`} className="btn-secondary mt-4 inline-block">
            Canjear por letras
          </Link>
        ) : null}
      </section>

      {letras.length > 0 ? (
        <section className="card mt-4">
          <h2 className="font-heading text-lg">Letras por pagar</h2>
          <ul className="mt-2 space-y-1 text-sm">
            {letras.map((l) => (
              <li key={l.id} className="flex items-center justify-between border-b border-gray-100 py-1.5 last:border-0">
                <span>{l.numero_letra ?? 'sin número'} · vence {l.fecha_vencimiento} · {ETIQUETA_ESTADO_VENCIMIENTO[l.estado] ?? l.estado}</span>
                <Money valor={l.monto} moneda={l.moneda} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="card mt-4">
        <h2 className="font-heading text-lg">Líneas facturadas</h2>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left text-gray-500">
                <th className="pb-2 pr-3 font-medium">Producto</th>
                <th className="pb-2 pr-3 text-right font-medium">Cant. facturada</th>
                <th className="pb-2 pr-3 text-right font-medium">Precio</th>
                <th className="pb-2 text-right font-medium">Subtotal</th>
              </tr>
            </thead>
            <tbody>
              {obligacion.items.map((i) => (
                <tr key={i.id} className="border-b border-gray-100 last:border-0">
                  <td className="py-2 pr-3">
                    <span className="font-mono text-xs text-gray-500">{i.producto?.codigo ?? '—'}</span>
                    <br />
                    {i.producto?.descripcion ?? 'producto no legible'}
                  </td>
                  <td className="py-2 pr-3 text-right tabular-nums">{i.cantidad_facturada}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{i.precio_facturado.toFixed(4)}</td>
                  <td className="py-2 text-right"><Money valor={i.cantidad_facturada * i.precio_facturado} moneda={obligacion.moneda} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <dl className="mt-4 ml-auto max-w-xs space-y-1 text-sm">
          <Total termino="Base imponible" valor={obligacion.base_imponible} moneda={obligacion.moneda} />
          <Total termino="IGV" valor={obligacion.igv} moneda={obligacion.moneda} />
          <Total termino="Detracción" valor={-obligacion.monto_detraccion} moneda={obligacion.moneda} />
          <Total termino="Neto a pagar" valor={obligacion.neto_a_pagar} moneda={obligacion.moneda} destacado />
        </dl>
      </section>

      <section className="card mt-4">
        <h2 className="font-heading text-lg">Notas de crédito</h2>
        <NotasCredito
          obligacionId={obligacion.id}
          moneda={obligacion.moneda}
          notasCredito={obligacion.notasCredito}
        />
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
