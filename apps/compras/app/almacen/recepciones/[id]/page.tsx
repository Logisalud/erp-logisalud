import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Encabezado } from '@/components/nav'
import { obtenerRecepcion } from '@/services/recepciones'
import { obtenerSaldoPendienteOC } from '@/services/ordenes-compra'
import { VerVoucher } from '@/app/cuentas-por-pagar/[id]/ver-voucher'
import { verArchivoGuiaAction } from './actions'
import { BotonCerrarOCDesdeRecepcion } from './cerrar-oc'

export const dynamic = 'force-dynamic'

/**
 * Ficha de una recepción ya registrada.
 *
 * Desde el rediseño de tres columnas (2026-09-18) esta pantalla ya NO
 * resuelve discrepancias: no hay matriz que resolver. Lo que muestra es qué
 * quedó y qué falta — y la salida para cerrar la orden, que es el paso que
 * sigue cuando quedó saldo sin recibir.
 *
 * El cierre de la OC vive ACÁ y no antes de recibir: se decide cuando ya se
 * sabe qué llegó, no como una apuesta previa.
 */
const ETIQUETA_ESTADO_RECEPCION: Record<string, string> = {
  pendiente: 'Registrada',
  conforme: 'Todo conforme',
  con_discrepancia: 'Con diferencias respecto de la factura',
}

export default async function DetalleRecepcion({ params }: { params: { id: string } }) {
  const recepcion = await obtenerRecepcion(params.id)
  if (!recepcion) notFound()

  const saldo = await obtenerSaldoPendienteOC(recepcion.oc_id)

  return (
    <main className="mx-auto max-w-4xl px-4 py-8">
      <Encabezado
        titulo={`Recepción de ${recepcion.oc?.codigo ?? 'la orden'}`}
        atras={{ href: '/almacen', texto: 'Almacén' }}
      />

      <section className="card">
        <dl className="grid grid-cols-1 gap-x-4 gap-y-1.5 text-sm sm:grid-cols-2">
          <Dato termino="Proveedor" valor={recepcion.oc?.proveedor?.razon_social ?? null} />
          <Dato termino="Llegó el" valor={recepcion.fecha_recepcion} />
          {/* Cada guía con su archivo al lado: es la única forma de ver de
              un vistazo si el legajo está completo. Antes eran números
              separados por coma y un solo adjunto, así que faltar un papel
              no se notaba. */}
          <div className="flex gap-2 sm:col-span-2">
            <dt className="text-gray-500">
              {recepcion.guias.length === 1 ? 'Guía de remisión' : 'Guías de remisión'}:
            </dt>
            <dd className="flex flex-wrap gap-x-4 gap-y-1">
              {recepcion.guias.length === 0 ? (
                recepcion.guia_remision || '—'
              ) : (
                recepcion.guias.map((g) => (
                  <span key={g.id} className="flex items-center gap-1.5">
                    <span>{g.numero}</span>
                    <VerVoucher
                      storagePath={g.storage_path}
                      etiqueta="ver"
                      accion={verArchivoGuiaAction}
                    />
                  </span>
                ))
              )}
            </dd>
          </div>
          <Dato termino="Factura" valor={recepcion.numero_factura} />
          <Dato termino="Estado" valor={ETIQUETA_ESTADO_RECEPCION[recepcion.estado] ?? recepcion.estado} />
        </dl>
      </section>

      {/* Qué falta para cerrar la orden. El texto sale del dominio, así que
          dice lo mismo que decía la pantalla de recepción antes de guardar. */}
      {saldo ? (
        <section className="card mt-4 border-amber-300">
          <h2 className="font-heading text-base">La orden {recepcion.oc?.codigo}</h2>
          <p className="mt-1 text-sm text-gray-700">{saldo.mensaje}</p>
          {saldo.puedeCerrarse ? (
            <BotonCerrarOCDesdeRecepcion
              ocId={recepcion.oc_id}
              ocCodigo={recepcion.oc?.codigo ?? ''}
              detalle={saldo.detalle}
            />
          ) : null}
        </section>
      ) : null}

      <section className="mt-6">
        <h2 className="font-heading mb-2 text-lg">Lo que se recibió</h2>
        <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50 text-left text-gray-500">
                <th className="px-3 py-2 font-medium">Producto</th>
                <th className="px-3 py-2 text-right font-medium">Factura</th>
                <th className="px-3 py-2 text-right font-medium">Llegó</th>
                <th className="px-3 py-2 font-medium">Observaciones</th>
              </tr>
            </thead>
            <tbody>
              {recepcion.items.map((item) => {
                const factura = Number(item.cantidad_factura ?? 0)
                const fisica = Number(item.cantidad_fisica)
                const difiere = factura !== fisica
                return (
                  <tr key={item.id} className="border-b border-gray-100 last:border-0">
                    <td className="px-3 py-2">{item.producto?.descripcion ?? '—'}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{factura}</td>
                    <td className={`px-3 py-2 text-right tabular-nums ${difiere ? 'font-medium text-amber-800' : ''}`}>
                      {fisica}
                      {difiere ? (
                        <span className="block text-xs font-normal">
                          {fisica < factura
                            ? `faltan ${factura - fisica}`
                            : `${fisica - factura} sin facturar`}
                        </span>
                      ) : null}
                    </td>
                    <td className="px-3 py-2 text-gray-600">{item.observaciones ?? '—'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </section>

      {recepcion.obligacionId ? (
        <Link href={`/cuentas-por-pagar/${recepcion.obligacionId}`} className="btn-secondary mt-4 inline-block">
          Ver la obligación que se generó
        </Link>
      ) : (
        <p className="card mt-4 text-sm text-amber-900">
          La recepción se guardó pero la obligación no se pudo generar automáticamente.
          Avisá a Contabilidad para que la registre.
        </p>
      )}
    </main>
  )
}

function Dato({ termino, valor }: { termino: string; valor: string | null }) {
  return (
    <div className="flex gap-2">
      <dt className="text-gray-500">{termino}:</dt>
      <dd>{valor ?? '—'}</dd>
    </div>
  )
}
