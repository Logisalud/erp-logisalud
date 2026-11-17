import { ClipboardList, Eye, FileCheck2, Hourglass, PackageCheck, Send, TriangleAlert, Truck, XCircle } from 'lucide-react'
import { estadoDeOrden, etiquetaEstadoOrden, type DatosEstadoOrden, type EstadoOrden } from '@/domain/estado-orden'
import { ETIQUETA_ETAPA } from '@/domain/despacho'
import { CHIP_AVISO, CHIP_NEUTRO, CHIP_OK } from '../estilos-opcion'

const base = 'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium leading-none whitespace-nowrap'
const ROJO = 'border-red-200 bg-red-50 text-red-800'
const TEAL = 'border-teal-200 bg-teal-50 text-teal-900'

/** Estilo e ícono de cada estado de la orden: siempre texto + ícono, nunca solo color. */
export const ESTILO_ESTADO_ORDEN: Record<EstadoOrden, { cls: string; Icono: typeof Hourglass }> = {
  CREADA: { cls: CHIP_NEUTRO, Icono: ClipboardList }, EN_PICKING: { cls: TEAL, Icono: Hourglass }, EN_CONFORMIDAD: { cls: TEAL, Icono: Eye },
  LISTA: { cls: CHIP_OK, Icono: FileCheck2 }, GUIA_ENVIADA: { cls: CHIP_OK, Icono: Send }, EN_RUTA: { cls: TEAL, Icono: Truck },
  ENTREGADA: { cls: CHIP_OK, Icono: PackageCheck }, NO_ENTREGADA: { cls: CHIP_AVISO, Icono: TriangleAlert }, CANCELADA: { cls: ROJO, Icono: XCircle },
}

/** Solo la forma del estado (texto + ícono): la usa la leyenda y el chip de la orden. */
export function ChipEstadoVisual({ estado, etiqueta, ...extra }: { estado: EstadoOrden; etiqueta: string } & React.HTMLAttributes<HTMLSpanElement>) {
  const m = ESTILO_ESTADO_ORDEN[estado]
  return <span {...extra} className={`${base} ${m.cls}`} data-estado={estado}><m.Icono className="h-3.5 w-3.5" aria-hidden />{etiqueta}</span>
}

/** El estado de la Orden de Salida. El detalle fino (la «etapa» interna) queda en `title` y en `data-etapa` para quien lo necesite. */
export function ChipEstadoOrden({ s }: { s: DatosEstadoOrden }) {
  return <ChipEstadoVisual estado={estadoDeOrden(s)} etiqueta={etiquetaEstadoOrden(s)} data-testid="chip-estado-orden" data-etapa={s.etapa} title={ETIQUETA_ETAPA[s.etapa]} />
}
