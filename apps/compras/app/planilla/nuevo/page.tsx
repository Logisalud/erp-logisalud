import { redirect } from 'next/navigation'
import { perfilActual } from '@logisalud/auth/server'
import { Encabezado } from '@/components/nav'
import { puedeCargarPlanilla } from '@/domain/planilla'
import { FormularioPlanilla } from '../formulario'

export const dynamic = 'force-dynamic'

export default async function NuevoPagoPlanilla() {
  // También está en el servicio y en la policy RLS: acá es solo para no
  // mostrar un formulario que no va a poder guardar.
  if (!puedeCargarPlanilla(await perfilActual())) redirect('/planilla')

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <Encabezado
        titulo="Cargar pago de planilla"
        atras={{ href: '/planilla', texto: 'Pago de Planilla' }}
      />
      <p className="card mb-4 text-sm text-gray-600">
        Transcribe el total que arroja BUK para este pago. No hace falta desglose por trabajador:
        lo que el circuito necesita es el monto total y cuándo se transfiere.
      </p>
      <FormularioPlanilla />
    </main>
  )
}
