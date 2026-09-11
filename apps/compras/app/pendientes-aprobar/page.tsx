import Link from 'next/link'
import { Encabezado } from '@/components/nav'
import { Money } from '@/components/money'
import { listarPendientesDeAprobar } from '@/services/pendientes-aprobar'
import { etiquetaEspera, ETIQUETA_TIPO_PENDIENTE } from '@/domain/pendientes-aprobar'

export const dynamic = 'force-dynamic'

/**
 * La contraparte de "Mis operaciones": lo que espera una decisión MÍA, de
 * las cuatro fuentes con gate de aprobación real (Pago Directo, Anticipo/
 * Reembolso, Reposición de Caja Chica y Orden de Servicio).
 *
 * Solo listado y priorización — los botones de aprobar/rechazar siguen
 * viviendo en el detalle de cada registro, que es donde están las reglas y
 * el motivo obligatorio. Acá no se decide nada, se decide POR DÓNDE EMPEZAR:
 * lo más viejo arriba.
 *
 * Propuestas de pago no entran: son de Gerencia y ya tienen su pantalla.
 */
export default async function PendientesDeAprobar() {
  const filas = await listarPendientesDeAprobar()

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <Encabezado titulo="Pendientes de aprobar" atras={{ href: '/', texto: 'Compras y Pagos' }} />

      {filas.length === 0 ? (
        <p className="card text-sm text-gray-600">
          No tienes nada esperando tu aprobación. Cuando alguien cargue algo que dependa de ti, va a
          aparecer aquí con cuánto tiempo lleva esperando.
        </p>
      ) : (
        <>
          <p className="mb-3 text-sm text-gray-600">
            {filas.length === 1 ? '1 registro espera' : `${filas.length} registros esperan`} tu
            decisión. Lo que más tiempo lleva esperando va primero.
          </p>
          <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50 text-left text-gray-500">
                  <th className="px-3 py-2 font-medium">Tipo</th>
                  <th className="px-3 py-2 font-medium">Código</th>
                  <th className="px-3 py-2 font-medium">Quién lo creó</th>
                  <th className="px-3 py-2 font-medium">Fecha</th>
                  <th className="px-3 py-2 text-right font-medium">Monto</th>
                  <th className="px-3 py-2 font-medium">Esperando hace</th>
                  <th className="px-3 py-2 font-medium">Lo necesita para</th>
                  <th className="px-3 py-2 font-medium">Decide</th>
                  <th className="px-3 py-2 font-medium">Acción</th>
                </tr>
              </thead>
              <tbody>
                {filas.map((f) => (
                  <tr key={`${f.tipo}-${f.id}`} className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
                    <td className="px-3 py-2 whitespace-nowrap">{ETIQUETA_TIPO_PENDIENTE[f.tipo]}</td>
                    <td className="px-3 py-2">
                      <Link href={f.href} className="font-medium text-logisalud-teal underline">
                        {f.codigo}
                      </Link>
                    </td>
                    <td className="px-3 py-2 max-w-[200px] truncate">{f.quienLoCreo ?? '—'}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{f.esperandoDesde.slice(0, 10)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      <Money valor={f.monto} moneda={f.moneda} />
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <Espera dias={f.diasEsperando} />
                    </td>
                    {/* Solo Anticipo y Reembolso capturan esta fecha. */}
                    <td className="px-3 py-2 whitespace-nowrap text-gray-600">
                      {f.fechaRequerida ?? '—'}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap text-gray-600">{f.quienDecide}</td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <Link href={f.href} className="text-logisalud-teal underline">
                        Revisar y decidir
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </main>
  )
}

/**
 * El color no es la única señal (el texto ya dice los días) — solo hace que
 * lo viejo salte a la vista al recorrer la columna.
 */
function Espera({ dias }: { dias: number }) {
  const clase = dias >= 7 ? 'text-red-700 font-medium' : dias >= 3 ? 'text-amber-700' : 'text-gray-600'
  return <span className={clase}>{etiquetaEspera(dias)}</span>
}
