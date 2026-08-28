import { notFound } from 'next/navigation'
import { Encabezado } from '@/components/nav'
import { obtenerRecepcion } from '@/services/recepciones'
import { ETIQUETA_DISCREPANCIA } from '@/domain/recepcion'
import { ResolucionDiscrepancia } from './resolucion'

export const dynamic = 'force-dynamic'

const ETIQUETA_ESTADO_RECEPCION: Record<string, string> = {
  pendiente: 'Pendiente de resolver discrepancias',
  conforme: 'Conforme',
  con_discrepancia: 'Con discrepancia',
}

export default async function DetalleRecepcion({ params }: { params: { id: string } }) {
  const recepcion = await obtenerRecepcion(params.id)
  if (!recepcion) notFound()

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <Encabezado titulo={recepcion.oc?.codigo ?? 'Recepción'} atras={{ href: '/almacen', texto: 'Almacén' }} />

      <section className="card">
        <dl className="grid grid-cols-1 gap-x-4 gap-y-1.5 text-sm sm:grid-cols-2">
          <Dato termino="Proveedor" valor={recepcion.oc?.proveedor?.razon_social ?? null} />
          <Dato termino="Fecha de recepción" valor={recepcion.fecha_recepcion.slice(0, 10)} />
          <Dato termino="Guía de remisión" valor={recepcion.guia_remision} />
          <Dato termino="Estado" valor={ETIQUETA_ESTADO_RECEPCION[recepcion.estado]} />
        </dl>
      </section>

      <section className="card mt-4">
        <h2 className="font-heading text-lg">Líneas recibidas</h2>
        <ul className="mt-3 space-y-3">
          {recepcion.items.map((item) => (
            <li key={item.id} className="rounded-md border border-gray-200 p-3">
              <div className="flex items-baseline justify-between gap-3">
                <p className="font-medium">
                  <span className="font-mono text-xs text-gray-500">{item.producto?.codigo ?? '—'}</span>
                  {' '}{item.producto?.descripcion ?? 'producto no legible'}
                </p>
                {item.tipo_discrepancia !== 'ninguna' ? (
                  <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
                    {ETIQUETA_DISCREPANCIA[item.tipo_discrepancia]}
                  </span>
                ) : (
                  <span className="shrink-0 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800">
                    Sin discrepancia
                  </span>
                )}
              </div>

              <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-sm text-gray-600 sm:grid-cols-4">
                <Dato termino="Guía" valor={item.cantidad_guia != null ? String(item.cantidad_guia) : null} />
                <Dato termino="Física" valor={String(item.cantidad_fisica)} />
                <Dato termino="Aceptada" valor={String(item.cantidad_aceptada)} />
                <Dato termino="Rechazada" valor={String(item.cantidad_rechazada)} />
                <Dato termino="Lote" valor={item.lote} />
                <Dato termino="Vencimiento" valor={item.fecha_vencimiento} />
              </dl>

              {item.tipo_discrepancia !== 'ninguna' ? (
                item.resolucion ? (
                  <p className="mt-2 text-sm text-gray-600">
                    Resuelta: <span className="font-medium">{ETIQUETA_ACCION[item.resolucion.accion_tomada] ?? item.resolucion.accion_tomada}</span>
                    {item.resolucion.comentario ? ` — ${item.resolucion.comentario}` : ''}
                  </p>
                ) : (
                  <div className="mt-3 rounded-md bg-amber-50 p-3">
                    {item.accion_estandar ? (
                      <p className="mb-2 text-sm text-amber-900">
                        Acción sugerida: {item.accion_estandar}
                      </p>
                    ) : null}
                    <ResolucionDiscrepancia
                      recepcionId={recepcion.id}
                      recepcionItemId={item.id}
                      cantidadFisica={item.cantidad_fisica}
                      cantidadSugerida={item.cantidad_aceptada}
                    />
                  </div>
                )
              ) : null}
            </li>
          ))}
        </ul>
      </section>
    </main>
  )
}

const ETIQUETA_ACCION: Record<string, string> = {
  aceptado_segun_sugerencia: 'Aceptada según sugerencia',
  aceptado_con_ajuste: 'Aceptada con ajuste',
  rechazado: 'Rechazada',
  nota_credito_solicitada: 'Nota de crédito solicitada',
  reposicion_solicitada: 'Reposición solicitada',
}

function Dato({ termino, valor }: { termino: string; valor: string | null }) {
  return (
    <div className="flex gap-2">
      <dt className="text-gray-500">{termino}:</dt>
      <dd>{valor || '—'}</dd>
    </div>
  )
}
