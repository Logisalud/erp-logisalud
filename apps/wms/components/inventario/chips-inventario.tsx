import { Ban, CheckCircle2, CircleDashed, ClipboardCheck, Hand, Hourglass, ScanSearch, TriangleAlert, Truck, UserCheck } from 'lucide-react'
import { ETIQUETA_ESTADO_CONTEO, ETIQUETA_ESTADO_ORDEN, ETIQUETA_RESULTADO_LINEA, type EstadoConteo, type EstadoOrden, type ResultadoLinea } from '@/domain/inventario'

const base = 'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium leading-none whitespace-nowrap'

export function ChipOrden({ estado }: { estado: EstadoOrden }) {
  const m = {
    PREPARADO: { cls: 'border-gray-300 bg-gray-100 text-gray-800', Icono: UserCheck },
    AUTORIZADO: { cls: 'border-sky-200 bg-sky-50 text-sky-900', Icono: Truck },
    EJECUTADO: { cls: 'border-amber-300 bg-amber-50 text-amber-900', Icono: ScanSearch },
    CONFIRMADO: { cls: 'border-green-200 bg-green-50 text-green-800', Icono: CheckCircle2 },
    CON_DIFERENCIA: { cls: 'border-red-200 bg-red-50 text-red-800', Icono: TriangleAlert },
    ANULADO: { cls: 'border-gray-300 bg-gray-50 text-gray-700', Icono: Ban },
  }[estado]
  return <span className={`${base} ${m.cls}`}><m.Icono className="h-3.5 w-3.5" aria-hidden />{ETIQUETA_ESTADO_ORDEN[estado]}</span>
}

export function ChipConteo({ estado }: { estado: EstadoConteo }) {
  const m = {
    PROGRAMADO: { cls: 'border-gray-300 bg-gray-100 text-gray-800', Icono: CircleDashed },
    EN_CONTEO: { cls: 'border-sky-200 bg-sky-50 text-sky-900', Icono: Hand },
    POR_RECONTAR: { cls: 'border-amber-300 bg-amber-50 text-amber-900', Icono: Hourglass },
    EN_REVISION: { cls: 'border-teal-300 bg-teal-50 text-teal-900', Icono: ClipboardCheck },
    CERRADO: { cls: 'border-green-200 bg-green-50 text-green-800', Icono: CheckCircle2 },
  }[estado]
  return <span className={`${base} ${m.cls}`}><m.Icono className="h-3.5 w-3.5" aria-hidden />{ETIQUETA_ESTADO_CONTEO[estado]}</span>
}

export function ChipResultado({ r }: { r: ResultadoLinea }) {
  const ok = r === 'COINCIDE' || r === 'COINCIDE_EN_RECONTEO' || r === 'AJUSTADA'
  const Icono = ok ? CheckCircle2 : TriangleAlert
  return <span className={`${base} ${ok ? 'border-green-200 bg-green-50 text-green-800' : 'border-amber-300 bg-amber-50 text-amber-900'}`}><Icono className="h-3.5 w-3.5" aria-hidden />{ETIQUETA_RESULTADO_LINEA[r]}</span>
}
