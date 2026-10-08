import Link from 'next/link'
import { SearchX } from 'lucide-react'

export default function NoEncontrado() {
  return (
    <div className="mx-auto max-w-md py-16 text-center">
      <SearchX className="mx-auto h-10 w-10 text-gray-400" aria-hidden />
      <h1 className="mt-4 font-heading text-2xl font-semibold uppercase tracking-wide text-gray-900">No encontramos eso</h1>
      <p className="mt-2 text-gray-700">El producto o la página que buscas no existe, o ya no está disponible.</p>
      <Link href="/" className="btn-primary mt-6">Volver al inicio</Link>
    </div>
  )
}
