import { CheckCircle2, ClipboardList, Eye, FileWarning, Hourglass, Lock, PackageX, PackageCheck, TriangleAlert, XCircle } from 'lucide-react'
import { ETIQUETA_ETAPA, type EtapaSalida } from '@/domain/despacho'
import { CHIP_AVISO, CHIP_NEUTRO, CHIP_OK } from '../estilos-opcion'

const base = 'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium leading-none whitespace-nowrap'
const ROJO = 'border-red-200 bg-red-50 text-red-800'
const TEAL = 'border-teal-200 bg-teal-50 text-teal-900'

/** La etapa de la salida, siempre con texto + ícono. */
export function ChipEtapa({ etapa }: { etapa: EtapaSalida }) {
  const m = ({
    SIN_STOCK: { cls: ROJO, Icono: PackageX }, ASIGNADA: { cls: CHIP_NEUTRO, Icono: ClipboardList }, EN_PICKING: { cls: TEAL, Icono: Hourglass },
    CON_DISCREPANCIA: { cls: CHIP_AVISO, Icono: TriangleAlert }, PENDIENTE_CONFORMIDAD: { cls: TEAL, Icono: Eye }, OBSERVADA: { cls: CHIP_AVISO, Icono: TriangleAlert },
    CONFORME: { cls: CHIP_AVISO, Icono: FileWarning }, DOCUMENTACION_COMPLETA: { cls: CHIP_OK, Icono: CheckCircle2 }, EMBALADA: { cls: CHIP_AVISO, Icono: FileWarning },
    LISTA_PARA_CARGA: { cls: CHIP_OK, Icono: CheckCircle2 }, CARGADA: { cls: TEAL, Icono: PackageCheck }, CONFIRMADA: { cls: CHIP_OK, Icono: PackageCheck }, CANCELADA: { cls: ROJO, Icono: XCircle },
  } satisfies Record<EtapaSalida, { cls: string; Icono: typeof Lock }>)[etapa]
  return <span className={`${base} ${m.cls}`} data-testid="chip-etapa"><m.Icono className="h-3.5 w-3.5" aria-hidden />{ETIQUETA_ETAPA[etapa]}</span>
}
