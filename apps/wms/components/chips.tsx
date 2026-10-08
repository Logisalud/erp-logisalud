import { Ban, CheckCircle2, Undo2, CircleDashed, Clock, Hourglass, MessageSquareWarning, ShieldAlert, ShieldCheck, TriangleAlert } from 'lucide-react'
import type { Estado, EstadoValidacion } from '@/domain/tipos'
import type { SituacionRS } from '@/domain/regulatorio'
import { ETIQUETA_ESTADO } from '@/domain/estados'

// Los estados siempre llevan TEXTO + ÍCONO: nunca dependen solo del color.

const base = 'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium leading-none whitespace-nowrap'

export function ChipEstado({ estado, className = '' }: { estado: Estado; className?: string }) {
  const m = {
    CUARENTENA: { cls: 'border-indigo-200 bg-indigo-50 text-indigo-800', Icono: Hourglass },
    DEVOLUCIONES: { cls: 'border-orange-200 bg-orange-50 text-orange-900', Icono: Undo2 },
    APROBADO: { cls: 'border-green-200 bg-green-50 text-green-800', Icono: ShieldCheck },
    BAJAS_RECHAZADOS: { cls: 'border-red-200 bg-red-50 text-red-800', Icono: Ban },
  }[estado]
  return (
    <span className={`${base} ${m.cls} ${className}`}>
      <m.Icono className="h-3.5 w-3.5" aria-hidden />
      {ETIQUETA_ESTADO[estado]}
    </span>
  )
}

export function ChipRS({ situacion, className = '' }: { situacion: SituacionRS; className?: string }) {
  const m = {
    VIGENTE: { cls: 'border-green-200 bg-green-50 text-green-800', Icono: ShieldCheck, t: 'Registro vigente' },
    POR_VENCER: { cls: 'border-amber-300 bg-amber-50 text-amber-900', Icono: Clock, t: 'Por vencer' },
    VENCIDO: { cls: 'border-red-200 bg-red-50 text-red-800', Icono: ShieldAlert, t: 'Registro vencido' },
    SIN_DATO: { cls: 'border-gray-200 bg-gray-100 text-gray-700', Icono: CircleDashed, t: 'Sin registro' },
  }[situacion]
  return (
    <span className={`${base} ${m.cls} ${className}`}>
      <m.Icono className="h-3.5 w-3.5" aria-hidden />
      {m.t}
    </span>
  )
}

export function ChipValidacion({ estado, className = '' }: { estado: EstadoValidacion; className?: string }) {
  const m = {
    VALIDADO: { cls: 'border-green-200 bg-green-50 text-green-800', Icono: CheckCircle2, t: 'Validado' },
    PENDIENTE: { cls: 'border-gray-300 bg-gray-100 text-gray-800', Icono: Clock, t: 'Por validar' },
    OBSERVADO: { cls: 'border-amber-300 bg-amber-50 text-amber-900', Icono: MessageSquareWarning, t: 'Con observación' },
  }[estado]
  return (
    <span className={`${base} ${m.cls} ${className}`}>
      <m.Icono className="h-3.5 w-3.5" aria-hidden />
      {m.t}
    </span>
  )
}

export function ChipPorVerificar({ className = '' }: { className?: string }) {
  return (
    <span className={`${base} border-amber-300 bg-amber-50 text-amber-900 ${className}`}>
      <TriangleAlert className="h-3.5 w-3.5" aria-hidden />
      Por verificar en sitio
    </span>
  )
}

export function ChipPorTrasladar({ className = '' }: { className?: string }) {
  return (
    <span className={`${base} border-teal-300 bg-teal-50 text-teal-900 ${className}`}>
      <Clock className="h-3.5 w-3.5" aria-hidden />
      Aprobado · por trasladar
    </span>
  )
}
