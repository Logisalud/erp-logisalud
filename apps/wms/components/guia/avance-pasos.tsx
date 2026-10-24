import Link from 'next/link'
import { ArrowRight, CheckCircle2, Circle, CircleDot, UserRound } from 'lucide-react'
import { esMiTarea, type Avance } from '@/domain/pasos'
import type { Rol } from '@/domain/tipos'

/** «¿Qué tengo que hacer ahora?»: los pasos del camino, quién hace el siguiente y un botón directo. Estados con ícono y palabra, nunca solo color. */
export function AvancePasos({ avance, roles, titulo = 'Dónde va y qué sigue', testid = 'avance-pasos' }: { avance: Avance; roles: readonly Rol[]; titulo?: string; testid?: string }) {
  const { pasos, siguiente } = avance
  const mia = esMiTarea(roles, siguiente)
  return (
    <section aria-labelledby={`${testid}-t`} className="rounded-lg border border-gray-200 bg-white p-4" data-testid={testid}>
      <h2 id={`${testid}-t`} className="font-heading text-lg font-medium tracking-wide text-gray-900">{titulo}</h2>
      <ol className="mt-3 flex flex-wrap gap-x-4 gap-y-2" data-testid={`${testid}-pasos`}>
        {pasos.map((p) => (
          <li key={p.clave} className="flex items-center gap-1.5 text-sm" data-paso={p.clave} data-estado={p.estado}>
            {p.estado === 'HECHO' ? <CheckCircle2 className="h-5 w-5 text-logisalud-green" aria-hidden /> : p.estado === 'ACTUAL' ? <CircleDot className="h-5 w-5 text-gray-900" aria-hidden /> : <Circle className="h-5 w-5 text-gray-400" aria-hidden />}
            <span className={p.estado === 'ACTUAL' ? 'font-semibold text-gray-900' : p.estado === 'HECHO' ? 'text-gray-800' : 'text-gray-600'}>
              {p.etiqueta}<span className="sr-only"> — {p.estado === 'HECHO' ? 'hecho' : p.estado === 'ACTUAL' ? 'paso actual' : 'pendiente'}</span>
            </span>
          </li>
        ))}
      </ol>
      <div className="mt-4 rounded-md border border-gray-200 bg-gray-50 p-3" data-testid={`${testid}-siguiente`}>
        <p className="text-gray-900"><strong>{siguiente.fin ? 'Estado:' : 'Sigue:'}</strong> <span data-testid={`${testid}-texto`}>{siguiente.texto}</span></p>
        {!siguiente.fin && (
          <p className="mt-1 flex items-center gap-1.5 text-sm text-gray-800" data-testid={`${testid}-quien`}>
            <UserRound className="h-4 w-4" aria-hidden />Lo hace: {siguiente.responsable.etiqueta}{mia && <strong className="ml-1 rounded-full border border-gray-300 bg-white px-2 py-0.5 text-xs">Te toca a ti</strong>}
          </p>
        )}
        {siguiente.href && siguiente.boton && (
          <Link href={siguiente.href} className={`${mia ? 'btn-primary' : 'btn-secondary'} mt-3 inline-flex`} data-testid={`${testid}-boton`}>{siguiente.boton}<ArrowRight className="h-5 w-5" aria-hidden /></Link>
        )}
      </div>
    </section>
  )
}
