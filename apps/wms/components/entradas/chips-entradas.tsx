import { Ban, CalendarClock, CheckCircle2, CircleDashed, Clock, ClipboardCheck, FileSignature, Hourglass, PenLine, ScanSearch, ShieldAlert, Thermometer, TriangleAlert, Truck, UserCheck } from 'lucide-react'
import {
  ETIQUETA_ALERTA, ETIQUETA_PASO, ETIQUETA_REGISTRO_COMPRAS, ETIQUETA_TIPO_INGRESO, type EstadoActa, type EstadoRegistroCompras, type PasoSolicitud,
  type TipoAlerta, type TipoIngreso, type VerificacionLinea,
} from '@/domain/entradas'

const base = 'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium leading-none whitespace-nowrap'

export function ChipPaso({ paso, tipo }: { paso: PasoSolicitud; tipo?: TipoIngreso }) {
  const m = {
    POR_AUTORIZAR: { cls: 'border-gray-300 bg-gray-100 text-gray-800', Icono: UserCheck },
    POR_LLEGAR: { cls: 'border-sky-200 bg-sky-50 text-sky-900', Icono: Truck },
    VERIFICANDO: { cls: 'border-amber-300 bg-amber-50 text-amber-900', Icono: ScanSearch },
    ACTA: { cls: 'border-gray-300 bg-gray-100 text-gray-800', Icono: FileSignature },
    FIRMAS: { cls: 'border-amber-300 bg-amber-50 text-amber-900', Icono: PenLine },
    CONFIRMAR: { cls: 'border-teal-300 bg-teal-50 text-teal-900', Icono: ClipboardCheck },
    CERRADA: tipo === 'DEVOLUCION' ? { cls: 'border-orange-200 bg-orange-50 text-orange-900', Icono: Hourglass } : { cls: 'border-indigo-200 bg-indigo-50 text-indigo-800', Icono: Hourglass },
    ANULADA: { cls: 'border-red-200 bg-red-50 text-red-800', Icono: Ban },
  }[paso]
  // Una solicitud cerrada ya tiene su inventario: espera su acta organoléptica en Cuarentena (o en Devoluciones).
  const texto = paso === 'CERRADA' ? (tipo === 'DEVOLUCION' ? 'En Devoluciones' : 'En Cuarentena') : ETIQUETA_PASO[paso]
  return <span className={`${base} ${m.cls}`}><m.Icono className="h-3.5 w-3.5" aria-hidden />{texto}</span>
}

export function ChipVerificacion({ v }: { v: VerificacionLinea | null }) {
  if (!v) return null
  const m = {
    PENDIENTE: { cls: 'border-gray-300 bg-gray-100 text-gray-800', Icono: CircleDashed, t: 'Por verificar' },
    COINCIDE: { cls: 'border-green-200 bg-green-50 text-green-800', Icono: CheckCircle2, t: 'Coincide' },
    AJUSTADA: { cls: 'border-amber-300 bg-amber-50 text-amber-900', Icono: TriangleAlert, t: 'Se ajustó' },
  }[v]
  return <span className={`${base} ${m.cls}`}><m.Icono className="h-3.5 w-3.5" aria-hidden />{m.t}</span>
}

export function ChipRegistroCompras({ estado }: { estado: EstadoRegistroCompras }) {
  const m = {
    OK: { cls: 'border-green-200 bg-green-50 text-green-800', Icono: CheckCircle2 },
    FALTA: { cls: 'border-amber-300 bg-amber-50 text-amber-900', Icono: Clock },
    NO_COINCIDE: { cls: 'border-red-200 bg-red-50 text-red-800', Icono: TriangleAlert },
  }[estado]
  return <span className={`${base} ${m.cls}`}><m.Icono className="h-3.5 w-3.5" aria-hidden />{ETIQUETA_REGISTRO_COMPRAS[estado]}</span>
}

export function ChipTipoIngreso({ tipo }: { tipo: TipoIngreso }) {
  return <span className={`${base} border-gray-200 bg-white text-gray-800`}>{ETIQUETA_TIPO_INGRESO[tipo]}</span>
}

export function ChipActa({ estado }: { estado: EstadoActa | 'PENDIENTE_DT' }) {
  const m = {
    BORRADOR: { cls: 'border-gray-300 bg-gray-100 text-gray-800', Icono: CircleDashed, t: 'Borrador' },
    FIRMADA: { cls: 'border-green-200 bg-green-50 text-green-800', Icono: CheckCircle2, t: 'Firmada' },
    ANULADA: { cls: 'border-red-200 bg-red-50 text-red-800', Icono: Ban, t: 'Anulada' },
    PENDIENTE_DT: { cls: 'border-amber-300 bg-amber-50 text-amber-900', Icono: Clock, t: 'Espera a Dirección Técnica' },
  }[estado]
  return <span className={`${base} ${m.cls}`}><m.Icono className="h-3.5 w-3.5" aria-hidden />{m.t}</span>
}

export function ChipAlerta({ tipo }: { tipo: TipoAlerta }) {
  const Icono = tipo === 'TEMPERATURA' ? Thermometer : tipo === 'RS_VENCIDO' ? ShieldAlert : tipo === 'LOTE_POR_VENCER' || tipo === 'LOTE_VENCIDO' ? CalendarClock : TriangleAlert
  return <span className={`${base} border-amber-300 bg-amber-50 text-amber-900`}><Icono className="h-3.5 w-3.5" aria-hidden />{ETIQUETA_ALERTA[tipo]}</span>
}
