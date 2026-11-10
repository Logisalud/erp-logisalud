import Link from 'next/link'
import { ArrowRight, CheckCircle2, ClipboardList } from 'lucide-react'
import type { TareaPendiente } from '@/domain/pasos'

/** «Mis tareas» de Inicio: lo que le toca a esta persona ahora, con quién sigue después de ella y un botón directo. Con la lista vacía lo dice. */
export function MisTareas({ tareas }: { tareas: TareaPendiente[] }) {
  const mostrar = tareas.slice(0, 8)
  return (
    <section aria-labelledby="mis-tareas" data-testid="mis-tareas">
      <h2 id="mis-tareas" className="font-heading text-lg font-medium uppercase tracking-wide text-gray-800">Mis tareas</h2>
      {tareas.length === 0 ? (
        <div className="mt-3 flex items-center gap-3 rounded-lg border border-green-200 bg-green-50 p-4 text-green-900" data-testid="sin-tareas">
          <CheckCircle2 className="h-6 w-6 shrink-0" aria-hidden />
          <div><p className="font-medium">No tienes tareas pendientes</p><p className="text-sm">Cuando una orden o un ingreso llegue a un paso tuyo, aparece aquí con su botón.</p></div>
        </div>
      ) : (
        <>
          <p className="mt-1 text-sm text-gray-700">{tareas.length === 1 ? 'Tienes 1 tarea.' : `Tienes ${tareas.length} tareas.`} Las más cercanas a salir van primero.</p>
          <ul className="mt-3 divide-y divide-gray-200 overflow-hidden rounded-lg border border-gray-200 bg-white" data-testid="lista-tareas">
            {mostrar.map((t) => (
              <li key={t.clave}>
                <Link href={t.siguiente.href ?? '/'} className="flex min-h-16 items-center gap-4 px-4 py-3 transition duration-fast hover:bg-gray-50" data-testid="tarea">
                  <ClipboardList className="h-6 w-6 shrink-0 text-gray-500" aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="tabular block font-medium text-gray-900">{t.titulo}</span>
                    <span className="block text-sm text-gray-700">{t.siguiente.texto}</span>
                    <span className="block text-xs text-gray-600">Va en: {t.donde}</span>
                  </span>
                  <span className="shrink-0 rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-900">{t.siguiente.boton}</span>
                  <ArrowRight className="hidden h-4 w-4 shrink-0 text-gray-400 md:block" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
          {tareas.length > mostrar.length && <p className="mt-2 text-sm text-gray-600">Y {tareas.length - mostrar.length} más. Mira la lista de <Link href="/salidas" className="underline">Salidas</Link> o de <Link href="/entradas" className="underline">Entradas</Link>.</p>}
        </>
      )}
    </section>
  )
}
