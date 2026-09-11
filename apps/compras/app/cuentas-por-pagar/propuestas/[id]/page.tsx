import { notFound } from 'next/navigation'
import { perfilActual } from '@logisalud/auth/server'
import { Encabezado } from '@/components/nav'
import { Money } from '@/components/money'
import { obtenerPropuesta } from '@/services/propuestas'
import { obtenerProveedor } from '@/services/proveedores'
import { listarCuentasBancariasDe } from '@/services/empleado-cuentas-bancarias'
import { ETIQUETA_ESTADO_PROPUESTA } from '@/domain/propuesta'
import { puedeAprobarPropuesta, puedeVerPropuestas, totalesDeLote } from '@/domain/propuesta-permisos'
import { AccionesPropuesta } from './acciones'
import { FormularioPago } from './pago'

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
    <main className="mx-auto max-w-2xl px-4 py-8">
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
          pago desde acá.
        </p>
      ) : null}

      <ul className="mt-4 space-y-2">
        {await Promise.all(
          propuesta.detalle.map(async (d) => {
            // Un reembolso/anticipo/reposición se paga a la cuenta bancaria
            // que el empleado cargó en "Mi cuenta bancaria" (Fase 1.3) — antes
            // esta pantalla no ofrecía "cuenta destino" para ese caso.
            const puedePagar = aprobada && !d.yaPagada
            const tipoCuentas: 'proveedor' | 'empleado' = d.proveedorId ? 'proveedor' : 'empleado'
            const cuentas = d.proveedorId
              ? (await obtenerProveedor(d.proveedorId))?.cuentas ?? []
              : d.beneficiarioPersonaId
                ? await listarCuentasBancariasDe(d.beneficiarioPersonaId)
                : []
            return (
              <li key={d.obligacionId} className="card">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="font-medium">{d.codigo}{d.numeroFactura ? ` · ${d.numeroFactura}` : ''}</span>
                  <Money valor={d.montoAPagar} moneda={d.moneda} />
                </div>
                <p className="mt-0.5 text-sm text-gray-600">{d.proveedor?.razon_social ?? d.beneficiario?.nombre ?? d.observaciones ?? 'sin proveedor ni beneficiario'}</p>
                {d.yaPagada ? (
                  <span className="mt-2 inline-block rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800">Pagada</span>
                ) : puedePagar ? (
                  <FormularioPago
                    propuestaId={propuesta.id}
                    obligacionId={d.obligacionId}
                    cuentas={cuentas}
                    tipoCuentas={tipoCuentas}
                  />
                ) : null}
              </li>
            )
          })
        )}
      </ul>
    </main>
  )
}
