import { Fragment } from 'react'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { perfilActual } from '@logisalud/auth/server'
import { Encabezado } from '@/components/nav'
import { Money } from '@/components/money'
import { obtenerPropuesta } from '@/services/propuestas'
import { ETIQUETA_ESTADO_PROPUESTA } from '@/domain/propuesta'
import { puedeAprobarPropuesta, puedeVerPropuestas, totalesDeLote } from '@/domain/propuesta-permisos'
import { AccionesPropuesta } from './acciones'
import { FormularioPago, type TipoCuentas } from './pago'
import { BadgeFaltaCuenta } from '@/components/badge-falta-cuenta'

export const dynamic = 'force-dynamic'

export default async function DetallePropuesta({ params }: { params: { id: string } }) {
  const perfil = await perfilActual()
  if (!puedeVerPropuestas(perfil)) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-8">
        <Encabezado titulo="Propuesta de pago" atras={{ href: '/cuentas-por-pagar', texto: 'Cuentas por Pagar' }} />
        <p className="card text-sm text-gray-600">
          Esta pantalla es de Contabilidad y Tesorería.
        </p>
      </main>
    )
  }

  const propuesta = await obtenerPropuesta(params.id)
  if (!propuesta) notFound()

  const aprobada = propuesta.estado === 'aprobada'
  // Tesorería ve el panel pero no decide: su momento es ejecutar el pago,
  // ya aprobado. Sin este gate el botón le aparecía a cualquiera (Pieza I).
  const puedeAprobar = puedeAprobarPropuesta(perfil)
  const totales = totalesDeLote(
    propuesta.detalle.map((d) => ({ moneda: d.moneda, montoAPagar: d.montoAPagar, yaPagada: d.yaPagada }))
  )

  return (
    <main className="mx-auto max-w-7xl px-4 py-8">
      <Encabezado titulo={propuesta.codigo} atras={{ href: '/cuentas-por-pagar/propuestas', texto: 'Propuestas' }} />

      <div className="card mb-4 flex items-center justify-between">
        <span className="text-sm text-gray-600">{propuesta.periodo}</span>
        <span className="text-sm font-medium">{ETIQUETA_ESTADO_PROPUESTA[propuesta.estado]}</span>
      </div>

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

      {/* No se gatea el componente entero: "Enviar a aprobación" es de
          Tesorería, que arma el lote. Lo que se gatea es aprobar/rechazar. */}
      <AccionesPropuesta propuestaId={propuesta.id} estado={propuesta.estado} puedeAprobar={puedeAprobar} />
      {!puedeAprobar && propuesta.estado === 'pendiente_aprobacion' ? (
        <p className="card mb-4 text-sm text-gray-600">
          Esperando la aprobación de Contabilidad. Cuando la aprueben, vas a poder registrar cada
          pago desde aquí.
        </p>
      ) : null}

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
              const puedePagar = aprobada && !d.yaPagada
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
    </main>
  )
}
