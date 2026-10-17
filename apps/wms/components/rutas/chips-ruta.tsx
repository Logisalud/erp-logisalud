import { CheckCircle2, CircleDashed, Lock, PackageX, Truck, TriangleAlert, XCircle } from 'lucide-react'
import { ETIQUETA_ESTADO_RUTA, ETIQUETA_STOCK_PARADA, type EstadoRuta, type EstadoStockParada } from '@/domain/rutas'
import { CHIP_AVISO, CHIP_NEUTRO, CHIP_OK } from '../estilos-opcion'

const base = 'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium leading-none whitespace-nowrap'
const CHIP_ROJO = 'border-red-200 bg-red-50 text-red-800'
const CHIP_TEAL = 'border-teal-200 bg-teal-50 text-teal-900'

/** El estado de la ruta, siempre con texto + ícono. */
export function ChipEstadoRuta({ estado }: { estado: EstadoRuta }) {
  const m = ({
    BORRADOR: { cls: CHIP_NEUTRO, Icono: CircleDashed }, PLANIFICADA: { cls: CHIP_OK, Icono: CheckCircle2 }, LISTA_PARA_CARGA: { cls: CHIP_OK, Icono: CheckCircle2 },
    LIBERADA: { cls: CHIP_TEAL, Icono: Truck }, EN_RUTA: { cls: CHIP_TEAL, Icono: Truck }, PENDIENTE_CIERRE: { cls: CHIP_AVISO, Icono: Lock },
    CERRADA: { cls: CHIP_NEUTRO, Icono: Lock }, CANCELADA: { cls: CHIP_ROJO, Icono: XCircle },
  } satisfies Record<EstadoRuta, { cls: string; Icono: typeof Truck }>)[estado]
  return <span className={`${base} ${m.cls}`} data-testid="chip-estado-ruta"><m.Icono className="h-3.5 w-3.5" aria-hidden />{ETIQUETA_ESTADO_RUTA[estado]}</span>
}

export function ChipStockParada({ stock }: { stock: EstadoStockParada }) {
  const m = ({ ASIGNADA: { cls: CHIP_OK, Icono: CheckCircle2 }, SIN_STOCK: { cls: CHIP_ROJO, Icono: PackageX }, PENDIENTE: { cls: CHIP_NEUTRO, Icono: TriangleAlert } } as const)[stock]
  return <span className={`${base} ${m.cls}`} data-testid="chip-stock-parada"><m.Icono className="h-3.5 w-3.5" aria-hidden />{ETIQUETA_STOCK_PARADA[stock]}</span>
}
