import Link from 'next/link'
import { perfilActual } from '@logisalud/auth/server'
import { Encabezado } from '@/components/nav'
import { Money } from '@/components/money'
import { listarPagosPlanilla } from '@/services/planilla'
import {
  ETIQUETA_ESTADO_PLANILLA, etiquetaPeriodo, etiquetaSecuencia, puedeCargarPlanilla,
  puedeCorregirse, puedeDarConformidadPlanilla, puedeDarseConformidad, puedeVerPlanilla,
} from '@/domain/planilla'
import { ETIQUETA_ESTADO } from '@/domain/obligacion'
import type { EstadoObligacion } from '@/domain/obligacion'
import { BotonConformidadPlanilla } from './acciones'

export const dynamic = 'force-dynamic'

/**
 * Pago de Planilla — concepto propio, NO un tipo de impuesto.
 *
 * Arlette (Gestión Humana) transcribe el total que le da BUK; Contabilidad o
 * Tesorería dan conformidad y ahí nace la obligación, que sigue el embudo
 * normal de Cuentas por Pagar. Son dos o más pagos por mes, cada uno con su
 * propio total.
 */
export default async function Planilla() {
  const perfil = await perfilActual()
  if (!puedeVerPlanilla(perfil)) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-8">
        <Encabezado titulo="Pago de Planilla" atras={{ href: '/', texto: 'Compras y Pagos' }} />
        <p className="card text-sm text-gray-600">
          Esta pantalla es de Gestión Humana, Contabilidad y Tesorería.
        </p>
      </main>
    )
  }

  const puedeCargar = puedeCargarPlanilla(perfil)
  const puedeConformar = puedeDarConformidadPlanilla(perfil)
  const pagos = await listarPagosPlanilla()

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <Encabezado titulo="Pago de Planilla" atras={{ href: '/', texto: 'Compras y Pagos' }} />

      <p className="mb-4 text-sm text-gray-600">
        El total de cada pago de sueldos, tal como lo arroja BUK. Son dos o más por mes (quincena,
        fin de mes y los extra). Al dar conformidad se genera la obligación y sigue el circuito
        normal: propuesta de pago, aprobación y desembolso de Tesorería.
      </p>

      {puedeCargar ? (
        <div className="mb-5">
          <Link href="/planilla/nuevo" className="btn-primary w-full sm:w-auto">
            Cargar pago de planilla
          </Link>
        </div>
      ) : null}

      {pagos.length === 0 ? (
        <p className="card text-sm text-gray-600">Todavía no hay ningún pago de planilla cargado.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50 text-left text-gray-500">
                <th className="px-3 py-2 font-medium">Código</th>
                <th className="px-3 py-2 font-medium">Periodo</th>
                <th className="px-3 py-2 font-medium">Pago</th>
                <th className="px-3 py-2 text-right font-medium">Monto</th>
                <th className="px-3 py-2 font-medium">Fecha de pago</th>
                <th className="px-3 py-2 font-medium">Estado</th>
                <th className="px-3 py-2 font-medium">Cargó</th>
                <th className="px-3 py-2 font-medium">Acción</th>
              </tr>
            </thead>
            <tbody>
              {pagos.map((p) => (
                <tr key={p.id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
                  <td className="px-3 py-2 whitespace-nowrap font-medium">{p.codigo}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{etiquetaPeriodo(p.periodo)}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{etiquetaSecuencia(p.secuencia)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    <Money valor={p.monto} moneda={p.moneda} />
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">{p.fecha_pago}</td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    {/* Una vez que generó obligación, lo que importa es en
                        qué anda ESA — la carga ya cumplió su parte. */}
                    {p.obligacion_id && p.estadoObligacion ? (
                      <Link
                        href={`/cuentas-por-pagar/${p.obligacion_id}`}
                        className="text-logisalud-teal underline"
                      >
                        {ETIQUETA_ESTADO[p.estadoObligacion as EstadoObligacion] ?? p.estadoObligacion}
                      </Link>
                    ) : (
                      <span title={p.anulado_motivo ?? undefined}>
                        {ETIQUETA_ESTADO_PLANILLA[p.estado]}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap text-gray-600">{p.cargadoPor ?? '—'}</td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    <div className="flex flex-wrap gap-2">
                      {puedeConformar && puedeDarseConformidad(p.estado) ? (
                        <BotonConformidadPlanilla
                          pagoId={p.id}
                          resumen={`${etiquetaPeriodo(p.periodo)} · ${etiquetaSecuencia(p.secuencia)} · ${p.moneda} ${p.monto.toFixed(2)}`}
                        />
                      ) : null}
                      {puedeCargar && puedeCorregirse(p.estado) ? (
                        <Link
                          href={`/planilla/${p.id}/editar`}
                          className="text-logisalud-teal underline"
                        >
                          Corregir
                        </Link>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  )
}
