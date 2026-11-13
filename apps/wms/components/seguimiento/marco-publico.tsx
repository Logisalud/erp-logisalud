import type { ReactNode } from 'react'
import { Marca } from '../marca'

/** El marco de las páginas públicas: sin menú, sin banner de empleados, nada del WMS. Mobile-first. */
export function MarcoPublico({ titulo, children, ancho = false }: { titulo: string; children: ReactNode; ancho?: boolean }) {
  return (
    <div className="min-h-screen bg-gray-50" data-publica={ancho ? 'stock' : 'seguimiento'} data-testid="marco-publico">
      <header className="border-b border-gray-200 bg-white px-4 py-4"><div className={`mx-auto flex items-center gap-3 ${ancho ? 'max-w-5xl' : 'max-w-xl'}`}><Marca /></div></header>
      <main className={`mx-auto space-y-5 px-4 py-6 ${ancho ? 'max-w-5xl' : 'max-w-xl'}`}>
        <h1 className="font-heading text-3xl font-semibold uppercase tracking-wide text-gray-900">{titulo}</h1>
        {children}
      </main>
    </div>
  )
}
