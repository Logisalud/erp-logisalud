import { Lock } from 'lucide-react'
import { exigirContexto } from '@/lib/contexto'
import { repositorio } from '@/services/repositorio-actual'
import { puedeActualizarBandeja, puedeVerBandeja, tocaTraerPedidos } from '@/domain/pedidos-despacho'
import { modoDemoActivo } from '@/lib/demo'
import { modoPilotoActivo } from '@/lib/modo-piloto'
import { BandejaPedidosVista } from '@/components/pedidos/bandeja-pedidos'
import { puedePrepararSalidas } from '@/domain/despacho'

export const metadata = { title: 'Pedidos por despachar — WMS LOGISALUD' }

export default async function Pedidos() {
  const ctx = await exigirContexto()
  if (!puedeVerBandeja(ctx.roles)) {
    return (
      <div className="mx-auto max-w-2xl rounded-lg border border-gray-200 bg-white px-6 py-12 text-center" data-testid="pedidos-sin-permiso">
        <Lock className="mx-auto h-9 w-9 text-gray-400" aria-hidden />
        <h1 className="mt-3 font-heading text-2xl font-semibold uppercase tracking-wide text-gray-900">Pedidos por despachar</h1>
        <p className="mt-2 text-gray-700">Esta bandeja es para quien planifica las salidas y las rutas. Si la necesitas, pídele acceso al administrador del WMS.</p>
      </div>
    )
  }
  let bandeja = await repositorio().bandejaPedidos()
  // 1e: con la conexión a Pedidos configurada, los pedidos del día se traen solos al abrir la bandeja (cada 15 min como máximo; lo hace quien puede actualizarla). Si Pedidos no responde, el intento queda anotado y la bandeja sigue con lo ya importado.
  if (!modoDemoActivo() && process.env.WMS_PEDIDOS_URL && process.env.WMS_PEDIDOS_SECRETO && puedeActualizarBandeja(ctx.roles) && tocaTraerPedidos(bandeja.ultimoIntento?.en, Date.now())) {
    const r = await repositorio().actualizarBandeja({ id: ctx.usuario.id, nombre: ctx.usuario.nombre, roles: ctx.roles }).catch(() => null)
    if (r?.ok) bandeja = await repositorio().bandejaPedidos()
  }
  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <header>
        <h1 className="font-heading text-3xl font-semibold uppercase tracking-wide text-gray-900">Pedidos por despachar</h1>
        <p className="mt-1 max-w-3xl text-gray-600">Los pedidos que Pedidos dejó listos para operaciones, tal como estaban al importarse. Si uno cambia después, llega como una versión nueva y te avisamos: nada se pisa en silencio.</p>
      </header>
      <BandejaPedidosVista bandeja={bandeja} puedeActualizar={puedeActualizarBandeja(ctx.roles)} puedeCrearOrdenes={puedePrepararSalidas(ctx.roles)} demo={modoDemoActivo()} piloto={await modoPilotoActivo()} />
    </div>
  )
}
