import { Ban, CalendarX2, CheckCircle2, FileWarning, HeartCrack, Hourglass, Mail, PackageX, RotateCcw, XCircle } from 'lucide-react'
import { ETIQUETA_ESTADO_BAJA, ETIQUETA_MOTIVO_BAJA, type EstadoOrdenBaja, type MotivoBaja } from '@/domain/bajas'

// Estado y motivo siempre con TEXTO + ÍCONO: nunca dependen solo del color.
const base = 'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium leading-none whitespace-nowrap'

export function ChipEstadoBaja({ estado, porTrasladar }: { estado: EstadoOrdenBaja; porTrasladar?: boolean }) {
  if (estado === 'EMITIDA' && porTrasladar) {
    return <span className={`${base} border-amber-300 bg-amber-50 text-amber-900`} data-testid="chip-estado-baja"><PackageX className="h-3.5 w-3.5" aria-hidden />Emitida · por trasladar</span>
  }
  const m = {
    SOLICITADA: { cls: 'border-amber-300 bg-amber-50 text-amber-900', Icono: Hourglass },
    EMITIDA: { cls: 'border-green-200 bg-green-50 text-green-800', Icono: CheckCircle2 },
    RECHAZADA: { cls: 'border-red-200 bg-red-50 text-red-800', Icono: XCircle },
    CANCELADA: { cls: 'border-gray-300 bg-gray-100 text-gray-800', Icono: RotateCcw },
    ANULADA: { cls: 'border-red-200 bg-red-50 text-red-800', Icono: Ban },
  }[estado]
  return <span className={`${base} ${m.cls}`} data-testid="chip-estado-baja"><m.Icono className="h-3.5 w-3.5" aria-hidden />{ETIQUETA_ESTADO_BAJA[estado]}</span>
}

export function ChipMotivoBaja({ motivo }: { motivo: MotivoBaja }) {
  const Icono = { VENCIDO: CalendarX2, DETERIORO_DANO: HeartCrack, ALERTA_DIGEMID: FileWarning, OBSERVACION_PROVEEDOR: Mail }[motivo]
  return <span className={`${base} border-gray-300 bg-white text-gray-800`}><Icono className="h-3.5 w-3.5" aria-hidden />{ETIQUETA_MOTIVO_BAJA[motivo]}</span>
}
