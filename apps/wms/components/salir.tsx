import { LogOut } from 'lucide-react'
import { salirDemo } from '@/app/acciones'
import { BotonSalirReal } from './boton-salir'

export function Salir({ demo, className = '' }: { demo: boolean; className?: string }) {
  if (!demo) return <BotonSalirReal className={className} />
  return (
    <form action={salirDemo}>
      <button type="submit" className={className}>
        <LogOut className="h-4 w-4" aria-hidden />
        <span className="txt">Cerrar sesión</span>
      </button>
    </form>
  )
}
