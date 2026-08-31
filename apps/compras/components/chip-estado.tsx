import type { ColorEstado } from '@/domain/ordenes-unificadas'

const CLASES: Record<ColorEstado, string> = {
  gris: 'bg-gray-100 text-gray-700 border-gray-200',
  ambar: 'bg-amber-50 text-amber-800 border-amber-200',
  teal: 'bg-logisalud-teal/10 text-logisalud-teal border-logisalud-teal/30',
  verde: 'bg-logisalud-green/10 text-logisalud-green border-logisalud-green/30',
  rojo: 'bg-red-50 text-red-700 border-red-200',
}

/** Chip de estado — el color nunca es la única señal, siempre lleva el texto del estado real. */
export function ChipEstado({ texto, color }: { texto: string; color: ColorEstado }) {
  return (
    <span className={`inline-block whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-medium ${CLASES[color]}`}>
      {texto}
    </span>
  )
}
