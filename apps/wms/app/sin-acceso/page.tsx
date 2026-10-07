import { ShieldQuestion } from 'lucide-react'
import { Marca } from '@/components/marca'

export const metadata = { title: 'Sin acceso — WMS LOGISALUD' }

export default function SinAcceso() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4 py-10">
      <Marca alto={30} />
      <ShieldQuestion className="mt-8 h-10 w-10 text-teal-600" aria-hidden />
      <h1 className="mt-4 font-heading text-2xl font-semibold uppercase tracking-wide">Todavía no tienes acceso al almacén</h1>
      <p className="mt-2 text-gray-700">
        Tu usuario existe, pero aún no tiene un rol en el WMS. Pídele a quien administra el WMS que te asigne uno y vuelve a entrar.
      </p>
    </main>
  )
}
