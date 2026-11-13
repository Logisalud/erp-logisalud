import type { Metadata } from 'next'
import { headers } from 'next/headers'
import { PantallaSeguimiento } from '@/components/seguimiento/pantalla-seguimiento'
import { MarcoPublico } from '@/components/seguimiento/marco-publico'
import { ipDe, TEXTO_ENLACE_INVALIDO, TEXTO_ERROR, TEXTO_NO_DISPONIBLE, textoEspera } from '@/domain/seguimiento'
import { repositorio } from '@/services/repositorio-actual'

export const metadata: Metadata = { title: 'Seguimiento de tu pedido — LOGISALUD', robots: { index: false, follow: false }, referrer: 'no-referrer' }
export const dynamic = 'force-dynamic'

/** El enlace con token largo que copia el vendedor: muestra la línea de tiempo del pedido sin pedir datos. Un token inválido, vencido o revocado responde lo mismo. */
export default async function SeguimientoPorEnlace({ params }: { params: { token: string } }) {
  const h = headers()
  let r
  try { r = await repositorio().consultarSeguimientoPorToken(decodeURIComponent(params.token).slice(0, 200), ipDe(h.get('x-forwarded-for'), h.get('x-real-ip'))) } catch { r = { estado: 'ERROR' as const } }
  return (
    <MarcoPublico titulo="Seguimiento de tu pedido">
      {r.estado === 'OK' ? <PantallaSeguimiento inicial={r} origen={{ tipo: 'token', token: decodeURIComponent(params.token).slice(0, 200) }} />
        : r.estado === 'NO_DISPONIBLE' ? <p role="status" className="rounded-lg border border-gray-200 bg-white p-5 text-lg text-gray-800" data-testid="seguimiento-no-disponible">{TEXTO_NO_DISPONIBLE}</p>
        : r.estado === 'ESPERA' ? <p role="alert" className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-amber-950" data-testid="seguimiento-espera">{textoEspera(r.esperaSegundos)}</p>
        : r.estado === 'ERROR' ? <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-900" data-testid="seguimiento-error">{TEXTO_ERROR}</p>
        : <p role="alert" className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-amber-950" data-testid="seguimiento-enlace-invalido">{TEXTO_ENLACE_INVALIDO}</p>}
    </MarcoPublico>
  )
}
