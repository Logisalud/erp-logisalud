import { MarcoPublico } from '@/components/seguimiento/marco-publico'

export default function CargandoStock() {
  return (
    <MarcoPublico titulo="Tu stock en LOGISALUD" ancho>
      <div className="space-y-4" role="status" aria-live="polite" data-testid="stock-cargando">
        <span className="sr-only">Cargando tu stock…</span>
        <div className="h-12 w-2/3 animate-pulse rounded-md bg-gray-200" />
        <div className="flex gap-2"><div className="h-11 w-40 animate-pulse rounded-full bg-gray-200" /><div className="h-11 w-48 animate-pulse rounded-full bg-gray-200" /></div>
        <div className="divide-y divide-gray-200 overflow-hidden rounded-lg border border-gray-200 bg-white">
          {[0, 1, 2, 3].map((i) => <div key={i} className="space-y-2 px-4 py-4"><div className="h-5 w-1/2 animate-pulse rounded bg-gray-200" /><div className="h-4 w-1/3 animate-pulse rounded bg-gray-100" /></div>)}
        </div>
      </div>
    </MarcoPublico>
  )
}
