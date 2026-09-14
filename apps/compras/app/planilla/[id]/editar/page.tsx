import { notFound, redirect } from 'next/navigation'
import { perfilActual } from '@logisalud/auth/server'
import { Encabezado } from '@/components/nav'
import { obtenerPagoPlanilla } from '@/services/planilla'
import { puedeCargarPlanilla, puedeCorregirse } from '@/domain/planilla'
import { FormularioPlanilla } from '../../formulario'
import { editarPagoPlanillaAction } from '../../actions'
import { BotonAnularPlanilla } from '../../acciones'

export const dynamic = 'force-dynamic'

/** Corregir un monto mal transcrito, antes de que genere obligación.
 * Después ya hay deuda formal y se anula desde Cuentas por Pagar. */
export default async function EditarPagoPlanilla({ params }: { params: { id: string } }) {
  if (!puedeCargarPlanilla(await perfilActual())) redirect('/planilla')

  const pago = await obtenerPagoPlanilla(params.id)
  if (!pago) notFound()
  if (!puedeCorregirse(pago.estado)) redirect('/planilla')

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <Encabezado
        titulo={`Corregir ${pago.codigo}`}
        atras={{ href: '/planilla', texto: 'Pago de Planilla' }}
      />

      <FormularioPlanilla
        inicial={{
          periodo: pago.periodo,
          secuencia: String(pago.secuencia),
          monto: String(pago.monto),
          moneda: pago.moneda,
          fechaPago: pago.fecha_pago,
        }}
        accionServidor={editarPagoPlanillaAction.bind(null, params.id)}
        textoBoton="Guardar cambios"
        textoEnviando="Guardando…"
      />

      <div className="mt-6">
        <BotonAnularPlanilla pagoId={params.id} />
      </div>
    </main>
  )
}
