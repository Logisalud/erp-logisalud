import type { ReactNode } from 'react'
import { Marca } from '../marca'

/** El marco de las páginas públicas: sin menú, sin banner de empleados, nada del WMS. Mobile-first. */
export function MarcoPublico({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-50" data-publica="seguimiento" data-testid="marco-publico">
      <header className="border-b border-gray-200 bg-white px-4 py-4"><div className="mx-auto flex max-w-xl items-center gap-3"><Marca /></div></header>
      <main className="mx-auto max-w-xl space-y-5 px-4 py-6">
        <h1 className="font-heading text-3xl font-semibold uppercase tracking-wide text-gray-900">{titulo}</h1>
        {children}
      </main>
    </div>
  )
}
