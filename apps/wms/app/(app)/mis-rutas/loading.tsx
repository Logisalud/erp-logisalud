export default function CargandoMisRutas() {
  return (
    <div className="mx-auto max-w-xl space-y-3" role="status" aria-live="polite" data-testid="mis-rutas-cargando">
      <div className="h-9 w-40 animate-pulse rounded bg-gray-200" />
      <div className="h-24 animate-pulse rounded-lg bg-gray-100" />
      <div className="h-40 animate-pulse rounded-lg bg-gray-100" />
      <span className="sr-only">Cargando tus rutas…</span>
    </div>
  )
}
