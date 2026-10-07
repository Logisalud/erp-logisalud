import { FlaskConical } from 'lucide-react'

/** Aviso visible en TODA pantalla mientras el modo demostración esté activo (fijo arriba, alto 2.25rem). */
export function BannerDemo() {
  return (
    <div
      role="status"
      data-testid="banner-demo"
      className="sticky top-0 z-[70] flex h-9 items-center justify-center gap-2 bg-gray-900 px-3 text-xs font-medium text-white"
    >
      <FlaskConical className="h-4 w-4 shrink-0 text-teal-300" aria-hidden />
      <span className="rounded bg-teal-300 px-1.5 py-0.5 font-bold tracking-wide text-gray-900">DEMO</span>
      <span className="truncate md:hidden">Datos de prueba · sin base real</span>
      <span className="hidden md:inline">Datos de prueba, sin conexión a ninguna base real. Lo que hagas aquí no se guarda.</span>
    </div>
  )
}
