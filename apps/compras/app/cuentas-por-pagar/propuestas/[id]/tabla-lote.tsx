import { Fragment } from 'react'
import Link from 'next/link'
import { Money } from '@/components/money'
import { totalesDeLote } from '@/domain/propuesta-permisos'
import { FormularioPago, type TipoCuentas } from './pago'
import { BadgeFaltaCuenta } from '@/components/badge-falta-cuenta'
import type { PropuestaDetalle } from '@/services/propuestas'

/**
 * El lote: sus totales y su detalle línea por línea. Lo comparten DOS
 * pantallas, y la diferencia entre ellas es una sola cosa:
 *
 * - `/cuentas-por-pagar/propuestas/[id]` — el lote para MIRAR y aprobar.
 *   `conPago = false`.
 * - `/pagos-por-ejecutar/[id]` — el lote para PAGAR, y la única puerta al
 *   formulario de pago. `conPago = true`.
 *
 * Están separadas porque tener el formulario en las dos confundía: se llegaba
 * al mismo lugar por dos caminos y no quedaba claro cuál era "el" camino
 * (pedido de Sebas, 2026-09-18). Ahora aprobar y pagar son dos pantallas, en
 * el orden en que pasan.
 */
export function TablaLote({
  propuesta, conPago,
}: {
  propuesta: PropuestaDetalle
  conPago: boolean
}) {
  const aprobada = propuesta.estado === 'aprobada'
  const totales = totalesDeLote(
    propuesta.detalle.map((d) => ({ moneda: d.moneda, montoAPagar: d.montoAPagar, yaPagada: d.yaPagada }))
  )

  return (
    <>
      {/* Barra de totales antes del detalle: el número que decide se mira
          ANTES de recorrer la lista, no al final. Agrupado por moneda —
          sumar PEN con USD daría un número falso. */}
      <section className="card mb-4">
        <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
          <div>
            <p className="text-xs font-semibold uppercase text-gray-500">Total del lote</p>
            <p className="font-heading mt-0.5 flex flex-wrap gap-x-4 text-xl">
              {totales.total.length === 0
                ? '—'
                : totales.total.map((t) => (
                    <span key={t.moneda} className="tabular-nums">
                      <Money valor={t.monto} moneda={t.moneda} />
                    </span>
                  ))}
            </p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase text-gray-500">Falta desembolsar</p>
            <p className="mt-0.5 flex flex-wrap gap-x-4 text-sm">
              {totales.pendiente.length === 0 ? (
                <span className="text-green-700">Todo pagado</span>
              ) : (
                totales.pendiente.map((t) => (
                  <span key={t.moneda} className="tabular-nums">
                    <Money valor={t.monto} moneda={t.moneda} />
                  </span>
                ))
              )}
            </p>
          </div>
        </div>
      </section>

      {/* Pieza 4 (Mariela, 2026-09-12): el desglose línea por línea que
          Milagritos necesita para ejecutar el lote — a quién le paga, a qué
          cuenta, cuánto y por qué concepto. En tabla y no en tarjetas
          porque acá se ESCANEA, igual que en Cuentas por Pagar; y con la
          cuenta a la vista para que "falta la cuenta bancaria" se descubra
          ANTES de intentar el pago, no adentro de un desplegable vacío. */}
      <div className="mt-4 overflow-x-auto rounded-lg border border-gray-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50 text-left text-gray-500">
              <th className="px-3 py-2 font-medium">Código</th>
              <th className="px-3 py-2 font-medium">Proveedor / Beneficiario</th>
              <th className="px-3 py-2 font-medium">Cuenta bancaria</th>
              <th className="px-3 py-2 font-medium">Concepto</th>
              <th className="px-3 py-2 text-right font-medium">Importe</th>
              <th className="px-3 py-2 font-medium">Estado</th>
            </tr>
          </thead>
          <tbody>
            {propuesta.detalle.map((d) => {
              const puedePagar = conPago && aprobada && !d.yaPagada
              const tipoCuentas: TipoCuentas = d.proveedorId
                ? 'proveedor'
                : d.proveedorServicioId
                  ? 'proveedor_servicio'
                  : 'empleado'
              const quien = d.proveedor?.razon_social ?? d.beneficiario?.nombre ?? d.observaciones ?? null
              return (
                <Fragment key={d.obligacionId}>
                  <tr className={puedePagar ? 'bg-gray-50/60' : 'border-b border-gray-100'}>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <Link
                        href={`/cuentas-por-pagar/${d.obligacionId}`}
                        className="font-medium text-logisalud-teal underline"
                      >
                        {d.codigo}
                      </Link>
                      {d.numeroFactura ? (
                        <span className="block text-xs text-gray-500">{d.numeroFactura}</span>
                      ) : null}
                    </td>
                    <td className="px-3 py-2 max-w-[220px] truncate">
                      {quien ?? <span className="text-gray-400">sin proveedor ni beneficiario</span>}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      {d.cuentaPreferida ? (
                        <>
                          <span className="tabular-nums">{d.cuentaPreferida.numero_cuenta}</span>
                          <span className="block text-xs text-gray-500">
                            {d.cuentaPreferida.banco} · {d.cuentaPreferida.moneda}
                            {d.cuentas.length > 1 ? ` · +${d.cuentas.length - 1}` : ''}
                          </span>
                        </>
                      ) : (
                        <BadgeFaltaCuenta />
                      )}
                    </td>
                    <td className="px-3 py-2 max-w-[240px]">
                      <span className="block truncate" title={d.concepto ?? undefined}>
                        {d.concepto ?? '—'}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      <Money valor={d.montoAPagar} moneda={d.moneda} />
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      {d.yaPagada ? (
                        <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800">
                          Pagada
                        </span>
                      ) : aprobada ? (
                        <span className="text-xs text-gray-500">por pagar</span>
                      ) : (
                        <span className="text-xs text-gray-400">esperando aprobación</span>
                      )}
                    </td>
                  </tr>
                  {/* El formulario va pegado a SU fila y con un borde de
                      color a la izquierda: desplegado a ancho completo y sin
                      esa marca, no se distinguía si pertenecía a la fila de
                      arriba o a la de abajo. */}
                  {puedePagar ? (
                    <tr className="border-b-4 border-white bg-gray-50/60">
                      <td colSpan={6} className="px-3 pb-4">
                        <div className="border-l-4 border-logisalud-teal pl-3">
                          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
                            Registrar pago de {d.codigo} · {quien ?? 'sin proveedor'} ·{' '}
                            <Money valor={d.montoAPagar} moneda={d.moneda} />
                          </p>
                          <FormularioPago
                            propuestaId={propuesta.id}
                            obligacionId={d.obligacionId}
                            cuentas={d.cuentas}
                            tipoCuentas={tipoCuentas}
                          />
                        </div>
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              )
            })}
          </tbody>
        </table>
      </div>
    </>
  )
}
