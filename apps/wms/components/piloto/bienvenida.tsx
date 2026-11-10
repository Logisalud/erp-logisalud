import { ArrowRight, FlaskConical } from 'lucide-react'
import { FECHA_REINICIO_PILOTO, PUNTOS_BIENVENIDA_PILOTO, TITULO_BIENVENIDA_PILOTO } from '@/domain/modo-piloto'

/**
 * Pantalla de bienvenida del piloto (se muestra en el primer ingreso y queda en un enlace del Inicio). `aceptar` es la Server Action que recuerda que la persona ya la leyó;
 * sin ella (solo lectura) no hay botón. Sin lógica de negocio.
 */
export function Bienvenida({ piloto, aceptar }: { piloto: boolean; aceptar?: () => Promise<void> }) {
  if (!piloto) {
    return (
      <div className="mx-auto max-w-2xl rounded-lg border border-gray-200 bg-white px-6 py-10 text-center" data-testid="bienvenida-sin-piloto">
        <h1 className="font-heading text-2xl font-semibold uppercase tracking-wide text-gray-900">Bienvenida al piloto</h1>
        <p className="mt-2 text-gray-700">El piloto ya terminó: este sistema ya no está en modo de prueba.</p>
      </div>
    )
  }
  return (
    <div className="mx-auto max-w-3xl space-y-6" data-testid="bienvenida-piloto">
      <header className="flex items-start gap-3">
        <FlaskConical className="mt-1 h-8 w-8 shrink-0 text-amber-700" aria-hidden />
        <div>
          <h1 className="font-heading text-3xl font-semibold uppercase tracking-wide text-gray-900">{TITULO_BIENVENIDA_PILOTO}</h1>
          <p className="mt-1 text-gray-700">Léelo con calma, son cuatro ideas. Después puedes empezar.</p>
        </div>
      </header>
      <ol className="space-y-3">
        {PUNTOS_BIENVENIDA_PILOTO.map((p, i) => (
          <li key={p.clave} className="flex gap-3 rounded-lg border border-amber-300 bg-amber-50 p-4" data-testid={`bienvenida-punto-${p.clave}`}>
            <span className="tabular flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-200 font-heading text-lg font-semibold text-amber-950" aria-hidden>{i + 1}</span>
            <div>
              <h2 className="font-medium text-gray-900">{p.titulo}</h2>
              <p className="text-sm text-gray-800">{p.texto}</p>
            </div>
          </li>
        ))}
      </ol>
      <p className="text-sm text-gray-700" data-testid="bienvenida-fecha">Fecha del reinicio: <span className="tabular font-medium">1 de diciembre</span> ({FECHA_REINICIO_PILOTO}).</p>
      {aceptar && (
        <form action={aceptar}>
          <button type="submit" className="btn-primary" data-testid="bienvenida-entendi"><ArrowRight className="h-5 w-5" aria-hidden />Entendido, entrar al sistema</button>
        </form>
      )}
    </div>
  )
}
