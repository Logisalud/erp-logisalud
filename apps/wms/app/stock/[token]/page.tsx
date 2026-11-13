import type { Metadata } from 'next'
import { headers } from 'next/headers'
import { MarcoPublico } from '@/components/seguimiento/marco-publico'
import { StockCliente } from '@/components/stock-cliente/stock-cliente'
import { ipDe, textoEspera } from '@/domain/seguimiento'
import { TEXTO_ENLACE_INVALIDO_STOCK, TEXTO_ERROR_STOCK, TEXTO_NO_DISPONIBLE_STOCK } from '@/domain/stock-cliente'
import { repositorio } from '@/services/repositorio-actual'

export const metadata: Metadata = { title: 'Tu stock — LOGISALUD', robots: { index: false, follow: false }, referrer: 'no-referrer' }
export const dynamic = 'force-dynamic'

/** El enlace con token que Logisalud le da a un cliente de almacenamiento: su stock por producto y lote, lo que vence y su Kardex. Solo lectura, sin usuario. Un enlace inválido, vencido o revocado responde lo mismo. */
export default async function StockPorEnlace({ params }: { params: { token: string } }) {
  const h = headers()
  const token = decodeURIComponent(params.token).slice(0, 200)
  let r
  try { r = await repositorio().consultarStockCliente(token, ipDe(h.get('x-forwarded-for'), h.get('x-real-ip'))) } catch { r = { estado: 'ERROR' as const } }
  const prefijo = process.env.NEXT_PUBLIC_BASE_PATH ?? ''
  return (
    <MarcoPublico titulo="Tu stock en LOGISALUD" ancho>
      {r.estado === 'OK' ? <StockCliente token={token} prefijo={prefijo} datos={r} />
        : r.estado === 'NO_DISPONIBLE' ? <p role="status" className="rounded-lg border border-gray-200 bg-white p-5 text-lg text-gray-800" data-testid="stock-no-disponible">{TEXTO_NO_DISPONIBLE_STOCK}</p>
        : r.estado === 'ESPERA' ? <p role="alert" className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-amber-950" data-testid="stock-espera">{textoEspera(r.esperaSegundos)}</p>
        : r.estado === 'ERROR' ? <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-900" data-testid="stock-error">{TEXTO_ERROR_STOCK}</p>
        : <p role="alert" className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-amber-950" data-testid="stock-enlace-invalido">{TEXTO_ENLACE_INVALIDO_STOCK}</p>}
    </MarcoPublico>
  )
}
