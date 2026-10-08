// Estado "cargando": esqueleto con la forma de la pantalla, sin spinners infinitos.
export default function Cargando() {
  return (
    <div className="animate-pulse space-y-5" role="status" aria-label="Cargando">
      <div className="h-8 w-48 rounded bg-gray-200" />
      <div className="space-y-3">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-16 rounded-lg border border-gray-200 bg-white" />
        ))}
      </div>
      <span className="sr-only">Cargando…</span>
    </div>
  )
}
