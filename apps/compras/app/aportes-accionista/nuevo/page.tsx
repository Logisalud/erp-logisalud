import { redirect } from 'next/navigation'
import { perfilActual } from '@logisalud/auth/server'
import { Encabezado } from '@/components/nav'
import { listarCategoriasGasto } from '@/services/solicitudes-gasto'
import { puedeRegistrarAporte } from '@/services/aportes-accionista'
import { FormularioAportes } from '../formulario'

export const dynamic = 'force-dynamic'

export default async function NuevoAporte() {
  // El gate también está en la Server Action y en la policy RLS: acá es solo
  // para no mostrar un formulario que no va a poder guardar.
  if (!puedeRegistrarAporte(await perfilActual())) redirect('/aportes-accionista')
  const categorias = await listarCategoriasGasto()

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <Encabezado
        titulo="Registrar aporte de accionista"
        atras={{ href: '/aportes-accionista', texto: 'Aportes de accionista' }}
      />
      <p className="card mb-4 text-sm text-gray-600">
        Gastos del negocio que pagaste de tu bolsillo y <strong>no vas a reclamar</strong>. Puedes
        cargar varios de una vez — cada uno con sus propios datos.
        Esto no genera ninguna deuda de la empresa ni entra a ninguna propuesta de pago: queda
        registrado para que Contabilidad lo asiente como aporte de capital. Si en realidad quieres
        que te devuelvan el dinero, lo que corresponde es un reembolso en &ldquo;Pedir un
        pago&rdquo;.
      </p>
      <FormularioAportes categorias={categorias} />
    </main>
  )
}
