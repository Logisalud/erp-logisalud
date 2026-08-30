/** Stepper de progreso — el paso alcanzado se calcula 1:1 desde el estado real (domain/ordenes-unificadas.ts), nunca por deducción visual. */
export function StepperOrden({
  pasos, pasoAlcanzado,
}: { pasos: readonly { clave: string; titulo: string }[]; pasoAlcanzado: number }) {
  if (pasoAlcanzado < 0) return null
  return (
    <ol className="flex flex-wrap gap-2 sm:gap-0 sm:overflow-x-auto">
      {pasos.map((paso, i) => {
        const completado = i <= pasoAlcanzado
        const actual = i === pasoAlcanzado
        return (
          <li key={paso.clave} className="flex items-center sm:shrink-0">
            <span
              className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium ${
                completado
                  ? actual
                    ? 'border-logisalud-teal bg-logisalud-teal/10 text-logisalud-teal'
                    : 'border-logisalud-green bg-logisalud-green/10 text-logisalud-green'
                  : 'border-gray-200 bg-gray-50 text-gray-400'
              }`}
            >
              {completado && !actual ? '✓' : i + 1}. {paso.titulo}
            </span>
            {i < pasos.length - 1 ? <span className="mx-1 hidden text-gray-300 sm:inline">→</span> : null}
          </li>
        )
      })}
    </ol>
  )
}

export function TarjetaSiguientePaso({ texto, children }: { texto: string; children?: React.ReactNode }) {
  return (
    <section className="card-highlight mt-4">
      <h2 className="font-heading text-lg">Siguiente paso</h2>
      <p className="mt-1 text-sm text-gray-700">{texto}</p>
      {children ? <div className="mt-3">{children}</div> : null}
    </section>
  )
}
