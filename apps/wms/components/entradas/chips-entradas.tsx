import { Ban, CheckCircle2, CircleDashed, Clock, FileSignature, Hourglass, PenLine, ShieldAlert, Thermometer, TriangleAlert } from 'lucide-react'
import { ETIQUETA_ALERTA, ETIQUETA_PASO, ETIQUETA_TIPO_INGRESO, type EstadoActa, type PasoIngreso, type TipoAlerta, type TipoIngreso } from '@/domain/entradas'

const base = 'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium leading-none whitespace-nowrap'

export function ChipPaso({ paso }: { paso: PasoIngreso }) {
  const m = {
    DATOS_Y_LOTES: { cls: 'border-gray-300 bg-gray-100 text-gray-800', Icono: CircleDashed },
    ACTA: { cls: 'border-gray-300 bg-gray-100 text-gray-800', Icono: FileSignature },
    FIRMAS: { cls: 'border-amber-300 bg-amber-50 text-amber-900', Icono: PenLine },
    CONFIRMAR: { cls: 'border-teal-300 bg-teal-50 text-teal-900', Icono: CheckCircle2 },
    CONFIRMADO: { cls: 'border-indigo-200 bg-indigo-50 text-indigo-800', Icono: Hourglass },
  }[paso]
  return <span className={`${base} ${m.cls}`}><m.Icono className="h-3.5 w-3.5" aria-hidden />{ETIQUETA_PASO[paso]}</span>
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
  const Icono = tipo === 'TEMPERATURA' ? Thermometer : tipo === 'RS_VENCIDO' ? ShieldAlert : TriangleAlert
  return <span className={`${base} border-amber-300 bg-amber-50 text-amber-900`}><Icono className="h-3.5 w-3.5" aria-hidden />{ETIQUETA_ALERTA[tipo]}</span>
}
