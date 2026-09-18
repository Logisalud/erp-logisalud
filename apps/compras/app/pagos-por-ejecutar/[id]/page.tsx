import { notFound } from 'next/navigation'
import { Encabezado } from '@/components/nav'
import { obtenerPropuesta } from '@/services/propuestas'
import { puedeVerPagosPorEjecutar } from '@/services/pagos-por-ejecutar'
import { ETIQUETA_ESTADO_PROPUESTA } from '@/domain/propuesta'
import { TablaLote } from '@/app/cuentas-por-pagar/propuestas/[id]/tabla-lote'

export const dynamic = 'force-dynamic'

/**
 * Registrar los pagos de un lote aprobado. LA ÚNICA puerta al formulario de
 * pago.
 *
 * Antes el formulario vivía en la pantalla de la propuesta, a la que se
 * llegaba desde "Propuestas de pago" Y desde "Pagos por ejecutar" — dos
 * caminos al mismo lugar, sin que quedara claro cuál era el bueno (pedido de
 * Sebas, 2026-09-18). Ahora son dos pantallas y cada una hace una cosa: allá
 * se aprueba el lote, acá se desembolsa.
 *
 * Solo se entra con un lote APROBADO: pagar algo sin aprobar sería saltarse
 * la regla de oro del módulo, así que no alcanza con esconder el botón — la
 * pantalla entera se niega.
 */
export default async function RegistrarPagosDelLote({ params }: { params: { id: string } }) {
  // El gate resuelve el perfil por dentro — mismo criterio que la bandeja,
  // una sola definición de quién puede ver esto.
  if (!(await puedeVerPagosPorEjecutar())) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-8">
        <Encabezado titulo="Registrar pagos" atras={{ href: '/', texto: 'Módulos' }} />
        <p className="card text-sm text-gray-600">
          Esta pantalla es de Tesorería y Contabilidad.
        </p>
      </main>
    )
  }

  const propuesta = await obtenerPropuesta(params.id)
  if (!propuesta) notFound()

  const atras = { href: '/pagos-por-ejecutar', texto: 'Pagos por ejecutar' }

  if (propuesta.estado !== 'aprobada') {
    return (
      <main className="mx-auto max-w-2xl px-4 py-8">
        <Encabezado titulo={propuesta.codigo} atras={atras} />
        <p className="card border-amber-300 text-sm text-amber-900">
          Este lote está en <strong>{ETIQUETA_ESTADO_PROPUESTA[propuesta.estado]}</strong>, así que
          todavía no se puede pagar. El desembolso se registra recién cuando Contabilidad lo
          aprueba.
        </p>
      </main>
    )
  }

  return (
    <main className="mx-auto max-w-7xl px-4 py-8">
      <Encabezado titulo={propuesta.codigo} atras={atras} />

      <div className="card mb-4 flex items-center justify-between">
        <span className="text-sm text-gray-600">{propuesta.periodo}</span>
        <span className="text-sm font-medium">{ETIQUETA_ESTADO_PROPUESTA[propuesta.estado]}</span>
      </div>

      <TablaLote propuesta={propuesta} conPago />
    </main>
  )
}
