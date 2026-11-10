import type { Metadata } from 'next'
import { headers } from 'next/headers'
import { ConsultaSeguimiento } from '@/components/seguimiento/consulta-seguimiento'
import { MarcoPublico } from '@/components/seguimiento/marco-publico'
import { ipDe, TEXTO_NO_DISPONIBLE } from '@/domain/seguimiento'
import { repositorio } from '@/services/repositorio-actual'

export const metadata: Metadata = { title: 'Seguimiento de tu pedido — LOGISALUD', robots: { index: false, follow: false }, referrer: 'no-referrer' }
export const dynamic = 'force-dynamic'

/** Página PÚBLICA (sin usuario, fuera del layout de empleados): el cliente escribe su número de pedido y su RUC. En el piloto responde «Seguimiento aún no disponible». */
export default async function Seguimiento() {
  const h = headers()
  let disponible = false
  try { disponible = (await repositorio().consultarSeguimiento('', '', ipDe(h.get('x-forwarded-for'), h.get('x-real-ip')))).estado === 'LISTO' } catch { disponible = false }
  return (
    <MarcoPublico titulo="Seguimiento de tu pedido">
      {disponible
        ? <><p className="text-gray-700">Escribe el número de tu pedido y el RUC de tu empresa para ver en qué estado está.</p><ConsultaSeguimiento /></>
        : <p role="status" className="rounded-lg border border-gray-200 bg-white p-5 text-lg text-gray-800" data-testid="seguimiento-no-disponible">{TEXTO_NO_DISPONIBLE}</p>}
    </MarcoPublico>
  )
}
