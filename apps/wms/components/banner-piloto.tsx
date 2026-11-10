import { TriangleAlert } from 'lucide-react'
import { DETALLE_BANNER_PILOTO, TEXTO_BANNER_PILOTO } from '@/domain/modo-piloto'

/** Aviso fijo en TODA pantalla mientras `modo_piloto` esté encendido (alto 2.25rem; va debajo del banner DEMO si lo hay). Ícono + texto, nunca solo color. */
export function BannerPiloto({ bajoDemo = false }: { bajoDemo?: boolean }) {
  return (
    <div
      role="status"
      data-testid="banner-piloto"
      className={`sticky ${bajoDemo ? 'top-9' : 'top-0'} z-[69] flex h-9 items-center justify-center gap-2 border-b border-amber-400 bg-amber-100 px-3 text-xs font-medium text-amber-950`}
    >
      <TriangleAlert className="h-4 w-4 shrink-0" aria-hidden />
      <span className="truncate font-bold uppercase tracking-wide">{TEXTO_BANNER_PILOTO}</span>
      <span className="hidden truncate lg:inline">{DETALLE_BANNER_PILOTO}</span>
    </div>
  )
}
